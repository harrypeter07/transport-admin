type CacheEntry<T> = {
  data: T;
  timestamp: number;
  ttl: number;
};

const store = new Map<string, CacheEntry<unknown>>();
const DEFAULT_TTL = 5 * 60 * 1000;

export function getSessionCache<T>(key: string): T | null {
  const entry = store.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > entry.ttl) {
    store.delete(key);
    return null;
  }
  return entry.data as T;
}

export function setSessionCache<T>(key: string, data: T, ttl = DEFAULT_TTL): void {
  store.set(key, { data, timestamp: Date.now(), ttl });
}

export function clearSessionCache(): void {
  store.clear();
}

export function invalidateSessionCache(key: string): void {
  store.delete(key);
}
