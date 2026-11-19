/**
 * A small TTL cache with single-flight, for the upstream film APIs.
 *
 * Why this exists
 * ---------------
 * Every home page load asks TMDb for two catalogues, and every search asks
 * OMDb for suggestions. OMDb's free tier allows 1,000 requests a day, so a
 * few hundred searches exhaust it and search stops working for everyone
 * until midnight. The data barely changes: a film's details are effectively
 * immutable, and a popularity list changes over hours, not seconds.
 *
 * Single-flight matters as much as the cache itself. Without it, ten people
 * searching the same title during a cold key all queue their own upstream
 * request; with it, the first makes the call and the rest wait on it.
 *
 * In-memory on purpose. A Redis would survive restarts, but it is another
 * service to run and pay for, and the whole point here is to stop burning a
 * quota, which one process does perfectly well. The eviction policy is
 * oldest-first rather than true LRU: at this size the difference is not
 * worth the bookkeeping.
 */

function createCache({ max = 500, ttlMs = 10 * 60 * 1000, now = Date.now } = {}) {
  const entries = new Map(); // key -> { value, expiresAt }
  const inFlight = new Map(); // key -> Promise
  const stats = { hits: 0, misses: 0, evictions: 0, errors: 0 };

  function isFresh(entry) {
    return entry !== undefined && entry.expiresAt > now();
  }

  function get(key) {
    const entry = entries.get(key);
    if (!isFresh(entry)) {
      if (entry !== undefined) entries.delete(key);
      return undefined;
    }
    return entry.value;
  }

  function set(key, value, ttl = ttlMs) {
    // Re-inserting moves the key to the end, so the oldest stays first.
    entries.delete(key);
    entries.set(key, { value, expiresAt: now() + ttl });

    while (entries.size > max) {
      const oldest = entries.keys().next().value;
      entries.delete(oldest);
      stats.evictions += 1;
    }
    return value;
  }

  /**
   * Return the cached value, or produce it with `fn` and cache that.
   *
   * A failure is never cached: a transient upstream error would otherwise
   * be served to everyone for the whole TTL.
   */
  async function wrap(key, fn, ttl = ttlMs) {
    const cached = get(key);
    if (cached !== undefined) {
      stats.hits += 1;
      return cached;
    }

    const pending = inFlight.get(key);
    if (pending) {
      // Still a miss for accounting, but it costs no upstream call.
      stats.hits += 1;
      return pending;
    }

    stats.misses += 1;
    const promise = (async () => fn())()
      .then((value) => {
        set(key, value, ttl);
        return value;
      })
      .catch((error) => {
        stats.errors += 1;
        throw error;
      })
      .finally(() => {
        inFlight.delete(key);
      });

    inFlight.set(key, promise);
    return promise;
  }

  return {
    get,
    set,
    wrap,
    clear() {
      entries.clear();
      inFlight.clear();
    },
    get size() {
      return entries.size;
    },
    stats() {
      const total = stats.hits + stats.misses;
      return {
        ...stats,
        size: entries.size,
        hitRate: total ? Number((stats.hits / total).toFixed(3)) : 0,
      };
    },
  };
}

module.exports = { createCache };
