import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { config } from "dotenv";
import pg from "pg";

config({ path: resolve(".env.local") });

const LAB_PROJECT = "lab.miguelzacca";
const LAB_TABLES = new Set([
  "_prisma_migrations", "Formulation", "Ingredient", "FormulationIngredient",
  "Collection", "Tag", "FormulationTag", "Revision", "Reference",
  "QualityControlRecord", "ProcessMetadata", "LabelingField", "Packaging",
  "DocumentSettings", "Attachment", "AppSettings", "AIInteraction"
]);
const FORBIDDEN_MARKERS = [
  "users", "organizations", "properties", "crm_contacts", "subscriptions",
  "whatsapp_outreach_campaigns"
];

function fail(message) {
  console.error("[LAB DATABASE GUARD] " + message);
  process.exit(1);
}

const directUrl =
  process.env.PRISMA_DATABASE_URL ||
  process.env.POSTGRES_URL ||
  process.env.DATABASE_URL;
if (!directUrl) fail("PRISMA_DATABASE_URL, POSTGRES_URL or DATABASE_URL is required.");

let parsed;
try {
  parsed = new URL(directUrl);
} catch {
  fail("The migration database URL is invalid.");
}
if (!["postgres:", "postgresql:"].includes(parsed.protocol)) fail("PostgreSQL is required.");
if (parsed.hostname !== "db.prisma.io") fail("Migrations require the direct Prisma Postgres host db.prisma.io.");

let project;
try {
  project = JSON.parse(await readFile(resolve(".vercel/project.json"), "utf8"));
} catch {
  fail("This repository must be linked to its Vercel project before migration.");
}
if (project.projectName !== LAB_PROJECT) {
  fail("Refusing to run outside the " + LAB_PROJECT + " Vercel project.");
}

const fingerprint = createHash("sha256").update(directUrl).digest("hex").slice(0, 16);
const pool = new pg.Pool({
  connectionString: directUrl,
  max: 1,
  connectionTimeoutMillis: 15000,
  idleTimeoutMillis: 1000,
  ssl: { rejectUnauthorized: false }
});

try {
  const identity = await pool.query(
    "select current_database() as database, current_user as role, current_schema() as schema"
  );
  const tableResult = await pool.query(
    "select tablename from pg_catalog.pg_tables where schemaname = 'public' order by tablename"
  );
  const tables = tableResult.rows.map((row) => row.tablename);
  const forbidden = tables.filter((table) => FORBIDDEN_MARKERS.includes(table.toLowerCase()));
  const unrelated = tables.filter((table) => !LAB_TABLES.has(table));
  if (forbidden.length || unrelated.length) {
    fail("Target contains non-Lab tables: " + [...forbidden, ...unrelated].join(", ") + ".");
  }
  console.log(JSON.stringify({
    safe: true,
    project: project.projectName,
    provider: parsed.hostname,
    database: identity.rows[0].database,
    schema: identity.rows[0].schema,
    targetFingerprint: fingerprint,
    existingLabTables: tables.length
  }, null, 2));
} finally {
  await pool.end();
}
