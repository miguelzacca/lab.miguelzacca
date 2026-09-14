import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../../generated/prisma/index.js";

export function runtimeDatabaseUrl(value = process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.PRISMA_DATABASE_URL) {
  if (!value) throw new Error("DATABASE_URL is not configured.");
  const url = new URL(value);
  if (!["postgres:", "postgresql:"].includes(url.protocol)) throw new Error("DATABASE_URL must use PostgreSQL.");
  if (url.searchParams.get("sslmode") === "require") url.searchParams.set("sslmode", "verify-full");
  return url.toString();
}

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function createClient() {
  const isProduction = Boolean(process.env.VERCEL || process.env.NODE_ENV === "production");
  const adapter = new PrismaPg({
    connectionString: runtimeDatabaseUrl(),
    max: positiveInteger(process.env.DATABASE_POOL_MAX, isProduction ? 2 : 5),
    connectionTimeoutMillis: positiveInteger(process.env.DATABASE_CONNECTION_TIMEOUT_MS, 15000),
    idleTimeoutMillis: positiveInteger(process.env.DATABASE_IDLE_TIMEOUT_MS, 10000),
    statement_timeout: positiveInteger(process.env.DATABASE_QUERY_TIMEOUT_MS, 30000)
  });
  return new PrismaClient({
    adapter,
    errorFormat: "minimal",
    transactionOptions: { maxWait: 5000, timeout: 30000 }
  });
}

export function getPrisma() {
  if (!globalThis.__mzLabPrisma) globalThis.__mzLabPrisma = createClient();
  return globalThis.__mzLabPrisma;
}
