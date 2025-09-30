"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var _a, _b, _c;
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const logger_1 = __importDefault(require("./libs/logger"));
const import_router_1 = __importDefault(require("./routes/import.router"));
const prisma_1 = __importDefault(require("./libs/prisma"));
dotenv_1.default.config();
const app = (0, express_1.default)();
const trustProxySetting = (_a = process.env.TRUST_PROXY) !== null && _a !== void 0 ? _a : "loopback";
app.set("trust proxy", trustProxySetting);
app.use((0, cors_1.default)());
app.use(express_1.default.json({ limit: (_b = process.env.REQUEST_BODY_LIMIT) !== null && _b !== void 0 ? _b : "50mb" }));
app.get("/health", (_req, res) => {
    res.json({ ok: true });
});
app.use("/api/v1/balanco", import_router_1.default);
app.use((err, _req, res, _next) => {
    logger_1.default.error({ err }, "Erro nao tratado");
    res.status(500).json({
        success: false,
        message: "Erro interno do servidor"
    });
});
const PORT = Number((_c = process.env.PORT) !== null && _c !== void 0 ? _c : 3000);
const server = app.listen(PORT, () => {
    logger_1.default.info({ port: PORT }, `API running at http://localhost:${PORT}`);
});
const shutdown = async () => {
    logger_1.default.info("Encerrando aplicacao");
    await prisma_1.default.$disconnect();
    server.close(() => {
        process.exit(0);
    });
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
exports.default = app;
//# sourceMappingURL=server.js.map