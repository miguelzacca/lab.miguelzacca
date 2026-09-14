import { loginOwner } from "../../src/server/auth/session.js";
import { readJson, safeError, sendJson } from "../../src/server/http.js";

export default async function handler(request, response) {
  if (request.method !== "POST") {
    sendJson(response, 405, { error: "M\u00e9todo n\u00e3o permitido." });
    return;
  }
  try {
    await loginOwner(request, response, await readJson(request, 10000));
  } catch (error) {
    safeError(response, error);
  }
}
