import test from "node:test";
import assert from "node:assert/strict";
import { access } from "node:fs/promises";

import {
  loginOwner,
  logoutOwner,
  ownerSession,
  requireOwner,
  validMutationOrigin
} from "../src/server/auth/session.js";
import statusHandler from "../api/auth/status.js";

const ENV_KEYS = [
  "LAB_AUTH_USERNAME",
  "LAB_AUTH_PASSWORD",
  "LAB_AUTH_SECRET",
  "LAB_AUTH_TTL_SECONDS",
  "NODE_ENV",
  "VERCEL"
];

function useEnv(values = {}) {
  const previous = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
  for (const key of ENV_KEYS) delete process.env[key];
  Object.assign(process.env, values);
  return () => {
    for (const key of ENV_KEYS) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  };
}

function responseMock() {
  return {
    statusCode: 200,
    headers: {},
    body: undefined,
    setHeader(name, value) { this.headers[String(name).toLowerCase()] = value; },
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; },
    end(value) {
      this.body = typeof value === "string" ? JSON.parse(value) : value;
      return this;
    }
  };
}

function localRequest(headers = {}) {
  return { headers: { host: "localhost:4173", ...headers } };
}

const configuredEnv = {
  LAB_AUTH_USERNAME: "owner",
  LAB_AUTH_PASSWORD: "senha-local-forte",
  LAB_AUTH_SECRET: "segredo-de-teste-com-mais-de-trinta-e-dois-caracteres"
};

test("ownerSession informa configuracao ausente sem autenticar", () => {
  const restore = useEnv();
  try {
    assert.deepEqual(ownerSession(localRequest()), { configured: false, authenticated: false });
  } finally {
    restore();
  }
});

test("loginOwner cria cookie assinado e ownerSession valida somente o token integro", async () => {
  const restore = useEnv(configuredEnv);
  try {
    const response = responseMock();
    await loginOwner(localRequest(), response, { username: "owner", password: "senha-local-forte" });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.body, { authenticated: true });
    assert.match(response.headers["set-cookie"], /^mz_lab_session=v1\./);
    assert.match(response.headers["set-cookie"], /HttpOnly/);
    assert.match(response.headers["set-cookie"], /SameSite=Lax/);
    assert.match(response.headers["set-cookie"], /Max-Age=43200/);
    assert.doesNotMatch(response.headers["set-cookie"], /; Secure/);

    const cookie = response.headers["set-cookie"].split(";")[0];
    assert.deepEqual(ownerSession(localRequest({ cookie })), { configured: true, authenticated: true });

    const tamperedCookie = cookie.slice(0, -1) + (cookie.endsWith("a") ? "b" : "a");
    assert.deepEqual(ownerSession(localRequest({ cookie: tamperedCookie })), { configured: true, authenticated: false });
  } finally {
    restore();
  }
});

test("validMutationOrigin aceita same-origin e bloqueia ausencia ou origem cruzada em producao", () => {
  const restore = useEnv({ ...configuredEnv, NODE_ENV: "production" });
  try {
    const headers = {
      host: "lab.miguelzacca.dev",
      "x-forwarded-proto": "https"
    };
    assert.equal(validMutationOrigin({ headers: { ...headers, origin: "https://lab.miguelzacca.dev" } }), true);
    assert.equal(validMutationOrigin({ headers }), false);
    assert.equal(validMutationOrigin({ headers: { ...headers, origin: "https://exemplo-malicioso.test" } }), false);
  } finally {
    restore();
  }
});

test("cookie de producao recebe Secure e TTL customizado e limitado", async () => {
  const restore = useEnv({ ...configuredEnv, NODE_ENV: "production", LAB_AUTH_TTL_SECONDS: "10" });
  try {
    const request = {
      headers: {
        host: "lab.miguelzacca.dev",
        origin: "https://lab.miguelzacca.dev",
        "x-forwarded-proto": "https"
      }
    };
    const response = responseMock();
    await loginOwner(request, response, { username: "owner", password: "senha-local-forte" });

    assert.match(response.headers["set-cookie"], /; Secure/);
    assert.match(response.headers["set-cookie"], /Max-Age=900/);
  } finally {
    restore();
  }
});

test("requireOwner protege mutacoes e libera sessao autentica", async () => {
  const restore = useEnv(configuredEnv);
  try {
    const denied = responseMock();
    assert.equal(requireOwner(localRequest(), denied), false);
    assert.equal(denied.statusCode, 401);

    const loginResponse = responseMock();
    await loginOwner(localRequest(), loginResponse, { username: "owner", password: "senha-local-forte" });
    const cookie = loginResponse.headers["set-cookie"].split(";")[0];
    assert.equal(requireOwner(localRequest({ cookie }), responseMock()), true);
  } finally {
    restore();
  }
});

test("logoutOwner invalida o cookie no navegador", () => {
  const restore = useEnv(configuredEnv);
  try {
    const response = responseMock();
    logoutOwner(localRequest(), response);
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.body, { authenticated: false });
    assert.match(response.headers["set-cookie"], /^mz_lab_session=;/);
    assert.match(response.headers["set-cookie"], /Max-Age=0/);
  } finally {
    restore();
  }
});

test("endpoint de status e somente leitura e nao existe fluxo de registro", async () => {
  const restore = useEnv(configuredEnv);
  try {
    const statusResponse = responseMock();
    await statusHandler({ method: "GET", headers: {} }, statusResponse);
    assert.equal(statusResponse.statusCode, 200);
    assert.deepEqual(statusResponse.body, { configured: true, authenticated: false });

    const rejectedMethod = responseMock();
    await statusHandler({ method: "POST", headers: {} }, rejectedMethod);
    assert.equal(rejectedMethod.statusCode, 405);

    await assert.rejects(access(new URL("../api/auth/register.js", import.meta.url)), { code: "ENOENT" });
  } finally {
    restore();
  }
});
