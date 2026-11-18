const mongoose = require("mongoose");

const ReviewSchema = new mongoose.Schema({
  movieId: { type: String, required: true, trim: true, maxlength: 64 },
  userId: { type: String, required: true, trim: true, maxlength: 128, index: true },
  username: { type: String, required: true, trim: true, maxlength: 100 },
  rating: { type: Number, required: true, min: 1, max: 10 },
  comment: { type: String, required: true, trim: true, minlength: 1, maxlength: 2000 },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date }, // New field for tracking updates
});

module.exports = mongoose.model("Review", ReviewSchema);
