"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.inferDateFromFileName = exports.readDate = exports.toNumber = exports.normalizeRowHeaders = exports.normalizeHeader = exports.detectSheet = exports.loadWorkbook = exports.monthNamePT = void 0;
const xlsx_1 = require("xlsx");
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
const monthNamePT = (monthIndex) => MONTHS_PT[monthIndex];
exports.monthNamePT = monthNamePT;
const loadWorkbook = (buffer) => (0, xlsx_1.read)(buffer, {
    type: "buffer",
    cellDates: true,
    cellNF: false,
    cellText: false
});
exports.loadWorkbook = loadWorkbook;
const normalizeSheetName = (name) => name.trim().toLowerCase();
const compactSheetName = (name) => normalizeSheetName(name).replace(/\s+/g, "");
const detectSheet = (workbook) => {
    if (!workbook.SheetNames.length) {
        throw new Error("A planilha enviada nao possui abas");
    }
    const sheetNames = workbook.SheetNames;
    const normalizedEntries = sheetNames.map((name) => ({
        original: name,
        normalized: normalizeSheetName(name),
        compact: compactSheetName(name)
    }));
    const selectSheet = (predicate) => {
        const match = normalizedEntries.find(predicate);
        return match ? { name: match.original, sheet: workbook.Sheets[match.original] } : null;
    };
    const julSheet = selectSheet((entry) => entry.compact === "jul25");
    if (julSheet) {
        return julSheet;
    }
    const scdeSheet = selectSheet((entry) => entry.normalized === "scde");
    if (scdeSheet) {
        return scdeSheet;
    }
    const monthSheet = selectSheet((entry) => /^(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)[0-9]{2}$/.test(entry.compact));
    if (monthSheet) {
        return monthSheet;
    }
    const notaSheet = selectSheet((entry) => entry.normalized === "nota");
    if (notaSheet) {
        return notaSheet;
    }
    const firstSheetName = sheetNames[0];
    return { name: firstSheetName, sheet: workbook.Sheets[firstSheetName] };
};
exports.detectSheet = detectSheet;
const normalizeHeader = (header) => header
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\r?\n+/g, " ")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
exports.normalizeHeader = normalizeHeader;
const normalizeRowHeaders = (row) => {
    const normalized = {};
    for (const [key, value] of Object.entries(row)) {
        const normalizedKey = (0, exports.normalizeHeader)(key);
        if (!normalizedKey) {
            continue;
        }
        if (normalized[normalizedKey] === undefined) {
            normalized[normalizedKey] = value;
        }
    }
    return normalized;
};
exports.normalizeRowHeaders = normalizeRowHeaders;
const toNumber = (value) => {
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
exports.toNumber = toNumber;
const readDate = (value) => {
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
        const parsed = xlsx_1.SSF.parse_date_code(value);
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
exports.readDate = readDate;
const inferDateFromFileName = (fileName) => {
    const normalized = (0, exports.normalizeHeader)(fileName);
    const yearMonthMatch = normalized.match(/(20\d{2})[_\-.]?(0[1-9]|1[0-2])/);
    if (yearMonthMatch) {
        const [, year, month] = yearMonthMatch;
        return new Date(Date.UTC(Number(year), Number(month) - 1, 1));
    }
    const monthNameMatch = normalized.match(/(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)[_\-.]?(\d{2})/);
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
exports.inferDateFromFileName = inferDateFromFileName;
//# sourceMappingURL=xlsx.js.map