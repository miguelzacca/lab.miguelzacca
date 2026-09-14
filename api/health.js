import { getPrisma } from "../src/server/db/prisma.js";
import { sendJson } from "../src/server/http.js";
import { DEFAULT_NVIDIA_MODEL, NvidiaProvider } from "../src/server/ai/provider.js";

export default async function handler(_request, response) {
  let database = "unavailable";
  try {
    await getPrisma().$queryRaw`SELECT 1`;
    database = "connected";
  } catch {
    database = "unavailable";
  }
  const provider = new NvidiaProvider();
  sendJson(response, database === "connected" ? 200 : 503, {
    ok: database === "connected",
    product: "MIGUEL ZAKALEB FORMULATION LAB",
    database,
    ai: {
      provider: "NVIDIA NIM",
      configured: provider.configured,
      model: provider.model || DEFAULT_NVIDIA_MODEL
    },
    timestamp: new Date().toISOString()
  });
}
