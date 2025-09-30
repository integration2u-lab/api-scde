import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import crypto from "crypto";
import { Prisma } from "@prisma/client";
import prisma from "../libs/prisma";
import logger from "../libs/logger";
import {
  generateImportBatchId,
  parseWorkbook,
  SpreadsheetValidationError,
  upsertRows
} from "../services/import.service";

const overwriteStrategyValues = ["upsert", "insertOnly"] as const;

const importBodySchema = z.object({
  fileName: z.string().min(1, "fileName e obrigatorio"),
  mimeType: z
    .string()
    .min(1, "mimeType e obrigatorio")
    .refine(
      (value) =>
        [
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "application/vnd.ms-excel",
          "text/csv"
        ].includes(value),
      "mimeType nao suportado"
    ),
  base64: z.string().min(1, "Arquivo base64 e obrigatorio"),
  origin: z.string().min(1, "origin e obrigatorio"),
  overwriteStrategy: z
    .enum(overwriteStrategyValues)
    .default("upsert"),
  idempotencyKey: z.string().optional()
});

const buildValidationErrorResponse = (error: z.ZodError) => ({
  success: false,
  errors: error.errors.map((issue) => ({
    path: issue.path.join("."),
    message: issue.message
  }))
});

const bytesLimit = Number(process.env.MAX_IMPORT_PAYLOAD_BYTES ?? 50 * 1024 * 1024);

const supportedMimeTypes = new Set([
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "text/csv"
]);

const importLogger = logger.child({ context: "import-controller" });

const sanitizeBase64 = (input: string) => input.replace(/\s+/g, "");

const computeIdempotencyKey = (body: { base64: string; idempotencyKey?: string }) => {
  if (body.idempotencyKey) {
    return body.idempotencyKey;
  }
  return crypto.createHash("sha256").update(body.base64).digest("hex");
};

const decimalToNumber = (decimal: Prisma.Decimal | null) =>
  decimal ? Number(decimal.toString()) : 0;

type PrismaDecimal = Prisma.Decimal;

const formatBatchResponse = (batch: {
  batchKey: string;
  insertedCount: number;
  updatedCount: number;
  skippedCount: number;
  errors: unknown;
}) => ({
  success: true,
  importBatchId: batch.batchKey,
  counts: {
    inserted: batch.insertedCount,
    updated: batch.updatedCount,
    skipped: batch.skippedCount
  },
  errors: (batch.errors as { row: number; message: string }[]) ?? []
});

export class ImportController {
  public async handleImport(req: Request, res: Response, next: NextFunction) {
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
      let buffer: Buffer;
      try {
        buffer = Buffer.from(sanitizedBase64, "base64");
      } catch (error) {
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

      const existingBatch = await prisma.importBatch.findUnique({
        where: { idempotencyKey }
      });
      if (existingBatch) {
        return res.json(formatBatchResponse(existingBatch));
      }

      const { batchId } = generateImportBatchId(idempotencyKey);

      const batch = await prisma.importBatch.create({
        data: {
          batchKey: batchId,
          idempotencyKey,
          fileName: body.fileName,
          origin: body.origin,
          mimeType: body.mimeType,
          overwriteStrategy: body.overwriteStrategy
        }
      });

      const parsing = parseWorkbook(buffer, {
        origin: body.origin,
        fileName: body.fileName
      });

      const upsertResult = await upsertRows(parsing.rows, {
        overwriteStrategy: body.overwriteStrategy,
        importBatchId: batch.batchKey
      });

      const combinedErrors = [...parsing.errors, ...upsertResult.errors];
      const jsonErrors = combinedErrors.map((error) => ({ row: error.row, message: error.message }));

      const updatedBatch = await prisma.importBatch.update({
        where: { id: batch.id },
        data: {
          insertedCount: upsertResult.counts.inserted,
          updatedCount: upsertResult.counts.updated,
          skippedCount: upsertResult.counts.skipped,
          errorCount: combinedErrors.length,
          errors: jsonErrors as unknown as Prisma.JsonArray,
          completedAt: new Date()
        }
      });

      importLogger.info({
        importBatchId: batch.batchKey,
        counts: upsertResult.counts,
        errors: combinedErrors.length
      });

      return res.status(201).json(formatBatchResponse(updatedBatch));
    } catch (error) {
      if (error instanceof SpreadsheetValidationError) {
        return res.status(400).json({
          success: false,
          message: error.message
        });
      }

      importLogger.error({ err: error }, "Falha no processamento da importacao");
      return next(error);
    }
  }

  public async getImportBatch(req: Request, res: Response, next: NextFunction) {
    try {
      const { batchId } = req.params;
      const batch = await prisma.importBatch.findUnique({
        where: { batchKey: batchId }
      });
      if (!batch) {
        return res.status(404).json({
          success: false,
          message: "importacao nao encontrada"
        });
      }
      return res.json(formatBatchResponse(batch));
    } catch (error) {
      return next(error);
    }
  }

  public async getMonthlySummary(req: Request, res: Response, next: NextFunction) {
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

      const page = Math.max(1, Number(req.query.page ?? 1));
      const pageSize = Math.min(500, Math.max(1, Number(req.query.pageSize ?? 50)));
      const skip = (page - 1) * pageSize;

      const referencia = `${year}-${String(month).padStart(2, "0")}`;

      const [aggregated, items] = await prisma.$transaction([
        prisma.energyBalance.aggregate({
          where: { referencia },
          _count: { _all: true },
          _sum: {
            consumoKwh: true,
            valorTotal: true
          }
        }),
        prisma.energyBalance.findMany({
          where: { referencia },
          orderBy: { dataBase: "asc" },
          skip,
          take: pageSize
        })
      ]);

      const totalRows = aggregated._count._all ?? 0;
      const totalPages = totalRows === 0 ? 0 : Math.ceil(totalRows / pageSize);

      return res.json({
        success: true,
        referencia,
        totals: {
          rows: totalRows,
          consumoKwh: decimalToNumber(aggregated._sum.consumoKwh),
          valorTotal: decimalToNumber(aggregated._sum.valorTotal)
        },
        pagination: {
          page,
          pageSize,
          totalPages
        },
        items: items.map((item) => ({
          id: item.id,
          clienteNome: item.clienteNome,
          numeroInstalacao: item.numeroInstalacao,
          referencia: item.referencia,
          dataBase: item.dataBase.toISOString(),
          consumoKwh: decimalToNumber(item.consumoKwh as PrismaDecimal),
          valorTotal: decimalToNumber(item.valorTotal as PrismaDecimal),
          origin: item.origin,
          status: item.status,
          importBatchId: item.importBatchId,
          createdAt: item.createdAt.toISOString(),
          updatedAt: item.updatedAt.toISOString()
        }))
      });
    } catch (error) {
      return next(error);
    }
  }
}

export const importController = new ImportController();

