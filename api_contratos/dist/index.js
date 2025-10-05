"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const express_1 = __importDefault(require("express"));
const contracts_1 = __importDefault(require("./routes/contracts"));
const app = (0, express_1.default)();
app.use(express_1.default.json());
app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
});
app.use('/contracts', contracts_1.default);
// Centralized error handling to avoid leaking stack traces in responses.
app.use((error, _req, res, _next) => {
    console.error('Unhandled error', error);
    res.status(500).json({ error: 'Internal server error.' });
});
const port = Number(process.env.PORT ?? 3000);
const server = app.listen(port, () => {
    console.log(`API listening on port ${port}`);
});
const gracefulShutdown = (signal) => {
    console.log(`Received ${signal}. Closing server.`);
    server.close(() => {
        process.exit(0);
    });
};
process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);
exports.default = app;
