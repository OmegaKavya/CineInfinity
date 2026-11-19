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
// Null means Firebase initialised; set it to an Error to simulate a server
// deployed without a credential.
let firebaseFault = null;

const realLoad = Module._load;
Module._load = function patched(request, parent, isMain) {
  if (request.endsWith("config/firebase")) {
    return {
      // config/firebase also exports authError(): the routes call it to tell
      // a credential fault apart from a bad token. A stub missing it made
      // every authenticated request throw a 500 instead of failing the way
      // the test meant to exercise.
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
  assert.strictEqual(listed.body.items.length, 1);
  assert.strictEqual(listed.body.items[0].comment, "Still holds up.");
});

test("reviews are readable without a token", async () => {
  await request("POST", "/api/reviews", { body: newReview() });
  const listed = await request("GET", "/api/reviews/tt0110357", { token: null });
  assert.strictEqual(listed.status, 200);
  assert.strictEqual(listed.body.items.length, 1);
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
  assert.strictEqual(listed.body.items.length, 1);
  assert.strictEqual(listed.body.items[0].movieId, "tt0110357");
});

test("the newest review is listed first", async () => {
  await request("POST", "/api/reviews", { body: newReview({ comment: "First." }) });
  await new Promise((resolve) => setTimeout(resolve, 10));
  await request("POST", "/api/reviews", { body: newReview({ comment: "Second." }) });

  const listed = await request("GET", "/api/reviews/tt0110357", { token: null });
  assert.strictEqual(listed.body.items[0].comment, "Second.");
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
  assert.deepStrictEqual(listed.body.items, []);
  assert.strictEqual(listed.body.total, 0);
  assert.strictEqual(listed.body.hasMore, false);
  // No reviews means no average, not an average of zero, which would read
  // as every rater giving it the lowest possible score.
  assert.strictEqual(listed.body.average, null);
});

// ---- pagination, feeds, search and the signal ------------------------------

async function seed(count, over = {}) {
  for (let i = 0; i < count; i += 1) {
    await request("POST", "/api/reviews", {
      body: newReview({ comment: `Review number ${i}`, ...over }),
    });
  }
}

test("a listing is paginated and says whether more remain", async () => {
  await seed(12);

  const first = await request("GET", "/api/reviews/tt0110357?limit=5", { token: null });
  assert.strictEqual(first.body.items.length, 5);
  assert.strictEqual(first.body.total, 12);
  assert.strictEqual(first.body.hasMore, true);

  const last = await request("GET", "/api/reviews/tt0110357?limit=5&page=3", { token: null });
  assert.strictEqual(last.body.items.length, 2);
  // The final page must not claim more are coming, or the client loops.
  assert.strictEqual(last.body.hasMore, false);
});

test("a caller cannot ask for an unbounded page", async () => {
  await seed(3);
  const huge = await request("GET", "/api/reviews/tt0110357?limit=100000", { token: null });
  assert.ok(huge.body.limit <= 50, `limit was ${huge.body.limit}`);
});

test("a nonsense page number falls back to the first page", async () => {
  await seed(2);
  const bad = await request("GET", "/api/reviews/tt0110357?page=-4&limit=abc", { token: null });
  assert.strictEqual(bad.body.page, 1);
  assert.strictEqual(bad.body.items.length, 2);
});

test("a listing reports the film's average rating", async () => {
  await request("POST", "/api/reviews", { body: newReview({ rating: 6 }) });
  currentUser = { uid: "user-b", name: "Someone" };
  await request("POST", "/api/reviews", { body: newReview({ rating: 9 }) });

  const listed = await request("GET", "/api/reviews/tt0110357", { token: null });
  assert.strictEqual(listed.body.average, 7.5);
});

test("the recent feed spans every film, newest first", async () => {
  await request("POST", "/api/reviews", { body: newReview({ movieId: "tt1111111" }) });
  await request("POST", "/api/reviews", { body: newReview({ movieId: "tt2222222" }) });

  const feed = await request("GET", "/api/reviews/feed/recent", { token: null });
  assert.strictEqual(feed.body.items.length, 2);
  assert.strictEqual(feed.body.items[0].movieId, "tt2222222");
});

test("trending ranks by how many people reviewed, not by score", async () => {
  // One perfect score from one person is not a trend.
  await request("POST", "/api/reviews", {
    body: newReview({ movieId: "tt_quiet", rating: 10, title: "Quiet" }),
  });
  for (const uid of ["user-a", "user-b", "user-c"]) {
    currentUser = { uid, name: uid };
    await request("POST", "/api/reviews", {
      body: newReview({ movieId: "tt_busy", rating: 6, title: "Busy" }),
    });
  }

  const trending = await request("GET", "/api/reviews/feed/trending", { token: null });
  assert.strictEqual(trending.body.items[0].movieId, "tt_busy");
  assert.strictEqual(trending.body.items[0].reviews, 3);
  assert.strictEqual(trending.body.items[0].average, 6);
});

test("search finds words inside what people wrote", async () => {
  await request("POST", "/api/reviews", {
    body: newReview({ comment: "The practical effects carry it." }),
  });
  await request("POST", "/api/reviews", {
    body: newReview({ movieId: "tt_other", comment: "Overlong and airless." }),
  });

  const hits = await request("GET", "/api/reviews/search?q=practical", { token: null });
  assert.strictEqual(hits.body.total, 1);
  assert.match(hits.body.items[0].comment, /practical/);
});

test("a search for a regex metacharacter is a search for that character", async () => {
  await request("POST", "/api/reviews", { body: newReview({ comment: "Good (mostly)." }) });
  // Unescaped, "(mostly" is an unterminated group and the engine throws.
  const hits = await request("GET", "/api/reviews/search?q=(mostly", { token: null });
  assert.strictEqual(hits.status, 200);
  assert.strictEqual(hits.body.total, 1);
});

test("a one-character search is refused rather than returning everything", async () => {
  await seed(3);
  const hits = await request("GET", "/api/reviews/search?q=a", { token: null });
  assert.strictEqual(hits.status, 400);
});

test("the signal compares a user against everyone but themselves", async () => {
  currentUser = { uid: "user-a", name: "Kavya" };
  await request("POST", "/api/reviews", {
    body: newReview({ movieId: "tt_shared", rating: 10, title: "Tenet", year: "2020" }),
  });
  for (const uid of ["user-b", "user-c"]) {
    currentUser = { uid, name: uid };
    await request("POST", "/api/reviews", {
      body: newReview({ movieId: "tt_shared", rating: 6, title: "Tenet", year: "2020" }),
    });
  }

  currentUser = { uid: "user-a", name: "Kavya" };
  const signal = await request("GET", "/api/reviews/me/signal");
  assert.strictEqual(signal.body.total, 1);
  assert.strictEqual(signal.body.comparedOn, 1);
  // 10 against a crowd of 6, and the crowd must not include the 10 itself.
  assert.strictEqual(signal.body.bias, 4);
  assert.strictEqual(signal.body.contrarian[0].crowd, 6);
  assert.strictEqual(signal.body.contrarian[0].crowdCount, 2);
});

test("the signal needs a token", async () => {
  const signal = await request("GET", "/api/reviews/me/signal", { token: null });
  assert.strictEqual(signal.status, 401);
});

test("my reviews returns only mine", async () => {
  await request("POST", "/api/reviews", { body: newReview({ comment: "Mine." }) });
  currentUser = { uid: "user-b", name: "Other" };
  await request("POST", "/api/reviews", { body: newReview({ comment: "Theirs." }) });

  currentUser = { uid: "user-a", name: "Kavya" };
  const mine = await request("GET", "/api/reviews/me/reviews");
  assert.strictEqual(mine.body.total, 1);
  assert.strictEqual(mine.body.items[0].comment, "Mine.");
});

test("a review carries the film's details so a feed needs no upstream call", async () => {
  const created = await request("POST", "/api/reviews", {
    body: newReview({ title: "Pulp Fiction", year: "1994", poster: "https://example.test/p.jpg" }),
  });
  assert.strictEqual(created.body.review.title, "Pulp Fiction");
  assert.strictEqual(created.body.review.year, "1994");
});
