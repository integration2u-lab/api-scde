import dotenv from "dotenv";
import express, { Request, Response } from "express";
import cors from "cors";
import { PrismaClient, Prisma, Scde, energy_contracts_v2 } from "@prisma/client";

dotenv.config();

const app = express();
const prisma = new PrismaClient();

app.use(cors());
app.use(express.json());

const PORT = Number(process.env.PORT ?? 3000);

class ValidationError extends Error {}

type SerializableScde = Omit<Scde, "id"> & { id: string };
type SerializableEnergyContract = Omit<energy_contracts_v2, "id"> & { id: string };

type Payload = Record<string, unknown>;

type RecordConfig = {
  decimalFields: readonly string[];
  stringFields: readonly string[];
};

const scdeConfig: RecordConfig = {
  decimalFields: [
    "price",
    "adjusted",
    "consumption",
    "proinfa",
    "contract",
    "minimum",
    "maximum",
    "to_bill"
  ],
  stringFields: ["supplier", "meter", "measurement", "cp"]
};

const energyContractsConfig: RecordConfig = {
  decimalFields: [
    "price",
    "adjusted",
    "consumption",
    "proinfa",
    "contract",
    "minimum",
    "maximum",
    "to_invoice"
  ],
  stringFields: ["supplier", "meter", "measurement", "cp", "unnamed_14"]
};

const serializeScde = (record: Scde): SerializableScde => ({
  ...record,
  id: record.id.toString()
});

const serializeEnergyContract = (
  record: energy_contracts_v2
): SerializableEnergyContract => ({
  ...record,
  id: record.id.toString()
});

const toDecimal = (value: unknown, field: string) => {
  if (value === null) {
    return null;
  }

  if (value instanceof Prisma.Decimal) {
    return value;
  }

  if (typeof value === "string" || typeof value === "number") {
    if (value === "") {
      throw new ValidationError(`Field ${field} cannot be an empty string`);
    }

    try {
      return new Prisma.Decimal(value);
    } catch (error) {
      throw new ValidationError(`Field ${field} must be a numeric value`);
    }
  }

  throw new ValidationError(`Field ${field} must be a number or string`);
};

const toDate = (value: unknown) => {
  if (value === null || value === undefined) {
    return value ?? undefined;
  }

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      throw new ValidationError("Field base_date must be a valid date");
    }
    return value;
  }

  if (typeof value === "string" || typeof value === "number") {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      throw new ValidationError("Field base_date must be a valid date");
    }
    return date;
  }

  throw new ValidationError("Field base_date must be a valid date");
};

const normalizeCharges = (value: unknown) => {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch (error) {
      throw new ValidationError("Field charges must be valid JSON");
    }
  }

  return value;
};

const buildRecordData = (
  payload: Payload,
  {
    requireClient = false,
    config
  }: { requireClient?: boolean; config: RecordConfig }
): Record<string, unknown> => {
  const data: Record<string, unknown> = {};

  if (Object.prototype.hasOwnProperty.call(payload, "client")) {
    const rawClient = payload["client"];

    if (typeof rawClient !== "string" || rawClient.trim() === "") {
      throw new ValidationError("Field client must be a non-empty string");
    }

    data.client = rawClient.trim();
  } else if (requireClient) {
    throw new ValidationError("Field client is required");
  }

  if (Object.prototype.hasOwnProperty.call(payload, "base_date")) {
    data.base_date = toDate(payload["base_date"]);
  }

  config.decimalFields.forEach((field) => {
    if (Object.prototype.hasOwnProperty.call(payload, field)) {
      const value = payload[field];
      if (value === undefined) {
        return;
      }
      data[field] = toDecimal(value, field);
    }
  });

  config.stringFields.forEach((field) => {
    if (Object.prototype.hasOwnProperty.call(payload, field)) {
      const value = payload[field];
      if (value === undefined) {
        return;
      }
      if (value === null) {
        data[field] = null;
        return;
      }
      if (typeof value !== "string") {
        throw new ValidationError(`Field ${field} must be a string or null`);
      }
      data[field] = value;
    }
  });

  if (Object.prototype.hasOwnProperty.call(payload, "charges")) {
    data.charges = normalizeCharges(payload["charges"]);
  }

  return data;
};

app.get("/health", (req: Request, res: Response) => {
  res.json({ ok: true });
});

app.get("/scde", async (req: Request, res: Response) => {
  try {
    const records = await prisma.scde.findMany({
      take: 50,
      orderBy: { id: "desc" }
    });

    res.json(records.map(serializeScde));
  } catch (error) {
    console.error("Failed to list scde records", error);
    res.status(500).json({ error: "Failed to fetch scde records" });
  }
});

app.get("/scde/:id", async (req: Request, res: Response) => {
  let scdeId: bigint;

  try {
    scdeId = BigInt(req.params.id);
  } catch (error) {
    return res.status(400).json({ error: "Invalid id" });
  }

  try {
    const record = await prisma.scde.findUnique({
      where: { id: scdeId }
    });

    if (!record) {
      return res.status(404).json({ error: "Record not found" });
    }

    res.json(serializeScde(record));
  } catch (error) {
    console.error(`Failed to fetch scde record ${req.params.id}`, error);
    res.status(500).json({ error: "Failed to fetch scde record" });
  }
});

app.post("/scde", async (req: Request, res: Response) => {
  const payload = (req.body ?? {}) as Payload;

  try {
    const data = buildRecordData(payload, {
      requireClient: true,
      config: scdeConfig
    });
    const created = await prisma.scde.create({
      data: data as Prisma.ScdeCreateInput
    });

    res.status(201).json(serializeScde(created));
  } catch (error) {
    if (error instanceof ValidationError) {
      return res.status(400).json({ error: error.message });
    }

    console.error("Failed to create scde record", error);
    res.status(500).json({ error: "Failed to create scde record" });
  }
});

app.put("/scde/:id", async (req: Request, res: Response) => {
  let scdeId: bigint;

  try {
    scdeId = BigInt(req.params.id);
  } catch (error) {
    return res.status(400).json({ error: "Invalid id" });
  }

  const payload = (req.body ?? {}) as Payload;

  try {
    const data = buildRecordData(payload, { config: scdeConfig });

    if (Object.keys(data).length === 0) {
      return res.status(400).json({ error: "No fields provided to update" });
    }

    const updated = await prisma.scde.update({
      where: { id: scdeId },
      data: data as Prisma.ScdeUpdateInput
    });

    res.json(serializeScde(updated));
  } catch (error) {
    if (error instanceof ValidationError) {
      return res.status(400).json({ error: error.message });
    }

    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      return res.status(404).json({ error: "Record not found" });
    }

    console.error(`Failed to update scde record ${req.params.id}`, error);
    res.status(500).json({ error: "Failed to update scde record" });
  }
});

app.delete("/scde/:id", async (req: Request, res: Response) => {
  let scdeId: bigint;

  try {
    scdeId = BigInt(req.params.id);
  } catch (error) {
    return res.status(400).json({ error: "Invalid id" });
  }

  try {
    await prisma.scde.delete({
      where: { id: scdeId }
    });

    res.status(204).send();
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      return res.status(404).json({ error: "Record not found" });
    }

    console.error(`Failed to delete scde record ${req.params.id}`, error);
    res.status(500).json({ error: "Failed to delete scde record" });
  }
});

app.get("/energy-contracts", async (req: Request, res: Response) => {
  try {
    const records = await prisma.energy_contracts_v2.findMany({
      take: 50,
      orderBy: { id: "desc" }
    });

    res.json(records.map(serializeEnergyContract));
  } catch (error) {
    console.error("Failed to list energy contracts", error);
    res.status(500).json({ error: "Failed to fetch energy contracts" });
  }
});

app.get("/energy-contracts/:id", async (req: Request, res: Response) => {
  let contractId: bigint;

  try {
    contractId = BigInt(req.params.id);
  } catch (error) {
    return res.status(400).json({ error: "Invalid id" });
  }

  try {
    const record = await prisma.energy_contracts_v2.findUnique({
      where: { id: contractId }
    });

    if (!record) {
      return res.status(404).json({ error: "Record not found" });
    }

    res.json(serializeEnergyContract(record));
  } catch (error) {
    console.error(`Failed to fetch energy contract ${req.params.id}`, error);
    res.status(500).json({ error: "Failed to fetch energy contract" });
  }
});

app.post("/energy-contracts", async (req: Request, res: Response) => {
  const payload = (req.body ?? {}) as Payload;

  try {
    const data = buildRecordData(payload, {
      requireClient: true,
      config: energyContractsConfig
    });

    const created = await prisma.energy_contracts_v2.create({
      data: data as Prisma.energy_contracts_v2CreateInput
    });

    res.status(201).json(serializeEnergyContract(created));
  } catch (error) {
    if (error instanceof ValidationError) {
      return res.status(400).json({ error: error.message });
    }

    console.error("Failed to create energy contract", error);
    res.status(500).json({ error: "Failed to create energy contract" });
  }
});

app.put("/energy-contracts/:id", async (req: Request, res: Response) => {
  let contractId: bigint;

  try {
    contractId = BigInt(req.params.id);
  } catch (error) {
    return res.status(400).json({ error: "Invalid id" });
  }

  const payload = (req.body ?? {}) as Payload;

  try {
    const data = buildRecordData(payload, { config: energyContractsConfig });

    if (Object.keys(data).length === 0) {
      return res.status(400).json({ error: "No fields provided to update" });
    }

    const updated = await prisma.energy_contracts_v2.update({
      where: { id: contractId },
      data: data as Prisma.energy_contracts_v2UpdateInput
    });

    res.json(serializeEnergyContract(updated));
  } catch (error) {
    if (error instanceof ValidationError) {
      return res.status(400).json({ error: error.message });
    }

    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      return res.status(404).json({ error: "Record not found" });
    }

    console.error(`Failed to update energy contract ${req.params.id}`, error);
    res.status(500).json({ error: "Failed to update energy contract" });
  }
});

app.delete("/energy-contracts/:id", async (req: Request, res: Response) => {
  let contractId: bigint;

  try {
    contractId = BigInt(req.params.id);
  } catch (error) {
    return res.status(400).json({ error: "Invalid id" });
  }

  try {
    await prisma.energy_contracts_v2.delete({
      where: { id: contractId }
    });

    res.status(204).send();
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      return res.status(404).json({ error: "Record not found" });
    }

    console.error(`Failed to delete energy contract ${req.params.id}`, error);
    res.status(500).json({ error: "Failed to delete energy contract" });
  }
});

app.listen(PORT, () => {
  console.log(`API running at http://localhost:${PORT}`);
});

process.on("SIGINT", async () => {
  await prisma.$disconnect();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  await prisma.$disconnect();
  process.exit(0);
});
