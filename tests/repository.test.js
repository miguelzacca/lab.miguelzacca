import test from "node:test";
import assert from "node:assert/strict";

import { PrismaIngredientRepository } from "../src/server/repositories/ingredient-repository.js";

function createMemoryPrisma() {
  const rows = [];
  let sequence = 0;
  const clone = (value) => structuredClone(value);

  return {
    rows,
    ingredient: {
      async create({ data }) {
        const timestamp = new Date().toISOString();
        const row = { id: `ingredient-${++sequence}`, createdAt: timestamp, updatedAt: timestamp, ...clone(data) };
        rows.push(row);
        return clone(row);
      },
      async update({ where, data }) {
        const index = rows.findIndex((row) => row.id === where.id);
        if (index < 0) throw new Error("NOT_FOUND");
        rows[index] = { ...rows[index], ...clone(data), updatedAt: new Date().toISOString() };
        return clone(rows[index]);
      },
      async findMany() {
        return rows
          .map((row) => ({ ...clone(row), _count: { formulations: row.formulationCount || 0 } }))
          .sort((a, b) => a.canonicalName.localeCompare(b.canonicalName));
      }
    }
  };
}

test("PrismaIngredientRepository persiste, lista e atualiza perfis", async () => {
  const prisma = createMemoryPrisma();
  const repository = new PrismaIngredientRepository(prisma);
  const created = await repository.save({
    canonicalName: "  Componente Beta  ",
    technicalName: " Nome tecnico ",
    synonyms: ["Beta", "B"],
    commonRoles: ["Veiculo"],
    metadataOrigin: "VERIFIED",
    verificationStatus: "VERIFIED"
  });

  assert.equal(created.canonicalName, "Componente Beta");
  assert.equal(created.technicalName, "Nome tecnico");

  prisma.rows[0].formulationCount = 2;
  const listed = await repository.list();
  assert.equal(listed[0].usageCount, 2);
  assert.equal("_count" in listed[0], false);

  const updated = await repository.save({ ...created, canonicalName: "Componente Alfa" });
  assert.equal(updated.id, created.id);
  assert.equal(updated.canonicalName, "Componente Alfa");
  assert.equal(prisma.rows.length, 1);
});

test("PrismaIngredientRepository aplica defaults seguros e rejeita nome vazio", async () => {
  const repository = new PrismaIngredientRepository(createMemoryPrisma());
  const created = await repository.save({ canonicalName: "Componente" });

  assert.equal(created.metadataOrigin, "MANUAL");
  assert.equal(created.verificationStatus, "UNVERIFIED");
  await assert.rejects(repository.save({ canonicalName: "  " }), /INVALID/);
});
