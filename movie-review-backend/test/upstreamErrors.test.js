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

// OMDb reports a spent quota as HTTP 200 with Response "False", the same body
// it uses for a film it does not have. Cached as a miss, one bad minute became
// a day of "not found" for every film looked up during it.
const film = { data: { Response: "True", Title: "Heat", imdbID: "tt0113277" } };
const quotaSpent = { data: { Response: "False", Error: "Request limit reached!" } };

// Each path asks for something different, as the routes share one cache.
for (const path of [
  "/api/movies/omdb/details?imdbID=tt0113277",
  "/api/movies/omdb/Heat",
  "/api/movies/omdb/Ronin?year=1998",
  "/api/movies/omdb/search?query=heat",
  "/api/movies/search?query=ronin",
]) {
  test(`an OMDb quota error on ${path} is a tagged 502 and is not cached`, async () => {
    upstream = async (url) => (url === "/" ? quotaSpent : { data: { results: [] } });
    const res = await fetch(`${base}${path}`);
    const body = await res.json();
    assert.strictEqual(res.status, 502);
    assert.strictEqual(body.code, "UPSTREAM_UNAVAILABLE");
    assert.doesNotMatch(JSON.stringify(body), /Request limit/);
    assert.ok(logged.some((line) => line.includes("Request limit reached!")), "cause was not logged");

    upstream = async (url) =>
      url === "/" ? { data: { ...film.data, Search: [film.data] } } : { data: { results: [] } };
    assert.strictEqual((await fetch(`${base}${path}`)).status, 200);
  });
}

test("a film OMDb does not have is still a cached 404", async () => {
  let calls = 0;
  upstream = async () => {
    calls += 1;
    return { data: { Response: "False", Error: "Movie not found!" } };
  };
  for (let i = 0; i < 2; i += 1) {
    const res = await fetch(`${base}/api/movies/omdb/No%20Such%20Film`);
    assert.strictEqual(res.status, 404);
  }
  assert.strictEqual(calls, 1);
});

test("an IMDb id OMDb does not know is a 404, not an outage", async () => {
  upstream = async () => ({ data: { Response: "False", Error: "Error getting data." } });
  const res = await fetch(`${base}/api/movies/omdb/details?imdbID=tt9999999`);
  assert.strictEqual(res.status, 404);
});

for (const path of [
  "/api/movies/omdb/search?query=alien",
  "/api/movies/tmdb/search?query=alien",
  "/api/movies/omdb/Alien",
  "/api/movies/tmdb/Alien",
  "/api/movies/search?query=alien",
]) {
  test(`an unreachable upstream on ${path} is a tagged 502 with no internals`, async () => {
    upstream = async () => { throw new Error("connect ECONNREFUSED 104.26.0.1:443"); };
    const res = await fetch(`${base}${path}`);
    const body = await res.json();
    assert.strictEqual(res.status, 502);
    assert.strictEqual(body.code, "UPSTREAM_UNAVAILABLE");
    assert.doesNotMatch(JSON.stringify(body), /ECONNREFUSED/);
  });
}
