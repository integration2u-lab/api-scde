import { Prisma, EnergyBalance } from "@prisma/client";

import { prisma } from "../db";
import { calculateContractDemandBounds } from "../utils/contractDemand";

export type Decimalish = string | number | Prisma.Decimal | null | undefined;
export type BigIntish = string | number | bigint | null | undefined;

export type EnergyBalancePayload = {
  meter: string;
  clientName: string;
  referenceBase: string | Date;
  price?: Decimalish;
  reajutedPrice?: Decimalish;
  supplier?: string | null;
  email?: string | null;
  ativaCKwh: Decimalish;
  proinfaContribution?: Decimalish;
  contract?: Decimalish;
  adjusted?: boolean | null;
  contactActive?: boolean | null;
  clientId?: string | null;
  contractId?: BigIntish;
  sentOk?: boolean | null;
  sendDate?: string | Date | null;
  billsDate?: string | Date | null;
  createdAt?: string | Date | null;
  updatedAt?: string | Date | null;
};

type UpsertResult =
  | { success: true; message: string; data: EnergyBalance }
  | { success: false; message: string; error: unknown };

const DECIMAL_ZERO = new Prisma.Decimal(0);
const DECIMAL_ONE_HUNDRED = new Prisma.Decimal(100);
const DECIMAL_ONE_HUNDRED_THREE = new Prisma.Decimal(103);
const DECIMAL_TWO = new Prisma.Decimal(2);
const DECIMAL_ONE_THOUSAND = new Prisma.Decimal(1000);
const DECIMAL_LOSS_RATE = new Prisma.Decimal("0.03");

const toDecimal = (value: Decimalish, field?: string): Prisma.Decimal | null | undefined => {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  try {
    if (value instanceof Prisma.Decimal) {
      return value;
    }

    if (typeof value === "string") {
      const normalized = value.trim().replace(",", ".");
      if (normalized.length === 0) {
        return null;
      }
      return new Prisma.Decimal(normalized);
    }

    return new Prisma.Decimal(value);
  } catch (error) {
    throw new Error(`Field ${field ?? "value"} must be a valid number`);
  }
};

const toBigInt = (value: BigIntish): bigint | null | undefined => {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return null;
  }
  return BigInt(value);
};

const toDate = (value: string | Date | null | undefined, field: string): Date | null => {
  if (value === undefined || value === null) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid date provided for '${field}'.`);
  }

  return date;
};

const normalizeNullableString = (
  value: string | null | undefined,
): string | null | undefined => {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const formatDecimalField = (value: Prisma.Decimal | null): string | null => {
  if (value === null) {
    return null;
  }

  return value.toString();
};

const buildRelatedContract = async (meter: string, clientId?: string | null) => {
  const where: Record<string, unknown> = { groupName: meter };
  if (clientId) {
    where.client_id = clientId;
  }

  return prisma.contract.findFirst({
    where,
    select: {
      id: true,
      average_price_mwh: true,
      supplier: true,
      email: true,
      client_id: true,
      contracted_volume_mwh: true,
      proinfa_contribution: true,
      lower_limit_percent: true,
      upper_limit_percent: true,
      flexibility_percent: true,
      minDemand: true,
      maxDemand: true,
    },
  });
};

export async function updateEnergyBalance(payload: EnergyBalancePayload): Promise<UpsertResult> {
  const meter = payload.meter?.trim();
  const context = `[EnergyBalance] meter=${meter ?? "undefined"}`;

  try {
    if (!meter) {
      throw new Error("Missing required field 'meter'.");
    }

    if (!payload.clientName) {
      throw new Error("Missing required field 'clientName'.");
    }

    const referenceBase = toDate(payload.referenceBase, "referenceBase");
    if (!referenceBase) {
      throw new Error("Missing required field 'referenceBase'.");
    }

    const rawConsumption = toDecimal(payload.ativaCKwh, "ativaCKwh");
    if (rawConsumption === undefined || rawConsumption === null) {
      throw new Error("Missing required column 'Ativa C (kWh)'.");
    }
    const consumptionKwh = rawConsumption.div(DECIMAL_ONE_THOUSAND);

    const clientIdInput = payload.clientId;
    if (!clientIdInput) {
      throw new Error("Missing required field 'clientId'.");
    }

    let relatedContract = await buildRelatedContract(meter, clientIdInput);
    if (!relatedContract) {
      relatedContract = await buildRelatedContract(meter);
    }

    const priceSource = payload.price ?? relatedContract?.average_price_mwh ?? null;
    const price = toDecimal(priceSource, "price") ?? null;
    const reajutedPriceSource = payload.reajutedPrice ?? null;
    const reajutedPrice = toDecimal(reajutedPriceSource, "reajutedPrice") ?? null;

    const contractSource = payload.contract ?? relatedContract?.contracted_volume_mwh ?? null;
    const contractDecimal = toDecimal(contractSource, "contract");
    const hasContract = contractDecimal !== undefined && contractDecimal !== null;
    const contract = contractDecimal ?? null;

    const proinfa =
      toDecimal(
        payload.proinfaContribution ?? relatedContract?.proinfa_contribution ?? null,
        "proinfaContribution",
      ) ?? DECIMAL_ZERO;

    const hasPayloadProinfa = payload.proinfaContribution !== undefined && payload.proinfaContribution !== null;
    const hasRelatedProinfa =
      !hasPayloadProinfa &&
      relatedContract?.proinfa_contribution !== undefined &&
      relatedContract?.proinfa_contribution !== null;
    const hasBillableInputs = hasContract || hasPayloadProinfa || hasRelatedProinfa;

    let minDemand: Prisma.Decimal | null = null;
    let maxDemand: Prisma.Decimal | null = null;

    if (relatedContract) {
      const bounds = calculateContractDemandBounds({
        contractedVolume: relatedContract.contracted_volume_mwh ?? contractDecimal ?? null,
        lowerLimitPercent: relatedContract.lower_limit_percent ?? null,
        upperLimitPercent: relatedContract.upper_limit_percent ?? null,
        flexibilityPercent: relatedContract.flexibility_percent ?? null,
      });

      minDemand = relatedContract.minDemand ?? bounds.min;
      maxDemand = relatedContract.maxDemand ?? bounds.max;
    } else if (hasContract) {
      minDemand = DECIMAL_ZERO;
      maxDemand = contractDecimal!.mul(DECIMAL_TWO);
    }

    const billableCandidate = hasBillableInputs
      ? consumptionKwh.mul(DECIMAL_ONE_HUNDRED_THREE).div(DECIMAL_ONE_HUNDRED).minus(proinfa)
      : null;

    const billable =
      hasBillableInputs && billableCandidate !== null
        ? maxDemand && billableCandidate.gt(maxDemand)
          ? maxDemand
          : billableCandidate
        : null;

    const lossDecimal = consumptionKwh.mul(DECIMAL_LOSS_RATE);
    const requirementDecimal = consumptionKwh
      .add(lossDecimal)
      .minus(proinfa ?? DECIMAL_ZERO);
    const netDecimal =
      billable !== null ? requirementDecimal.minus(billable) : null;

    const cpCode = maxDemand && billable ? (billable.lt(maxDemand) ? "\u004E\u00E3o h\u00E1." : "Compra") : null;

    const adjusted = payload.adjusted ?? null;
    const contactActive = payload.contactActive ?? null;
    const supplier = payload.supplier ?? relatedContract?.supplier ?? null;
    let email: string | null = null;
    if (relatedContract) {
      email = normalizeNullableString(relatedContract.email ?? null) ?? null;
    }
    if (email === null) {
      email = normalizeNullableString(payload.email ?? null) ?? null;
    }
    if (email === null && relatedContract?.client_id) {
      const client = await prisma.client.findUnique({
        where: { clientId: relatedContract.client_id },
        select: { email: true },
      });
      email = normalizeNullableString(client?.email ?? null) ?? null;
    }
    const contractId = toBigInt(payload.contractId ?? (relatedContract?.id ?? null)) ?? null;
    const sentOk = payload.sentOk ?? null;
    const sendDate =
      payload.sendDate !== undefined ? toDate(payload.sendDate, "sendDate") : null;
    const billsDate =
      payload.billsDate !== undefined ? toDate(payload.billsDate, "billsDate") : null;

    const explicitCreatedAt = toDate(payload.createdAt ?? null, "createdAt");
    const explicitUpdatedAt = toDate(payload.updatedAt ?? null, "updatedAt");
    const now = new Date();

    const commonData = {
      clientName: payload.clientName,
      price,
      reajuted_price: reajutedPrice,
      referenceBase,
      supplier,
      email,
      meter,
      consumptionKwh,
      proinfaContribution: proinfa,
      contract,
      minDemand,
      maxDemand,
      cpCode: cpCode ?? null,
      clientId: clientIdInput,
      contractId,
      adjusted,
      contactActive,
      billable,
      loss: formatDecimalField(lossDecimal),
      requirement: formatDecimalField(requirementDecimal),
      net: formatDecimalField(netDecimal),
      sentOk,
      sendDate,
      billsDate,
    } satisfies Prisma.EnergyBalanceUncheckedCreateInput;

    const updateData: Prisma.EnergyBalanceUncheckedUpdateInput = {
      ...commonData,
      clientId: clientIdInput,
      contractId,
      updatedAt: explicitUpdatedAt ?? now,
    };

    const createData: Prisma.EnergyBalanceUncheckedCreateInput = {
      ...commonData,
      createdAt: explicitCreatedAt ?? now,
      updatedAt: explicitUpdatedAt ?? now,
    };

    const existing = await prisma.energyBalance.findFirst({
      where: { meter },
    });

    if (existing) {
      const updatedRecord = await prisma.energyBalance.update({
        where: { id: existing.id },
        data: updateData,
      });

      console.info(`${context} update succeeded (id=${existing.id})`);

      return {
        success: true,
        message: `${context} update succeeded`,
        data: updatedRecord,
      };
    }

    const createdRecord = await prisma.energyBalance.create({
      data: createData,
    });

    console.info(`${context} insert succeeded (id=${createdRecord.id})`);

    return {
      success: true,
      message: `${context} insert succeeded`,
      data: createdRecord,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error(`${context} upsert failed: ${errorMessage}`, { error });

    return {
      success: false,
      message: `${context} upsert failed: ${errorMessage}`,
      error,
    };
  }
}

export const upsertEnergyBalance = updateEnergyBalance;









