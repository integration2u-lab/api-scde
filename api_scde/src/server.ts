import dotenv from "dotenv";
import express, { NextFunction, Request, Response } from "express";
import cors from "cors";
import logger from "./libs/logger";
import importRouter from "./routes/import.router";
import prisma from "./libs/prisma";

dotenv.config();

const app = express();

const trustProxySetting = process.env.TRUST_PROXY ?? "loopback";
app.set("trust proxy", trustProxySetting);
app.use(cors());
app.use(express.json({ limit: process.env.REQUEST_BODY_LIMIT ?? "50mb" }));

app.get("/health", (_req: Request, res: Response) => {
  res.json({ ok: true });
});

app.use("/api/v1/balanco", importRouter);

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  logger.error({ err }, "Erro nao tratado");
  res.status(500).json({
    success: false,
    message: "Erro interno do servidor"
  });
});

const PORT = Number(process.env.PORT ?? 3000);

const server = app.listen(PORT, () => {
  logger.info({ port: PORT }, `API running at http://localhost:${PORT}`);
});

const shutdown = async () => {
  logger.info("Encerrando aplicacao");
  await prisma.$disconnect();
  server.close(() => {
    process.exit(0);
  });
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

export default app;

