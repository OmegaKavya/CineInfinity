const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
require("dotenv").config();

const authRoutes = require("./routes/authRoutes");
const movieRoutes = require("./routes/movieRoutes");
const reviewRoutes = require("./routes/reviewRoutes");

const app = express();

// Middleware
app.disable("x-powered-by");
app.use(helmet());
app.use(express.json({ limit: "100kb" }));
app.use(rateLimit({ windowMs: 15 * 60 * 1000, limit: 300, standardHeaders: "draft-8", legacyHeaders: false }));

// CORS Config
//
// The list said localhost:3000, which is Create React App's port. The
// frontend moved to Vite, which serves on 5173 in development and 4173 for a
// preview build, so every local request was refused and the app looked like
// the backend was down.
//
// CORS_ORIGINS overrides this with a comma-separated list, so a new deploy
// target does not need a code change.
const DEFAULT_ORIGINS = [
  "http://localhost:5173", // vite dev
  "http://localhost:4173", // vite preview
  "https://movie-e78c5.web.app",
];

const allowedOrigins = (process.env.CORS_ORIGINS || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const origins = allowedOrigins.length ? allowedOrigins : DEFAULT_ORIGINS;

app.use(cors({
  origin: function (origin, callback) {
    // No Origin header means a same-origin or non-browser caller (curl, a
    // health check); those are not what CORS is protecting against.
    if (!origin || origins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`Origin ${origin} is not allowed. Set CORS_ORIGINS to permit it.`));
    }
  },
  credentials: true
}));

app.use("/api/auth", rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: "draft-8", legacyHeaders: false }));

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/movies", movieRoutes);
app.use("/api/reviews", reviewRoutes);

app.get("/", (req, res) => {
  res.send("🎬 CineInfinity API is Running");
});

app.use((err, _req, res, _next) => {
  if (err instanceof SyntaxError && "body" in err) {
    return res.status(400).json({ error: "Invalid JSON request body" });
  }
  if (err.message === "Not allowed by CORS") {
    return res.status(403).json({ error: "Origin is not allowed" });
  }
  console.error("Unhandled request error", err);
  return res.status(500).json({ error: "Internal server error" });
});

// MongoDB Connection
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB Connected"))
  .catch((err) => {
    console.error("❌ MongoDB Connection Error:", err);
    process.exit(1);
  });

// Start Server
const PORT = process.env.PORT || 5001;
app.listen(PORT, () => console.log(`🚀 CineInfinity API running at http://localhost:${PORT}`));
