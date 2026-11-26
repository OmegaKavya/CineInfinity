// /health is public, so a degraded server must say which subsystem is down
// without repeating the error behind it. Empty rather than deleted, for the
// reason given in middleware.test.js.
process.env.NODE_ENV = "production";
process.env.MONGO_URI = "";
process.env.CORS_ORIGINS = "";

const test = require("node:test");
const assert = require("node:assert");
const Module = require("node:module");

// A credential fault whose text must stay in the log.
const firebaseFault = new Error("Service account JSON is malformed: private_key missing");

const logged = [];
const realConsoleError = console.error;
console.error = (...args) => logged.push(args.join(" "));

const realLoad = Module._load;
Module._load = function patched(request, parent, isMain) {
  if (request.endsWith("config/firebase")) {
    return {
      authError: () => firebaseFault,
      authAvailable: () => false,
      auth: {},
    };
  }
  return realLoad.call(this, request, parent, isMain);
};
const app = require("../server");
Module._load = realLoad;

let server;
let base;

test.before(async () => {
  await new Promise((resolve) => {
    server = app.listen(0, resolve);
  });
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(() => {
  console.error = realConsoleError;
  return new Promise((resolve) => server.close(resolve));
});

test("a degraded /health names the subsystems but not their errors", async () => {
  const res = await fetch(`${base}/health`);
  const body = await res.json();

  // The frontend's wakeBackend reads exactly this as "awake".
  assert.strictEqual(res.status, 503);
  assert.strictEqual(body.status, "degraded");
  assert.strictEqual(body.database, "disconnected");
  assert.strictEqual(body.auth, "unavailable");

  assert.doesNotMatch(JSON.stringify(body), /MONGO_URI|private_key|malformed/);
  assert.ok(logged.some((line) => line.includes("MONGO_URI is not set")), "database cause was not logged");
});
