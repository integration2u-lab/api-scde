"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var _a;
Object.defineProperty(exports, "__esModule", { value: true });
exports.importController = exports.ImportController = void 0;
const zod_1 = require("zod");
const crypto_1 = __importDefault(require("crypto"));
const prisma_1 = __importDefault(require("../libs/prisma"));
const logger_1 = __importDefault(require("../libs/logger"));
const import_service_1 = require("../services/import.service");
const overwriteStrategyValues = ["upsert", "insertOnly"];
const importBodySchema = zod_1.z.object({
    fileName: zod_1.z.string().min(1, "fileName e obrigatorio"),
    mimeType: zod_1.z
        .string()
        .min(1, "mimeType e obrigatorio")
        .refine((value) => [
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "application/vnd.ms-excel",
        "text/csv"
    ].includes(value), "mimeType nao suportado"),
    base64: zod_1.z.string().min(1, "Arquivo base64 e obrigatorio"),
    origin: zod_1.z.string().min(1, "origin e obrigatorio"),
    overwriteStrategy: zod_1.z
        .enum(overwriteStrategyValues)
        .default("upsert"),
    idempotencyKey: zod_1.z.string().optional()
});
const buildValidationErrorResponse = (error) => ({
    success: false,
    errors: error.errors.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message
    }))
});
const bytesLimit = Number((_a = process.env.MAX_IMPORT_PAYLOAD_BYTES) !== null && _a !== void 0 ? _a : 50 * 1024 * 1024);
const supportedMimeTypes = new Set([
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-excel",
    "text/csv"
]);
const importLogger = logger_1.default.child({ context: "import-controller" });
const sanitizeBase64 = (input) => input.replace(/\s+/g, "");
const computeIdempotencyKey = (body) => {
    if (body.idempotencyKey) {
        return body.idempotencyKey;
    }
    return crypto_1.default.createHash("sha256").update(body.base64).digest("hex");
};
const decimalToNumber = (decimal) => decimal ? Number(decimal.toString()) : 0;
const formatBatchResponse = (batch) => {
    var _a;
    return ({
        success: true,
        importBatchId: batch.batchKey,
        counts: {
            energyBalance: {
                inserted: batch.energyInsertedCount,
                updated: batch.energyUpdatedCount,
                skipped: batch.energySkippedCount
            },
            scde: {
                inserted: batch.scdeInsertedCount,
                updated: batch.scdeUpdatedCount,
                skipped: batch.scdeSkippedCount
            }
        },
        errors: (_a = batch.errors) !== null && _a !== void 0 ? _a : []
    });
};
const getMonthRange = (year, month) => {
    const start = new Date(Date.UTC(year, month - 1, 1));
    const end = new Date(Date.UTC(year, month, 1));
    return { start, end };
};
class ImportController {
    async handleImport(req, res, next) {
        try {
            const validation = importBodySchema.safeParse(req.body);
            if (!validation.success) {
                return res.status(400).json(buildValidationErrorResponse(validation.error));
            }
            const body = validation.data;
            if (!supportedMimeTypes.has(body.mimeType)) {
                return res.status(415).json({
                    success: false,
                    message: "Tipo de arquivo nao suportado"
                });
            }
            const sanitizedBase64 = sanitizeBase64(body.base64);
            let buffer;
            try {
                buffer = Buffer.from(sanitizedBase64, "base64");
            }
            catch (error) {
                return res.status(400).json({
                    success: false,
                    message: "base64 invalido"
                });
            }
            if (!buffer.length) {
                return res.status(400).json({
                    success: false,
                    message: "Arquivo base64 invalido"
                });
            }
            if (buffer.byteLength > bytesLimit) {
                return res.status(413).json({
                    success: false,
                    message: "Arquivo excede o limite permitido"
                });
            }
            const idempotencyKey = computeIdempotencyKey({
                base64: sanitizedBase64,
                idempotencyKey: body.idempotencyKey
            });
            const existingBatch = await prisma_1.default.importBatch.findUnique({
                where: { idempotencyKey }
            });
            if (existingBatch) {
                return res.json(formatBatchResponse(existingBatch));
            }
            const { batchId } = (0, import_service_1.generateImportBatchId)(idempotencyKey);
            const batch = await prisma_1.default.importBatch.create({
                data: {
                    batchKey: batchId,
                    idempotencyKey,
                    fileName: body.fileName,
                    origin: body.origin,
                    mimeType: body.mimeType,
                    overwriteStrategy: body.overwriteStrategy
                }
            });
            const parsing = (0, import_service_1.parseWorkbook)(buffer, {
                origin: body.origin,
                fileName: body.fileName
            });
            const energyResult = await (0, import_service_1.upsertEnergyRows)(parsing.energyRows, {
                overwriteStrategy: body.overwriteStrategy,
                importBatchId: batch.batchKey
            });
            const scdeResult = await (0, import_service_1.upsertScdeRows)(parsing.scdeRows, {
                overwriteStrategy: body.overwriteStrategy,
                importBatchId: batch.batchKey
            });
            const combinedErrors = [...parsing.errors, ...energyResult.errors, ...scdeResult.errors];
            const jsonErrors = combinedErrors.map((error) => ({
                sheet: error.sheet,
                row: error.row,
                message: error.message
            }));
            const updatedBatch = await prisma_1.default.importBatch.update({
                where: { id: batch.id },
                data: {
                    energyInsertedCount: energyResult.counts.inserted,
                    energyUpdatedCount: energyResult.counts.updated,
                    energySkippedCount: energyResult.counts.skipped,
                    scdeInsertedCount: scdeResult.counts.inserted,
                    scdeUpdatedCount: scdeResult.counts.updated,
                    scdeSkippedCount: scdeResult.counts.skipped,
                    errorCount: combinedErrors.length,
                    errors: jsonErrors,
                    completedAt: new Date()
                }
            });
            importLogger.info({
                importBatchId: batch.batchKey,
                energyCounts: energyResult.counts,
                scdeCounts: scdeResult.counts,
                errors: combinedErrors.length
            });
            return res.status(201).json(formatBatchResponse(updatedBatch));
        }
        catch (error) {
            if (error instanceof import_service_1.SpreadsheetValidationError) {
                return res.status(400).json({
                    success: false,
                    message: error.message
                });
            }
            importLogger.error({ err: error }, "Falha no processamento da importacao");
            return next(error);
        }
    }
    async getImportBatch(req, res, next) {
        try {
            const { batchId } = req.params;
            const batch = await prisma_1.default.importBatch.findUnique({
                where: { batchKey: batchId }
            });
            if (!batch) {
                return res.status(404).json({
                    success: false,
                    message: "importacao nao encontrada"
                });
            }
            return res.json(formatBatchResponse(batch));
        }
        catch (error) {
            return next(error);
        }
    }
    async getMonthlySummary(req, res, next) {
        var _a, _b, _c;
        try {
            const { yyyyMM } = req.params;
            const pattern = /^(\d{4})(\d{2})$/;
            const match = yyyyMM.match(pattern);
            if (!match) {
                return res.status(400).json({
                    success: false,
                    message: "Formato invalido. Use YYYYMM"
                });
            }
            const year = Number(match[1]);
            const month = Number(match[2]);
            if (month < 1 || month > 12) {
                return res.status(400).json({
                    success: false,
                    message: "Mes invalido"
                });
            }
            const page = Math.max(1, Number((_a = req.query.page) !== null && _a !== void 0 ? _a : 1));
            const pageSize = Math.min(500, Math.max(1, Number((_b = req.query.pageSize) !== null && _b !== void 0 ? _b : 50)));
            const skip = (page - 1) * pageSize;
            const referencia = `${year}-${String(month).padStart(2, "0")}`;
            const { start, end } = getMonthRange(year, month);
            const [aggregated, items] = await prisma_1.default.$transaction([
                prisma_1.default.energyBalance.aggregate({
                    where: {
                        referenceDate: {
                            gte: start,
                            lt: end
                        }
                    },
                    _count: { _all: true },
                    _sum: {
                        consumption: true,
                        toBill: true
                    }
                }),
                prisma_1.default.energyBalance.findMany({
                    where: {
                        referenceDate: {
                            gte: start,
                            lt: end
                        }
                    },
                    orderBy: { referenceDate: "asc" },
                    skip,
                    take: pageSize
                })
            ]);
            const totalRows = (_c = aggregated._count._all) !== null && _c !== void 0 ? _c : 0;
            const totalPages = totalRows === 0 ? 0 : Math.ceil(totalRows / pageSize);
            return res.json({
                success: true,
                referencia,
                totals: {
                    rows: totalRows,
                    consumption: decimalToNumber(aggregated._sum.consumption),
                    toBill: decimalToNumber(aggregated._sum.toBill)
                },
                pagination: {
                    page,
                    pageSize,
                    totalPages
                },
                items: items.map((item) => {
                    var _a, _b;
                    return ({
                        id: item.id,
                        clients: item.clients,
                        referenceDate: (_b = (_a = item.referenceDate) === null || _a === void 0 ? void 0 : _a.toISOString()) !== null && _b !== void 0 ? _b : null,
                        price: decimalToNumber(item.price),
                        adjusted: decimalToNumber(item.adjusted),
                        supplier: item.supplier,
                        meter: item.meter,
                        consumption: decimalToNumber(item.consumption),
                        measurement: item.measurement,
                        proinfa: decimalToNumber(item.proinfa),
                        contract: decimalToNumber(item.contract),
                        minimum: decimalToNumber(item.minimum),
                        maximum: decimalToNumber(item.maximum),
                        toBill: decimalToNumber(item.toBill),
                        cp: item.cp,
                        origin: item.origin,
                        importBatchId: item.importBatchId,
                        createdAt: item.createdAt.toISOString(),
                        updatedAt: item.updatedAt.toISOString()
                    });
                })
            });
        }
        catch (error) {
            return next(error);
        }
    }
}
exports.ImportController = ImportController;
exports.importController = new ImportController();
//# sourceMappingURL=import.controller.js.map