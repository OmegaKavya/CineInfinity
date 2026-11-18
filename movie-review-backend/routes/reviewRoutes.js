const express = require("express");
const Review = require("../models/review");
const { requireAuth } = require("../middleware/auth");
const { validateReview, validateNewReview } = require("../middleware/validate");
const router = express.Router();

// ➤ Create a new review
router.post("/", requireAuth, validateNewReview, async (req, res) => {
  try {
    const { movieId, rating, comment } = req.body;
    const userId = req.user.uid;
    const username = req.user.name || req.user.email || "Anonymous";
    const newReview = new Review({ movieId, userId, username, rating, comment });
    await newReview.save();
    res.json({ message: "Review added successfully", review: newReview });
  } catch (error) {
    res.status(500).json({ error: "Failed to add review" });
  }
});

// ➤ Get all reviews for a specific movie
router.get("/:movieId", async (req, res) => {
  try {
    const reviews = await Review.find({ movieId: req.params.movieId }).sort({ createdAt: -1 });
    res.json(reviews);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch reviews" });
  }
});

// ➤ Edit an existing review
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
  } catch (error) {
    res.status(500).json({ error: "Failed to update review" });
  }
});

// ➤ Delete a review
router.delete("/:id", requireAuth, async (req, res) => {
  try {
    const deletedReview = await Review.findOneAndDelete({ _id: req.params.id, userId: req.user.uid });
    if (!deletedReview) return res.status(404).json({ error: "Review not found" });
    res.json({ message: "Review deleted successfully" });
  } catch (error) {
    res.status(500).json({ error: "Failed to delete review" });
  }
});

module.exports = router;
