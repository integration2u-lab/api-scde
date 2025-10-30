import { Prisma } from "@prisma/client";

import { prisma } from "../db";
import { calculateContractDemandBounds } from "../utils/contractDemand";
import {
  CreateContractInput,
  UpdateContractInput,
} from "../validators/contractsValidator";

const contractFields: Array<keyof CreateContractInput> = [
  "contract_code",
  "client_id",
  "client_name",
  "groupName",
  "social_reason",
  "cnpj",
  "segment",
  "supplier",
  "contact_responsible",
  "email",
  "contracted_volume_mwh",
  "status",
  "energy_source",
  "contracted_modality",
  "start_date",
  "end_date",
  "billing_cycle",
  "upper_limit_percent",
  "lower_limit_percent",
  "flexibility_percent",
  "minDemand",
  "maxDemand",
  "average_price_mwh",
  "proinfa_contribution",
  "spot_price_ref_mwh",
  "compliance_consumption",
  "compliance_nf",
  "compliance_invoice",
  "compliance_charges",
  "compliance_overall",
  "created_at",
  "updated_at",
];

const generateRandomCode = (): string => `2025-${Math.floor(Math.random() * 10000)
  .toString()
  .padStart(4, "0")}`;


const isContractCodeConflict = (error: unknown): boolean => {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    const target = error.meta?.target;
    if (typeof target === "string") {
      return target.includes("contract_code");
    }
    if (Array.isArray(target)) {
      return target.includes("contract_code");
    }
  }
  return false;
};

const toPrismaPayload = (
  input: CreateContractInput | UpdateContractInput,
): Record<string, unknown> => {
  const payload: Record<string, unknown> = {};

  for (const field of contractFields) {
    const value = input[field];
    if (value !== undefined) {
      payload[field] = value;
    }
  }

  return payload;
};

export async function createContract(data: CreateContractInput) {
  return prisma.$transaction(async (tx) => {
    const payload = toPrismaPayload(data) as Prisma.ContractUncheckedCreateInput;
    const clientName = data.client_name.trim();

    let clientRecord = await tx.client.findFirst({ where: { name: clientName } });

    if (!clientRecord) {
      clientRecord = await tx.client.create({
        data: {
          name: clientName,
        },
      });
    }

    payload.client_id = clientRecord.clientId;
    payload.client_name = clientName;

    if (typeof payload.email === "string") {
      const trimmedEmail = payload.email.trim();
      payload.email = trimmedEmail.length > 0 ? trimmedEmail : null;
    }

    const { min, max } = calculateContractDemandBounds({
      contractedVolume: payload.contracted_volume_mwh ?? null,
      lowerLimitPercent: payload.lower_limit_percent ?? null,
      upperLimitPercent: payload.upper_limit_percent ?? null,
      flexibilityPercent: payload.flexibility_percent ?? null,
    });

    payload.minDemand = min ?? null;
    payload.maxDemand = max ?? null;

    const contractDate =
      payload.created_at instanceof Date ? payload.created_at : new Date();

    payload.created_at = contractDate;

    const maxAttempts = 50;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const candidateCode = generateRandomCode();

      const existingCode = await tx.contract.findUnique({
        where: { contract_code: candidateCode },
        select: { id: true },
      });

      if (existingCode) {
        continue;
      }

      payload.contract_code = candidateCode;
      return tx.contract.create({ data: payload });
    }

    throw new Error("Failed to generate a unique contract code");
  });
}

export async function listContracts() {
  return prisma.contract.findMany({ orderBy: { id: "asc" } });
}

export async function getContractById(id: bigint) {
  return prisma.contract.findUnique({ where: { id } });
}

export async function updateContract(id: bigint, data: UpdateContractInput) {
  const payload = toPrismaPayload(data) as Prisma.ContractUncheckedUpdateInput;
  if (typeof payload.email === "string") {
    const trimmedEmail = payload.email.trim();
    payload.email = trimmedEmail.length > 0 ? trimmedEmail : null;
  }
  const shouldRecalculate =
    payload.contracted_volume_mwh !== undefined ||
    payload.lower_limit_percent !== undefined ||
    payload.upper_limit_percent !== undefined ||
    payload.flexibility_percent !== undefined;

  if (!shouldRecalculate) {
    return prisma.contract.update({ where: { id }, data: payload });
  }

  return prisma.$transaction(async (tx) => {
    const existing = await tx.contract.findUnique({
      where: { id },
      select: {
        contracted_volume_mwh: true,
        lower_limit_percent: true,
        upper_limit_percent: true,
        flexibility_percent: true,
      },
    });

    if (!existing) {
      const error = new Error("Contract not found");
      (error as Error & { code?: string }).code = "P2025";
      throw error;
    }

    const merged = {
      contracted_volume_mwh:
        payload.contracted_volume_mwh !== undefined
          ? payload.contracted_volume_mwh
          : existing.contracted_volume_mwh,
      lower_limit_percent:
        payload.lower_limit_percent !== undefined
          ? payload.lower_limit_percent
          : existing.lower_limit_percent,
      upper_limit_percent:
        payload.upper_limit_percent !== undefined
          ? payload.upper_limit_percent
          : existing.upper_limit_percent,
      flexibility_percent:
        payload.flexibility_percent !== undefined
          ? payload.flexibility_percent
          : existing.flexibility_percent,
    };

    const { min, max } = calculateContractDemandBounds({
      contractedVolume: merged.contracted_volume_mwh,
      lowerLimitPercent: merged.lower_limit_percent,
      upperLimitPercent: merged.upper_limit_percent,
      flexibilityPercent: merged.flexibility_percent,
    });

    payload.minDemand = min ?? null;
    payload.maxDemand = max ?? null;

    return tx.contract.update({ where: { id }, data: payload });
  });
}

export async function deleteContract(id: bigint) {
  await prisma.contract.delete({ where: { id } });
}

