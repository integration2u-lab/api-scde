import crypto from "crypto";
import { utils, WorkBook, WorkSheet } from "xlsx";
import { Prisma } from "@prisma/client";
import logger from "../libs/logger";
import prisma from "../libs/prisma";
import {
  loadWorkbook,
  normalizeRowHeaders,
  readDate,
  toNumber
} from "../libs/xlsx";

export type OverwriteStrategy = "upsert" | "insertOnly";

export interface ParsedEnergyRow {
  rowNumber: number;
  clients: string;
  price: number | null;
  referenceDate: Date;
  adjusted: number | null;
  supplier: string | null;
  meter: string | null;
  consumption: number | null;
  measurement: string | null;
  proinfa: number | null;
  contract: number | null;
  minimum: number | null;
  maximum: number | null;
  toBill: number | null;
  cp: string | null;
  charges: unknown;
  origin: string;
}

export interface ParsedScdeRow {
  rowNumber: number;
  agent: string;
  groupPoint: string | null;
  referenceMonth: string;
  activeCKwh: number | null;
  quality: string | null;
  source: string | null;
}

export interface ImportError {
  sheet: string;
  row: number;
  message: string;
}

export interface ParseResult {
  energyRows: ParsedEnergyRow[];
  scdeRows: ParsedScdeRow[];
  errors: ImportError[];
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

const monthSheetPattern = /^(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)[0-9]{2}$/i;
const normalizedMonthHeaderPattern = /^(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)_\d{2}$/i;

const normalizeSheetName = (name: string) => name.trim().toLowerCase();
const compactSheetName = (name: string) => normalizeSheetName(name).replace(/\s+/g, "");

const safeDecimal = (value: number | null | undefined, fractionDigits: number): Prisma.Decimal | null => {
  if (value === null || value === undefined) {
    return null;
  }
  const factor = 10 ** fractionDigits;
  const rounded = Math.round(value * factor) / factor;
  return new Prisma.Decimal(rounded.toString());
};

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

const getNumber = (row: Record<string, unknown>, candidates: string[]): number | null => {
  for (const key of candidates) {
    if (!(key in row)) {
      continue;
    }
    const parsed = toNumber(row[key]);
    if (parsed === null) {
      continue;
    }
    return parsed;
  }
  return null;
};

const getChargesValue = (row: Record<string, unknown>, candidates: string[]): unknown => {
  for (const key of candidates) {
    if (!(key in row)) {
      continue;
    }
    const value = row[key];
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (!trimmed) {
        continue;
      }
      try {
        return JSON.parse(trimmed);
      } catch {
        return trimmed;
      }
    }
    if (value !== undefined) {
      return value;
    }
  }
  return null;
};

interface SheetEntry {
  original: string;
  normalized: string;
  compact: string;
  sheet: WorkSheet;
}

const buildSheetEntries = (workbook: WorkBook): SheetEntry[] =>
  workbook.SheetNames.map((name) => ({
    original: name,
    normalized: normalizeSheetName(name),
    compact: compactSheetName(name),
    sheet: workbook.Sheets[name]!
  }));

const parseEnergySheet = (
  sheet: WorkSheet,
  sheetName: string,
  options: { origin: string }
): { rows: ParsedEnergyRow[]; errors: ImportError[] } => {
  const rawRows = utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: null,
    raw: true
  });
  const matrixRows = utils.sheet_to_json<(string | number | null | undefined)[]>(sheet, {
    header: 1,
    defval: null,
    raw: true
  });
  const dataMatrixRows = matrixRows.slice(1);

  if (!rawRows.length) {
    return {
      rows: [],
      errors: [
        {
          sheet: sheetName,
          row: 0,
          message: `A aba "${sheetName}" nao possui dados para processamento`
        }
      ]
    };
  }

  const rows: ParsedEnergyRow[] = [];
  const errors: ImportError[] = [];
  const normalizedRows = rawRows.map(normalizeRowHeaders);

  normalizedRows.forEach((row, index) => {
    const rowNumber = index + 2;

    const isEmptyRow = Object.values(row).every((value) => {
      if (value === null || value === undefined) {
        return true;
      }
      if (typeof value === "string") {
        return value.trim() === "";
      }
      return false;
    });
    if (isEmptyRow) {
      return;
    }


    let clients = getString(row, [
      "clients",
      "client",
      "cliente",
      "clientes",
      "cliente_nome",
      "nome",
      "jul-25"
    ]);

    if (!clients) {
      const monthHeaderKey = Object.keys(row).find((key) =>
        normalizedMonthHeaderPattern.test(key)
      );
      if (monthHeaderKey) {
        const fallbackValue = row[monthHeaderKey];
        if (typeof fallbackValue === "string" && fallbackValue.trim() !== "") {
          clients = fallbackValue.trim();
        } else if (fallbackValue !== null && fallbackValue !== undefined) {
          clients = String(fallbackValue);
        }
      }
    }

    if (!clients) {
      const firstColumnKey = Object.keys(row)[0];
      const firstColumnValue = firstColumnKey ? row[firstColumnKey] : null;
      if (typeof firstColumnValue === "string" && firstColumnValue.trim() !== "") {
        clients = firstColumnValue.trim();
      } else if (firstColumnValue !== null && firstColumnValue !== undefined) {
        clients = String(firstColumnValue);
      }
    }

    if (!clients) {
      const matrixValue = dataMatrixRows[index]?.[0];
      if (typeof matrixValue === "string" && matrixValue.trim() !== "") {
        clients = matrixValue.trim();
      } else if (matrixValue !== null && matrixValue !== undefined) {
        clients = String(matrixValue);
      }
    }

    if (!clients) {
      errors.push({
        sheet: sheetName,
        row: rowNumber,
        message: "Coluna de cliente/clients nao encontrada ou vazia"
      });
      return;
    }

    const referenceDateCandidate = getString(row, ["reference_date", "data_base", "referencia", "reference"]);
    const referenceDateNumber = getNumber(row, ["reference_date", "data_base", "referencia", "reference"]);
    let referenceDate: Date | null = null;
    if (referenceDateCandidate) {
      referenceDate = readDate(referenceDateCandidate);
    }
    if (!referenceDate && referenceDateNumber !== null) {
      referenceDate = readDate(referenceDateNumber);
    }
    if (!referenceDate) {
      errors.push({
        sheet: sheetName,
        row: rowNumber,
        message: "Nao foi possivel determinar reference_date"
      });
      return;
    }

    const consumption = getNumber(row, [
      "consumption",
      "consumo",
      "consumo_kwh",
      "consumo_mwh",
      "volume",
      "volume_kwh",
      "volume_mwh"
    ]);

    const measurement = getString(row, ["measurement", "unidade", "measurement_unit", "unidade_medida"]);

    let consumptionValue = consumption;
    if (consumptionValue !== null) {
      const measurementLower = measurement?.toLowerCase() ?? "";
      const sourceKey = Object.keys(row).find((key) => key.includes("mwh"));
      const inferredFromHeader = sourceKey?.includes("mwh");
      if (measurementLower.includes("mwh") || inferredFromHeader) {
        consumptionValue = consumptionValue * 1000;
      }
    }

    const charges = getChargesValue(row, ["charges", "encargos", "charges_json"]);

    rows.push({
      rowNumber,
      clients,
      price: getNumber(row, ["price", "preco", "valor", "price_unit", "unit_price"]),
      referenceDate,
      adjusted: getNumber(row, ["adjusted", "ajustado", "ajuste"]),
      supplier: getString(row, ["supplier", "fornecedor"]),
      meter: getString(row, ["meter", "medidor", "numero_medidor"]),
      consumption: consumptionValue,
      measurement,
      proinfa: getNumber(row, ["proinfa"]),
      contract: getNumber(row, ["contract", "contrato"]),
      minimum: getNumber(row, ["minimum", "minimo"]),
      maximum: getNumber(row, ["maximum", "maximo"]),
      toBill: getNumber(row, ["to_bill", "total_faturar", "valor_total", "a_faturar", "faturar"]),
      cp: getString(row, ["cp", "cp_codigo"]),
      charges,
      origin: options.origin
    });
  });

  return { rows, errors };
};

const parseScdeSheet = (sheet: WorkSheet, sheetName: string): { rows: ParsedScdeRow[]; errors: ImportError[] } => {
  const rawRows = utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: null,
    raw: true
  });

  if (!rawRows.length) {
    return {
      rows: [],
      errors: [
        {
          sheet: sheetName,
          row: 0,
          message: `A aba "${sheetName}" nao possui dados para processamento`
        }
      ]
    };
  }

  const rows: ParsedScdeRow[] = [];
  const errors: ImportError[] = [];
  const normalizedRows = rawRows.map(normalizeRowHeaders);

  normalizedRows.forEach((row, index) => {
    const rowNumber = index + 2;

    const isEmptyRow = Object.values(row).every((value) => {
      if (value === null || value === undefined) {
        return true;
      }
      if (typeof value === "string") {
        return value.trim() === "";
      }
      return false;
    });
    if (isEmptyRow) {
      return;
    }


    const agent = getString(row, ["agent", "agente", "empresa", "cliente"]);
    if (!agent) {
      errors.push({
        sheet: sheetName,
        row: rowNumber,
        message: "Coluna de agent nao encontrada ou vazia"
      });
      return;
    }

    const referenceMonth =
      getString(row, ["reference_month", "referencia", "mes_referencia", "mes"])
        ?.replace(/\s+/g, "") ?? null;
    if (!referenceMonth) {
      errors.push({
        sheet: sheetName,
        row: rowNumber,
        message: "Coluna reference_month nao encontrada ou vazia"
      });
      return;
    }

    rows.push({
      rowNumber,
      agent,
      groupPoint: getString(row, ["group_point", "ponto", "ponto_grupo", "group"]),
      referenceMonth,
      activeCKwh: getNumber(row, ["active_c_kwh", "consumo_ativo", "consumo_kwh"]),
      quality: getString(row, ["quality", "qualidade"]),
      source: getString(row, ["source", "fonte"])
    });
  });

  return { rows, errors };
};

export const parseWorkbook = (
  buffer: Buffer,
  options: { origin: string; fileName: string }
): ParseResult => {
  const workbook = loadWorkbook(buffer);
  const entries = buildSheetEntries(workbook);

  if (!entries.length) {
    throw new SpreadsheetValidationError("A planilha enviada nao possui abas");
  }

  const selectSheet = (predicate: (entry: SheetEntry) => boolean) => {
    const match = entries.find(predicate);
    return match ? { name: match.original, sheet: match.sheet } : null;
  };

  const energySheet =
    selectSheet((entry) => entry.compact === "jul25") ??
    selectSheet((entry) => monthSheetPattern.test(entry.compact));

  const scdeSheet =
    selectSheet((entry) => entry.normalized === "scde") ??
    selectSheet((entry) => entry.compact === "scde");

  const errors: ImportError[] = [];
  const energyResult = energySheet
    ? parseEnergySheet(energySheet.sheet, energySheet.name, { origin: options.origin })
    : {
        rows: [],
        errors: [
          {
            sheet: "jul25",
            row: 0,
            message: "Aba jul25 (ou equivalente) nao encontrada"
          }
        ]
      };

  const scdeResult = scdeSheet
    ? parseScdeSheet(scdeSheet.sheet, scdeSheet.name)
    : {
        rows: [],
        errors: [
          {
            sheet: "scde",
            row: 0,
            message: "Aba SCDE nao encontrada"
          }
        ]
      };

  errors.push(...energyResult.errors, ...scdeResult.errors);

  return {
    energyRows: energyResult.rows,
    scdeRows: scdeResult.rows,
    errors
  };
};

export const upsertEnergyRows = async (
  rows: ParsedEnergyRow[],
  options: { overwriteStrategy: OverwriteStrategy; importBatchId: string }
): Promise<UpsertResult> => {
  const counts = { inserted: 0, updated: 0, skipped: 0 };
  const errors: ImportError[] = [];
  const batchLogger = logger.child({ importBatchId: options.importBatchId, table: "energy_balance" });

  await prisma.$transaction(
    async (tx) => {
      for (const row of rows) {
        try {
          const existing = await tx.energyBalance.findFirst({
            where: {
              clients: row.clients,
              referenceDate: row.referenceDate
            }
          });

          const data = {
            clients: row.clients,
            price: safeDecimal(row.price, 4),
            referenceDate: row.referenceDate,
            adjusted: safeDecimal(row.adjusted, 4),
            supplier: row.supplier ?? undefined,
            meter: row.meter ?? undefined,
            consumption: safeDecimal(row.consumption, 6),
            measurement: row.measurement ?? undefined,
            proinfa: safeDecimal(row.proinfa, 4),
            contract: safeDecimal(row.contract, 4),
            minimum: safeDecimal(row.minimum, 4),
            maximum: safeDecimal(row.maximum, 4),
            toBill: safeDecimal(row.toBill, 4),
            cp: row.cp ?? undefined,
            charges: row.charges ?? undefined,
            origin: row.origin,
            importBatchId: options.importBatchId
          } satisfies Prisma.EnergyBalanceUncheckedCreateInput;

          if (!existing) {
            await tx.energyBalance.create({ data });
            counts.inserted += 1;
            continue;
          }

          if (options.overwriteStrategy === "insertOnly") {
            counts.skipped += 1;
            continue;
          }

          await tx.energyBalance.update({
            where: { id: existing.id },
            data
          });
          counts.updated += 1;
        } catch (error) {
          batchLogger.error({ err: error, row: row.rowNumber }, "Erro ao processar linha energy_balance");
          errors.push({
            sheet: "energy_balance",
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

export const upsertScdeRows = async (
  rows: ParsedScdeRow[],
  options: { overwriteStrategy: OverwriteStrategy; importBatchId: string }
): Promise<UpsertResult> => {
  const counts = { inserted: 0, updated: 0, skipped: 0 };
  const errors: ImportError[] = [];
  const batchLogger = logger.child({ importBatchId: options.importBatchId, table: "scde" });

  await prisma.$transaction(
    async (tx) => {
      for (const row of rows) {
        try {
          const existing = await tx.scde.findFirst({
            where: {
              agent: row.agent,
              groupPoint: row.groupPoint ?? undefined,
              referenceMonth: row.referenceMonth
            }
          });

          const data = {
            agent: row.agent,
            groupPoint: row.groupPoint ?? undefined,
            referenceMonth: row.referenceMonth,
            activeCKwh: safeDecimal(row.activeCKwh, 6),
            quality: row.quality ?? undefined,
            source: row.source ?? undefined,
            importBatchId: options.importBatchId
          } satisfies Prisma.ScdeUncheckedCreateInput;

          if (!existing) {
            await tx.scde.create({ data });
            counts.inserted += 1;
            continue;
          }

          if (options.overwriteStrategy === "insertOnly") {
            counts.skipped += 1;
            continue;
          }

          await tx.scde.update({
            where: { id: existing.id },
            data
          });
          counts.updated += 1;
        } catch (error) {
          batchLogger.error({ err: error, row: row.rowNumber }, "Erro ao processar linha scde");
          errors.push({
            sheet: "scde",
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

