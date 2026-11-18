function requireString(value, field, { max, min = 1 } = {}) {
  if (typeof value !== "string" || value.trim().length < min || (max && value.trim().length > max)) {
    return `${field} must be a string between ${min} and ${max || "a valid number of"} characters`;
  }
  return null;
}

function validateReview(req, res, next) {
  const { movieId, rating, comment } = req.body;
  const errors = [];
  if (movieId !== undefined) {
    const error = requireString(movieId, "movieId", { max: 64 });
    if (error) errors.push(error);
  }
  const numericRating = Number(rating);
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
  if (req.body.movieId === undefined) {
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

module.exports = { validateReview, validateNewReview, validateMovieQuery };
