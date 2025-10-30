import { Router } from "express";
import { randomUUID } from "node:crypto";
import { Prisma, EnergyBalance } from "@prisma/client";

import { prisma } from "../db";
import { updateEnergyBalance, EnergyBalancePayload } from "../controllers/energyBalanceController";

const router = Router();

const parseId = (value: string) => {
  try {
    return BigInt(value);
  } catch (error) {
    throw new Error("Invalid energy balance id");
  }
};

const pickFirst = <T = unknown>(source: Record<string, unknown>, keys: string[]): T | undefined => {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(source, key)) {
      return source[key] as T;
    }
  }
  return undefined;
};

const parseOptionalBoolean = (value: unknown): boolean | null | undefined => {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return null;
  }
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true" || normalized === "1" || normalized === "yes" || normalized === "y") {
      return true;
    }
    if (normalized === "false" || normalized === "0" || normalized === "no" || normalized === "n") {
      return false;
    }
  }
  if (typeof value === "number") {
    if (value === 1) {
      return true;
    }
    if (value === 0) {
      return false;
    }
  }
  return Boolean(value);
};

const decimalToString = (value: Prisma.Decimal | bigint | number | null | undefined): string | null => {
  if (value === undefined || value === null) {
    return null;
  }

  if (value instanceof Prisma.Decimal) {
    return value.toString();
  }

  return value.toString();
};

const dateToISOString = (value: Date | null | undefined): string | null => {
  if (!value) {
    return null;
  }

  return value.toISOString();
};

const serializeEnergyBalance = (record: EnergyBalance) => ({
  id: record.id.toString(),
  meter: record.meter,
  clientName: record.clientName,
  referenceBase: dateToISOString(record.referenceBase),
  price: decimalToString(record.price),
  reajutedPrice: decimalToString(record.reajuted_price),
  supplier: record.supplier ?? null,
  email: record.email ?? null,
  consumptionKwh: decimalToString(record.consumptionKwh),
  loss: record.loss ?? null,
  requirement: record.requirement ?? null,
  net: record.net ?? null,
  proinfaContribution: decimalToString(record.proinfaContribution),
  contract: decimalToString(record.contract),
  minDemand: decimalToString(record.minDemand),
  maxDemand: decimalToString(record.maxDemand),
  billable: decimalToString(record.billable),
  cpCode: record.cpCode ?? null,
  createdAt: dateToISOString(record.createdAt),
  updatedAt: dateToISOString(record.updatedAt),
  clientId: record.clientId,
  contractId: decimalToString(record.contractId),
  contactActive: record.contactActive ?? null,
  adjusted: record.adjusted ?? null,
  sentOk: record.sentOk ?? null,
  sendDate: dateToISOString(record.sendDate),
  billsDate: dateToISOString(record.billsDate),
});

const energyBalanceToPayload = (
  record: EnergyBalance,
  body: Record<string, unknown>,
): EnergyBalancePayload => {
  const sentOkInput =
    parseOptionalBoolean(pickFirst(body, ["sentOk", "sent_ok"])) ??
    record.sentOk ??
    null;

  return {
    meter: (pickFirst(body, ["meter"]) ?? record.meter) as string,
    clientName: (pickFirst(body, ["clientName", "client_name"]) ?? record.clientName) as string,
    referenceBase: (pickFirst(body, ["referenceBase", "reference_base"]) ?? record.referenceBase) as EnergyBalancePayload["referenceBase"],
    price: (pickFirst(body, ["price"]) ?? record.price?.toString()) as EnergyBalancePayload["price"],
    reajutedPrice: (pickFirst(body, ["reajutedPrice", "reajuted_price"]) ??
      record.reajuted_price?.toString()) as EnergyBalancePayload["reajutedPrice"],
    supplier: (pickFirst(body, ["supplier"]) ?? record.supplier) as EnergyBalancePayload["supplier"],
    email: (pickFirst(body, ["email", "email_address"]) ?? record.email ?? null) as EnergyBalancePayload["email"],
    ativaCKwh: (pickFirst(body, ["ativaCKwh", "ativa_c_kwh"]) ?? record.consumptionKwh?.toString()) as EnergyBalancePayload["ativaCKwh"],
    proinfaContribution: (pickFirst(body, ["proinfaContribution", "proinfa_contribution"]) ?? record.proinfaContribution?.toString()) as EnergyBalancePayload["proinfaContribution"],
    contract: (pickFirst(body, ["contract"]) ?? record.contract?.toString()) as EnergyBalancePayload["contract"],
    adjusted: (pickFirst(body, ["adjusted"]) ?? record.adjusted ?? null) as EnergyBalancePayload["adjusted"],
    contactActive: (parseOptionalBoolean(pickFirst(body, ["contactActive", "contact_active"])) ?? record.contactActive ?? null) as EnergyBalancePayload["contactActive"],
    clientId: (pickFirst(body, ["clientId", "client_id"]) ?? record.clientId) as EnergyBalancePayload["clientId"],
    contractId: (pickFirst(body, ["contractId", "contract_id"]) ?? record.contractId?.toString()) as EnergyBalancePayload["contractId"],
    sentOk: sentOkInput as EnergyBalancePayload["sentOk"],
    sendDate: (pickFirst(body, ["sendDate", "send_date"]) ?? record.sendDate?.toISOString() ?? null) as EnergyBalancePayload["sendDate"],
    billsDate: (pickFirst(body, ["billsDate", "bills_date"]) ?? record.billsDate?.toISOString() ?? null) as EnergyBalancePayload["billsDate"],
    createdAt: (pickFirst(body, ["createdAt", "created_at"]) ?? record.createdAt?.toISOString()) as EnergyBalancePayload["createdAt"],
    updatedAt: (pickFirst(body, ["updatedAt", "updated_at"]) ?? new Date().toISOString()) as EnergyBalancePayload["updatedAt"],
  };
};

router.get("/", async (_req, res) => {
  try {
    const records = await prisma.energyBalance.findMany({
      orderBy: { id: "desc" },
    });
    res.json(records.map(serializeEnergyBalance));
  } catch (error) {
    res.status(500).json({ message: "Failed to list energy balance records." });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const id = parseId(req.params.id);
    const record = await prisma.energyBalance.findUnique({ where: { id } });

    if (!record) {
      return res.status(404).json({ message: "Energy balance not found." });
    }

    res.json(serializeEnergyBalance(record));
  } catch (error) {
    if (error instanceof Error && error.message === "Invalid energy balance id") {
      return res.status(400).json({ message: error.message });
    }

    res.status(500).json({ message: "Failed to fetch energy balance record." });
  }
});

router.post("/", async (req, res) => {
  try {
    const body = (req.body ?? {}) as Partial<EnergyBalancePayload>;
    const payload = {
      ...body,
      clientId:
        typeof body.clientId === "string" && body.clientId.trim().length > 0
          ? body.clientId
          : randomUUID(),
    } as EnergyBalancePayload;

    const result = await updateEnergyBalance(payload);

    if (!result.success) {
      return res.status(400).json({ message: result.message });
    }

    res.status(201).json(serializeEnergyBalance(result.data));
  } catch (error) {
    res.status(500).json({ message: "Failed to create energy balance record." });
  }
});

router.put("/:id", async (req, res) => {
  try {
    const id = parseId(req.params.id);
    const existing = await prisma.energyBalance.findUnique({ where: { id } });

    if (!existing) {
      return res.status(404).json({ message: "Energy balance not found." });
    }

    const payload = energyBalanceToPayload(existing, req.body ?? {});
    const result = await updateEnergyBalance(payload);

    if (!result.success) {
      return res.status(400).json({ message: result.message });
    }

    res.json(serializeEnergyBalance(result.data));
  } catch (error) {
    if (error instanceof Error && error.message === "Invalid energy balance id") {
      return res.status(400).json({ message: error.message });
    }

    res.status(500).json({ message: "Failed to update energy balance record." });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const id = parseId(req.params.id);
    await prisma.energyBalance.delete({ where: { id } });
    res.status(204).send();
  } catch (error) {
    if (error instanceof Error && error.message === "Invalid energy balance id") {
      return res.status(400).json({ message: error.message });
    }

    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      return res.status(404).json({ message: "Energy balance not found." });
    }

    res.status(500).json({ message: "Failed to delete energy balance record." });
  }
});

export const energyBalanceRouter = router;


