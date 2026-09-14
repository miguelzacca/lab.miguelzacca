import test from "node:test";
import assert from "node:assert/strict";

import {
  calculateComposition,
  compatibleTotal,
  normalizePercentages,
  numeric,
  percentageTotal
} from "../src/js/domain/calculations.js";

test("numeric preserva zero e trata campos vazios como ausentes", () => {
  assert.equal(numeric("0"), 0);
  assert.equal(numeric(2.5), 2.5);
  assert.equal(numeric(""), null);
  assert.equal(numeric(null), null);
});

test("percentageTotal soma apenas valores numericos", () => {
  const ingredients = [
    { percentageWW: "20.0" },
    { percentageWW: 80 },
    { percentageWW: "valor invalido" },
    { percentageWW: "" }
  ];

  assert.equal(percentageTotal(ingredients), 100);
});

test("compatibleTotal converte unidades de massa deterministicamente", () => {
  const total = compatibleTotal([
    { value: 500, unit: "mg" },
    { value: 1.5, unit: "g" },
    { value: 0.001, unit: "kg" }
  ], "g");

  assert.equal(total, 3);
});

test("compatibleTotal converte volume e rejeita unidade ausente ou incompativel", () => {
  assert.equal(compatibleTotal([
    { value: 250, unit: "mL" },
    { value: 0.75, unit: "L" }
  ], "mL"), 1000);
  assert.equal(compatibleTotal([{ value: 10, unit: "" }], "g"), null);
  assert.equal(compatibleTotal([{ value: 10, unit: "mL" }], "g"), null);
});

test("calculateComposition relaciona percentuais, lote e fracionamento", () => {
  const result = calculateComposition({
    ingredients: [
      { percentageWW: 20, batchQuantity: 20, batchUnit: "g" },
      { percentageWW: 80, batchQuantity: 80000, batchUnit: "mg" }
    ],
    batch: {
      total: 100,
      unit: "g",
      containerCount: 5,
      amountPerContainer: 20,
      containerUnit: "g"
    }
  });

  assert.deepEqual(result, {
    percentageTotal: 100,
    percentageDifference: 0,
    batchTotal: 100,
    batchDifference: 0,
    fractionTotal: 100,
    fractionDifference: 0
  });
});

test("normalizePercentages normaliza sem mutar a entrada e marca a origem calculada", () => {
  const original = [
    { id: "a", percentageWW: 20, metadataOrigin: "MANUAL" },
    { id: "b", percentageWW: 30, metadataOrigin: "MANUAL" }
  ];

  const normalized = normalizePercentages(original);

  assert.deepEqual(normalized.map((item) => item.percentageWW), [40, 60]);
  assert.ok(normalized.every((item) => item.metadataOrigin === "CALCULATED"));
  assert.deepEqual(original.map((item) => item.percentageWW), [20, 30]);
});

test("normalizePercentages nao inventa valores quando o total e zero", () => {
  const ingredients = [{ percentageWW: 0 }, { percentageWW: "" }];
  assert.equal(normalizePercentages(ingredients), ingredients);
});
