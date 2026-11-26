// A rate-limited browser must be told it was rate-limited. Without CORS
// headers on the 429 the browser hides the response, and the visitor sees an
// opaque network error. Its own file, because exhausting the limiter would
// fail every later request in a shared process.
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

test("a 429 from the global limiter carries CORS headers", async () => {
  const origin = "https://cineinfinity.web.app";
  let res;
  // The global ceiling is 300 per window; keep going until it answers 429.
  for (let i = 0; i < 400; i += 1) {
    res = await fetch(`${base}/`, { headers: { Origin: origin } });
    if (res.status === 429) break;
    await res.text();
  }
  assert.strictEqual(res.status, 429);
  assert.strictEqual(res.headers.get("access-control-allow-origin"), origin);
});
