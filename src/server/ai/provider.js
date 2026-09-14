import { parseStructuredResponse } from "./schema.js";

export const DEFAULT_NVIDIA_MODEL = "nvidia/nemotron-3.5-lightning-30b-a3b";

const systemPrompt = [
  "You are a contextual editorial metadata assistant inside a private formulation-record workspace.",
  "You may improve wording, normalize terminology, suggest public chemical identifiers, synonyms, tags, and technical names.",
  "Never prescribe treatment, invent clinical dosing, administration schedules, hazardous manufacturing instructions, QC thresholds, or packaging requirements.",
  "Never alter quantities. Treat CAS metadata as an unverified proposal.",
  "For ingredient proposals, use cas, molecularFormula, synonyms, or an ingredients.N.field path. Never suggest any quantitative field.",
  "Return strict JSON only in this shape:",
  '{"suggestions":[{"field":"allowedField","current":"value","suggested":"value","confidence":0.0,"reason":"short reason"}]}'
].join("\n");

function publicError(status, message) {
  const error = new Error(message);
  error.status = status;
  error.publicMessage = message;
  return error;
}

export class NvidiaProvider {
  constructor(env = process.env) {
    this.apiKey = env.NVIDIA_API_KEY || env.NVIDIA_NIM_API_KEY;
    this.baseUrl = (env.NVIDIA_BASE_URL || env.NVIDIA_NIM_BASE_URL || "https://integrate.api.nvidia.com/v1").replace(/\/$/, "");
    this.model = env.NVIDIA_MODEL || env.NVIDIA_NIM_MODEL || DEFAULT_NVIDIA_MODEL;
  }

  get configured() {
    return Boolean(this.apiKey && this.model);
  }

  async suggest(action, input, externalSignal) {
    if (!this.configured) throw publicError(503, "NVIDIA NIM ainda n\u00e3o est\u00e1 configurado no servidor.");
    const inputText = JSON.stringify({ action, input });
    if (inputText.length > 40000) throw publicError(413, "O conte\u00fado excede o limite seguro.");

    for (let attempt = 0; attempt < 2; attempt += 1) {
      if (externalSignal?.aborted) throw publicError(499, "A solicita\u00e7\u00e3o foi cancelada.");
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 30000);
      const abort = () => controller.abort();
      externalSignal?.addEventListener("abort", abort, { once: true });
      try {
        const response = await fetch(this.baseUrl + "/chat/completions", {
          method: "POST",
          headers: { Authorization: "Bearer " + this.apiKey, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: this.model,
            temperature: 0.2,
            max_tokens: 1600,
            response_format: { type: "json_object" },
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: inputText }
            ]
          }),
          signal: controller.signal
        });
        if (!response.ok) {
          if (attempt === 0 && [408, 429, 500, 502, 503, 504].includes(response.status)) continue;
          throw publicError(response.status >= 500 ? 502 : 400, "N\u00e3o foi poss\u00edvel concluir o aprimoramento.");
        }
        const rawPayload = await response.text();
        if (rawPayload.length > 1000000) throw publicError(502, "A resposta do provedor excedeu o limite seguro.");
        let payload;
        try {
          payload = JSON.parse(rawPayload);
        } catch {
          throw new Error("MALFORMED_PROVIDER_RESPONSE");
        }
        return parseStructuredResponse(payload?.choices?.[0]?.message?.content);
      } catch (error) {
        if (error.name === "AbortError") throw publicError(504, "A solicita\u00e7\u00e3o excedeu o tempo limite.");
        if (error.status) throw error;
        if (attempt === 1) throw publicError(502, "O servi\u00e7o de intelig\u00eancia n\u00e3o respondeu como esperado.");
      } finally {
        clearTimeout(timer);
        externalSignal?.removeEventListener("abort", abort);
      }
    }
    throw publicError(502, "O servi\u00e7o de intelig\u00eancia n\u00e3o respondeu como esperado.");
  }
}
