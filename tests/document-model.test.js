import test from "node:test";
import assert from "node:assert/strict";

import { paginateDocument, toDocumentModel } from "../src/js/domain/document-model.js";

function baseRecord(overrides = {}) {
  return {
    code: "MZ-FRM-0142",
    title: "Composicao demonstrativa",
    technicalName: "Sistema tecnico neutro",
    documentDate: "2026-09-14",
    revisionNumber: 3,
    description: "Registro tecnico sem indicacao clinica.",
    coverImageData: "data:image/png;base64,AAAA",
    ingredients: [],
    batch: { total: 100, unit: "g" },
    packaging: {},
    qualityRecords: [],
    processMetadata: [],
    labelingFields: [],
    references: [],
    revisions: [],
    technicalNotes: "Nota tecnica",
    storageNotes: "Nota de armazenamento",
    documentSettings: {},
    ...overrides
  };
}

test("toDocumentModel transforma campos e respeita preferencias documentais", () => {
  const model = toDocumentModel(baseRecord({
    revisions: [{ revisionNumber: 2 }],
    documentSettings: {
      showCoverImage: false,
      showTechnicalNotes: false,
      showRevisionHistory: false,
      showCas: false,
      density: "COMPACT"
    }
  }));

  assert.equal(model.code, "MZ-FRM-0142");
  assert.equal(model.revision, 3);
  assert.equal(model.coverImageData, "");
  assert.equal(model.technicalNotes, "");
  assert.deepEqual(model.revisions, []);
  assert.equal(model.settings.showCas, false);
  assert.equal(model.settings.density, "COMPACT");
});

test("toDocumentModel inclui somente campos de rotulagem selecionados", () => {
  const model = toDocumentModel(baseRecord({
    labelingFields: [
      { label: "Codigo", value: "142", include: true },
      { label: "Campo interno", value: "oculto", include: false }
    ]
  }));

  assert.deepEqual(model.labelingFields.map((item) => item.label), ["Codigo"]);
});

test("paginateDocument ajusta a capacidade quando existe capa e continua a tabela", () => {
  const ingredients = Array.from({ length: 34 }, (_, index) => ({ commonName: `Componente ${index + 1}` }));
  const pages = paginateDocument(toDocumentModel(baseRecord({ ingredients })));

  assert.equal(pages[0].type, "primary");
  assert.equal(pages[0].ingredients.length, 5);
  assert.equal(pages[0].compositionContinues, true);
  assert.deepEqual(
    pages.filter((page) => page.type === "composition-continuation").map((page) => page.ingredients.length),
    [12, 12, 5]
  );
});

test("paginateDocument respeita a ordem e materializa secoes secundarias independentes", () => {
  const model = toDocumentModel(baseRecord({
    packaging: { containerType: "Frasco" },
    qualityRecords: [{ metric: "RSD" }],
    processMetadata: [{ stageTitle: "Etapa registrada" }],
    labelingFields: [{ label: "Codigo", value: "142", include: true }],
    references: [{ title: "Referencia interna" }],
    revisions: [{ revisionNumber: 2 }],
    documentSettings: { showRevisionHistory: true }
  }));
  const pages = paginateDocument(model);

  assert.deepEqual(
    pages.filter((page) => page.type === "secondary").map((page) => page.sections[0].key),
    ["packaging", "quality", "process", "labeling", "notes", "references", "history"]
  );
  assert.ok(pages.filter((page) => page.type === "secondary").every((page) => page.sections.length === 1));
});

test("paginateDocument omite todas as secoes secundarias vazias", () => {
  const model = toDocumentModel(baseRecord({
    coverImageData: "",
    technicalNotes: "",
    storageNotes: ""
  }));
  const pages = paginateDocument(model);

  assert.equal(pages.length, 1);
  assert.equal(pages[0].type, "primary");
});
