import { calculateComposition } from "./calculations.js";

export function toDocumentModel(record) {
  const settings = record.documentSettings || {};
  const enabled = settings.enabledSections || {};
  const totals = calculateComposition(record);
  const packaging = record.packaging || {};
  const hasPackaging = [
    "containerType", "containerMaterial", "containerCount", "netContent", "closureType", "sealType",
    "flowControl", "moistureProtection", "lightProtection", "packagingNotes"
  ].some((key) => packaging[key] !== "" && packaging[key] != null && packaging[key] !== false);
  return {
    code: record.code || "SEM CÓDIGO",
    revision: record.revisionNumber || 1,
    date: record.documentDate || new Date().toISOString().slice(0, 10),
    title: record.title || "Formulação sem título",
    technicalName: record.technicalName || record.subtitle || "",
    description: record.description || "",
    coverImageData: settings.showCoverImage === false ? "" : record.coverImageData || "",
    coverImageAlt: record.coverImageAlt || "",
    category: record.category || "—",
    formType: record.formType || "—",
    presentation: record.presentation || "—",
    route: record.route || "—",
    ingredients: record.ingredients || [],
    batch: record.batch || {},
    totals,
    packaging: record.packaging || {},
    qualityRecords: record.qualityRecords || [],
    processMetadata: record.processMetadata || [],
    labelingFields: (record.labelingFields || []).filter((item) => item.include !== false),
    technicalNotes: settings.showTechnicalNotes === false ? "" : record.technicalNotes || "",
    storageNotes: record.storageNotes || "",
    references: record.references || [],
    revisions: settings.showRevisionHistory ? record.revisions || [] : [],
    settings: {
      density: settings.density || "STANDARD",
      showCas: settings.showCas !== false,
      showSynonyms: Boolean(settings.showSynonyms),
      showProvenance: Boolean(settings.showProvenance),
      language: settings.language || "pt-BR",
      pageSize: settings.pageSize || "A4",
      sectionOrder: settings.sectionOrder || [],
      enabledSections: enabled,
      hasPackaging
    }
  };
}

export function paginateDocument(model) {
  const pages = [];
  const compositionEnabled = model.settings.enabledSections.composition !== false;
  const firstPageCapacity = model.coverImageData ? 5 : model.settings.density === "COMPACT" ? 9 : 7;
  const firstIngredients = compositionEnabled ? model.ingredients.slice(0, firstPageCapacity) : [];
  pages.push({
    type: "primary",
    ingredients: firstIngredients,
    compositionContinues: model.ingredients.length > firstIngredients.length
  });
  const remaining = compositionEnabled ? model.ingredients.slice(firstPageCapacity) : [];
  const continuationCapacity = model.settings.density === "COMPACT" ? 16 : 12;
  for (let index = 0; index < remaining.length; index += continuationCapacity) {
    pages.push({ type: "composition-continuation", ingredients: remaining.slice(index, index + continuationCapacity) });
  }
  const availability = {
    packaging: model.settings.hasPackaging,
    quality: model.qualityRecords.length,
    process: model.processMetadata.length,
    labeling: model.labelingFields.length,
    notes: model.technicalNotes || model.storageNotes,
    references: model.references.length,
    history: model.revisions.length
  };
  const defaults = ["packaging", "quality", "process", "labeling", "notes", "references", "history"];
  const order = [...new Set([...(model.settings.sectionOrder || []), ...defaults])]
    .filter((key) => defaults.includes(key) && model.settings.enabledSections[key] !== false && availability[key]);
  const rowSources = {
    quality: [model.qualityRecords, 7],
    process: [model.processMetadata, 7],
    labeling: [model.labelingFields, 10],
    references: [model.references, 9],
    history: [model.revisions, 8]
  };
  order.forEach((key) => {
    if (key === "notes") {
      const chunks = splitTechnicalText(model.technicalNotes, 1500);
      if (!chunks.length) chunks.push("");
      chunks.forEach((technicalNotes, index) => pages.push({
        type: "secondary",
        sections: [{ key, technicalNotes, storageNotes: index === chunks.length - 1 ? model.storageNotes : "", continuation: index > 0 }]
      }));
      return;
    }
    if (!rowSources[key]) {
      pages.push({ type: "secondary", sections: [{ key }] });
      return;
    }
    const [items, size] = rowSources[key];
    for (let index = 0; index < items.length; index += size) {
      pages.push({ type: "secondary", sections: [{ key, items: items.slice(index, index + size), continuation: index > 0 }] });
    }
  });
  if (!pages.length) {
    pages.push({ type: "primary", ingredients: [], compositionContinues: false });
  }
  return pages;
}

function splitTechnicalText(input, limit) {
  const text = String(input || "").trim();
  if (!text) return [];
  const chunks = [];
  let remaining = text;
  while (remaining.length > limit) {
    let boundary = remaining.lastIndexOf("\n", limit);
    if (boundary < limit * .55) boundary = remaining.lastIndexOf(" ", limit);
    if (boundary < limit * .55) boundary = limit;
    chunks.push(remaining.slice(0, boundary).trim());
    remaining = remaining.slice(boundary).trim();
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}
