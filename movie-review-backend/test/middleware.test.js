// Properties of the middleware stack that no route test would notice if a
// refactor reordered it.
// Empty rather than deleted: server.js loads .env, and dotenv fills in any
// variable that is absent, which would connect this test to the real
// database and keep the process alive after it finishes.
process.env.NODE_ENV = "production";
process.env.MONGO_URI = "";
process.env.CORS_ORIGINS = "";

const test = require("node:test");
const assert = require("node:assert");

const app = require("../server");

let server;
let base;

test.before(async () => {
  await new Promise((resolve) => {
    server = app.listen(0, resolve);
  });
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(() => new Promise((resolve) => server.close(resolve)));

test("trusts exactly one proxy hop", () => {
  assert.strictEqual(app.get("trust proxy"), 1);
});

test("a refused origin is a 403, not a logged 500", async () => {
  const res = await fetch(`${base}/`, { headers: { Origin: "https://evil.example" } });
  assert.strictEqual(res.status, 403);
});

test("an allowed origin gets CORS and security headers", async () => {
  const res = await fetch(`${base}/`, { headers: { Origin: "https://cineinfinity.web.app" } });
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.headers.get("access-control-allow-origin"), "https://cineinfinity.web.app");
  assert.ok(res.headers.get("x-content-type-options"), "helmet headers missing");
  assert.ok(res.headers.get("ratelimit-policy") || res.headers.get("ratelimit"),
    "global rate limit not applied");
});

test("film details require a real IMDb id, before any upstream call", async () => {
  for (const qs of ["", "?query=foo", "?imdbID=undefined", "?imdbID=123"]) {
    const res = await fetch(`${base}/api/movies/omdb/details${qs}`);
    assert.strictEqual(res.status, 400, qs);
  }
});

test("search ignores an imdbID it does not read: a 400, not a 500", async () => {
  const res = await fetch(`${base}/api/movies/search?imdbID=tt0111161`);
  assert.strictEqual(res.status, 400);
});

test("a non-JSON review body is a 400, not a crash", async () => {
  // Authentication runs first on review routes, so exercise the validator
  // directly with the body express.json leaves for a non-JSON request.
  const { validateNewReview } = require("../middleware/validate");
  let status;
  const res = { status(code) { status = code; return { json() {} }; } };
  validateNewReview({ body: undefined }, res, () => assert.fail("next() called"));
  assert.strictEqual(status, 400);
});
