import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import formulations from "./api/formulations.js";
import ingredients from "./api/ingredients.js";
import settings from "./api/settings.js";
import backup from "./api/backup.js";
import health from "./api/health.js";
import enhance from "./api/ai/enhance.js";
import metadata from "./api/ai/metadata.js";
import normalize from "./api/ai/normalize.js";
import names from "./api/ai/names.js";
import ask from "./api/ai/ask.js";
import authStatus from "./api/auth/status.js";
import authLogin from "./api/auth/login.js";
import authLogout from "./api/auth/logout.js";

const root = resolve(".");
const port = Number(process.env.PORT || 4173);
const handlers = new Map([
  ["/api/formulations", formulations],
  ["/api/ingredients", ingredients],
  ["/api/settings", settings],
  ["/api/backup", backup],
  ["/api/health", health],
  ["/api/ai/enhance", enhance],
  ["/api/ai/metadata", metadata],
  ["/api/ai/normalize", normalize],
  ["/api/ai/names", names],
  ["/api/ai/ask", ask]
  ,["/api/auth/status", authStatus]
  ,["/api/auth/login", authLogin]
  ,["/api/auth/logout", authLogout]
]);
const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json"
};

function applySecurityHeaders(request, response) {
  response.setHeader("Content-Security-Policy", [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    "img-src 'self' data: blob:",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'"
  ].join("; "));
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Frame-Options", "DENY");
  response.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  response.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=()");
  if (process.env.VERCEL || process.env.NODE_ENV === "production" ||
      String(request.headers["x-forwarded-proto"] || "") === "https") {
    response.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
}

function adaptResponse(response) {
  response.status = (status) => {
    response.statusCode = status;
    return response;
  };
  response.json = (payload) => {
    response.setHeader("Content-Type", "application/json; charset=utf-8");
    response.setHeader("Cache-Control", "no-store");
    response.end(JSON.stringify(payload));
  };
  return response;
}

const server = createServer(async (request, response) => {
  try {
    applySecurityHeaders(request, response);
    const url = new URL(request.url, "http://" + (request.headers.host || "localhost"));
    const apiHandler = handlers.get(url.pathname);
    if (apiHandler) {
      await apiHandler(request, adaptResponse(response));
      return;
    }
    const relative = url.pathname === "/"
      ? "public/index.html"
      : url.pathname.startsWith("/assets/")
        ? "src/" + url.pathname.slice("/assets/".length)
        : "public/" + url.pathname.replace(/^\/+/, "");
    const target = resolve(root, relative);
    if (!target.startsWith(root + sep)) {
      response.writeHead(403).end("Forbidden");
      return;
    }
    const info = await stat(target);
    if (!info.isFile()) throw new Error("Not found");
    response.writeHead(200, {
      "Content-Type": mimeTypes[extname(target)] || "application/octet-stream",
      "Cache-Control": "no-cache",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "same-origin"
    });
    response.end(await readFile(target));
  } catch {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
  }
});

server.listen(port, () => {
  console.log("MIGUEL ZAKALEB FORMULATION LAB: http://localhost:" + port);
});
