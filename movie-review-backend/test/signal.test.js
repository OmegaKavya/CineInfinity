const test = require("node:test");
const assert = require("node:assert/strict");
const { buildSignal, histogram, spread, divergence } = require("../lib/signal");

const reviews = (ratings, year = "2016") =>
  ratings.map((rating) => ({ rating, year }));

test("the histogram has a bucket per rating, including empty ones", () => {
  const buckets = histogram([8, 8, 3]);
  assert.strictEqual(buckets.length, 10);
  // An empty bucket is information: it is where this person never rates.
  assert.strictEqual(buckets[0].count, 0);
  assert.strictEqual(buckets[2].count, 1);
  assert.strictEqual(buckets[7].count, 2);
});

test("a single rating has no spread rather than a spread of zero", () => {
  // Zero would claim perfect consistency from one data point.
  assert.strictEqual(spread([7]), null);
  assert.ok(spread([2, 8]) > 0);
});

test("films only this user rated are excluded from the comparison", () => {
  // Their average IS this user, so the difference is necessarily zero and
  // would drag any bias towards the middle.
  const result = divergence([
    { movieId: "tt1", mine: 9, crowdMean: 7, crowdCount: 3 },
    { movieId: "tt2", mine: 4, crowdMean: NaN, crowdCount: 0 },
  ]);
  assert.strictEqual(result.count, 1);
  assert.strictEqual(result.bias, 2);
});

test("the contrarian list ranks by distance in either direction", () => {
  const result = divergence([
    { movieId: "tt1", mine: 9, crowdMean: 8.5, crowdCount: 2 },
    { movieId: "tt2", mine: 3, crowdMean: 8.0, crowdCount: 2 },
    { movieId: "tt3", mine: 10, crowdMean: 8.0, crowdCount: 2 },
  ]);
  // Being 5 below is more contrarian than being 2 above, so a plain sort by
  // delta would put the wrong film first.
  assert.strictEqual(result.contrarian[0].movieId, "tt2");
  assert.strictEqual(result.contrarian[0].delta, -5);
  assert.strictEqual(result.contrarian[1].movieId, "tt3");
});

test("no reviews yields an empty profile rather than NaN", () => {
  const s = buildSignal({ reviews: [], pairs: [] });
  assert.strictEqual(s.total, 0);
  assert.strictEqual(s.mean, null);
  assert.strictEqual(s.spread, null);
  assert.strictEqual(s.bias, null);
  assert.match(s.verdict, /No ratings yet/);
});

test("decades come from the film's year and ignore unusable ones", () => {
  const s = buildSignal({
    reviews: [
      { rating: 8, year: "1994" },
      { rating: 7, year: "1999" },
      { rating: 6, year: "2016" },
      { rating: 5, year: "N/A" },
      { rating: 5, year: undefined },
    ],
    pairs: [],
  });
  assert.deepStrictEqual(s.decades, [
    { decade: 1990, count: 2 },
    { decade: 2010, count: 1 },
  ]);
  // The unusable years still count as ratings; only the decade is unknown.
  assert.strictEqual(s.total, 5);
});

test("a small bias is not reported as a personality", () => {
  const s = buildSignal({
    reviews: reviews([7, 8, 6, 7]),
    pairs: [
      { movieId: "a", mine: 7, crowdMean: 6.9, crowdCount: 4 },
      { movieId: "b", mine: 8, crowdMean: 7.9, crowdCount: 4 },
      { movieId: "c", mine: 6, crowdMean: 6.0, crowdCount: 4 },
    ],
  });
  assert.match(s.verdict, /in line with the crowd/);
});

test("a clearly generous rater is described as one", () => {
  const s = buildSignal({
    reviews: reviews([9, 10, 9, 8]),
    pairs: [
      { movieId: "a", mine: 9, crowdMean: 6.0, crowdCount: 5 },
      { movieId: "b", mine: 10, crowdMean: 7.0, crowdCount: 5 },
      { movieId: "c", mine: 9, crowdMean: 6.5, crowdCount: 5 },
    ],
  });
  assert.match(s.verdict, /more generous/);
});

test("too few ratings is said plainly instead of being read into", () => {
  const s = buildSignal({
    reviews: reviews([10]),
    pairs: [{ movieId: "a", mine: 10, crowdMean: 4, crowdCount: 9 }],
  });
  assert.match(s.verdict, /Too few/);
});
