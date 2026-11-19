const mongoose = require("mongoose");

/**
 * One saved title per user.
 *
 * The entry carries enough of the film to render a card without calling
 * OMDb again: a watchlist of twenty would otherwise be twenty upstream
 * requests on every page load, against a quota that is already the reason
 * the cache exists. The copy can go stale, which costs a poster or a year
 * being out of date and is the right trade.
 */
const WatchlistSchema = new mongoose.Schema({
  userId: { type: String, required: true, trim: true, maxlength: 128 },
  movieId: { type: String, required: true, trim: true, maxlength: 64 },
  title: { type: String, required: true, trim: true, maxlength: 300 },
  year: { type: String, trim: true, maxlength: 20 },
  poster: { type: String, trim: true, maxlength: 1000 },
  addedAt: { type: Date, default: Date.now },
});

// The pair is the identity of a row, so the database refuses a duplicate
// rather than the route checking first and racing with itself.
WatchlistSchema.index({ userId: 1, movieId: 1 }, { unique: true });
// Listing is always "this user's, newest first", which this serves directly.
WatchlistSchema.index({ userId: 1, addedAt: -1 });

module.exports = mongoose.model("Watchlist", WatchlistSchema);
