"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var _a;
Object.defineProperty(exports, "__esModule", { value: true });
const pino_1 = __importDefault(require("pino"));
const logger = (0, pino_1.default)({
    level: (_a = process.env.LOG_LEVEL) !== null && _a !== void 0 ? _a : "info",
    redact: {
        paths: ["req.headers.authorization"],
        remove: true
    },
    formatters: {
        level(label) {
            return { level: label };
        }
    }
});
exports.default = logger;
//# sourceMappingURL=logger.js.map