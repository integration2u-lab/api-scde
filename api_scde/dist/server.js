"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var _a, _b;
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const client_1 = require("@prisma/client");
const XLSX = __importStar(require("xlsx"));
dotenv_1.default.config();
const app = (0, express_1.default)();
const prisma = new client_1.PrismaClient();
const PORT = Number((_a = process.env.PORT) !== null && _a !== void 0 ? _a : 3000);
const JSON_BODY_LIMIT = ((_b = process.env.JSON_BODY_LIMIT) === null || _b === void 0 ? void 0 : _b.trim()) || "10mb";
app.use((0, cors_1.default)());
app.use(express_1.default.json({ limit: JSON_BODY_LIMIT }));
const serialize = (record) => ({
    ...record,
    id: record.id.toString()
});
const toDecimal = (value, field) => {
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
            return new client_1.Prisma.Decimal(trimmed);
        }
        catch (error) {
            throw new Error(`Field ${field} must be a valid number`);
        }
    }
    if (typeof value === "number") {
        try {
            return new client_1.Prisma.Decimal(value);
        }
        catch (error) {
            throw new Error(`Field ${field} must be a valid number`);
        }
    }
    throw new Error(`Field ${field} must be a number or numeric string`);
};
const toDate = (value, field) => {
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
const toOptionalString = (value, field) => {
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
const toJson = (value, field) => {
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
        }
        catch (error) {
            throw new Error(`Field ${field} must be a valid JSON string`);
        }
    }
    return value;
};
const normalizeJsonForWrite = (value) => {
    if (value === null) {
        return client_1.Prisma.JsonNull;
    }
    return value;
};
const HEADER_MAP = {
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
const normalizeHeaderName = (value) => {
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
const resolveFieldFromHeader = (value) => {
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
    if (normalized.includes("preco") ||
        normalized.includes("price") ||
        normalized.includes("valor_mwh") ||
        normalized.includes("valor_unit")) {
        return "price";
    }
    if (normalized === "data" ||
        normalized.includes("data_base") ||
        (normalized.includes("data") && normalized.includes("base")) ||
        normalized.includes("competencia") ||
        normalized.includes("mes_referencia")) {
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
    if (normalized.includes("consumo_max") ||
        normalized.includes("consumo_min")) {
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
const normalizeBase64 = (raw) => {
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
const resolveSheetName = (available, desired) => {
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
const resolveHeaderRowIndex = (value) => {
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
const parseSpreadsheet = (payload) => {
    var _a, _b, _c;
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
    const desiredSheet = (_c = (_b = (_a = (typeof payload.sheet === "string" && payload.sheet.trim().length ? payload.sheet : undefined)) !== null && _a !== void 0 ? _a : (typeof payload.sheetName === "string" && payload.sheetName.trim().length ? payload.sheetName : undefined)) !== null && _b !== void 0 ? _b : (typeof payload.tab === "string" && payload.tab.trim().length ? payload.tab : undefined)) !== null && _c !== void 0 ? _c : (typeof payload.aba === "string" && payload.aba.trim().length ? payload.aba : undefined);
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
    });
    if (rows.length <= headerRowIndex) {
        throw new Error(`Linha de cabe�alho ${headerRowIndex + 1} n�o encontrada na planilha`);
    }
    const headerRow = rows[headerRowIndex];
    const fieldPerColumn = headerRow.map((cell) => resolveFieldFromHeader(cell));
    const dataRows = rows.slice(headerRowIndex + 1);
    const records = [];
    dataRows.forEach((row, index) => {
        if (!Array.isArray(row)) {
            return;
        }
        const rowNumber = headerRowIndex + 2 + index;
        const record = { __rowNumber: rowNumber };
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
                }
                else if (field === "base_date") {
                    record.base_date = trimmedValue;
                }
                else {
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
                }
                else {
                    record[field] = value;
                }
                return;
            }
            if (typeof value === "number") {
                if (field === "client") {
                    record.client = value.toString();
                }
                else {
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
const parseRecord = (item) => {
    if (typeof item !== "object" || item === null) {
        throw new Error("Each entry must be an object");
    }
    const clientRaw = item.client;
    if (typeof clientRaw !== "string" || clientRaw.trim().length === 0) {
        throw new Error("Field client is required");
    }
    const client = clientRaw.trim();
    const createData = { client };
    const updateData = {};
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
    }
    const cp = toOptionalString(item.cp, "cp");
    if (cp !== undefined) {
        createData.cp = cp;
        updateData.cp = cp;
    }
    const charges = toJson(item.charges, "charges");
    if (charges !== undefined) {
        const normalizedCharges = normalizeJsonForWrite(charges);
        createData.charges = normalizedCharges;
        updateData.charges = normalizedCharges;
    }
    return { client, createData, updateData };
};
app.get("/health", (_req, res) => {
    res.json({ ok: true });
});
app.get("/scde", async (_req, res) => {
    try {
        const records = await prisma.scde.findMany({
            take: 50,
            orderBy: { id: "desc" }
        });
        res.json(records.map(serialize));
    }
    catch (error) {
        res.status(500).json({ error: "Failed to fetch records" });
    }
});
app.get("/scde/:id", async (req, res) => {
    let recordId;
    try {
        recordId = BigInt(req.params.id);
    }
    catch (error) {
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
    }
    catch (error) {
        res.status(500).json({ error: "Failed to fetch record" });
    }
});
app.post("/scde", async (req, res) => {
    let items = [];
    let mode = "json-array";
    let spreadsheetMeta;
    if (Array.isArray(req.body)) {
        items = req.body;
    }
    else if (req.body && typeof req.body === "object") {
        const payload = req.body;
        if (typeof payload.base64 === "string") {
            mode = "spreadsheet";
            try {
                const { records, sheetName, headerRow } = parseSpreadsheet(payload);
                items = records;
                spreadsheetMeta = { sheetName, headerRow: headerRow + 1 };
            }
            catch (error) {
                return res.status(400).json({
                    error: error instanceof Error ? error.message : "Falha ao interpretar a planilha"
                });
            }
        }
        else {
            return res.status(400).json({ error: "Body must be an array or contain a base64 property" });
        }
    }
    else {
        return res.status(400).json({ error: "Body must be an array or contain a base64 property" });
    }
    const added = [];
    const updated = [];
    const pending = [];
    for (const item of items) {
        const { __rowNumber, ...record } = item;
        try {
            const { client, createData, updateData } = parseRecord(record);
            const existing = await prisma.scde.findUnique({ where: { client } });
            if (existing) {
                const result = await prisma.scde.update({
                    where: { client },
                    data: updateData
                });
                updated.push(serialize(result));
            }
            else {
                const result = await prisma.scde.create({ data: createData });
                added.push(serialize(result));
            }
        }
        catch (error) {
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
            sheetName: spreadsheetMeta === null || spreadsheetMeta === void 0 ? void 0 : spreadsheetMeta.sheetName,
            headerRow: spreadsheetMeta === null || spreadsheetMeta === void 0 ? void 0 : spreadsheetMeta.headerRow
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
//# sourceMappingURL=server.js.map