import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { sendJson } from "../http.js";
import { takeRateLimit } from "../security/rate-limit.js";

const COOKIE_NAME = "mz_lab_session";
const DEFAULT_TTL_SECONDS = 12 * 60 * 60;

function config(env = process.env) {
  const username = env.LAB_AUTH_USERNAME || "";
  const password = env.LAB_AUTH_PASSWORD || "";
  const secret = env.LAB_AUTH_SECRET || "";
  return {
    username,
    password,
    secret,
    configured: Boolean(username && password && secret.length >= 32)
  };
}

function secureRequest(request) {
  return Boolean(process.env.VERCEL || process.env.NODE_ENV === "production" ||
    String(request.headers?.["x-forwarded-proto"] || "").split(",")[0].trim() === "https");
}

function expectedOrigin(request) {
  const protocol = String(request.headers?.["x-forwarded-proto"] || (secureRequest(request) ? "https" : "http"))
    .split(",")[0].trim();
  const host = String(request.headers?.["x-forwarded-host"] || request.headers?.host || "")
    .split(",")[0].trim();
  return host ? protocol + "://" + host : "";
}

export function validMutationOrigin(request) {
  const origin = String(request.headers?.origin || "").replace(/\/$/, "");
  if (!origin) return !process.env.VERCEL && process.env.NODE_ENV !== "production";
  return origin === expectedOrigin(request);
}

function digest(value, secret, namespace) {
  return createHmac("sha256", secret).update(namespace + "\0" + String(value)).digest();
}

function equalSecret(provided, expected, secret, namespace) {
  return timingSafeEqual(digest(provided, secret, namespace), digest(expected, secret, namespace));
}

function sign(payload, secret) {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

function parseCookies(header = "") {
  return Object.fromEntries(String(header).split(";").map((part) => {
    const index = part.indexOf("=");
    if (index < 0) return ["", ""];
    return [part.slice(0, index).trim(), part.slice(index + 1).trim()];
  }).filter(([key]) => key));
}

function ttlSeconds() {
  const value = Number(process.env.LAB_AUTH_TTL_SECONDS || DEFAULT_TTL_SECONDS);
  return Number.isInteger(value) ? Math.max(900, Math.min(value, 604800)) : DEFAULT_TTL_SECONDS;
}

function issueToken(auth) {
  const now = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(JSON.stringify({
    sub: digest(auth.username, auth.secret, "subject").toString("base64url"),
    iat: now,
    exp: now + ttlSeconds(),
    nonce: randomBytes(12).toString("base64url")
  })).toString("base64url");
  return "v1." + payload + "." + sign("v1." + payload, auth.secret);
}

function verifyToken(token, auth) {
  if (!auth.configured || typeof token !== "string" || token.length > 2048) return false;
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== "v1") return false;
  const actual = Buffer.from(parts[2], "base64url");
  const expected = Buffer.from(sign(parts[0] + "." + parts[1], auth.secret), "base64url");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return false;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    const expectedSubject = digest(auth.username, auth.secret, "subject").toString("base64url");
    return payload.sub === expectedSubject &&
      Number.isInteger(payload.iat) &&
      Number.isInteger(payload.exp) &&
      payload.iat <= Math.floor(Date.now() / 1000) + 60 &&
      payload.exp > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

function setCookie(response, value, request, maxAge) {
  const attributes = [
    COOKIE_NAME + "=" + value,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=" + maxAge
  ];
  if (secureRequest(request)) attributes.push("Secure");
  response.setHeader("Set-Cookie", attributes.join("; "));
}

export function ownerSession(request) {
  const auth = config();
  if (!auth.configured) return { configured: false, authenticated: false };
  const token = parseCookies(request.headers?.cookie)[COOKIE_NAME];
  return { configured: true, authenticated: verifyToken(token, auth) };
}

export function requireOwner(request, response) {
  const session = ownerSession(request);
  if (!session.configured) {
    sendJson(response, 503, { error: "A autentica\u00e7\u00e3o privada ainda n\u00e3o est\u00e1 configurada." });
    return false;
  }
  const method = String(request.method || "GET").toUpperCase();
  if (!["GET", "HEAD", "OPTIONS"].includes(method) && !validMutationOrigin(request)) {
    sendJson(response, 403, { error: "Origem da solicita\u00e7\u00e3o n\u00e3o autorizada." });
    return false;
  }
  if (!session.authenticated) {
    sendJson(response, 401, { error: "Autentica\u00e7\u00e3o necess\u00e1ria." });
    return false;
  }
  return true;
}

export async function loginOwner(request, response, credentials) {
  const auth = config();
  if (!auth.configured) {
    sendJson(response, 503, { error: "A autentica\u00e7\u00e3o privada ainda n\u00e3o est\u00e1 configurada." });
    return;
  }
  if (!validMutationOrigin(request)) {
    sendJson(response, 403, { error: "Origem da solicita\u00e7\u00e3o n\u00e3o autorizada." });
    return;
  }
  if (!takeRateLimit(request, "auth-login", { limit: 8, windowMs: 15 * 60 * 1000 })) {
    sendJson(response, 429, { error: "Muitas tentativas. Aguarde antes de tentar novamente." });
    return;
  }
  const username = typeof credentials?.username === "string" ? credentials.username.slice(0, 256) : "";
  const password = typeof credentials?.password === "string" ? credentials.password.slice(0, 1024) : "";
  const valid = equalSecret(username, auth.username, auth.secret, "username") &&
    equalSecret(password, auth.password, auth.secret, "password");
  if (!valid) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    sendJson(response, 401, { error: "Credenciais inv\u00e1lidas." });
    return;
  }
  setCookie(response, issueToken(auth), request, ttlSeconds());
  sendJson(response, 200, { authenticated: true });
}

export function logoutOwner(request, response) {
  if (!validMutationOrigin(request)) {
    sendJson(response, 403, { error: "Origem da solicita\u00e7\u00e3o n\u00e3o autorizada." });
    return;
  }
  setCookie(response, "", request, 0);
  sendJson(response, 200, { authenticated: false });
}
