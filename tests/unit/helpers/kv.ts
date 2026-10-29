// KV "finto" in memoria: get/put con expirationTtl, quanto basta per i test.
export function memoryKV(now: () => number = Date.now) {
  const store = new Map<string, { value: string; expires?: number }>();
  const kv = {
    store,
    puts: [] as { key: string; ttl?: number }[],
    async get(key: string): Promise<string | null> {
      const e = store.get(key);
      if (!e) return null;
      if (e.expires && e.expires <= now()) {
        store.delete(key);
        return null;
      }
      return e.value;
    },
    async put(key: string, value: string, opts?: { expirationTtl?: number }): Promise<void> {
      kv.puts.push({ key, ...(opts?.expirationTtl ? { ttl: opts.expirationTtl } : {}) });
      store.set(key, {
        value,
        ...(opts?.expirationTtl ? { expires: now() + opts.expirationTtl * 1000 } : {}),
      });
    },
  };
  return kv as typeof kv & KVNamespace;
}
