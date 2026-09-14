import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";

test("schema Prisma usa PostgreSQL e possui os modelos relacionais essenciais", async () => {
  const schema = await readFile(new URL("../prisma/schema.prisma", import.meta.url), "utf8");
  const requiredModels = [
    "Formulation",
    "Ingredient",
    "FormulationIngredient",
    "Collection",
    "Tag",
    "FormulationTag",
    "Revision",
    "Reference",
    "QualityControlRecord",
    "ProcessMetadata",
    "DocumentSettings",
    "AppSettings",
    "AIInteraction"
  ];

  assert.match(schema, /datasource\s+db\s*\{[\s\S]*provider\s*=\s*"postgresql"/);
  for (const model of requiredModels) {
    assert.match(schema, new RegExp(`model\\s+${model}\\s*\\{`), `modelo ${model} ausente`);
  }
  assert.match(schema, /code\s+String\s+@unique/);
  assert.match(schema, /formulation\s+Formulation\s+@relation\([^\n]+onDelete:\s*Cascade/);
});

test("uma migracao SQL versionada acompanha o schema", async () => {
  const directory = new URL("../prisma/migrations/", import.meta.url);
  const entries = await readdir(directory, { withFileTypes: true });
  const migrationDirectories = entries.filter((entry) => entry.isDirectory());

  assert.ok(migrationDirectories.length > 0, "nenhuma migracao Prisma foi versionada");
  const sqlFiles = await Promise.all(migrationDirectories.map(async (entry) => {
    const files = await readdir(new URL(`${entry.name}/`, directory));
    return files.includes("migration.sql");
  }));
  assert.ok(sqlFiles.some(Boolean), "migration.sql ausente");
});
