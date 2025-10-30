"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var _a;
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const import_controller_1 = require("../controllers/import.controller");
const router = (0, express_1.Router)();
const limiter = (0, express_rate_limit_1.default)({
    windowMs: 60 * 1000,
    limit: Number((_a = process.env.RATE_LIMIT_PER_MINUTE) !== null && _a !== void 0 ? _a : 30),
    standardHeaders: "draft-7",
    legacyHeaders: false
});
router.use(limiter);
router.post("/import", (req, res, next) => import_controller_1.importController.handleImport(req, res, next));
router.get("/import/:batchId", (req, res, next) => import_controller_1.importController.getImportBatch(req, res, next));
router.get("/mes/:yyyyMM", (req, res, next) => import_controller_1.importController.getMonthlySummary(req, res, next));
exports.default = router;
//# sourceMappingURL=import.router.js.map