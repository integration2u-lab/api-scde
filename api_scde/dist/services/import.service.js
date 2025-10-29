"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateImportBatchId = exports.upsertScdeRows = exports.upsertEnergyRows = exports.parseWorkbook = exports.SpreadsheetValidationError = void 0;
const crypto_1 = __importDefault(require("crypto"));
const xlsx_1 = require("xlsx");
const client_1 = require("@prisma/client");
const logger_1 = __importDefault(require("../libs/logger"));
const prisma_1 = __importDefault(require("../libs/prisma"));
const xlsx_2 = require("../libs/xlsx");
class SpreadsheetValidationError extends Error {
    constructor(message) {
        super(message);
        this.name = "SpreadsheetValidationError";
    }
}
exports.SpreadsheetValidationError = SpreadsheetValidationError;
const monthSheetPattern = /^(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)[0-9]{2}$/i;
const normalizedMonthHeaderPattern = /^(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)_\d{2}$/i;
const normalizeSheetName = (name) => name.trim().toLowerCase();
const compactSheetName = (name) => normalizeSheetName(name).replace(/\s+/g, "");
const safeDecimal = (value, fractionDigits) => {
    if (value === null || value === undefined) {
        return null;
    }
    const factor = 10 ** fractionDigits;
    const rounded = Math.round(value * factor) / factor;
    return new client_1.Prisma.Decimal(rounded.toString());
};
const getString = (row, candidates) => {
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
const getNumber = (row, candidates) => {
    for (const key of candidates) {
        if (!(key in row)) {
            continue;
        }
        const parsed = (0, xlsx_2.toNumber)(row[key]);
        if (parsed === null) {
            continue;
        }
        return parsed;
    }
    return null;
};
const getChargesValue = (row, candidates) => {
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
            }
            catch {
                return trimmed;
            }
        }
        if (value !== undefined) {
            return value;
        }
    }
    return null;
};
const buildSheetEntries = (workbook) => workbook.SheetNames.map((name) => ({
    original: name,
    normalized: normalizeSheetName(name),
    compact: compactSheetName(name),
    sheet: workbook.Sheets[name]
}));
const parseEnergySheet = (sheet, sheetName, options) => {
    const rawRows = xlsx_1.utils.sheet_to_json(sheet, {
        defval: null,
        raw: true
    });
    const matrixRows = xlsx_1.utils.sheet_to_json(sheet, {
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
    const rows = [];
    const errors = [];
    const normalizedRows = rawRows.map(xlsx_2.normalizeRowHeaders);
    normalizedRows.forEach((row, index) => {
        var _a, _b;
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
            const monthHeaderKey = Object.keys(row).find((key) => normalizedMonthHeaderPattern.test(key));
            if (monthHeaderKey) {
                const fallbackValue = row[monthHeaderKey];
                if (typeof fallbackValue === "string" && fallbackValue.trim() !== "") {
                    clients = fallbackValue.trim();
                }
                else if (fallbackValue !== null && fallbackValue !== undefined) {
                    clients = String(fallbackValue);
                }
            }
        }
        if (!clients) {
            const firstColumnKey = Object.keys(row)[0];
            const firstColumnValue = firstColumnKey ? row[firstColumnKey] : null;
            if (typeof firstColumnValue === "string" && firstColumnValue.trim() !== "") {
                clients = firstColumnValue.trim();
            }
            else if (firstColumnValue !== null && firstColumnValue !== undefined) {
                clients = String(firstColumnValue);
            }
        }
        if (!clients) {
            const matrixValue = (_a = dataMatrixRows[index]) === null || _a === void 0 ? void 0 : _a[0];
            if (typeof matrixValue === "string" && matrixValue.trim() !== "") {
                clients = matrixValue.trim();
            }
            else if (matrixValue !== null && matrixValue !== undefined) {
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
        let referenceDate = null;
        if (referenceDateCandidate) {
            referenceDate = (0, xlsx_2.readDate)(referenceDateCandidate);
        }
        if (!referenceDate && referenceDateNumber !== null) {
            referenceDate = (0, xlsx_2.readDate)(referenceDateNumber);
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
            const measurementLower = (_b = measurement === null || measurement === void 0 ? void 0 : measurement.toLowerCase()) !== null && _b !== void 0 ? _b : "";
            const sourceKey = Object.keys(row).find((key) => key.includes("mwh"));
            const inferredFromHeader = sourceKey === null || sourceKey === void 0 ? void 0 : sourceKey.includes("mwh");
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
const parseScdeSheet = (sheet, sheetName) => {
    const rawRows = xlsx_1.utils.sheet_to_json(sheet, {
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
    const rows = [];
    const errors = [];
    const normalizedRows = rawRows.map(xlsx_2.normalizeRowHeaders);
    normalizedRows.forEach((row, index) => {
        var _a, _b;
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
        const referenceMonth = (_b = (_a = getString(row, ["reference_month", "referencia", "mes_referencia", "mes"])) === null || _a === void 0 ? void 0 : _a.replace(/\s+/g, "")) !== null && _b !== void 0 ? _b : null;
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
const parseWorkbook = (buffer, options) => {
    var _a, _b;
    const workbook = (0, xlsx_2.loadWorkbook)(buffer);
    const entries = buildSheetEntries(workbook);
    if (!entries.length) {
        throw new SpreadsheetValidationError("A planilha enviada nao possui abas");
    }
    const selectSheet = (predicate) => {
        const match = entries.find(predicate);
        return match ? { name: match.original, sheet: match.sheet } : null;
    };
    const energySheet = (_a = selectSheet((entry) => entry.compact === "jul25")) !== null && _a !== void 0 ? _a : selectSheet((entry) => monthSheetPattern.test(entry.compact));
    const scdeSheet = (_b = selectSheet((entry) => entry.normalized === "scde")) !== null && _b !== void 0 ? _b : selectSheet((entry) => entry.compact === "scde");
    const errors = [];
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
exports.parseWorkbook = parseWorkbook;
const upsertEnergyRows = async (rows, options) => {
    const counts = { inserted: 0, updated: 0, skipped: 0 };
    const errors = [];
    const batchLogger = logger_1.default.child({ importBatchId: options.importBatchId, table: "energy_balance" });
    await prisma_1.default.$transaction(async (tx) => {
        var _a, _b, _c, _d, _e;
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
                    supplier: (_a = row.supplier) !== null && _a !== void 0 ? _a : undefined,
                    meter: (_b = row.meter) !== null && _b !== void 0 ? _b : undefined,
                    consumption: safeDecimal(row.consumption, 6),
                    measurement: (_c = row.measurement) !== null && _c !== void 0 ? _c : undefined,
                    proinfa: safeDecimal(row.proinfa, 4),
                    contract: safeDecimal(row.contract, 4),
                    minimum: safeDecimal(row.minimum, 4),
                    maximum: safeDecimal(row.maximum, 4),
                    toBill: safeDecimal(row.toBill, 4),
                    cp: (_d = row.cp) !== null && _d !== void 0 ? _d : undefined,
                    charges: (_e = row.charges) !== null && _e !== void 0 ? _e : undefined,
                    origin: row.origin,
                    importBatchId: options.importBatchId
                };
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
            }
            catch (error) {
                batchLogger.error({ err: error, row: row.rowNumber }, "Erro ao processar linha energy_balance");
                errors.push({
                    sheet: "energy_balance",
                    row: row.rowNumber,
                    message: error instanceof Error ? error.message : "Erro desconhecido"
                });
            }
        }
    }, {
        timeout: 60000
    });
    return { counts, errors };
};
exports.upsertEnergyRows = upsertEnergyRows;
const upsertScdeRows = async (rows, options) => {
    const counts = { inserted: 0, updated: 0, skipped: 0 };
    const errors = [];
    const batchLogger = logger_1.default.child({ importBatchId: options.importBatchId, table: "scde" });
    await prisma_1.default.$transaction(async (tx) => {
        var _a, _b, _c, _d;
        for (const row of rows) {
            try {
                const existing = await tx.scde.findFirst({
                    where: {
                        agent: row.agent,
                        groupPoint: (_a = row.groupPoint) !== null && _a !== void 0 ? _a : undefined,
                        referenceMonth: row.referenceMonth
                    }
                });
                const data = {
                    agent: row.agent,
                    groupPoint: (_b = row.groupPoint) !== null && _b !== void 0 ? _b : undefined,
                    referenceMonth: row.referenceMonth,
                    activeCKwh: safeDecimal(row.activeCKwh, 6),
                    quality: (_c = row.quality) !== null && _c !== void 0 ? _c : undefined,
                    source: (_d = row.source) !== null && _d !== void 0 ? _d : undefined,
                    importBatchId: options.importBatchId
                };
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
            }
            catch (error) {
                batchLogger.error({ err: error, row: row.rowNumber }, "Erro ao processar linha scde");
                errors.push({
                    sheet: "scde",
                    row: row.rowNumber,
                    message: error instanceof Error ? error.message : "Erro desconhecido"
                });
            }
        }
    }, {
        timeout: 60000
    });
    return { counts, errors };
};
exports.upsertScdeRows = upsertScdeRows;
const generateImportBatchId = (idempotencyKey) => {
    const hash = crypto_1.default.createHash("sha256").update(idempotencyKey).digest("hex");
    const short = hash.slice(0, 8);
    return {
        batchId: `${new Date().toISOString()}_${short}`,
        hashBase: hash
    };
};
exports.generateImportBatchId = generateImportBatchId;
//# sourceMappingURL=import.service.js.map