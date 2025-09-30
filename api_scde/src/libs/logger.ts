import pino from "pino";

const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
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

export default logger;
