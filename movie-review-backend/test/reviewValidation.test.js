// The review endpoints are the only place a visitor can write to the
// database, so this is where malformed input has to be stopped. The
// validators are pure middleware, so they can be driven directly with a
// fake request and response rather than standing a server and a Mongo
// instance up for every case.
const test = require("node:test");
const assert = require("node:assert");

const {
  validateReview,
  validateNewReview,
  validateMovieQuery,
} = require("../middleware/validate");

/** Run a validator and report what it decided. */
function run(validator, body, params = {}, query = {}) {
  const req = { body: { ...body }, params, query };
  const result = { passed: false, status: null, payload: null };
  const res = {
    status(code) {
      result.status = code;
      return {
        json(payload) {
          result.payload = payload;
        },
      };
    },
  };
  validator(req, res, () => {
    result.passed = true;
  });
  return { ...result, body: req.body };
}

const valid = { movieId: "tt0110357", rating: 8, comment: "Worth it." };

test("a well-formed review passes and is normalised", () => {
  const out = run(validateNewReview, { ...valid, comment: "  Worth it.  " });
  assert.ok(out.passed);
  assert.strictEqual(out.body.rating, 8);
  assert.strictEqual(out.body.comment, "Worth it.", "comment should be trimmed");
});

test("a numeric string rating is accepted and coerced", () => {
  const out = run(validateNewReview, { ...valid, rating: "8" });
  assert.ok(out.passed);
  assert.strictEqual(out.body.rating, 8);
  assert.strictEqual(typeof out.body.rating, "number");
});

test("ratings outside one to ten are refused", () => {
  for (const rating of [0, 11, -1, 100]) {
    const out = run(validateNewReview, { ...valid, rating });
    assert.strictEqual(out.passed, false, `${rating} should not pass`);
    assert.strictEqual(out.status, 400);
  }
});

test("a fractional rating is refused", () => {
  assert.strictEqual(run(validateNewReview, { ...valid, rating: 7.5 }).passed, false);
});

test("values that merely look numeric to Number() are refused", () => {
  // Number() accepted all of these before: true became 1, [7] and ["7"]
  // became 7, "0x7" became 7. A malformed body turned into a plausible
  // rating rather than an error.
  for (const rating of [true, false, [7], ["7"], "0x7", "1e1", {}, null, ""]) {
    const out = run(validateNewReview, { ...valid, rating });
    assert.strictEqual(
      out.passed,
      false,
      `${JSON.stringify(rating)} should not be read as a rating`
    );
  }
});

test("a comment is required and cannot be whitespace", () => {
  for (const comment of ["", "   ", null, undefined, 42]) {
    assert.strictEqual(run(validateNewReview, { ...valid, comment }).passed, false);
  }
});

test("a comment is capped at 2000 characters", () => {
  assert.ok(run(validateNewReview, { ...valid, comment: "a".repeat(2000) }).passed);
  assert.strictEqual(
    run(validateNewReview, { ...valid, comment: "a".repeat(2001) }).passed,
    false
  );
});

test("creating a review requires a movieId", () => {
  const { movieId, ...withoutMovie } = valid;
  const out = run(validateNewReview, withoutMovie);
  assert.strictEqual(out.passed, false);
  assert.deepStrictEqual(out.payload.details, ["movieId is required"]);
});

test("editing does not require a movieId, since the route ignores it", () => {
  const { movieId, ...withoutMovie } = valid;
  assert.ok(run(validateReview, withoutMovie).passed);
});

test("an oversized movieId is refused", () => {
  assert.strictEqual(
    run(validateNewReview, { ...valid, movieId: "t".repeat(65) }).passed,
    false
  );
});

test("every problem in one body is reported at once", () => {
  const out = run(validateNewReview, { movieId: "tt1", rating: 99, comment: "" });
  assert.strictEqual(out.status, 400);
  assert.ok(out.payload.details.length >= 2, "should not stop at the first error");
});

test("a search needs a usable term", () => {
  assert.ok(run(validateMovieQuery, {}, { title: "Inception" }).passed);
  assert.ok(run(validateMovieQuery, {}, {}, { query: "Inception" }).passed);
  assert.strictEqual(run(validateMovieQuery, {}, {}, {}).passed, false);
  assert.strictEqual(run(validateMovieQuery, {}, { title: "   " }).passed, false);
  assert.strictEqual(
    run(validateMovieQuery, {}, { title: "x".repeat(151) }).passed,
    false
  );
});
