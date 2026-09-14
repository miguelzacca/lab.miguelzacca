import { createHash } from "node:crypto";

const buckets = globalThis.__mzLabRateLimits || new Map();
globalThis.__mzLabRateLimits = buckets;

function clientKey(request) {
  const forwarded = String(request.headers?.["x-forwarded-for"] || "").split(",")[0].trim();
  const address = forwarded || request.socket?.remoteAddress || "unknown";
  return createHash("sha256").update(address).digest("hex").slice(0, 24);
}

export function takeRateLimit(request, scope, { limit, windowMs }) {
  const now = Date.now();
  const key = scope + ":" + clientKey(request);
  const current = buckets.get(key);
  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
  } else {
    current.count += 1;
    if (current.count > limit) return false;
  }
  if (buckets.size > 2000) {
    for (const [entryKey, entry] of buckets) {
      if (entry.resetAt <= now) buckets.delete(entryKey);
    }
  }
  return true;
}
