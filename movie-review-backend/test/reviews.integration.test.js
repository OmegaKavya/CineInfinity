/**
 * The review API end to end: real HTTP, real Express handlers, real Mongoose
 * against a throwaway MongoDB.
 *
 * Every other suite stops at a boundary. The validators are tested with a
 * fake request, the auth gate with a stubbed verifier, the frontend with a
 * mocked client. None of them would notice if a route handler wrote the
 * wrong field, if the ownership filter failed to scope a query, or if a
 * Mongoose validator rejected something the API had just accepted.
 *
 * Only Firebase is stubbed, because verifying a real token needs Google.
 */
const test = require("node:test");
const assert = require("node:assert");
const http = require("node:http");
const Module = require("node:module");

const express = require("express");
const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");

// ---- stub Firebase before the routes pull it in ----------------------------
let currentUser = { uid: "user-a", name: "Kavya" };

const realLoad = Module._load;
Module._load = function patched(request, parent, isMain) {
  if (request.endsWith("config/firebase")) {
    return {
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

const reviewRoutes = require("../routes/reviewRoutes");
const Review = require("../models/review");
Module._load = realLoad;

// ---- harness ---------------------------------------------------------------
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
  return {
    status: response.status,
    body: text ? JSON.parse(text) : null,
  };
}

const newReview = (over = {}) => ({
  movieId: "tt0110357",
  rating: 8,
  comment: "Still holds up.",
  ...over,
});

test.before(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());

  const app = express();
  app.use(express.json());
  app.use("/api/reviews", reviewRoutes);

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
  await Review.deleteMany({});
});

// ---- tests -----------------------------------------------------------------

test("a review round-trips through the database", async () => {
  const created = await request("POST", "/api/reviews", { body: newReview() });
  assert.strictEqual(created.status, 200);
  assert.strictEqual(created.body.review.rating, 8);
  assert.strictEqual(created.body.review.userId, "user-a");
  assert.strictEqual(created.body.review.username, "Kavya");

  const listed = await request("GET", "/api/reviews/tt0110357", { token: null });
  assert.strictEqual(listed.status, 200);
  assert.strictEqual(listed.body.length, 1);
  assert.strictEqual(listed.body[0].comment, "Still holds up.");
});

test("reviews are readable without a token", async () => {
  await request("POST", "/api/reviews", { body: newReview() });
  const listed = await request("GET", "/api/reviews/tt0110357", { token: null });
  assert.strictEqual(listed.status, 200);
  assert.strictEqual(listed.body.length, 1);
});

test("writing without a token is refused", async () => {
  const result = await request("POST", "/api/reviews", { body: newReview(), token: null });
  assert.strictEqual(result.status, 401);
  assert.strictEqual(await Review.countDocuments(), 0);
});

test("a rejected token writes nothing", async () => {
  const result = await request("POST", "/api/reviews", { body: newReview(), token: "bad" });
  assert.strictEqual(result.status, 401);
  assert.strictEqual(await Review.countDocuments(), 0);
});

test("a listing only returns the film asked for", async () => {
  await request("POST", "/api/reviews", { body: newReview() });
  await request("POST", "/api/reviews", { body: newReview({ movieId: "tt0468569" }) });

  const listed = await request("GET", "/api/reviews/tt0110357", { token: null });
  assert.strictEqual(listed.body.length, 1);
  assert.strictEqual(listed.body[0].movieId, "tt0110357");
});

test("the newest review is listed first", async () => {
  await request("POST", "/api/reviews", { body: newReview({ comment: "First." }) });
  await new Promise((resolve) => setTimeout(resolve, 10));
  await request("POST", "/api/reviews", { body: newReview({ comment: "Second." }) });

  const listed = await request("GET", "/api/reviews/tt0110357", { token: null });
  assert.strictEqual(listed.body[0].comment, "Second.");
});

test("a rating the API rejects never reaches the database", async () => {
  for (const rating of [0, 11, 7.5, true, "0x7"]) {
    const result = await request("POST", "/api/reviews", { body: newReview({ rating }) });
    assert.strictEqual(result.status, 400, `${JSON.stringify(rating)} should be refused`);
  }
  assert.strictEqual(await Review.countDocuments(), 0);
});

test("an over-long comment is refused by the API, not by Mongoose", async () => {
  // If this ever returns 500 it means validation was skipped and the schema
  // caught it instead, which surfaces as a server error to the caller.
  const result = await request("POST", "/api/reviews", {
    body: newReview({ comment: "a".repeat(2001) }),
  });
  assert.strictEqual(result.status, 400);
});

test("an edit changes the review and records that it was edited", async () => {
  const created = await request("POST", "/api/reviews", { body: newReview() });
  const id = created.body.review._id;

  const edited = await request("PUT", `/api/reviews/${id}`, {
    body: { rating: 10, comment: "Better than I remembered." },
  });

  assert.strictEqual(edited.status, 200);
  assert.strictEqual(edited.body.review.rating, 10);
  assert.ok(edited.body.review.updatedAt, "updatedAt should be set");

  const stored = await Review.findById(id);
  assert.strictEqual(stored.comment, "Better than I remembered.");
});

test("one person cannot edit another person's review", async () => {
  const created = await request("POST", "/api/reviews", { body: newReview() });
  const id = created.body.review._id;

  currentUser = { uid: "user-b", name: "Someone else" };
  const attempt = await request("PUT", `/api/reviews/${id}`, {
    body: { rating: 1, comment: "Hijacked." },
  });

  assert.strictEqual(attempt.status, 404, "someone else's id should simply not match");

  const stored = await Review.findById(id);
  assert.strictEqual(stored.rating, 8, "the original must be untouched");
});

test("one person cannot delete another person's review", async () => {
  const created = await request("POST", "/api/reviews", { body: newReview() });
  const id = created.body.review._id;

  currentUser = { uid: "user-b" };
  const attempt = await request("DELETE", `/api/reviews/${id}`);

  assert.strictEqual(attempt.status, 404);
  assert.strictEqual(await Review.countDocuments(), 1);
});

test("deleting my own review removes it", async () => {
  const created = await request("POST", "/api/reviews", { body: newReview() });
  const result = await request("DELETE", `/api/reviews/${created.body.review._id}`);

  assert.strictEqual(result.status, 200);
  assert.strictEqual(await Review.countDocuments(), 0);
});

test("a review with no display name falls back to something printable", async () => {
  currentUser = { uid: "user-c", email: "someone@example.com" };
  const created = await request("POST", "/api/reviews", { body: newReview() });
  assert.strictEqual(created.body.review.username, "someone@example.com");

  currentUser = { uid: "user-d" };
  const anonymous = await request("POST", "/api/reviews", { body: newReview() });
  assert.strictEqual(anonymous.body.review.username, "Anonymous");
});

test("a film with no reviews returns an empty list, not an error", async () => {
  const listed = await request("GET", "/api/reviews/tt9999999", { token: null });
  assert.strictEqual(listed.status, 200);
  assert.deepStrictEqual(listed.body, []);
});
