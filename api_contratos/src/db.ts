import "dotenv/config";
import { Pool, type PoolConfig, type QueryResult, type QueryResultRow } from "pg";
import { parse as parseConnectionString } from "pg-connection-string";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL environment variable is not set");
}

const toOptionalString = (value?: string | null): string | undefined => value ?? undefined;

const parsed = parseConnectionString(connectionString);

const poolConfig: PoolConfig = {
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

export const pool = new Pool(poolConfig);

pool.on("error", (error: Error) => {
  // Surface unexpected errors so they are not swallowed by node-postgres.
  console.error("Unexpected PostgreSQL error", error);
});

export const query = <T extends QueryResultRow = Record<string, unknown>>(
  text: string,
  params: unknown[] = [],
): Promise<QueryResult<T>> => pool.query<T>(text, params);
