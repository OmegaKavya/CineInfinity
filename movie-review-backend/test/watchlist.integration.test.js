const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const Module = require("node:module");
const express = require("express");
const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");

let currentUser = { uid: "user-a", name: "Kavya" };
let firebaseFault = null;

const realLoad = Module._load;
Module._load = function patched(request, parent, isMain) {
  if (request.endsWith("config/firebase")) {
    return {
      authError: () => firebaseFault,
      authAvailable: () => firebaseFault === null,
      auth: {
        verifyIdToken: async (token) => {
          if (token === "bad") throw new Error("invalid token");
          return currentUser;
        },
      },
    };
  }
  return realLoad.call(this, request, parent, isMain);
};

const watchlistRoutes = require("../routes/watchlistRoutes");
const Watchlist = require("../models/watchlist");
Module._load = realLoad;

let mongo;
let server;
let baseUrl;

async function request(method, path, { body, token = "good" } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

const entry = (over = {}) => ({
  movieId: "tt0110357",
  title: "The Lion King",
  year: "1994",
  ...over,
});

test.before(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  // The unique index is what stops a duplicate, so the tests must wait for
  // it to exist rather than racing the first insert.
  await Watchlist.init();

  const app = express();
  app.use(express.json());
  app.use("/api/watchlist", watchlistRoutes);
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await mongoose.disconnect();
  await mongo.stop();
});

test.beforeEach(async () => {
  currentUser = { uid: "user-a", name: "Kavya" };
  await Watchlist.deleteMany({});
});

test("the whole watchlist needs a token", async () => {
  const cases = [
    ["GET", "/api/watchlist", undefined],
    ["POST", "/api/watchlist", entry()],
    ["DELETE", "/api/watchlist/tt0110357", undefined],
  ];
  for (const [method, path, body] of cases) {
    const result = await request(method, path, { token: null, body });
    assert.strictEqual(result.status, 401, `${method} ${path}`);
  }
});

test("a saved title comes back in the list", async () => {
  const saved = await request("POST", "/api/watchlist", { body: entry() });
  assert.strictEqual(saved.status, 201);

  const listed = await request("GET", "/api/watchlist");
  assert.strictEqual(listed.body.items.length, 1);
  assert.strictEqual(listed.body.items[0].title, "The Lion King");
});

test("saving the same title twice is not an error", async () => {
  await request("POST", "/api/watchlist", { body: entry() });
  const again = await request("POST", "/api/watchlist", { body: entry() });
  // Pressing the button twice is not a failure worth showing anyone.
  assert.ok(again.status < 400, `status was ${again.status}`);

  const listed = await request("GET", "/api/watchlist");
  assert.strictEqual(listed.body.items.length, 1);
});

test("one person's watchlist is invisible to another", async () => {
  await request("POST", "/api/watchlist", { body: entry() });

  currentUser = { uid: "user-b", name: "Other" };
  const theirs = await request("GET", "/api/watchlist");
  assert.strictEqual(theirs.body.items.length, 0);
});

test("one person cannot remove from another's watchlist", async () => {
  await request("POST", "/api/watchlist", { body: entry() });

  currentUser = { uid: "user-b", name: "Other" };
  const removed = await request("DELETE", "/api/watchlist/tt0110357");
  assert.strictEqual(removed.status, 404);

  currentUser = { uid: "user-a", name: "Kavya" };
  const listed = await request("GET", "/api/watchlist");
  assert.strictEqual(listed.body.items.length, 1, "the owner's entry survived");
});

test("removing my own entry removes it", async () => {
  await request("POST", "/api/watchlist", { body: entry() });
  const removed = await request("DELETE", "/api/watchlist/tt0110357");
  assert.strictEqual(removed.status, 200);

  const listed = await request("GET", "/api/watchlist");
  assert.strictEqual(listed.body.items.length, 0);
});

test("something that is not an IMDb id is refused", async () => {
  const bad = await request("POST", "/api/watchlist", {
    body: entry({ movieId: "../../etc/passwd" }),
  });
  assert.strictEqual(bad.status, 400);
});

test("an entry with no title is refused", async () => {
  const bad = await request("POST", "/api/watchlist", { body: entry({ title: "   " }) });
  assert.strictEqual(bad.status, 400);
});
