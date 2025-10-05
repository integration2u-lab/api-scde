"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.query = exports.pool = void 0;
require("dotenv/config");
const pg_1 = require("pg");
const pg_connection_string_1 = require("pg-connection-string");
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
    throw new Error("DATABASE_URL environment variable is not set");
}
const toOptionalString = (value) => value ?? undefined;
const parsed = (0, pg_connection_string_1.parse)(connectionString);
const poolConfig = {
    host: toOptionalString(parsed.host),
    port: parsed.port ? Number(parsed.port) : undefined,
    user: toOptionalString(parsed.user),
    password: toOptionalString(parsed.password),
    database: toOptionalString(parsed.database),
    ssl: {
        rejectUnauthorized: false,
    },
    max: Number(process.env.PG_POOL_MAX ?? 10),
    idleTimeoutMillis: 30_000,
};
const applicationName = toOptionalString(parsed.application_name);
if (applicationName) {
    poolConfig.application_name = applicationName;
}
const fallbackApplicationName = toOptionalString(parsed.fallback_application_name);
if (fallbackApplicationName) {
    poolConfig.fallback_application_name = fallbackApplicationName;
}
const options = toOptionalString(parsed.options);
if (options) {
    poolConfig.options = options;
}
exports.pool = new pg_1.Pool(poolConfig);
exports.pool.on("error", (error) => {
    // Surface unexpected errors so they are not swallowed by node-postgres.
    console.error("Unexpected PostgreSQL error", error);
});
const query = (text, params = []) => exports.pool.query(text, params);
exports.query = query;
