// What a visitor's browser receives when a service this server calls fails.
// Empty rather than deleted, for the reason given in middleware.test.js.
process.env.NODE_ENV = "production";
process.env.MONGO_URI = "";
process.env.CORS_ORIGINS = "";

const test = require("node:test");
const assert = require("node:assert");
const axios = require("axios");

// Stubbed before the server loads: the routes take axios.post and the
// instances axios.create returns at require time.
let upstream = async () => { throw new Error("upstream not stubbed for this test"); };
axios.post = (...args) => upstream(...args);
axios.create = () => ({ get: (...args) => upstream(...args) });

const app = require("../server");

let server;
let base;
const logged = [];
const realConsoleError = console.error;

test.before(async () => {
  console.error = (...args) => logged.push(args.join(" "));
  await new Promise((resolve) => {
    server = app.listen(0, resolve);
  });
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(() => {
  console.error = realConsoleError;
  return new Promise((resolve) => server.close(resolve));
});

const anilist = (id) =>
  fetch(`${base}/api/anilist/graphql`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "https://cineinfinity.web.app" },
    body: JSON.stringify({ operation: "entry", variables: { id } }),
  });

test("an unreachable AniList is a tagged 502 with no internals, and the cause is logged", async () => {
  upstream = async () => { throw new Error("getaddrinfo ENOTFOUND graphql.anilist.co"); };
  const res = await anilist(1);
  const body = await res.json();
  assert.strictEqual(res.status, 502);
  assert.strictEqual(body.code, "UPSTREAM_UNAVAILABLE");
  assert.doesNotMatch(JSON.stringify(body), /ENOTFOUND|getaddrinfo/);
  assert.ok(logged.some((line) => line.includes("ENOTFOUND")), "cause was not logged");
});

test("an AniList GraphQL error is not passed through to the visitor", async () => {
  upstream = async () => ({ data: { errors: [{ message: "Internal server error at resolver Media" }] } });
  const res = await anilist(2);
  const body = await res.json();
  assert.strictEqual(res.status, 502);
  assert.strictEqual(body.code, "UPSTREAM_UNAVAILABLE");
  assert.doesNotMatch(body.error, /resolver/);
});

test("AniList's own 429 stays a 429 and carries CORS headers", async () => {
  upstream = async () => {
    throw Object.assign(new Error("Request failed with status code 429"), { response: { status: 429 } });
  };
  const res = await anilist(3);
  assert.strictEqual(res.status, 429);
  assert.strictEqual(res.headers.get("access-control-allow-origin"), "https://cineinfinity.web.app");
});

test("a TMDb failure on the catalogue is a tagged 502 with no internals", async () => {
  upstream = async () => { throw new Error("connect ETIMEDOUT 13.224.0.1:443"); };
  const res = await fetch(`${base}/api/movies/discover/hollywood`);
  const body = await res.json();
  assert.strictEqual(res.status, 502);
  assert.strictEqual(body.code, "UPSTREAM_UNAVAILABLE");
  assert.doesNotMatch(JSON.stringify(body), /ETIMEDOUT/);
});
