const express = require("express");
const Watchlist = require("../models/watchlist");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

// Every route here is the signed-in user's own list, so auth is applied once
// rather than repeated per handler and forgotten on the next one added.
router.use(requireAuth);

router.get("/", async (req, res) => {
  try {
    const items = await Watchlist.find({ userId: req.user.uid })
      .sort({ addedAt: -1 })
      .limit(200)
      .lean();
    res.json({ items, total: items.length });
  } catch (_error) {
    res.status(500).json({ error: "Failed to load your watchlist" });
  }
});

router.post("/", async (req, res) => {
  const { movieId, title, year, poster } = req.body || {};

  if (typeof movieId !== "string" || !/^tt\d+$/.test(movieId.trim())) {
    return res.status(400).json({ error: "A valid IMDb id is required" });
  }
  if (typeof title !== "string" || !title.trim()) {
    return res.status(400).json({ error: "A title is required" });
  }

  try {
    // Upsert rather than insert: adding something already saved is the user
    // pressing a button twice, not an error worth showing them.
    const item = await Watchlist.findOneAndUpdate(
      { userId: req.user.uid, movieId: movieId.trim() },
      {
        $setOnInsert: {
          userId: req.user.uid,
          movieId: movieId.trim(),
          title: title.trim().slice(0, 300),
          year: typeof year === "string" ? year.trim().slice(0, 20) : undefined,
          poster: typeof poster === "string" ? poster.trim().slice(0, 1000) : undefined,
          addedAt: new Date(),
        },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    ).lean();

    res.status(201).json({ item });
  } catch (error) {
    // The unique index can still reject a genuine race between two tabs.
    if (error && error.code === 11000) {
      return res.status(200).json({ item: null, alreadySaved: true });
    }
    res.status(500).json({ error: "Failed to save to your watchlist" });
  }
});

router.delete("/:movieId", async (req, res) => {
  try {
    const removed = await Watchlist.findOneAndDelete({
      userId: req.user.uid,
      movieId: req.params.movieId,
    });
    if (!removed) return res.status(404).json({ error: "That title is not on your watchlist" });
    res.json({ removed: req.params.movieId });
  } catch (_error) {
    res.status(500).json({ error: "Failed to remove from your watchlist" });
  }
});

module.exports = router;
