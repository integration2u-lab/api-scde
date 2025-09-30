import { Router } from "express";
import rateLimit from "express-rate-limit";
import { importController } from "../controllers/import.controller";

const router = Router();

const limiter = rateLimit({
  windowMs: 60 * 1000,
  limit: Number(process.env.RATE_LIMIT_PER_MINUTE ?? 30),
  standardHeaders: "draft-7",
  legacyHeaders: false
});

router.use(limiter);

router.post("/import", (req, res, next) => importController.handleImport(req, res, next));
router.get("/import/:batchId", (req, res, next) => importController.getImportBatch(req, res, next));
router.get("/mes/:yyyyMM", (req, res, next) => importController.getMonthlySummary(req, res, next));

export default router;
