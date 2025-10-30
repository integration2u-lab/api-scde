import dotenv from "dotenv";
import express, { Request, Response } from "express";
import cors from "cors";
import { Prisma, PrismaClient, Scde, EnergyBalance } from "@prisma/client";
import * as XLSX from "xlsx";

dotenv.config();

const app = express();
const basePrisma = new PrismaClient();

const PORT = Number(process.env.PORT ?? 3000);
const JSON_BODY_LIMIT = process.env.JSON_BODY_LIMIT?.trim() || "10mb";

app.use(cors());
app.use(express.json({ limit: JSON_BODY_LIMIT }));

type SerializableScde = Omit<Scde, "id"> & { id: string };

type IncomingScde = Record<string, unknown>;

type ImportableRecord = IncomingScde & { __rowNumber?: number };

type ParsedRecord = {
  client: string;
  createData: Prisma.ScdeUncheckedCreateInput;
  updateData: Prisma.ScdeUncheckedUpdateInput;
};

type PendingItem = {
  item: IncomingScde;
  message: string;
  rowNumber?: number;
};

type SpreadsheetImportPayload = {
  base64: string;
  sheet?: string;
  sheetName?: string;
  tab?: string;
  aba?: string;
  headerRow?: number | string;
};

type SpreadsheetParseResult = {
  records: ImportableRecord[];
  sheetName: string;
  headerRow: number;
};

type SerializableEnergyBalance = Omit<
  EnergyBalance,
  "consumoKwh" | "valorTotal" | "proinfaContribution" | "dataBase" | "createdAt" | "updatedAt"
> & {
  consumoKwh: number;
  valorTotal: number;
  proinfaContribution: number | null;
  dataBase: string;
  createdAt: string;
  updatedAt: string;
};

const serialize = (record: Scde): SerializableScde => ({
  ...record,
  id: record.id.toString()
});

const decimalToNumber = (value: Prisma.Decimal | null | undefined): number | null => {
  if (value === undefined) {
    return null;
  }
  if (value === null) {
    return null;
  }
  return Number(value.toString());
};

const decimalsEqual = (
  left: Prisma.Decimal | null | undefined,
  right: Prisma.Decimal | null | undefined
): boolean => {
  if (left === null || left === undefined) {
    return right === null || right === undefined;
  }
  if (right === null || right === undefined) {
    return false;
  }
  return left.equals(right);
};

const computeScdeToBill = ({
  price,
  adjusted,
  consumption,
  proinfa
}: {
  price?: Prisma.Decimal | null;
  adjusted?: Prisma.Decimal | null;
  consumption?: Prisma.Decimal | null;
  proinfa?: Prisma.Decimal | null;
}): Prisma.Decimal | null => {
  const unitPrice = adjusted ?? price;
  if (!unitPrice || !consumption) {
    return proinfa ?? null;
  }

  try {
    let total = unitPrice.mul(consumption);
    if (proinfa) {
      total = total.plus(proinfa);
    }
    return total;
  } catch (error) {
    console.warn("Failed to compute SCDE to_bill", error);
    return null;
  }
};

const serializeEnergyBalance = (record: EnergyBalance): SerializableEnergyBalance => ({
  id: record.id,
  clienteNome: record.clienteNome,
  numeroInstalacao: record.numeroInstalacao,
  referencia: record.referencia,
  dataBase: record.dataBase.toISOString(),
  consumoKwh: Number(record.consumoKwh.toString()),
  valorTotal: Number(record.valorTotal.toString()),
  proinfaContribution: decimalToNumber(record.proinfaContribution),
  origin: record.origin,
  status: record.status,
  importBatchId: record.importBatchId,
  createdAt: record.createdAt.toISOString(),
  updatedAt: record.updatedAt.toISOString()
});

const toDecimal = (value: unknown, field: string): Prisma.Decimal | null | undefined => {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return null;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed.length) {
      return null;
    }
    try {
      return new Prisma.Decimal(trimmed);
    } catch (error) {
      throw new Error(`Field ${field} must be a valid number`);
    }
  }
  if (typeof value === "number") {
    try {
      return new Prisma.Decimal(value);
    } catch (error) {
      throw new Error(`Field ${field} must be a valid number`);
    }
  }
  throw new Error(`Field ${field} must be a number or numeric string`);
};

const toDate = (value: unknown, field: string): Date | null | undefined => {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return null;
  }
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      throw new Error(`Field ${field} must be a valid date`);
    }
    return value;
  }
  if (typeof value === "string" || typeof value === "number") {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      throw new Error(`Field ${field} must be a valid date`);
    }
    return date;
  }
  throw new Error(`Field ${field} must be a valid date value`);
};

const toOptionalString = (value: unknown, field: string): string | null | undefined => {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return null;
  }
  if (typeof value === "string") {
    return value;
  }
  throw new Error(`Field ${field} must be a string`);
};

const toJson = (value: unknown, field: string): Prisma.JsonValue | null | undefined => {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return null;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed.length) {
      return null;
    }
    try {
      return JSON.parse(trimmed);
    } catch (error) {
      throw new Error(`Field ${field} must be a valid JSON string`);
    }
  }
  return value as Prisma.JsonValue;
};

const normalizeJsonForWrite = (
  value: Prisma.JsonValue | null
): Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput => {
  if (value === null) {
    return Prisma.JsonNull;
  }
  return value as Prisma.InputJsonValue;
};

const extractDecimalFromUpdate = (
  value: unknown
): Prisma.Decimal | null | undefined => {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return null;
  }
  if (value instanceof Prisma.Decimal) {
    return value;
  }
  if (typeof value === "object") {
    const candidate = value as { set?: unknown };
    if (candidate && Object.prototype.hasOwnProperty.call(candidate, "set")) {
      return extractDecimalFromUpdate(candidate.set);
    }
  }
  if (typeof value === "string" || typeof value === "number") {
    try {
      return new Prisma.Decimal(value);
    } catch (error) {
      console.warn("Unable to convert value to Prisma.Decimal", error);
      return undefined;
    }
  }
  return undefined;
};

const prisma = basePrisma.$extends({
  query: {
    energyBalance: {
      async update({ args, query }) {
        const result = await query(args);
        const updateData = args.data as Record<string, unknown> | undefined;
        const proinfaCandidate =
          updateData?.proinfaContribution ?? updateData?.proinfa_contribution;
        const extracted = extractDecimalFromUpdate(proinfaCandidate);
        if (extracted !== undefined) {
          await recalculateScdeForEnergyBalance(result as EnergyBalance);
        }
        return result;
      },
      async upsert({ args, query }) {
        const result = await query(args);
        const updateData = args.update as Record<string, unknown> | undefined;
        const createData = args.create as Record<string, unknown> | undefined;
        const updateExtracted = extractDecimalFromUpdate(
          updateData?.proinfaContribution ?? updateData?.proinfa_contribution
        );
        const createExtracted = extractDecimalFromUpdate(
          createData?.proinfaContribution ?? createData?.proinfa_contribution
        );
        if (updateExtracted !== undefined || createExtracted !== undefined) {
          await recalculateScdeForEnergyBalance(result as EnergyBalance);
        }
        return result;
      },
      async create({ args, query }) {
        const result = await query(args);
        const createData = args.data as Record<string, unknown> | undefined;
        const createExtracted = extractDecimalFromUpdate(
          createData?.proinfaContribution ?? createData?.proinfa_contribution
        );
        if (createExtracted !== undefined) {
          await recalculateScdeForEnergyBalance(result as EnergyBalance);
        }
        return result;
      }
    }
  }
});

async function recalculateScdeForEnergyBalance(
  balance: EnergyBalance
): Promise<void> {
  const proinfa = balance.proinfaContribution ?? null;

  const searchConditions: Prisma.ScdeWhereInput[] = [];
  const installation = balance.numeroInstalacao?.trim();
  if (installation) {
    searchConditions.push({ meter: installation });
  }
  const clientName = balance.clienteNome?.trim();
  if (clientName) {
    searchConditions.push({ client: clientName });
  }

  if (!searchConditions.length) {
    return;
  }

  const baseWhere: Prisma.ScdeWhereInput = { OR: searchConditions };

  let relatedRecords: Scde[] = [];

  if (balance.dataBase instanceof Date) {
    relatedRecords = await prisma.scde.findMany({
      where: {
        AND: [baseWhere, { base_date: balance.dataBase }]
      }
    });
  }

  if (!relatedRecords.length) {
    relatedRecords = await prisma.scde.findMany({ where: baseWhere });
  }

  for (const record of relatedRecords) {
    const computedToBill = computeScdeToBill({
      price: record.price,
      adjusted: record.adjusted,
      consumption: record.consumption,
      proinfa
    });

    const updateData: Prisma.ScdeUncheckedUpdateInput = {};
    let hasChanges = false;

    if (!decimalsEqual(record.proinfa, proinfa)) {
      updateData.proinfa = proinfa;
      hasChanges = true;
    }

    if (computedToBill !== null) {
      const currentToBill = record.to_bill;
      if (currentToBill === null || !currentToBill.equals(computedToBill)) {
        updateData.to_bill = computedToBill;
        hasChanges = true;
      }
    }

    if (hasChanges) {
      await prisma.scde.update({
        where: { id: record.id },
        data: updateData
      });
    }
  }
}

const HEADER_MAP: Record<string, keyof Prisma.ScdeUncheckedCreateInput | "charges"> = {
  client: "client",
  cliente: "client",
  cliente_codigo: "client",
  codigo_cliente: "client",
  cod_cliente: "client",
  id_cliente: "client",
  clienteid: "client",
  price: "price",
  preco: "price",
  preco_energia: "price",
  preco_r_mwh: "price",
  valor_unitario: "price",
  valor_mwh: "price",
  base_date: "base_date",
  data_base: "base_date",
  data: "base_date",
  competencia: "base_date",
  mes_referencia: "base_date",
  adjusted: "adjusted",
  ajustado: "adjusted",
  valor_ajustado: "adjusted",
  supplier: "supplier",
  fornecedor: "supplier",
  meter: "meter",
  medidor: "meter",
  consumo: "consumption",
  consumption: "consumption",
  consumo_total: "consumption",
  measurement: "measurement",
  medicao: "measurement",
  proinfa: "proinfa",
  contract: "contract",
  contrato: "contract",
  contrato_mwh: "contract",
  minimum: "minimum",
  minimo: "minimum",
  consumo_minimo: "minimum",
  maximum: "maximum",
  maximo: "maximum",
  consumo_maximo: "maximum",
  to_bill: "to_bill",
  valor_faturar: "to_bill",
  a_faturar: "to_bill",
  faturar: "to_bill",
  cp: "cp",
  centro_custo: "cp",
  charges: "charges",
  encargos: "charges",
  detalhes_encargos: "charges"
};

const normalizeHeaderName = (value: unknown): string | null => {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return normalized.length ? normalized : null;
};

const resolveFieldFromHeader = (
  value: unknown
): keyof Prisma.ScdeUncheckedCreateInput | "charges" | null => {
  const normalized = normalizeHeaderName(value);
  if (!normalized) {
    return null;
  }

  const mapped = HEADER_MAP[normalized];
  if (mapped) {
    return mapped;
  }

  if (normalized.includes("client") || normalized.includes("cliente")) {
    return "client";
  }
  if (
    normalized.includes("preco") ||
    normalized.includes("price") ||
    normalized.includes("valor_mwh") ||
    normalized.includes("valor_unit")
  ) {
    return "price";
  }
  if (
    normalized === "data" ||
    normalized.includes("data_base") ||
    (normalized.includes("data") && normalized.includes("base")) ||
    normalized.includes("competencia") ||
    normalized.includes("mes_referencia")
  ) {
    return "base_date";
  }
  if (normalized.includes("ajust")) {
    return "adjusted";
  }
  if (normalized.includes("fornecedor") || normalized.includes("supplier")) {
    return "supplier";
  }
  if (normalized.includes("medidor") || normalized.includes("meter")) {
    return "meter";
  }
  if (normalized.includes("proinfa")) {
    return "proinfa";
  }
  if (normalized.includes("contrat")) {
    return "contract";
  }
  if (normalized.includes("minim")) {
    return "minimum";
  }
  if (normalized.includes("maxim")) {
    return "maximum";
  }
  if (
    normalized.includes("consumo_max") ||
    normalized.includes("consumo_min")
  ) {
    return normalized.includes("max") ? "maximum" : "minimum";
  }
  if (normalized.includes("consumo") || normalized.includes("consumption")) {
    return "consumption";
  }
  if (normalized.includes("medicao") || normalized.includes("measurement")) {
    return "measurement";
  }
  if (normalized.includes("fatur") || normalized.includes("to_bill") || normalized.includes("bill")) {
    return "to_bill";
  }
  if (normalized === "cp" || normalized.includes("centro_custo")) {
    return "cp";
  }
  if (normalized.includes("encarg") || normalized.includes("charge")) {
    return "charges";
  }

  return null;
};

const normalizeBase64 = (raw: string): string => {
  const trimmed = raw.trim();
  if (!trimmed.length) {
    return trimmed;
  }
  if (trimmed.startsWith("data:")) {
    const commaIndex = trimmed.indexOf(",");
    if (commaIndex !== -1) {
      return trimmed.slice(commaIndex + 1);
    }
  }
  return trimmed;
};

const resolveSheetName = (available: string[], desired?: string): string => {
  if (!available.length) {
    throw new Error("A planilha n�o possui abas");
  }

  if (desired) {
    const trimmed = desired.trim();
    if (trimmed.length) {
      const exact = available.find((sheet) => sheet === trimmed);
      if (exact) {
        return exact;
      }
      const lowered = trimmed.toLowerCase();
      const caseInsensitive = available.find((sheet) => sheet.toLowerCase() === lowered);
      if (caseInsensitive) {
        return caseInsensitive;
      }
    }
  }

  const julCandidate = available.find((sheet) => sheet.toLowerCase() === "jul25");
  if (julCandidate) {
    return julCandidate;
  }

  return available[0];
};

const resolveHeaderRowIndex = (value: SpreadsheetImportPayload["headerRow"]): number => {
  if (value === undefined || value === null) {
    return 0;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    if (value <= 1) {
      return 0;
    }
    return Math.max(0, Math.floor(value - 1));
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed.length) {
      return 0;
    }
    const parsed = Number(trimmed);
    if (!Number.isNaN(parsed)) {
      if (parsed <= 1) {
        return 0;
      }
      return Math.max(0, Math.floor(parsed - 1));
    }
  }

  return 0;
};

const parseSpreadsheet = (payload: SpreadsheetImportPayload): SpreadsheetParseResult => {
  if (typeof payload.base64 !== "string") {
    throw new Error("Campo base64 deve ser uma string");
  }

  const cleanedBase64 = normalizeBase64(payload.base64);
  if (!cleanedBase64.length) {
    throw new Error("Campo base64 est� vazio");
  }

  const workbook = XLSX.read(cleanedBase64, { type: "base64", cellDates: true });
  if (!workbook.SheetNames.length) {
    throw new Error("Arquivo sem abas dispon�veis");
  }

  const desiredSheet =
    (typeof payload.sheet === "string" && payload.sheet.trim().length ? payload.sheet : undefined) ??
    (typeof payload.sheetName === "string" && payload.sheetName.trim().length ? payload.sheetName : undefined) ??
    (typeof payload.tab === "string" && payload.tab.trim().length ? payload.tab : undefined) ??
    (typeof payload.aba === "string" && payload.aba.trim().length ? payload.aba : undefined);

  const sheetName = resolveSheetName(workbook.SheetNames, desiredSheet);
  const worksheet = workbook.Sheets[sheetName];
  if (!worksheet) {
    throw new Error(`Aba ${sheetName} n�o encontrada no arquivo`);
  }

  const headerRowIndex = resolveHeaderRowIndex(payload.headerRow);

  const rows = XLSX.utils.sheet_to_json(worksheet, {
    header: 1,
    defval: null,
    blankrows: false,
    raw: true
  }) as unknown[][];

  if (rows.length <= headerRowIndex) {
    throw new Error(`Linha de cabe�alho ${headerRowIndex + 1} n�o encontrada na planilha`);
  }

  const headerRow = rows[headerRowIndex];
  const fieldPerColumn = headerRow.map((cell) => resolveFieldFromHeader(cell));

  const dataRows = rows.slice(headerRowIndex + 1);
  const records: ImportableRecord[] = [];

  dataRows.forEach((row, index) => {
    if (!Array.isArray(row)) {
      return;
    }

    const rowNumber = headerRowIndex + 2 + index;
    const record: ImportableRecord = { __rowNumber: rowNumber };
    let hasMeaningfulValue = false;

    row.forEach((value, columnIndex) => {
      const field = columnIndex === 0 ? "client" : fieldPerColumn[columnIndex];
      if (!field) {
        return;
      }

      if (value === null || value === undefined) {
        return;
      }

      if (typeof value === "string") {
        const trimmedValue = value.trim();
        if (!trimmedValue.length) {
          return;
        }
        hasMeaningfulValue = true;
        if (field === "client") {
          record.client = trimmedValue;
        } else if (field === "base_date") {
          record.base_date = trimmedValue;
        } else {
          record[field] = trimmedValue;
        }
        return;
      }

      hasMeaningfulValue = true;

      if (value instanceof Date) {
        if (field === "client") {
          record.client = value.toISOString();
          return;
        }
        if (field === "base_date") {
          record.base_date = value;
        } else {
          record[field] = value;
        }
        return;
      }

      if (typeof value === "number") {
        if (field === "client") {
          record.client = value.toString();
        } else {
          record[field] = value;
        }
        return;
      }

      record[field] = value;
    });

    const clientValue = record.client;
    if (!hasMeaningfulValue) {
      return;
    }

    if (typeof clientValue === "string") {
      const trimmedClient = clientValue.trim();
      if (!trimmedClient.length) {
        return;
      }
      record.client = trimmedClient;
      records.push(record);
      return;
    }

    if (typeof clientValue === "number") {
      record.client = clientValue.toString();
      records.push(record);
      return;
    }

    if (clientValue instanceof Date) {
      record.client = clientValue.toISOString();
      records.push(record);
      return;
    }
  });

  return {
    records,
    sheetName,
    headerRow: headerRowIndex
  };
};

const parseRecord = (item: IncomingScde): ParsedRecord => {
  if (typeof item !== "object" || item === null) {
    throw new Error("Each entry must be an object");
  }

  const clientRaw = item.client;
  if (typeof clientRaw !== "string" || clientRaw.trim().length === 0) {
    throw new Error("Field client is required");
  }
  const client = clientRaw.trim();

  const createData: Prisma.ScdeUncheckedCreateInput = { client };
  const updateData: Prisma.ScdeUncheckedUpdateInput = {};

  const price = toDecimal(item.price, "price");
  if (price !== undefined) {
    createData.price = price;
    updateData.price = price;
  }

  const baseDate = toDate(item.base_date, "base_date");
  if (baseDate !== undefined) {
    createData.base_date = baseDate;
    updateData.base_date = baseDate;
  }

  const adjusted = toDecimal(item.adjusted, "adjusted");
  if (adjusted !== undefined) {
    createData.adjusted = adjusted;
    updateData.adjusted = adjusted;
  }

  const supplier = toOptionalString(item.supplier, "supplier");
  if (supplier !== undefined) {
    createData.supplier = supplier;
    updateData.supplier = supplier;
  }

  const meter = toOptionalString(item.meter, "meter");
  if (meter !== undefined) {
    createData.meter = meter;
    updateData.meter = meter;
  }

  const consumption = toDecimal(item.consumption, "consumption");
  if (consumption !== undefined) {
    createData.consumption = consumption;
    updateData.consumption = consumption;
  }

  const measurement = toOptionalString(item.measurement, "measurement");
  if (measurement !== undefined) {
    createData.measurement = measurement;
    updateData.measurement = measurement;
  }

  const proinfa = toDecimal(item.proinfa, "proinfa");
  if (proinfa !== undefined) {
    createData.proinfa = proinfa;
    updateData.proinfa = proinfa;
  }

  const contract = toDecimal(item.contract, "contract");
  if (contract !== undefined) {
    createData.contract = contract;
    updateData.contract = contract;
  }

  const minimum = toDecimal(item.minimum, "minimum");
  if (minimum !== undefined) {
    createData.minimum = minimum;
    updateData.minimum = minimum;
  }

  const maximum = toDecimal(item.maximum, "maximum");
  if (maximum !== undefined) {
    createData.maximum = maximum;
    updateData.maximum = maximum;
  }

  const toBill = toDecimal(item.to_bill, "to_bill");
  if (toBill !== undefined) {
    createData.to_bill = toBill;
    updateData.to_bill = toBill;
  } else {
    const computedToBill = computeScdeToBill({
      price: price === undefined ? undefined : price,
      adjusted: adjusted === undefined ? undefined : adjusted,
      consumption: consumption === undefined ? undefined : consumption,
      proinfa: proinfa === undefined ? undefined : proinfa
    });
    if (computedToBill !== null) {
      createData.to_bill = computedToBill;
      updateData.to_bill = computedToBill;
    }
  }

  const cp = toOptionalString(item.cp, "cp");
  if (cp !== undefined) {
    const normalizedCp = cp === null ? "None." : cp;
    createData.cp = normalizedCp;
    updateData.cp = normalizedCp;
  }

  const charges = toJson(item.charges, "charges");
  if (charges !== undefined) {
    const normalizedCharges = normalizeJsonForWrite(charges);
    createData.charges = normalizedCharges;
    updateData.charges = normalizedCharges;
  }

  return { client, createData, updateData };
};

app.get("/health", (_req: Request, res: Response) => {
  res.json({ ok: true });
});

app.patch("/energy-balance/:id/proinfa", async (req: Request, res: Response) => {
  const { id } = req.params;
  if (typeof id !== "string" || id.trim().length === 0) {
    return res.status(400).json({ error: "Invalid id" });
  }

  const payload = (req.body ?? {}) as Record<string, unknown>;
  const rawValue = Object.prototype.hasOwnProperty.call(payload, "proinfaContribution")
    ? payload.proinfaContribution
    : payload.proinfa_contribution;

  let proinfa: Prisma.Decimal | null | undefined;
  try {
    proinfa = toDecimal(rawValue, "proinfaContribution");
  } catch (error) {
    return res.status(400).json({
      error: error instanceof Error ? error.message : "Invalid proinfaContribution"
    });
  }

  if (proinfa === undefined) {
    return res.status(400).json({ error: "Field proinfaContribution is required" });
  }

  try {
    const updated = await prisma.energyBalance.update({
      where: { id },
      data: {
        proinfaContribution: proinfa,
        updatedAt: new Date()
      }
    });

    res.json(serializeEnergyBalance(updated));
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      return res.status(404).json({ error: "Record not found" });
    }
    res.status(500).json({ error: "Failed to update energy balance" });
  }
});

app.get("/scde", async (_req: Request, res: Response) => {
  try {
    const records = await prisma.scde.findMany({
      take: 50,
      orderBy: { id: "desc" }
    });
    res.json(records.map(serialize));
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch records" });
  }
});

app.get("/scde/:id", async (req: Request, res: Response) => {
  let recordId: bigint;
  try {
    recordId = BigInt(req.params.id);
  } catch (error) {
    return res.status(400).json({ error: "Invalid id" });
  }

  try {
    const record = await prisma.scde.findUnique({
      where: { id: recordId }
    });

    if (!record) {
      return res.status(404).json({ error: "Record not found" });
    }

    res.json(serialize(record));
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch record" });
  }
});

app.post("/scde", async (req: Request, res: Response) => {
  let items: ImportableRecord[] = [];
  let mode: "json-array" | "spreadsheet" = "json-array";
  let spreadsheetMeta: { sheetName: string; headerRow: number } | undefined;

  if (Array.isArray(req.body)) {
    items = req.body as ImportableRecord[];
  } else if (req.body && typeof req.body === "object") {
    const payload = req.body as SpreadsheetImportPayload;
    if (typeof payload.base64 === "string") {
      mode = "spreadsheet";
      try {
        const { records, sheetName, headerRow } = parseSpreadsheet(payload);
        items = records;
        spreadsheetMeta = { sheetName, headerRow: headerRow + 1 };
      } catch (error) {
        return res.status(400).json({
          error: error instanceof Error ? error.message : "Falha ao interpretar a planilha"
        });
      }
    } else {
      return res.status(400).json({ error: "Body must be an array or contain a base64 property" });
    }
  } else {
    return res.status(400).json({ error: "Body must be an array or contain a base64 property" });
  }

  const added: SerializableScde[] = [];
  const updated: SerializableScde[] = [];
  const pending: PendingItem[] = [];

  for (const item of items) {
    const { __rowNumber, ...record } = item;

    try {
      const { client, createData, updateData } = parseRecord(record);

      const existing = await prisma.scde.findFirst({ where: { client } });

      if (existing) {
        const result = await prisma.scde.update({
          where: { id: existing.id },
          data: updateData
        });
        updated.push(serialize(result));
      } else {
        const result = await prisma.scde.create({ data: createData });
        added.push(serialize(result));
      }
    } catch (error) {
      pending.push({
        item: record,
        message: error instanceof Error ? error.message : "Unknown error",
        rowNumber: __rowNumber
      });
    }
  }

  res.status(201).json({
    added,
    updated,
    pending,
    meta: {
      mode,
      totalProcessed: items.length,
      sheetName: spreadsheetMeta?.sheetName,
      headerRow: spreadsheetMeta?.headerRow
    }
  });
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