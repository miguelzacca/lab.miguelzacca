import test from "node:test";
import assert from "node:assert/strict";

import backupHandler, { validateBackup } from "../api/backup.js";
import { parseStructuredResponse } from "../src/server/ai/schema.js";

function responseMock() {
  return {
    statusCode: 200,
    body: undefined,
    headers: {},
    setHeader(name, value) { this.headers[String(name).toLowerCase()] = value; },
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; },
    end(value) { this.body = JSON.parse(value); return this; }
  };
}

test("validateBackup aceita backup bem formado e produz resumo", () => {
  const result = validateBackup({
    schemaVersion: 1,
    formulations: [{ code: "MZ-FRM-0001", title: "Formula neutra" }],
    ingredients: [{ canonicalName: "Componente A" }],
    collections: [{ name: "Pesquisa" }],
    settings: { appearance: { theme: "system" } }
  });

  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.summary, {
    formulations: 1,
    ingredients: 1,
    collections: 1,
    settings: 1
  });
});

test("validateBackup nunca descarta silenciosamente estruturas invalidas", () => {
  const missingCollection = validateBackup({ ingredients: [] });
  const invalidRecord = validateBackup({
    schemaVersion: 1,
    formulations: [{ title: "Sem codigo" }],
    ingredients: [],
    collections: [],
    settings: {}
  });

  assert.equal(missingCollection.valid, false);
  assert.ok(missingCollection.errors.length > 0);
  assert.equal(invalidRecord.valid, false);
  assert.ok(invalidRecord.errors.some((message) => /Formula..o 1 .* inv.lida/i.test(message)));
});

test("validateBackup limita o volume importado", () => {
  const result = validateBackup({
    schemaVersion: 1,
    formulations: Array.from({ length: 501 }, (_, index) => ({
      code: `MZ-${index}`,
      title: `Formula ${index}`
    })),
    ingredients: [],
    collections: [],
    settings: {}
  });

  assert.equal(result.valid, false);
  assert.ok(result.errors.some((message) => /limite de formula/i.test(message) && /500/.test(message)));
});

test("exportacao e importacao de backup exigem sessao do proprietario antes do banco", async () => {
  const keys = ["LAB_AUTH_USERNAME", "LAB_AUTH_PASSWORD", "LAB_AUTH_SECRET", "NODE_ENV", "VERCEL"];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  Object.assign(process.env, {
    LAB_AUTH_USERNAME: "owner",
    LAB_AUTH_PASSWORD: "senha-forte",
    LAB_AUTH_SECRET: "segredo-de-teste-com-mais-de-trinta-e-dois-caracteres"
  });
  delete process.env.NODE_ENV;
  delete process.env.VERCEL;
  try {
    for (const method of ["GET", "POST"]) {
      const response = responseMock();
      await backupHandler({ method, headers: { host: "localhost:4173" } }, response);
      assert.equal(response.statusCode, 401);
      assert.match(response.body.error, /Autentica/);
    }
  } finally {
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
});

test("parseStructuredResponse aceita JSON estrito inclusive em bloco markdown", () => {
  const response = parseStructuredResponse(`\n\`\`\`json
  {
    "suggestions": [{
      "field": "technicalName",
      "current": "Nome atual",
      "suggested": "Nome tecnico sugerido",
      "confidence": 0.81,
      "reason": "Terminologia mais precisa"
    }]
  }
  \`\`\``);

  assert.equal(response.suggestions.length, 1);
  assert.equal(response.suggestions[0].field, "technicalName");
  assert.equal(response.suggestions[0].confidence, 0.81);
});

test("parseStructuredResponse limita confianca e tamanho da justificativa", () => {
  const response = parseStructuredResponse(JSON.stringify({
    suggestions: [{
      field: "description",
      current: "",
      suggested: "Texto melhor",
      confidence: 7,
      reason: "x".repeat(700)
    }]
  }));

  assert.equal(response.suggestions[0].confidence, 1);
  assert.equal(response.suggestions[0].reason.length, 500);
});

test("parseStructuredResponse rejeita JSON malformado, campos e tipos inesperados", () => {
  assert.throws(() => parseStructuredResponse("nao e json"), /MALFORMED_PROVIDER_RESPONSE/);
  assert.throws(() => parseStructuredResponse(JSON.stringify({ suggestions: [{ field: "dose", suggested: "10" }] })), /UNSUPPORTED_SUGGESTION_FIELD/);
  assert.throws(() => parseStructuredResponse(JSON.stringify({ suggestions: [{ field: "title", suggested: { unsafe: true } }] })), /INVALID_SUGGESTED_VALUE/);
});
