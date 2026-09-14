import { readJson, safeError, sendJson } from "../src/server/http.js";
import { PrismaFormulationRepository } from "../src/server/repositories/formulation-repository.js";
import { requireOwner } from "../src/server/auth/session.js";

export default async function handler(req, res) {
  const repository = new PrismaFormulationRepository();
  try {
    if (req.method === "GET") {
      const url = new URL(req.url, "http://local");
      const id = url.searchParams.get("id");
      const result = id
        ? await repository.get(id)
        : await repository.list({
            archived: url.searchParams.get("archived") === "true",
            favorite: url.searchParams.get("favorite") === "true"
          });
      if (id && !result) throw Object.assign(new Error("NOT_FOUND"), { status: 404 });
      sendJson(res, 200, result);
      return;
    }
    if (!requireOwner(req, res)) return;
    const body = await readJson(req);
    if (req.method === "POST") {
      sendJson(res, 201, await repository.save(body.record, body.source || "MANUAL"));
      return;
    }
    if (req.method === "PUT") {
      if (body.action === "archive") sendJson(res, 200, await repository.archive(body.id, body.archived !== false));
      else if (body.action === "duplicate") sendJson(res, 201, await repository.duplicate(body.id));
      else sendJson(res, 200, await repository.save(body.record, body.source || "MANUAL"));
      return;
    }
    if (req.method === "DELETE") {
      await repository.remove(body.id);
      sendJson(res, 200, { ok: true });
      return;
    }
    sendJson(res, 405, { error: "Método não permitido." });
  } catch (error) {
    if (error.code === "P2002") error.status = 409;
    if (error.code === "P2025") error.status = 404;
    safeError(res, error);
  }
}
