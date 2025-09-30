import { read, utils, WorkBook, WorkSheet, SSF } from "xlsx";

const MONTHS_PT = [
  "janeiro",
  "fevereiro",
  "marco",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro"
];

export const monthNamePT = (monthIndex: number) => MONTHS_PT[monthIndex];

export const loadWorkbook = (buffer: Buffer): WorkBook =>
  read(buffer, {
    type: "buffer",
    cellDates: true,
    cellNF: false,
    cellText: false
  });

const normalizeSheetName = (name: string) => name.trim().toLowerCase();
const compactSheetName = (name: string) => normalizeSheetName(name).replace(/\s+/g, "");

export const detectSheet = (workbook: WorkBook): { name: string; sheet: WorkSheet } => {
  if (!workbook.SheetNames.length) {
    throw new Error("A planilha enviada nao possui abas");
  }

  const sheetNames = workbook.SheetNames;
  type NormalizedSheet = { original: string; normalized: string; compact: string };
  const normalizedEntries: NormalizedSheet[] = sheetNames.map((name) => ({
    original: name,
    normalized: normalizeSheetName(name),
    compact: compactSheetName(name)
  }));

  const selectSheet = (predicate: (entry: NormalizedSheet) => boolean) => {
    const match = normalizedEntries.find(predicate);
    return match ? { name: match.original, sheet: workbook.Sheets[match.original]! } : null;
  };

  const julSheet = selectSheet((entry) => entry.compact === "jul25");
  if (julSheet) {
    return julSheet;
  }

  const scdeSheet = selectSheet((entry) => entry.normalized === "scde");
  if (scdeSheet) {
    return scdeSheet;
  }

  const monthSheet = selectSheet((entry) =>
    /^(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)[0-9]{2}$/.test(entry.compact)
  );
  if (monthSheet) {
    return monthSheet;
  }

  const notaSheet = selectSheet((entry) => entry.normalized === "nota");
  if (notaSheet) {
    return notaSheet;
  }

  const firstSheetName = sheetNames[0]!;
  return { name: firstSheetName, sheet: workbook.Sheets[firstSheetName]! };
};

export const normalizeHeader = (header: string): string =>
  header
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\r?\n+/g, " ")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");

export const normalizeRowHeaders = (
  row: Record<string, unknown>
): Record<string, unknown> => {
  const normalized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    const normalizedKey = normalizeHeader(key);
    if (!normalizedKey) {
      continue;
    }
    if (normalized[normalizedKey] === undefined) {
      normalized[normalizedKey] = value;
    }
  }
  return normalized;
};

export const toNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  if (typeof value === "number") {
    if (Number.isNaN(value)) {
      return null;
    }
    return value;
  }

  if (typeof value === "string") {
    const sanitized = value
      .trim()
      .replace(/\s+/g, "")
      .replace(/\.(?=\d{3}(\D|$))/g, "")
      .replace(/,/g, ".");
    const parsed = Number(sanitized);
    return Number.isNaN(parsed) ? null : parsed;
  }

  return null;
};

export const readDate = (value: unknown): Date | null => {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      return null;
    }
    return new Date(Date.UTC(value.getFullYear(), value.getMonth(), value.getDate()));
  }

  if (typeof value === "number") {
    const parsed = SSF.parse_date_code(value);
    if (!parsed) {
      return null;
    }
    return new Date(Date.UTC(parsed.y, parsed.m - 1, parsed.d));
  }

  if (typeof value === "string") {
    const trimmed = value.trim();

    const isoCandidate = Date.parse(trimmed);
    if (!Number.isNaN(isoCandidate)) {
      const date = new Date(isoCandidate);
      return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    }

    const brazilianMatch = trimmed.match(/^(\d{2})[\/\-.](\d{2})[\/\-.](\d{4})$/);
    if (brazilianMatch) {
      const [, day, month, year] = brazilianMatch;
      return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
    }
  }

  return null;
};

export const inferDateFromFileName = (fileName: string): Date | null => {
  const normalized = normalizeHeader(fileName);

  const yearMonthMatch = normalized.match(/(20\d{2})[_\-.]?(0[1-9]|1[0-2])/);
  if (yearMonthMatch) {
    const [, year, month] = yearMonthMatch;
    return new Date(Date.UTC(Number(year), Number(month) - 1, 1));
  }

  const monthNameMatch = normalized.match(
    /(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)[_\-.]?(\d{2})/
  );
  if (monthNameMatch) {
    const [, monthName, yearSuffix] = monthNameMatch;
    const monthIndex = [
      "jan",
      "fev",
      "mar",
      "abr",
      "mai",
      "jun",
      "jul",
      "ago",
      "set",
      "out",
      "nov",
      "dez"
    ].indexOf(monthName);
    if (monthIndex >= 0) {
      const year = Number(`20${yearSuffix}`);
      return new Date(Date.UTC(year, monthIndex, 1));
    }
  }

  return null;
};
