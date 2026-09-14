const formulationFields = new Set([
  "title", "shortTitle", "technicalName", "subtitle", "description", "category",
  "formType", "presentation", "tags", "technicalNotes", "storageNotes"
]);
const ingredientFields = new Set([
  "commonName", "technicalName", "pharmacopoeialDesignation", "synonyms", "cas",
  "molecularFormula", "role", "physicalForm", "grade", "micronization", "source"
]);

function isAllowedField(field) {
  if (formulationFields.has(field) || ingredientFields.has(field)) return true;
  const match = /^ingredients\.(\d{1,3})\.([A-Za-z]+)$/.exec(field);
  return Boolean(match && Number(match[1]) < 500 && ingredientFields.has(match[2]));
}

function cleanValue(value, field) {
  const arrayField = field === "tags" || field === "synonyms" || field.endsWith(".synonyms");
  if (arrayField) {
    if (!Array.isArray(value) || value.length > 50) throw new Error("INVALID_SUGGESTED_VALUE");
    return value.map((item) => String(item).trim().slice(0, 240)).filter(Boolean);
  }
  if (typeof value !== "string") throw new Error("INVALID_SUGGESTED_VALUE");
  return value.slice(0, 20000);
}

export function parseStructuredResponse(content) {
  if (typeof content !== "string") throw new Error("MALFORMED_PROVIDER_RESPONSE");
  const cleaned = content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error("MALFORMED_PROVIDER_RESPONSE");
  }
  if (!parsed || !Array.isArray(parsed.suggestions) || parsed.suggestions.length > 30) {
    throw new Error("INVALID_SUGGESTION_SCHEMA");
  }
  return {
    suggestions: parsed.suggestions.map((item) => {
      if (!item || typeof item.field !== "string" || !isAllowedField(item.field)) {
        throw new Error("UNSUPPORTED_SUGGESTION_FIELD");
      }
      const confidence = Number(item.confidence);
      return {
        field: item.field,
        current: typeof item.current === "string" || Array.isArray(item.current)
          ? cleanValue(item.current, item.field)
          : "",
        suggested: cleanValue(item.suggested, item.field),
        confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : 0.5,
        reason: typeof item.reason === "string" ? item.reason.slice(0, 500) : ""
      };
    })
  };
}
