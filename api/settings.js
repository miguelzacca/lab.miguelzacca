import { getPrisma } from "../src/server/db/prisma.js";
import { readJson, safeError, sendJson } from "../src/server/http.js";
import { requireOwner } from "../src/server/auth/session.js";

const allowedKeys = new Set(["appearance", "libraryView", "documentDefaults", "previewAppearance"]);

export default async function handler(request, response) {
  const prisma = getPrisma();
  try {
    if (request.method === "GET") {
      const rows = await prisma.appSettings.findMany();
      sendJson(response, 200, Object.fromEntries(rows.map((row) => [row.key, row.value])));
      return;
    }
    if (request.method === "PUT") {
      if (!requireOwner(request, response)) return;
      const body = await readJson(request, 50000);
      if (!allowedKeys.has(body.key)) throw Object.assign(new Error("INVALID_KEY"), { status: 400 });
      await prisma.appSettings.upsert({
        where: { key: body.key },
        create: { key: body.key, value: body.value },
        update: { value: body.value }
      });
      sendJson(response, 200, { ok: true });
      return;
    }
    sendJson(response, 405, { error: "Método não permitido." });
  } catch (error) {
    safeError(response, error);
  }
}
