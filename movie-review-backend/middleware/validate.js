function requireString(value, field, { max, min = 1 } = {}) {
  if (typeof value !== "string" || value.trim().length < min || (max && value.trim().length > max)) {
    return `${field} must be a string between ${min} and ${max || "a valid number of"} characters`;
  }
  return null;
}

function validateReview(req, res, next) {
  // Undefined when the request was not JSON; that is a 400, not a crash.
  const { movieId, rating, comment } = req.body || {};
  const errors = [];
  if (movieId !== undefined) {
    const error = requireString(movieId, "movieId", { max: 64 });
    if (error) errors.push(error);
  }
  // Number() alone was too generous: it accepted true as 1, [7] and ["7"] as
  // 7, and "0x7" as 7, so a malformed body became a plausible-looking rating
  // instead of an error. Only a real number or a plain decimal string counts.
  const isPlainNumber = typeof rating === "number" && Number.isFinite(rating);
  const isDecimalString = typeof rating === "string" && /^\s*\d{1,2}\s*$/.test(rating);
  const numericRating = isPlainNumber || isDecimalString ? Number(rating) : NaN;

  if (!Number.isInteger(numericRating) || numericRating < 1 || numericRating > 10) {
    errors.push("rating must be an integer from 1 to 10");
  }
  const commentError = requireString(comment, "comment", { max: 2000 });
  if (commentError) errors.push(commentError);
  if (errors.length) return res.status(400).json({ error: "Invalid review", details: errors });
  req.body.rating = numericRating;
  req.body.comment = comment.trim();
  return next();
}

function validateNewReview(req, res, next) {
  if ((req.body || {}).movieId === undefined) {
    return res.status(400).json({ error: "Invalid review", details: ["movieId is required"] });
  }
  return validateReview(req, res, next);
}

function validateMovieQuery(req, res, next) {
  const value = req.params.title || req.query.query || req.query.imdbID;
  if (typeof value !== "string" || !value.trim() || value.length > 150) {
    return res.status(400).json({ error: "Search input must be between 1 and 150 characters" });
  }
  return next();
}

// /omdb/details looks a film up by IMDb id and nothing else. It used the
// shared query validator, which accepted ?query= as well, so a request with
// no imdbID passed validation and asked OMDb for "undefined" - spending a
// request from the 1,000-a-day quota and caching the miss under that key.
function validateImdbId(req, res, next) {
  const id = req.query.imdbID;
  if (typeof id !== "string" || !/^tt\d{7,10}$/.test(id)) {
    return res.status(400).json({ error: "imdbID must look like tt0111161" });
  }
  return next();
}

module.exports = { validateReview, validateNewReview, validateMovieQuery, validateImdbId };
