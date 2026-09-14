import test from "node:test";
import assert from "node:assert/strict";

import { validateCas, validateFormulation } from "../src/js/domain/validation.js";

function record(overrides = {}) {
  return {
    ingredients: [],
    batch: {
      total: 100,
      unit: "g",
      containerCount: 5,
      amountPerContainer: 20,
      containerUnit: "g"
    },
    ...overrides
  };
}

test("validateCas aceita CAS vazio e numeros com checksum valido", () => {
  assert.deepEqual(validateCas(""), { valid: true, empty: true });
  assert.equal(validateCas("7732-18-5").valid, true);
  assert.equal(validateCas("58-08-2").valid, true);
});

test("validateCas diferencia formato invalido de checksum invalido", () => {
  assert.match(validateCas("7732185").reason, /Formato esperado/);
  assert.match(validateCas("7732-18-4").reason, /verificador CAS/i);
});

test("validacao informa total percentual e oferece normalizacao deterministica", () => {
  const result = validateFormulation(record({
    ingredients: [
      { commonName: "Componente A", percentageWW: 20, batchQuantity: 20, batchUnit: "g" },
      { commonName: "Componente B", percentageWW: 78.5, batchQuantity: 78.5, batchUnit: "g" }
    ]
  }));
  const finding = result.findings.find((item) => item.code === "percentage-total");

  assert.equal(result.totals.percentageTotal, 98.5);
  assert.equal(result.totals.percentageDifference, -1.5);
  assert.equal(finding.action, "normalize");
});

test("validacao encontra lote e fracionamento inconsistentes", () => {
  const result = validateFormulation(record({
    ingredients: [
      { commonName: "A", percentageWW: 50, batchQuantity: 40, batchUnit: "g" },
      { commonName: "B", percentageWW: 50, batchQuantity: 40, batchUnit: "g" }
    ],
    batch: {
      total: 100,
      unit: "g",
      containerCount: 3,
      amountPerContainer: 20,
      containerUnit: "g"
    }
  }));

  assert.ok(result.findings.some((item) => item.code === "batch-total"));
  assert.ok(result.findings.some((item) => item.code === "fraction-total"));
});

test("validacao encontra duplicatas, numeros invalidos e negativos", () => {
  const result = validateFormulation(record({
    ingredients: [
      { commonName: "Ingrediente A", cas: "7732-18-5", percentageWW: 50, batchQuantity: -1, batchUnit: "g" },
      { commonName: "Outro nome", cas: "7732-18-5", percentageWW: "abc", batchQuantity: 101, batchUnit: "g" }
    ]
  }));

  assert.ok(result.findings.some((item) => item.code.startsWith("duplicate-")));
  assert.ok(result.findings.some((item) => item.code.includes("negative-0-batchQuantity")));
  assert.ok(result.findings.some((item) => item.code.includes("number-1-percentageWW")));
  assert.equal(result.valid, false);
});
