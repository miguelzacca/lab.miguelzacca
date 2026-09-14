import { readJson, safeError, sendJson } from "../src/server/http.js";
import { PrismaIngredientRepository } from "../src/server/repositories/ingredient-repository.js";
import { requireOwner } from "../src/server/auth/session.js";

export default async function handler(req, res) {
  const repository = new PrismaIngredientRepository();
  try {
    if (req.method === "GET") {
      sendJson(res, 200, await repository.list());
      return;
    }
    if (!requireOwner(req, res)) return;
    if (req.method === "POST" || req.method === "PUT") {
      sendJson(res, req.method === "POST" ? 201 : 200, await repository.save(await readJson(req, 200000)));
      return;
    }
    sendJson(res, 405, { error: "Método não permitido." });
  } catch (error) {
    safeError(res, error);
  }
}
