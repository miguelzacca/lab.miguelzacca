import { getPrisma } from "../src/server/db/prisma.js";
import { requireOwner } from "../src/server/auth/session.js";
import { PrismaFormulationRepository } from "../src/server/repositories/formulation-repository.js";
import { PrismaIngredientRepository } from "../src/server/repositories/ingredient-repository.js";
import { readJson, safeError, sendJson } from "../src/server/http.js";
import { takeRateLimit } from "../src/server/security/rate-limit.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const revisionSources = new Set(["MANUAL", "AI", "IMPORT", "RESTORE", "SYSTEM"]);

function duplicateValues(values) {
  const seen = new Set();
  const duplicates = new Set();
  for (const value of values) {
    const normalized = String(value || "").trim().toLowerCase();
    if (!normalized) continue;
    if (seen.has(normalized)) duplicates.add(normalized);
    seen.add(normalized);
  }
  return [...duplicates];
}

export function validateBackup(input) {
  const errors = [];
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    errors.push("O arquivo n\u00e3o cont\u00e9m um objeto JSON.");
  }
  if (input?.schemaVersion !== 1) errors.push("A vers\u00e3o do schema n\u00e3o \u00e9 compat\u00edvel.");
  if (!Array.isArray(input?.formulations)) errors.push("A cole\u00e7\u00e3o formulations est\u00e1 ausente.");
  if (!Array.isArray(input?.ingredients)) errors.push("A cole\u00e7\u00e3o ingredients est\u00e1 ausente.");
  if (!Array.isArray(input?.collections)) errors.push("A cole\u00e7\u00e3o collections est\u00e1 ausente.");
  if (!input?.settings || typeof input.settings !== "object" || Array.isArray(input.settings)) {
    errors.push("As configura\u00e7\u00f5es do backup est\u00e3o ausentes.");
  }
  if ((input?.formulations?.length || 0) > 500) errors.push("O backup excede o limite de formula\u00e7\u00f5es (m\u00e1ximo: 500).");
  if ((input?.ingredients?.length || 0) > 10000) errors.push("O backup excede o limite de ingredientes.");
  if ((input?.collections?.length || 0) > 1000) errors.push("O backup excede o limite de cole\u00e7\u00f5es.");

  (input?.formulations || []).forEach((record, index) => {
    if (!record || typeof record !== "object" || !String(record.title || "").trim() || !String(record.code || "").trim()) {
      errors.push("Formula\u00e7\u00e3o " + (index + 1) + " \u00e9 inv\u00e1lida.");
    }
    if (Array.isArray(record?.revisions) && record.revisions.length > 500) {
      errors.push("Formula\u00e7\u00e3o " + (index + 1) + " excede o limite de revis\u00f5es.");
    }
  });
  (input?.ingredients || []).forEach((record, index) => {
    if (!record || typeof record !== "object" || !String(record.canonicalName || "").trim()) {
      errors.push("Ingrediente " + (index + 1) + " \u00e9 inv\u00e1lido.");
    }
  });
  (input?.collections || []).forEach((record, index) => {
    if (!record || typeof record !== "object" || !String(record.name || "").trim()) {
      errors.push("Cole\u00e7\u00e3o " + (index + 1) + " \u00e9 inv\u00e1lida.");
    }
  });
  const duplicateCodes = duplicateValues((input?.formulations || []).map((item) => item?.code));
  if (duplicateCodes.length) errors.push("Existem c\u00f3digos de formula\u00e7\u00e3o duplicados no backup.");
  const duplicateCollections = duplicateValues((input?.collections || []).map((item) => item?.name));
  if (duplicateCollections.length) errors.push("Existem nomes de cole\u00e7\u00e3o duplicados no backup.");

  return {
    valid: errors.length === 0,
    errors,
    summary: {
      formulations: input?.formulations?.length || 0,
      ingredients: input?.ingredients?.length || 0,
      collections: input?.collections?.length || 0,
      settings: input?.settings && typeof input.settings === "object" ? Object.keys(input.settings).length : 0
    }
  };
}

function stripRevisionRecursion(value, depth = 0) {
  if (depth > 20) return null;
  if (Array.isArray(value)) return value.map((item) => stripRevisionRecursion(item, depth + 1));
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).flatMap(([key, item]) => {
    if (["revisions", "history", "aiInteractions", "coverImageData"].includes(key)) return [];
    return [[key, stripRevisionRecursion(item, depth + 1)]];
  }));
}

function revisionData(revision, formulationId) {
  const createdAt = new Date(revision.createdAt || Date.now());
  return {
    formulationId,
    revisionNumber: Number.isInteger(Number(revision.revisionNumber))
      ? Math.max(1, Number(revision.revisionNumber))
      : 1,
    source: revisionSources.has(revision.source) ? revision.source : "IMPORT",
    modifiedFields: Array.isArray(revision.modifiedFields)
      ? revision.modifiedFields.map(String).slice(0, 100)
      : ["imported"],
    previousValues: stripRevisionRecursion(revision.previousValues || {}),
    note: typeof revision.note === "string" ? revision.note.slice(0, 10000) : null,
    createdAt: Number.isNaN(createdAt.getTime()) ? new Date() : createdAt
  };
}

async function uniqueImportedCode(tx, original, index) {
  const stem = String(original).slice(0, 58);
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const suffix = "-IMPORT-" + Date.now().toString().slice(-6) + "-" + index + (attempt ? "-" + attempt : "");
    const code = (stem + suffix).slice(0, 80);
    const exists = await tx.formulation.findUnique({ where: { code }, select: { id: true } });
    if (!exists) return code;
  }
  throw Object.assign(new Error("IMPORT_CODE_CONFLICT"), { status: 409 });
}

async function importBackup(prisma, backup, mode) {
  return prisma.$transaction(async (tx) => {
    if (mode === "replace") {
      await tx.aIInteraction.deleteMany();
      await tx.formulation.deleteMany();
      await tx.ingredient.deleteMany();
      await tx.collection.deleteMany();
      await tx.tag.deleteMany();
      await tx.appSettings.deleteMany();
    }

    const collectionMap = new Map();
    for (const original of backup.collections) {
      const oldId = UUID.test(String(original.id || "")) ? original.id : null;
      const name = String(original.name).trim().slice(0, 160);
      const existing = mode === "merge"
        ? await tx.collection.findUnique({ where: { name } })
        : null;
      const row = existing || await tx.collection.create({
        data: {
          name,
          description: typeof original.description === "string" ? original.description.slice(0, 10000) : null,
          color: typeof original.color === "string" ? original.color.slice(0, 32) : null,
          position: Number.isInteger(Number(original.position)) ? Number(original.position) : 0,
          archivedAt: original.archivedAt ? new Date(original.archivedAt) : null
        }
      });
      if (oldId) collectionMap.set(oldId, row.id);
    }

    const ingredientMap = new Map();
    const ingredientRepository = new PrismaIngredientRepository(tx);
    for (const original of backup.ingredients) {
      const oldId = UUID.test(String(original.id || "")) ? original.id : null;
      const existing = oldId && mode === "merge"
        ? await tx.ingredient.findUnique({ where: { id: oldId } })
        : null;
      const row = existing || await ingredientRepository.save({ ...original, id: undefined });
      if (oldId) ingredientMap.set(oldId, row.id);
    }

    for (const [key, value] of Object.entries(backup.settings)) {
      if (!["appearance", "libraryView", "documentDefaults", "previewAppearance"].includes(key)) continue;
      await tx.appSettings.upsert({ where: { key }, create: { key, value }, update: { value } });
    }

    const repository = new PrismaFormulationRepository(tx);
    let imported = 0;
    for (const original of backup.formulations) {
      const record = structuredClone(original);
      delete record.id;
      const existing = await tx.formulation.findUnique({ where: { code: record.code }, select: { id: true } });
      if (existing) record.code = await uniqueImportedCode(tx, record.code, imported);
      record.collectionId = collectionMap.get(record.collectionId) || null;
      record.ingredients = Array.isArray(record.ingredients)
        ? record.ingredients.map((item) => ({
            ...item,
            id: undefined,
            ingredientId: ingredientMap.get(item.ingredientId) || null
          }))
        : [];
      const saved = await repository.save(record, "IMPORT");
      if (Array.isArray(original.revisions) && original.revisions.length) {
        await tx.revision.deleteMany({ where: { formulationId: saved.id } });
        await tx.revision.createMany({
          data: original.revisions.map((revision) => revisionData(revision, saved.id))
        });
      }
      imported += 1;
    }
    return { imported };
  }, { maxWait: 10000, timeout: 120000 });
}

export default async function handler(request, response) {
  if (!requireOwner(request, response)) return;
  const prisma = getPrisma();
  const repository = new PrismaFormulationRepository(prisma);
  try {
    if (request.method === "GET") {
      const [active, archived, ingredients, collections, settings] = await Promise.all([
        repository.list({ archived: false, full: true }),
        repository.list({ archived: true, full: true }),
        prisma.ingredient.findMany(),
        prisma.collection.findMany(),
        prisma.appSettings.findMany()
      ]);
      sendJson(response, 200, {
        product: "MIGUEL ZAKALEB FORMULATION LAB",
        schemaVersion: 1,
        exportedAt: new Date().toISOString(),
        formulations: [...active, ...archived],
        ingredients,
        collections,
        settings: Object.fromEntries(settings.map((row) => [row.key, row.value]))
      });
      return;
    }
    if (request.method === "POST") {
      if (!takeRateLimit(request, "backup-import", { limit: 8, windowMs: 5 * 60 * 1000 })) {
        sendJson(response, 429, { error: "Limite tempor\u00e1rio de importa\u00e7\u00f5es atingido." });
        return;
      }
      const body = await readJson(request, 12000000);
      const validation = validateBackup(body.backup);
      if (!validation.valid) {
        sendJson(response, 400, validation);
        return;
      }
      if (body.mode === "inspect") {
        const [formulations, ingredientIds, collectionNames] = await Promise.all([
          prisma.formulation.findMany({
            where: { code: { in: body.backup.formulations.map((item) => item.code) } },
            select: { id: true, code: true, title: true }
          }),
          prisma.ingredient.findMany({
            where: { id: { in: body.backup.ingredients.map((item) => item.id).filter((id) => UUID.test(String(id))) } },
            select: { id: true, canonicalName: true }
          }),
          prisma.collection.findMany({
            where: { name: { in: body.backup.collections.map((item) => item.name) } },
            select: { id: true, name: true }
          })
        ]);
        sendJson(response, 200, {
          ...validation,
          conflicts: formulations,
          conflictDetails: { formulations, ingredients: ingredientIds, collections: collectionNames }
        });
        return;
      }
      if (!["merge", "replace"].includes(body.mode)) {
        throw Object.assign(new Error("INVALID_MODE"), { status: 400 });
      }
      const result = await importBackup(prisma, body.backup, body.mode);
      sendJson(response, 200, { ok: true, ...result });
      return;
    }
    sendJson(response, 405, { error: "M\u00e9todo n\u00e3o permitido." });
  } catch (error) {
    safeError(response, error);
  }
}
