const MASS = { "µg": 0.000001, mcg: 0.000001, mg: 0.001, g: 1, kg: 1000 };
const VOLUME = { mL: 1, ml: 1, L: 1000, l: 1000 };

export const numeric = (value) => value === "" || value == null ? null : Number(value);
export const percentageTotal = (ingredients = []) => ingredients.reduce((sum, item) => {
  const value = numeric(item.percentageWW);
  return Number.isFinite(value) ? sum + value : sum;
}, 0);

export function compatibleTotal(entries, targetUnit) {
  const factors = MASS[targetUnit] ? MASS : VOLUME[targetUnit] ? VOLUME : null;
  if (!factors) return null;
  let total = 0;
  for (const entry of entries) {
    const value = numeric(entry.value);
    if (!Number.isFinite(value) || !factors[entry.unit]) return null;
    total += value * factors[entry.unit] / factors[targetUnit];
  }
  return total;
}

export function calculateComposition(record) {
  const percent = percentageTotal(record.ingredients);
  const batchTotal = compatibleTotal(
    record.ingredients.map((item) => ({ value: item.batchQuantity, unit: item.batchUnit })),
    record.batch.unit
  );
  const count = numeric(record.batch.containerCount);
  const perContainer = numeric(record.batch.amountPerContainer);
  const fractionTotal = Number.isFinite(count) && Number.isFinite(perContainer) ? count * perContainer : null;
  return {
    percentageTotal: percent,
    percentageDifference: percent - 100,
    batchTotal,
    batchDifference: batchTotal == null || !Number.isFinite(numeric(record.batch.total)) ? null : batchTotal - numeric(record.batch.total),
    fractionTotal,
    fractionDifference: fractionTotal == null || record.batch.unit !== record.batch.containerUnit || !Number.isFinite(numeric(record.batch.total))
      ? null
      : fractionTotal - numeric(record.batch.total)
  };
}

export function normalizePercentages(ingredients = []) {
  const total = percentageTotal(ingredients);
  if (!(total > 0)) return ingredients;
  return ingredients.map((item) => ({
    ...item,
    percentageWW: Number((((numeric(item.percentageWW) || 0) * 100) / total).toFixed(4)),
    metadataOrigin: "CALCULATED"
  }));
}
