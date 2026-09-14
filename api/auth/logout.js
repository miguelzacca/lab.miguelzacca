import { logoutOwner } from "../../src/server/auth/session.js";
import { sendJson } from "../../src/server/http.js";

export default async function handler(request, response) {
  if (request.method !== "POST") {
    sendJson(response, 405, { error: "M\u00e9todo n\u00e3o permitido." });
    return;
  }
  logoutOwner(request, response);
}
