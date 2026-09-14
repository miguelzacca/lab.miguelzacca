import { getPrisma } from "../db/prisma.js";

const include = {
  ingredients: { orderBy: { position: "asc" } },
  tags: { include: { tag: true } },
  revisions: { orderBy: { createdAt: "desc" }, take: 40 },
  references: { orderBy: { position: "asc" } },
  qualityRecords: { orderBy: { position: "asc" } },
  processMetadata: { orderBy: { stageOrder: "asc" } },
  labelingFields: { orderBy: { position: "asc" } },
  packaging: true,
  documentSettings: true,
  collection: true
};
const { revisions: _revisionInclude, ...listInclude } = include;

const cleanText = (value, max = 10000) => value == null ? null : String(value).trim().slice(0, max) || null;
const array = (value) => Array.isArray(value) ? value.map((item) => String(item).trim()).filter(Boolean) : [];
const invalid = (code = "INVALID") => Object.assign(new Error(code), { status: 400 });

function numeric(value, { integer = false, nonNegative = false } = {}) {
  if (value === "" || value == null) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || (integer && !Number.isInteger(parsed)) || (nonNegative && parsed < 0)) {
    throw invalid("INVALID_NUMERIC_VALUE");
  }
  return parsed;
}

const decimal = (value, nonNegative = false) => numeric(value, { nonNegative });
const integer = (value, nonNegative = false) => numeric(value, { integer: true, nonNegative });

function parsedDate(value, dateOnly = false) {
  if (!value) return null;
  const text = String(value);
  if (dateOnly && !/^\d{4}-\d{2}-\d{2}$/.test(text)) throw invalid("INVALID_DATE");
  const result = new Date(dateOnly ? text + "T00:00:00.000Z" : text);
  if (Number.isNaN(result.getTime())) throw invalid("INVALID_DATE");
  return result;
}

function coverImage(value) {
  if (!value) return { data: null, mime: null };
  if (typeof value !== "string" || value.length > 2100000) {
    throw Object.assign(new Error("INVALID_COVER"), { status: 413 });
  }
  const match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match || match[2].length % 4 === 1) throw invalid("INVALID_COVER");
  const bytes = Buffer.from(match[2], "base64");
  const validMagic = match[1] === "png"
    ? bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    : match[1] === "jpeg"
      ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
      : bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP";
  if (!validMagic) throw invalid("INVALID_COVER");
  return { data: value, mime: "image/" + match[1] };
}

function serialize(record) {
  if (!record) return record;
  return {
    ...record,
    documentDate: record.documentDate?.toISOString().slice(0, 10) || "",
    batch: {
      total: record.batchTotal == null ? null : Number(record.batchTotal),
      unit: record.batchUnit || "g",
      containerCount: record.containerCount,
      amountPerContainer: record.amountPerContainer == null ? null : Number(record.amountPerContainer),
      containerUnit: record.containerUnit || "g"
    },
    ingredients: record.ingredients.map((item) => ({
      ...item,
      percentageWW: item.percentageWW == null ? null : Number(item.percentageWW),
      batchQuantity: item.batchQuantity == null ? null : Number(item.batchQuantity),
      unitQuantity: item.unitQuantity == null ? null : Number(item.unitQuantity)
    })),
    tags: record.tags.map((link) => link.tag.name)
  };
}

function baseData(input) {
  if (!input || typeof input !== "object") throw Object.assign(new Error("INVALID"), { status: 400 });
  if (!cleanText(input.code, 80) || !cleanText(input.title, 240)) throw Object.assign(new Error("REQUIRED"), { status: 400 });
  const cover = coverImage(input.coverImageData);
  const schemaVersion = integer(input.schemaVersion ?? 1, true);
  if (schemaVersion !== 1) throw invalid("UNSUPPORTED_SCHEMA_VERSION");
  const status = input.status || "DRAFT";
  if (!["DRAFT", "REVIEW", "APPROVED", "RETIRED"].includes(status)) throw invalid("INVALID_STATUS");
  return {
    schemaVersion,
    code: cleanText(input.code, 80),
    title: cleanText(input.title, 240),
    shortTitle: cleanText(input.shortTitle, 160),
    technicalName: cleanText(input.technicalName, 320),
    subtitle: cleanText(input.subtitle, 320),
    description: cleanText(input.description, 20000),
    coverImageData: cover.data,
    coverImageMime: cover.mime,
    coverImageAlt: cleanText(input.coverImageAlt, 240),
    category: cleanText(input.category, 120),
    formType: cleanText(input.formType, 120),
    presentation: cleanText(input.presentation, 200),
    route: cleanText(input.route, 120),
    status,
    favorite: Boolean(input.favorite),
    documentDate: parsedDate(input.documentDate, true),
    revisionNumber: integer(input.revisionNumber ?? 1, true),
    batchTotal: decimal(input.batch?.total, true),
    batchUnit: cleanText(input.batch?.unit, 32),
    containerCount: integer(input.batch?.containerCount, true),
    amountPerContainer: decimal(input.batch?.amountPerContainer, true),
    containerUnit: cleanText(input.batch?.containerUnit, 32),
    quantitativeMap: input.quantitativeMap || undefined,
    technicalNotes: cleanText(input.technicalNotes, 50000),
    storageNotes: cleanText(input.storageNotes, 10000),
    archivedAt: parsedDate(input.archivedAt),
    collectionId: input.collectionId || null
  };
}

function ingredientData(item, position) {
  return {
    ingredientId: item.ingredientId || null,
    position,
    commonName: cleanText(item.commonName || item.name || item.canonicalName, 240) || "Ingrediente sem nome",
    technicalName: cleanText(item.technicalName, 320),
    pharmacopoeialDesignation: cleanText(item.pharmacopoeialDesignation, 320),
    cas: cleanText(item.cas, 32),
    molecularFormula: cleanText(item.molecularFormula, 160),
    synonyms: array(item.synonyms),
    role: cleanText(item.role, 160),
    physicalForm: cleanText(item.physicalForm, 120),
    grade: cleanText(item.grade, 120),
    micronization: cleanText(item.micronization, 120),
    percentageWW: decimal(item.percentageWW, true),
    batchQuantity: decimal(item.batchQuantity, true),
    batchUnit: cleanText(item.batchUnit, 32),
    unitQuantity: decimal(item.unitQuantity, true),
    unitQuantityUnit: cleanText(item.unitQuantityUnit, 32),
    notes: cleanText(item.notes, 10000),
    source: cleanText(item.source, 2000),
    metadataOrigin: ["MANUAL", "CALCULATED", "AI_SUGGESTED", "VERIFIED"].includes(item.metadataOrigin) ? item.metadataOrigin : "MANUAL",
    verificationStatus: ["UNVERIFIED", "REVIEWED", "VERIFIED"].includes(item.verificationStatus) ? item.verificationStatus : "UNVERIFIED"
  };
}

const revisionIgnoredKeys = new Set([
  "id", "formulationId", "createdAt", "updatedAt", "revisions", "history", "collection",
  "batchTotal", "batchUnit", "containerCount", "amountPerContainer", "containerUnit"
]);

function compactRevisionValue(value) {
  if (Array.isArray(value)) return value.map(compactRevisionValue);
  if (value instanceof Date) return value.toISOString();
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().flatMap((key) => {
    if (revisionIgnoredKeys.has(key)) return [];
    if (key === "coverImageData") {
      const image = typeof value[key] === "string" ? value[key] : "";
      return [[key, image ? "[image:" + image.length + ":" + image.slice(-24) + "]" : null]];
    }
    return [[key, compactRevisionValue(value[key])]];
  }));
}

function revisionState(record) {
  const value = compactRevisionValue(record);
  if (Array.isArray(value.tags)) value.tags = [...value.tags].sort((a, b) => String(a).localeCompare(String(b)));
  return value;
}

function changedFields(before, after) {
  return [...new Set([...Object.keys(before), ...Object.keys(after)])]
    .filter((key) => JSON.stringify(before[key]) !== JSON.stringify(after[key]));
}

function previousFieldValues(before, fields) {
  return Object.fromEntries(fields.map((field) => [field, before[field] ?? null]));
}

export class PrismaFormulationRepository {
  constructor(prisma = getPrisma()) { this.prisma = prisma; }

  async list(filters = {}) {
    const where = {
      archivedAt: filters.archived ? { not: null } : null,
      ...(filters.favorite ? { favorite: true } : {})
    };
    const records = await this.prisma.formulation.findMany({
      where,
      include: filters.full ? include : listInclude,
      ...(filters.full ? {} : { omit: { coverImageData: true } }),
      orderBy: { updatedAt: "desc" }
    });
    return records.map(serialize);
  }

  async get(id) {
    return serialize(await this.prisma.formulation.findUnique({ where: { id }, include }));
  }

  async save(input, source = "MANUAL") {
    let data = baseData(input);
    if (Array.isArray(input.ingredients) && input.ingredients.length > 500) {
      throw Object.assign(new Error("TOO_MANY_INGREDIENTS"), { status: 413 });
    }
    if (Array.isArray(input.tags) && input.tags.length > 30) {
      throw Object.assign(new Error("TOO_MANY_TAGS"), { status: 413 });
    }
    const persistedId = input.id && !String(input.id).startsWith("draft_") ? String(input.id) : null;
    const operation = async (tx) => {
      const lockKey = "formulation:" + (persistedId || data.code);
      await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtext(${lockKey}))`;
      const exists = persistedId
        ? await tx.formulation.findUnique({ where: { id: persistedId }, include })
        : null;
      if (persistedId && !exists) throw Object.assign(new Error("NOT_FOUND"), { status: 404 });
      if (exists) {
        const previous = serialize(exists);
        input = {
          ...previous,
          ...input,
          batch: { ...previous.batch, ...(input.batch || {}) },
          packaging: { ...(previous.packaging || {}), ...(input.packaging || {}) },
          documentSettings: { ...(previous.documentSettings || {}), ...(input.documentSettings || {}) }
        };
        data = baseData(input);
      }
      let record;
      if (exists) {
        const before = revisionState(serialize(exists));
        const after = revisionState(input);
        const changed = changedFields(before, after);
        if (!changed.length) return serialize(exists);
        record = await tx.formulation.update({
          where: { id: exists.id },
          data,
          include
        });
        await tx.formulationIngredient.deleteMany({ where: { formulationId: exists.id } });
        await tx.reference.deleteMany({ where: { formulationId: exists.id } });
        await tx.qualityControlRecord.deleteMany({ where: { formulationId: exists.id } });
        await tx.processMetadata.deleteMany({ where: { formulationId: exists.id } });
        await tx.labelingField.deleteMany({ where: { formulationId: exists.id } });
        await tx.formulationTag.deleteMany({ where: { formulationId: exists.id } });
        await tx.revision.create({
          data: {
            formulationId: exists.id,
            revisionNumber: data.revisionNumber,
            source,
            modifiedFields: changed,
            previousValues: previousFieldValues(before, changed)
          }
        });
      } else {
        record = await tx.formulation.create({ data, include });
        await tx.revision.create({
          data: {
            formulationId: record.id,
            revisionNumber: data.revisionNumber,
            source,
            modifiedFields: ["created"],
            previousValues: {}
          }
        });
      }
      const id = record.id;
      const ingredients = Array.isArray(input.ingredients) ? input.ingredients : [];
      if (ingredients.length) {
        await tx.formulationIngredient.createMany({
          data: ingredients.map((item, index) => ({ formulationId: id, ...ingredientData(item, index) }))
        });
      }
      const refs = Array.isArray(input.references) ? input.references : [];
      if (refs.length) await tx.reference.createMany({
        data: refs.map((item, position) => ({
          formulationId: id,
          position,
          title: cleanText(item.title, 500) || "Referência",
          locator: cleanText(item.locator, 320),
          url: cleanText(item.url, 2048),
          notes: cleanText(item.notes, 10000)
        }))
      });
      const quality = Array.isArray(input.qualityRecords) ? input.qualityRecords : [];
      if (quality.length) await tx.qualityControlRecord.createMany({
        data: quality.map((item, position) => ({
          formulationId: id,
          position,
          metric: cleanText(item.metric, 200) || "Métrica",
          operator: cleanText(item.operator, 32),
          targetValue: cleanText(item.targetValue, 160),
          unit: cleanText(item.unit, 48),
          samplingPlan: cleanText(item.samplingPlan, 10000),
          notes: cleanText(item.notes, 10000),
          status: cleanText(item.status, 80)
        }))
      });
      const process = Array.isArray(input.processMetadata) ? input.processMetadata : [];
      if (process.length) await tx.processMetadata.createMany({
        data: process.map((item, stageOrder) => ({
          formulationId: id,
          stageOrder,
          stageTitle: cleanText(item.stageTitle, 240) || "Etapa",
          equipment: cleanText(item.equipment, 240),
          parameterName: cleanText(item.parameterName, 160),
          parameterValue: cleanText(item.parameterValue, 240),
          parameterUnit: cleanText(item.parameterUnit, 48),
          notes: cleanText(item.notes, 10000)
        }))
      });
      const labels = Array.isArray(input.labelingFields) ? input.labelingFields : [];
      if (labels.length) await tx.labelingField.createMany({
        data: labels.map((item, position) => ({
          formulationId: id,
          position,
          label: cleanText(item.label, 160) || "Campo",
          value: cleanText(item.value, 10000),
          include: item.include !== false
        }))
      });
      const packaging = input.packaging || {};
      await tx.packaging.upsert({
        where: { formulationId: id },
        create: { formulationId: id, ...packagingData(packaging) },
        update: packagingData(packaging)
      });
      const settings = input.documentSettings || {};
      await tx.documentSettings.upsert({
        where: { formulationId: id },
        create: { formulationId: id, ...documentSettingsData(settings) },
        update: documentSettingsData(settings)
      });
      for (const name of array(input.tags).slice(0, 30)) {
        const normalizedName = name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
        const tag = await tx.tag.upsert({
          where: { normalizedName },
          create: { name, normalizedName },
          update: { name }
        });
        await tx.formulationTag.create({ data: { formulationId: id, tagId: tag.id } });
      }
      return serialize(await tx.formulation.findUnique({ where: { id }, include }));
    };
    return typeof this.prisma.$transaction === "function"
      ? this.prisma.$transaction(operation, { maxWait: 5000, timeout: 30000 })
      : operation(this.prisma);
  }

  async archive(id, archived = true) {
    return serialize(await this.prisma.formulation.update({
      where: { id },
      data: { archivedAt: archived ? new Date() : null },
      include
    }));
  }

  async remove(id) {
    await this.prisma.formulation.delete({ where: { id } });
  }

  async duplicate(id) {
    const source = await this.get(id);
    if (!source) throw Object.assign(new Error("NOT_FOUND"), { status: 404 });
    delete source.id;
    source.code = source.code + "-COPY-" + Date.now().toString().slice(-5);
    source.title = source.title + " — cópia";
    source.favorite = false;
    source.archivedAt = null;
    return this.save(source, "MANUAL");
  }
}

function packagingData(value) {
  return {
    containerType: cleanText(value.containerType, 160),
    containerMaterial: cleanText(value.containerMaterial, 160),
    containerCount: integer(value.containerCount),
    netContent: cleanText(value.netContent, 160),
    closureType: cleanText(value.closureType, 200),
    sealType: cleanText(value.sealType, 200),
    flowControl: cleanText(value.flowControl, 200),
    moistureProtection: cleanText(value.moistureProtection, 200),
    lightProtection: cleanText(value.lightProtection, 200),
    packagingNotes: cleanText(value.packagingNotes, 10000)
  };
}

function documentSettingsData(value) {
  const defaultSections = ["composition", "quantitative", "presentation", "packaging", "quality", "process", "labeling", "notes", "references", "history"];
  return {
    language: cleanText(value.language, 16) || "pt-BR",
    pageSize: cleanText(value.pageSize, 16) || "A4",
    density: cleanText(value.density, 24) || "STANDARD",
    showCoverImage: value.showCoverImage !== false,
    showProvenance: Boolean(value.showProvenance),
    showTechnicalNotes: value.showTechnicalNotes !== false,
    showCas: value.showCas !== false,
    showSynonyms: Boolean(value.showSynonyms),
    showRevisionHistory: Boolean(value.showRevisionHistory),
    sectionOrder: array(value.sectionOrder).length ? array(value.sectionOrder) : defaultSections,
    enabledSections: value.enabledSections || Object.fromEntries(defaultSections.map((key) => [key, true]))
  };
}
