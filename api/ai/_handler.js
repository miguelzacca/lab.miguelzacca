import { readJson, safeError, sendJson } from "../../src/server/http.js";
import { getPrisma } from "../../src/server/db/prisma.js";
import { NvidiaProvider } from "../../src/server/ai/provider.js";
import { requireOwner } from "../../src/server/auth/session.js";
import { takeRateLimit } from "../../src/server/security/rate-limit.js";

export function createAiHandler(action) {
  return async (request, response) => {
    if (request.method !== "POST") {
      sendJson(response, 405, { error: "Método não permitido." });
      return;
    }
    if (!requireOwner(request, response)) return;
    if (!takeRateLimit(request, "ai", { limit: 30, windowMs: 60 * 1000 })) {
      sendJson(response, 429, { error: "Limite tempor\u00e1rio de aprimoramentos atingido." });
      return;
    }
    let interactionId = null;
    try {
      const body = await readJson(request, 50000);
      if (!body.input || typeof body.input !== "object") {
        throw Object.assign(new Error("INVALID_INPUT"), { status: 400 });
      }
      const provider = new NvidiaProvider();
      const prisma = getPrisma();
      const interaction = await prisma.aIInteraction.create({
        data: {
          formulationId: body.formulationId || null,
          action,
          inputSummary: { fields: Object.keys(body.input), instruction: body.input.instruction?.slice(0, 300) || null },
          acceptedFields: [],
          model: provider.model
        }
      }).catch(() => null);
      interactionId = interaction?.id || null;
      const result = await provider.suggest(action, body.input, request.signal);
      if (interactionId) {
        await prisma.aIInteraction.update({
          where: { id: interactionId },
          data: { status: "COMPLETED", proposal: result }
        }).catch(() => {});
      }
      sendJson(response, 200, { ...result, interactionId, model: provider.model });
    } catch (error) {
      if (interactionId) {
        await getPrisma().aIInteraction.update({
          where: { id: interactionId },
          data: { status: "FAILED", errorCode: String(error.message || "AI_ERROR").slice(0, 120) }
        }).catch(() => {});
      }
      safeError(response, error);
    }
  };
}
