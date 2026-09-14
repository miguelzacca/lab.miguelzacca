export function sendJson(res, status, value) {
  if (typeof res.status === "function" && typeof res.json === "function") {
    res.status(status).json(value);
    return;
  }
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(value));
}

function parseText(text, maxBytes) {
  if (Buffer.byteLength(text, "utf8") > maxBytes) {
    throw Object.assign(new Error("PAYLOAD_TOO_LARGE"), { status: 413 });
  }
  try {
    return JSON.parse(text || "{}");
  } catch {
    throw Object.assign(new Error("INVALID_JSON"), { status: 400 });
  }
}

export async function readJson(req, maxBytes = 2500000) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") return parseText(req.body, maxBytes);
  let text = "";
  for await (const chunk of req) {
    text += chunk;
    if (Buffer.byteLength(text, "utf8") > maxBytes) {
      throw Object.assign(new Error("PAYLOAD_TOO_LARGE"), { status: 413 });
    }
  }
  return parseText(text, maxBytes);
}

export function safeError(res, error) {
  const status = Number(error.status) || 500;
  const messages = {
    400: "A solicita\u00e7\u00e3o cont\u00e9m dados inv\u00e1lidos.",
    401: "Autentica\u00e7\u00e3o necess\u00e1ria.",
    403: "Origem da solicita\u00e7\u00e3o n\u00e3o autorizada.",
    404: "Registro n\u00e3o encontrado.",
    409: "J\u00e1 existe um registro com estes identificadores.",
    413: "O conte\u00fado excede o limite seguro.",
    429: "Muitas tentativas. Aguarde antes de tentar novamente.",
    499: "A solicita\u00e7\u00e3o foi cancelada.",
    502: "O provedor de intelig\u00eancia n\u00e3o respondeu como esperado.",
    503: "O servi\u00e7o solicitado n\u00e3o est\u00e1 dispon\u00edvel agora.",
    504: "A solicita\u00e7\u00e3o excedeu o tempo limite."
  };
  const exposed = typeof error.publicMessage === "string" ? error.publicMessage : null;
  sendJson(res, status, { error: exposed || messages[status] || "N\u00e3o foi poss\u00edvel concluir a opera\u00e7\u00e3o." });
}
