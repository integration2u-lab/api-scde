import crypto from "crypto";
import { utils } from "xlsx";
import { Prisma } from "@prisma/client";
import type { Decimal } from "@prisma/client/runtime/library";
import logger from "../libs/logger";
import prisma from "../libs/prisma";
import {
  detectSheet,
  inferDateFromFileName,
  loadWorkbook,
  normalizeRowHeaders,
  readDate,
  toNumber
} from "../libs/xlsx";

export type OverwriteStrategy = "upsert" | "insertOnly";

export interface ParsedRow {
  rowNumber: number;
  clienteNome: string;
  numeroInstalacao: string | null;
  dataBase: Date;
  referencia: string;
  consumoKwh: Decimal;
  valorTotal: Decimal;
  status: string;
  origin: string;
}

export interface ImportError {
  row: number;
  message: string;
}

export interface ParseResult {
  rows: ParsedRow[];
  errors: ImportError[];
  referencia?: string;
}

export interface UpsertResult {
  counts: {
    inserted: number;
    updated: number;
    skipped: number;
  };
  errors: ImportError[];
}

export class SpreadsheetValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SpreadsheetValidationError";
  }
}

const REQUIRED_FIELDS_DESCRIPTION = [
  "cliente",
  "data-base",
  "consumo (MWh ou kWh)",
  "total/faturar"
];

const safeDecimal = (value: number, fractionDigits: number): Decimal =>
  new Prisma.Decimal(value.toFixed(fractionDigits));

const getString = (row: Record<string, unknown>, candidates: string[]): string | null => {
  for (const key of candidates) {
    if (!(key in row)) {
      continue;
    }
    const value = row[key];
    if (typeof value === "string" && value.trim() !== "") {
      return value.trim();
    }
  }
  return null;
};

const getNumber = (
  row: Record<string, unknown>,
  candidates: string[]
): { value: number; source: string } | null => {
  for (const key of candidates) {
    if (!(key in row)) {
      continue;
    }
    const parsed = toNumber(row[key]);
    if (parsed === null) {
      continue;
    }
    return { value: parsed, source: key };
  }
  return null;
};

const getDateValue = (row: Record<string, unknown>, candidates: string[]): Date | null => {
  for (const key of candidates) {
    if (!(key in row)) {
      continue;
    }
    const value = row[key];
    const asDate = readDate(value);
    if (asDate) {
      return asDate;
    }
  }
  return null;
};

const inferReferencia = (date: Date): string => {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
};

export const parseWorkbook = (
  buffer: Buffer,
  options: { origin: string; fileName: string }
): ParseResult => {
  const workbook = loadWorkbook(buffer);
  const { sheet, name: sheetName } = detectSheet(workbook);
  const rawRows = utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: null,
    raw: true
  });

  if (!rawRows.length) {
    throw new SpreadsheetValidationError(
      `A aba "${sheetName}" nao possui dados para processamento`
    );
  }

  const normalizedRows = rawRows.map(normalizeRowHeaders);

  const headerKeys = new Set<string>();
  normalizedRows.forEach((row) => {
    Object.keys(row).forEach((key) => headerKeys.add(key));
  });

  const hasCliente = Array.from(headerKeys).some(
    (key) => key.includes("cliente") && !key.includes("codigo")
  );
  const hasTotal = Array.from(headerKeys).some(
    (key) => key.includes("total") || key.includes("fatur")
  );
  const hasConsumo = Array.from(headerKeys).some(
    (key) => key.includes("consumo") || key.includes("volume")
  );

  if (!hasCliente || !hasTotal || !hasConsumo) {
    throw new SpreadsheetValidationError(
      `A planilha precisa conter colunas semelhantes a: ${REQUIRED_FIELDS_DESCRIPTION.join(", ")}`
    );
  }

  const errors: ImportError[] = [];
  const parsedRows: ParsedRow[] = [];

  const fallbackDateFromFile = inferDateFromFileName(options.fileName);
  let referenceDate: Date | null = null;

  normalizedRows.forEach((row, index) => {
    const isEmpty = Object.values(row).every(
      (value) => value === null || value === undefined || String(value).trim() === ""
    );
    if (isEmpty) {
      return;
    }

    const rowNumber = index + 2; // assume header is first row

    const clienteNome = getString(row, ["cliente", "cliente_nome", "nome", "cliente_proprietario"]);
    if (!clienteNome) {
      errors.push({
        row: rowNumber,
        message: "Coluna de cliente nao encontrada ou vazia"
      });
      return;
    }

    const numeroInstalacaoRaw = getString(row, [
      "numero_instalacao",
      "n_instalacao",
      "instalacao",
      "medidor",
      "numero",
      "n"
    ]);

    let dataBase =
      getDateValue(row, ["data_base", "data", "emissao", "referencia", "competencia"]);
    if (!dataBase) {
      const numericDate = getNumber(row, ["data_base", "data", "emissao"]);
      if (numericDate) {
        dataBase = readDate(numericDate.value);
      }
    }
    if (!dataBase) {
      dataBase = referenceDate ?? fallbackDateFromFile;
    }
    if (!dataBase) {
      errors.push({
        row: rowNumber,
        message: "Nao foi possivel determinar a data-base"
      });
      return;
    }

    if (!referenceDate) {
      referenceDate = dataBase;
    }

    const consumoCandidate =
      getNumber(row, [
        "consumo_kwh",
        "kwh",
        "consumo",
        "volume_kwh",
        "volume",
        "consumo_mwh",
        "volume_mwh"
      ]) ?? null;

    if (!consumoCandidate) {
      errors.push({
        row: rowNumber,
        message: "Coluna de consumo nao encontrada ou invalida"
      });
      return;
    }

    let consumoKwhValue = consumoCandidate.value;
    if (
      consumoCandidate.source.includes("mwh") ||
      (!consumoCandidate.source.includes("kwh") && consumoCandidate.value < 500)
    ) {
      consumoKwhValue = consumoCandidate.value * 1000;
    }

    const totalCandidate = getNumber(row, ["valor_total", "total", "faturar", "valor"]);
    if (!totalCandidate) {
      errors.push({
        row: rowNumber,
        message: "Coluna de total/faturamento nao encontrada ou invalida"
      });
      return;
    }

    const status =
      getString(row, ["status", "situacao", "situacao_linha"]) ?? "novo";

    const normalizedDate = new Date(
      Date.UTC(dataBase.getUTCFullYear(), dataBase.getUTCMonth(), dataBase.getUTCDate())
    );

    const referencia = inferReferencia(normalizedDate);

    parsedRows.push({
      rowNumber,
      clienteNome,
      numeroInstalacao: numeroInstalacaoRaw ?? null,
      dataBase: normalizedDate,
      referencia,
      consumoKwh: safeDecimal(consumoKwhValue, 3),
      valorTotal: safeDecimal(totalCandidate.value, 2),
      status,
      origin: options.origin
    });
  });

  if (!parsedRows.length) {
    throw new SpreadsheetValidationError(
      "Nenhuma linha valida foi encontrada na planilha enviada"
    );
  }

  return {
    rows: parsedRows,
    errors,
    referencia: parsedRows[0]?.referencia
  };
};

export const upsertRows = async (
  rows: ParsedRow[],
  options: { overwriteStrategy: OverwriteStrategy; importBatchId: string }
): Promise<UpsertResult> => {
  const strategy = options.overwriteStrategy;
  const counts = { inserted: 0, updated: 0, skipped: 0 };
  const errors: ImportError[] = [];

  const batchLogger = logger.child({ importBatchId: options.importBatchId });

  await prisma.$transaction(
    async (tx) => {
      for (const row of rows) {
        try {
          const whereClause = row.numeroInstalacao
            ? {
                numeroInstalacao: row.numeroInstalacao,
                dataBase: row.dataBase
              }
            : {
                clienteNome: row.clienteNome,
                dataBase: row.dataBase
              };

          const existing = await tx.energyBalance.findFirst({
            where: whereClause
          });

          const data = {
            clienteNome: row.clienteNome,
            numeroInstalacao: row.numeroInstalacao,
            dataBase: row.dataBase,
            referencia: row.referencia,
            consumoKwh: row.consumoKwh,
            valorTotal: row.valorTotal,
            origin: row.origin,
            status: row.status,
            importBatchId: options.importBatchId
          } satisfies Prisma.EnergyBalanceUncheckedCreateInput;

          if (!existing) {
            await tx.energyBalance.create({ data });
            counts.inserted += 1;
            continue;
          }

          if (strategy === "insertOnly") {
            counts.skipped += 1;
            continue;
          }

          await tx.energyBalance.update({
            where: { id: existing.id },
            data
          });
          counts.updated += 1;
        } catch (error) {
          batchLogger.error({ err: error, row: row.rowNumber }, "Erro ao processar linha");
          errors.push({
            row: row.rowNumber,
            message: error instanceof Error ? error.message : "Erro desconhecido"
          });
        }
      }
    },
    {
      timeout: 60_000
    }
  );

  return { counts, errors };
};

export const generateImportBatchId = (idempotencyKey: string): { batchId: string; hashBase: string } => {
  const hash = crypto.createHash("sha256").update(idempotencyKey).digest("hex");
  const short = hash.slice(0, 8);
  return {
    batchId: `${new Date().toISOString()}_${short}`,
    hashBase: hash
  };
};
