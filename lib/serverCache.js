// Simple in-memory cache with TTL. Suitable for a single server process.
// For multi-instance or serverless with cold starts, consider Redis instead.

const store = new Map();

function nowMs() {
  return Date.now();
}

function makeKey(parts) {
  return parts.filter(Boolean).join("|#|");
}

export function getCache(key) {
  const entry = store.get(key);
  if (!entry) return null;
  if (entry.expiresAt && entry.expiresAt < nowMs()) {
    store.delete(key);
    return null;
  }
  return entry.value;
}

export function setCache(key, value, ttlSeconds = 300) {
  const expiresAt = ttlSeconds > 0 ? nowMs() + ttlSeconds * 1000 : null;
  store.set(key, { value, expiresAt });
}

export function makeCacheKey(parts = []) {
  return makeKey(parts);
}

export function clearCache(key) {
  if (key) {
    store.delete(key);
  } else {
    store.clear();
  }
}
