import { calculateComposition, numeric } from "./calculations.js";

export function validateCas(value) {
  if (!value) return { valid: true, empty: true };
  const match = String(value).trim().match(/^(\d{2,7})-(\d{2})-(\d)$/);
  if (!match) return { valid: false, reason: "Formato esperado: 00000-00-0" };
  const digits = (match[1] + match[2]).split("").reverse().map(Number);
  const checksum = digits.reduce((sum, digit, index) => sum + digit * (index + 1), 0) % 10;
  return checksum === Number(match[3])
    ? { valid: true }
    : { valid: false, reason: "Dígito verificador CAS inconsistente" };
}

export function validateFormulation(record) {
  const findings = [];
  const totals = calculateComposition(record);
  if (record.ingredients.length && Math.abs(totals.percentageDifference) > 0.0001) {
    findings.push({
      code: "percentage-total",
      level: Math.abs(totals.percentageDifference) > 2 ? "warning" : "notice",
      title: "Composição total: " + totals.percentageTotal.toFixed(1) + "%",
      detail: "Esperado: 100,0% · Diferença: " + (totals.percentageDifference > 0 ? "+" : "") + totals.percentageDifference.toFixed(1) + "%",
      action: totals.percentageTotal > 0 ? "normalize" : null
    });
  }
  if (totals.batchDifference != null && Math.abs(totals.batchDifference) > 0.0001) {
    findings.push({
      code: "batch-total",
      level: "notice",
      title: "O total dos componentes difere do total do lote",
      detail: "Diferença calculada: " + totals.batchDifference.toFixed(3) + " " + record.batch.unit
    });
  }
  if (totals.fractionDifference != null && Math.abs(totals.fractionDifference) > 0.0001) {
    findings.push({
      code: "fraction-total",
      level: "notice",
      title: "O fracionamento não equivale ao total do lote",
      detail: "Diferença calculada: " + totals.fractionDifference.toFixed(3) + " " + record.batch.unit
    });
  }
  const identities = new Map();
  record.ingredients.forEach((ingredient, index) => {
    const key = (ingredient.cas || ingredient.commonName || ingredient.technicalName || "").trim().toLowerCase();
    if (key && identities.has(key)) {
      findings.push({
        code: "duplicate-" + index,
        level: "notice",
        title: "Ingrediente possivelmente duplicado",
        detail: (ingredient.commonName || ingredient.technicalName) + " também aparece na linha " + (identities.get(key) + 1) + "."
      });
    }
    if (key) identities.set(key, index);
    const cas = validateCas(ingredient.cas);
    if (!cas.valid) {
      findings.push({
        code: "cas-" + index,
        level: "notice",
        title: "CAS a revisar: " + ingredient.cas,
        detail: cas.reason
      });
    }
    ["percentageWW", "batchQuantity", "unitQuantity"].forEach((field) => {
      const raw = ingredient[field];
      const value = numeric(raw);
      if (raw !== "" && raw != null && !Number.isFinite(value)) {
        findings.push({ code: "number-" + index + "-" + field, level: "warning", title: "Valor numérico inválido", detail: ingredient.commonName || "Linha " + (index + 1) });
      }
      if (Number.isFinite(value) && value < 0) {
        findings.push({ code: "negative-" + index + "-" + field, level: "warning", title: "Valor negativo não permitido", detail: ingredient.commonName || "Linha " + (index + 1) });
      }
    });
  });
  return { valid: !findings.some((item) => item.level === "warning"), findings, totals };
}
