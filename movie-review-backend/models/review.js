const mongoose = require("mongoose");

const ReviewSchema = new mongoose.Schema({
  movieId: { type: String, required: true, trim: true, maxlength: 64 },
  userId: { type: String, required: true, trim: true, maxlength: 128, index: true },
  username: { type: String, required: true, trim: true, maxlength: 100 },
  rating: { type: Number, required: true, min: 1, max: 10 },
  comment: { type: String, required: true, trim: true, minlength: 1, maxlength: 2000 },
  // A copy of the film, carried on the review.
  //
  // Needed so a list of recent reviews, or the decade breakdown in Your
  // Signal, can render without one OMDb call per row against a quota that
  // is already the reason the cache exists. Optional, because reviews
  // written before this existed have none and must still load.
  title: { type: String, trim: true, maxlength: 300 },
  year: { type: String, trim: true, maxlength: 20 },
  poster: { type: String, trim: true, maxlength: 1000 },

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date }, // New field for tracking updates
});

// Listing a film's reviews newest first is the most frequent query in the
// app, and the feed and search both sort by recency across all films.
ReviewSchema.index({ movieId: 1, createdAt: -1 });
ReviewSchema.index({ createdAt: -1 });

module.exports = mongoose.model("Review", ReviewSchema);
