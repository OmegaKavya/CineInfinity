const test = require("node:test");
const assert = require("node:assert");
const { createCache } = require("../lib/cache");

/** A clock the test controls, so expiry can be asserted without waiting. */
function fakeClock(start = 1000) {
  let t = start;
  return { now: () => t, advance: (ms) => { t += ms; } };
}

test("a value survives until its ttl runs out", () => {
  const clock = fakeClock();
  const cache = createCache({ ttlMs: 1000, now: clock.now });

  cache.set("k", "v");
  assert.strictEqual(cache.get("k"), "v");

  clock.advance(999);
  assert.strictEqual(cache.get("k"), "v");

  clock.advance(2);
  assert.strictEqual(cache.get("k"), undefined, "should be gone once expired");
});

test("an expired entry is dropped rather than left to accumulate", () => {
  const clock = fakeClock();
  const cache = createCache({ ttlMs: 10, now: clock.now });
  cache.set("k", "v");
  clock.advance(11);
  cache.get("k");
  assert.strictEqual(cache.size, 0);
});

test("the oldest entry goes when the cache is full", () => {
  const cache = createCache({ max: 2 });
  cache.set("a", 1);
  cache.set("b", 2);
  cache.set("c", 3);

  assert.strictEqual(cache.get("a"), undefined);
  assert.strictEqual(cache.get("b"), 2);
  assert.strictEqual(cache.get("c"), 3);
  assert.strictEqual(cache.stats().evictions, 1);
});

test("rewriting a key refreshes its place in the queue", () => {
  const cache = createCache({ max: 2 });
  cache.set("a", 1);
  cache.set("b", 2);
  cache.set("a", 11); // a is now the newest
  cache.set("c", 3); // so b should go

  assert.strictEqual(cache.get("a"), 11);
  assert.strictEqual(cache.get("b"), undefined);
});

test("wrap calls the producer once and serves the rest from memory", async () => {
  const cache = createCache();
  let calls = 0;
  const produce = async () => { calls += 1; return "payload"; };

  assert.strictEqual(await cache.wrap("k", produce), "payload");
  assert.strictEqual(await cache.wrap("k", produce), "payload");
  assert.strictEqual(calls, 1, "the second call should not reach the producer");
});

test("simultaneous misses share one upstream call", async () => {
  // Ten people searching the same title on a cold key should cost one
  // request, not ten. This is the part that protects the daily quota.
  const cache = createCache();
  let calls = 0;
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const produce = async () => { calls += 1; await gate; return "payload"; };

  const waiting = Array.from({ length: 10 }, () => cache.wrap("k", produce));
  release();
  const results = await Promise.all(waiting);

  assert.strictEqual(calls, 1);
  assert.ok(results.every((r) => r === "payload"));
});

test("a failure is not cached", async () => {
  const cache = createCache();
  let calls = 0;
  const failing = async () => { calls += 1; throw new Error("upstream down"); };

  await assert.rejects(() => cache.wrap("k", failing));
  await assert.rejects(() => cache.wrap("k", failing));

  assert.strictEqual(calls, 2, "a transient failure must not be served for the whole ttl");
  assert.strictEqual(cache.size, 0);
});

test("a failed call does not wedge the key", async () => {
  const cache = createCache();
  await assert.rejects(() => cache.wrap("k", async () => { throw new Error("boom"); }));
  const value = await cache.wrap("k", async () => "recovered");
  assert.strictEqual(value, "recovered");
});

test("a per-call ttl overrides the default", () => {
  const clock = fakeClock();
  const cache = createCache({ ttlMs: 10, now: clock.now });
  cache.set("short", 1);
  cache.set("long", 2, 1000);

  clock.advance(11);
  assert.strictEqual(cache.get("short"), undefined);
  assert.strictEqual(cache.get("long"), 2);
});

test("stats report a hit rate worth looking at", async () => {
  const cache = createCache();
  await cache.wrap("a", async () => 1); // miss
  await cache.wrap("a", async () => 1); // hit
  await cache.wrap("b", async () => 2); // miss

  const stats = cache.stats();
  assert.strictEqual(stats.hits, 1);
  assert.strictEqual(stats.misses, 2);
  assert.strictEqual(stats.hitRate, 0.333);
});

test("a falsy cached value is still a hit", async () => {
  // get() returning undefined is the miss signal, so 0, "" and null have to
  // survive the round trip or they would be fetched again every time.
  const cache = createCache();
  for (const value of [0, "", null, false]) {
    cache.clear();
    let calls = 0;
    await cache.wrap("k", async () => { calls += 1; return value; });
    await cache.wrap("k", async () => { calls += 1; return value; });
    assert.strictEqual(calls, 1, `${JSON.stringify(value)} should be cached`);
  }
});
