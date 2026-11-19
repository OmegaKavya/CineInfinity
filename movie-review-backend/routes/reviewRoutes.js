const express = require("express");
const Review = require("../models/review");
const { requireAuth } = require("../middleware/auth");
const { validateReview, validateNewReview } = require("../middleware/validate");
const { buildSignal } = require("../lib/signal");

const router = express.Router();

// How many reviews a page holds, and the ceiling a caller can ask for. An
// unbounded ?limit is a way to ask the server to serialise the collection.
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;

function paging(query) {
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const requested = Number.parseInt(query.limit, 10) || DEFAULT_LIMIT;
  const limit = Math.min(MAX_LIMIT, Math.max(1, requested));
  return { page, limit, skip: (page - 1) * limit };
}

/** Escape a user string before it reaches a regular expression, so a search
 *  for "(" is a search for a bracket rather than a syntax error, and a
 *  crafted query cannot make the engine do exponential work. */
function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ---------------------------------------------------------------------------
// Literal routes first.
//
// Express matches in declaration order and "/:movieId" matches any single
// segment, so every literal route below has to be declared before it. This
// exact mistake already made the search endpoints unreachable once.
// ---------------------------------------------------------------------------

// The most recently written reviews across every film, for the home feed.
router.get("/feed/recent", async (req, res) => {
  const { page, limit, skip } = paging(req.query);
  try {
    const [items, total] = await Promise.all([
      Review.find().sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      Review.estimatedDocumentCount(),
    ]);
    res.json({ items, page, limit, total, hasMore: skip + items.length < total });
  } catch (_error) {
    res.status(500).json({ error: "Failed to load recent reviews" });
  }
});

// What is being reviewed most, with the average score each film is getting.
// Ranked by how many people reviewed it, not by score: one 10 from one
// person is not a trend.
router.get("/feed/trending", async (req, res) => {
  const limit = Math.min(24, Math.max(1, Number.parseInt(req.query.limit, 10) || 12));
  const days = Math.min(365, Math.max(1, Number.parseInt(req.query.days, 10) || 90));
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  try {
    const items = await Review.aggregate([
      { $match: { createdAt: { $gte: since } } },
      {
        $group: {
          _id: "$movieId",
          reviews: { $sum: 1 },
          average: { $avg: "$rating" },
          // The film's details are denormalised onto each review, so the
          // most recent one supplies a title and poster for the card.
          title: { $last: "$title" },
          year: { $last: "$year" },
          poster: { $last: "$poster" },
          lastReviewedAt: { $max: "$createdAt" },
        },
      },
      { $sort: { reviews: -1, lastReviewedAt: -1 } },
      { $limit: limit },
      {
        $project: {
          _id: 0,
          movieId: "$_id",
          reviews: 1,
          average: { $round: ["$average", 1] },
          title: 1, year: 1, poster: 1, lastReviewedAt: 1,
        },
      },
    ]);
    res.json({ items, days });
  } catch (_error) {
    res.status(500).json({ error: "Failed to load trending films" });
  }
});

// Full-text-ish search across what people wrote, not across film titles.
// This is the database answering a question OMDb cannot.
router.get("/search", async (req, res) => {
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  if (q.length < 2) {
    return res.status(400).json({ error: "Search for at least two characters" });
  }

  const { page, limit, skip } = paging(req.query);
  const pattern = new RegExp(escapeRegex(q), "i");

  try {
    const filter = { $or: [{ comment: pattern }, { title: pattern }] };
    const [items, total] = await Promise.all([
      Review.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      Review.countDocuments(filter),
    ]);
    res.json({ items, page, limit, total, query: q, hasMore: skip + items.length < total });
  } catch (_error) {
    res.status(500).json({ error: "Search failed" });
  }
});

// Everything the signed-in user has written, newest first.
router.get("/me/reviews", requireAuth, async (req, res) => {
  const { page, limit, skip } = paging(req.query);
  try {
    const filter = { userId: req.user.uid };
    const [items, total] = await Promise.all([
      Review.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      Review.countDocuments(filter),
    ]);
    res.json({ items, page, limit, total, hasMore: skip + items.length < total });
  } catch (_error) {
    res.status(500).json({ error: "Failed to load your reviews" });
  }
});

// Your Signal: the user's rating profile, and where it departs from everyone
// else's on the same films.
router.get("/me/signal", requireAuth, async (req, res) => {
  try {
    const mine = await Review.find({ userId: req.user.uid })
      .select("movieId rating title year")
      .lean();

    if (!mine.length) {
      return res.json(buildSignal({ reviews: [], pairs: [] }));
    }

    // The crowd, excluding this user, on exactly the films they rated. One
    // aggregation rather than a query per film.
    const crowd = await Review.aggregate([
      {
        $match: {
          movieId: { $in: mine.map((r) => r.movieId) },
          userId: { $ne: req.user.uid },
        },
      },
      { $group: { _id: "$movieId", crowdMean: { $avg: "$rating" }, crowdCount: { $sum: 1 } } },
    ]);

    const crowdBy = new Map(crowd.map((c) => [c._id, c]));
    const pairs = mine.map((r) => ({
      movieId: r.movieId,
      title: r.title,
      mine: r.rating,
      crowdMean: crowdBy.get(r.movieId)?.crowdMean ?? NaN,
      crowdCount: crowdBy.get(r.movieId)?.crowdCount ?? 0,
    }));

    res.json(buildSignal({ reviews: mine, pairs }));
  } catch (_error) {
    res.status(500).json({ error: "Failed to build your signal" });
  }
});

// ---------------------------------------------------------------------------
// Writes and the parameterised read
// ---------------------------------------------------------------------------

router.post("/", requireAuth, validateNewReview, async (req, res) => {
  try {
    const { movieId, rating, comment, title, year, poster } = req.body;
    const newReview = new Review({
      movieId,
      userId: req.user.uid,
      username: req.user.name || req.user.email || "Anonymous",
      rating,
      comment,
      title: typeof title === "string" ? title.trim().slice(0, 300) : undefined,
      year: typeof year === "string" ? year.trim().slice(0, 20) : undefined,
      poster: typeof poster === "string" ? poster.trim().slice(0, 1000) : undefined,
    });
    await newReview.save();
    res.json({ message: "Review added successfully", review: newReview });
  } catch (_error) {
    res.status(500).json({ error: "Failed to add review" });
  }
});

// A film's reviews, paginated. The response was a bare array; it is an object
// now so the page count travels with the page. `items` holds what the array
// used to.
router.get("/:movieId", async (req, res) => {
  const { page, limit, skip } = paging(req.query);
  try {
    const filter = { movieId: req.params.movieId };
    const [items, total, summary] = await Promise.all([
      Review.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      Review.countDocuments(filter),
      Review.aggregate([
        { $match: filter },
        { $group: { _id: null, average: { $avg: "$rating" } } },
      ]),
    ]);

    res.json({
      items,
      page,
      limit,
      total,
      hasMore: skip + items.length < total,
      average: summary.length ? Math.round(summary[0].average * 10) / 10 : null,
    });
  } catch (_error) {
    res.status(500).json({ error: "Failed to fetch reviews" });
  }
});

router.put("/:id", requireAuth, validateReview, async (req, res) => {
  try {
    const { rating, comment } = req.body;
    const updatedReview = await Review.findOneAndUpdate(
      { _id: req.params.id, userId: req.user.uid },
      { rating, comment, updatedAt: Date.now() },
      { new: true }
    );
    if (!updatedReview) return res.status(404).json({ error: "Review not found" });
    res.json({ message: "Review updated successfully", review: updatedReview });
  } catch (_error) {
    res.status(500).json({ error: "Failed to update review" });
  }
});

router.delete("/:id", requireAuth, async (req, res) => {
  try {
    const deletedReview = await Review.findOneAndDelete({
      _id: req.params.id,
      userId: req.user.uid,
    });
    if (!deletedReview) return res.status(404).json({ error: "Review not found" });
    res.json({ message: "Review deleted successfully" });
  } catch (_error) {
    res.status(500).json({ error: "Failed to delete review" });
  }
});

module.exports = router;
