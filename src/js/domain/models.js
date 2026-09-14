import { nowIso, uid } from "../utils/core.js";

export const SCHEMA_VERSION = 1;
export const DOCUMENT_SECTIONS = [
  ["composition", "Composição"],
  ["quantitative", "Mapa quantitativo"],
  ["presentation", "Apresentação"],
  ["packaging", "Acondicionamento"],
  ["quality", "Qualidade"],
  ["process", "Metadados de processo"],
  ["labeling", "Rotulagem"],
  ["notes", "Informações técnicas"],
  ["references", "Referências"],
  ["history", "Histórico de revisão"]
];

export function createIngredient(overrides = {}) {
  return {
    id: uid("line"),
    ingredientId: null,
    commonName: "",
    technicalName: "",
    pharmacopoeialDesignation: "",
    synonyms: [],
    cas: "",
    molecularFormula: "",
    role: "",
    physicalForm: "",
    grade: "",
    micronization: "",
    percentageWW: null,
    batchQuantity: null,
    batchUnit: "g",
    unitQuantity: null,
    unitQuantityUnit: "g",
    notes: "",
    source: "",
    metadataOrigin: "MANUAL",
    verificationStatus: "UNVERIFIED",
    ...overrides
  };
}

export function createFormulation(overrides = {}) {
  const timestamp = nowIso();
  return {
    id: uid("draft"),
    schemaVersion: SCHEMA_VERSION,
    code: "",
    title: "Formulação sem título",
    shortTitle: "",
    technicalName: "",
    subtitle: "",
    description: "",
    coverImageData: "",
    coverImageMime: "",
    coverImageAlt: "",
    category: "",
    formType: "",
    presentation: "",
    route: "",
    status: "DRAFT",
    tags: [],
    collectionId: null,
    favorite: false,
    archivedAt: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    documentDate: timestamp.slice(0, 10),
    revisionNumber: 1,
    ingredients: [],
    batch: {
      total: null,
      unit: "g",
      containerCount: null,
      amountPerContainer: null,
      containerUnit: "g"
    },
    quantitativeMap: {},
    packaging: {
      containerType: "",
      containerMaterial: "",
      containerCount: null,
      netContent: "",
      closureType: "",
      sealType: "",
      flowControl: "",
      moistureProtection: "",
      lightProtection: "",
      packagingNotes: ""
    },
    qualityRecords: [],
    processMetadata: [],
    labelingFields: [],
    technicalNotes: "",
    storageNotes: "",
    references: [],
    attachments: [],
    revisions: [],
    documentSettings: {
      language: "pt-BR",
      pageSize: "A4",
      density: "STANDARD",
      showCoverImage: true,
      showProvenance: false,
      showTechnicalNotes: true,
      showCas: true,
      showSynonyms: false,
      showRevisionHistory: false,
      sectionOrder: DOCUMENT_SECTIONS.map((entry) => entry[0]),
      enabledSections: Object.fromEntries(DOCUMENT_SECTIONS.map((entry) => [entry[0], true]))
    },
    ...overrides
  };
}
