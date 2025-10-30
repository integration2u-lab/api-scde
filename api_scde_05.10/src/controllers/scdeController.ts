import { Prisma, Scde } from "@prisma/client";
import { prisma } from "../db";

const generateRecordId = (): bigint => {
  try {
    return process.hrtime.bigint();
  } catch {
    return BigInt(Date.now());
  }
};

export type ScdePayload = {
  recordId?: number | string | bigint | null;
  created_at?: string | Date | null;
  clientName?: string | null;
  periodRef: string;
  consumed?: string | number | Prisma.Decimal | null;
  statusMeasurement?: string | null;
  origin: string[] | string;
  group: string;
};

type UpsertResult =
  | { success: true; message: string; data: Scde }
  | { success: false; message: string; error: unknown };

const normalizeDecimal = (
  value: ScdePayload["consumed"],
): Prisma.Decimal | null | undefined => {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  return value instanceof Prisma.Decimal ? value : new Prisma.Decimal(value);
};

const normalizeOrigin = (value: ScdePayload["origin"]): string => {
  if (Array.isArray(value)) {
    const normalizedItems = value
      .map((item) => (typeof item === "string" ? item.trim() : String(item ?? "").trim()))
      .filter((item) => item.length > 0);
    return normalizedItems.join(", ");
  }

  if (value === undefined || value === null) {
    return "";
  }

  if (typeof value === "string") {
    return value.trim();
  }

  return String(value).trim();
};
export async function upsertSCDE(payload: ScdePayload): Promise<UpsertResult> {
  const context = `[SCDE] group=${payload.group ?? "undefined"} period=${payload.periodRef ?? "undefined"}`;

  try {
    if (!payload.group) {
      throw new Error("Missing required field 'group'.");
    }

    if (!payload.periodRef) {
      throw new Error("Missing required field 'periodRef'.");
    }

    const normalizedOrigin = normalizeOrigin(payload.origin);
    if (normalizedOrigin.length === 0) {
      throw new Error("Field 'origin' must be a non-empty array of strings.");
    }

    const createdAt = (() => {
      if (payload.created_at === undefined || payload.created_at === null) {
        return new Date();
      }

      const date = payload.created_at instanceof Date ? payload.created_at : new Date(payload.created_at);
      if (Number.isNaN(date.getTime())) {
        throw new Error("Invalid date provided for 'created_at'.");
      }

      return date;
    })();

    const recordId = (() => {
      if (payload.recordId === undefined || payload.recordId === null) {
        return generateRecordId();
      }

      return BigInt(payload.recordId);
    })();

    const normalizedConsumed = normalizeDecimal(payload.consumed);
    const normalizedClientName = (() => {
      if (payload.clientName === undefined) {
        return undefined;
      }
      if (payload.clientName === null) {
        return null;
      }
      const trimmed = payload.clientName.trim();
      return trimmed.length > 0 ? trimmed : null;
    })();

    const upsertResult = await prisma.$transaction(async (tx) => {
      let clientId: string | null = null;
      let clientNameToPersist: string | null = normalizedClientName ?? null;

      const contractMatch = await tx.contract.findFirst({
        where: { groupName: payload.group },
        select: { client_id: true, client_name: true },
      });

      if (contractMatch) {
        clientId = contractMatch.client_id;
        if (!clientNameToPersist) {
          clientNameToPersist = contractMatch.client_name;
        }
      }

      if (!clientId && typeof normalizedClientName === "string") {
        let clientRecord = await tx.client.findFirst({ where: { name: normalizedClientName } });

        if (!clientRecord) {
          clientRecord = await tx.client.create({
            data: {
              name: normalizedClientName,
            },
          });
        }

        clientId = clientRecord.clientId;
        clientNameToPersist = clientRecord.name;
      }

      const groupKey =
        payload.group && payload.periodRef
          ? { groupName: payload.group, periodRef: payload.periodRef }
          : null;

      const buildUpdateData = () => ({
        createdAt,
        origin: normalizedOrigin,
        groupName: payload.group,
        ...(normalizedClientName !== undefined
          ? { clientName: clientNameToPersist, client_id: clientId ?? null }
          : {}),
        ...(normalizedConsumed !== undefined ? { consumed: normalizedConsumed } : {}),
        ...(payload.statusMeasurement !== undefined
          ? { statusMeasurement: payload.statusMeasurement ?? null }
          : {}),
      });

      const buildCreateData = () => ({
        recordId,
        createdAt,
        clientName: clientNameToPersist,
        client_id: clientId,
        periodRef: payload.periodRef,
        ...(normalizedConsumed !== undefined ? { consumed: normalizedConsumed } : {}),
        statusMeasurement: payload.statusMeasurement ?? null,
        origin: normalizedOrigin,
        groupName: payload.group,
      });

      if (groupKey) {
        const existingByGroup = await tx.scde.findUnique({
          where: { groupName_periodRef: groupKey },
        });

        if (existingByGroup) {
          return tx.scde.update({
            where: { recordId: existingByGroup.recordId },
            data: buildUpdateData(),
          });
        }
      }

      let existingByClientAndPeriod: Scde | null = null;

      if (clientNameToPersist && payload.periodRef) {
        existingByClientAndPeriod = await tx.scde.findFirst({
          where: {
            clientName: clientNameToPersist,
            periodRef: payload.periodRef,
          },
        });
      }

      if (existingByClientAndPeriod) {
        return tx.scde.update({
          where: { recordId: existingByClientAndPeriod.recordId },
          data: buildUpdateData(),
        });
      }

      if (!groupKey) {
        throw new Error("Missing group or periodRef for SCDE upsert.");
      }

      return tx.scde.upsert({
        where: { groupName_periodRef: groupKey },
        update: buildUpdateData(),
        create: buildCreateData(),
      });
    }, { maxWait: 10000, timeout: 15000 });

    console.info(`${context} upsert succeeded (recordId=${upsertResult.recordId})`);

    return {
      success: true,
      message: `${context} upsert succeeded`,
      data: upsertResult,
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













