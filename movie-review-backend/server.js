const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
require("dotenv").config();

const authRoutes = require("./routes/authRoutes");
const movieRoutes = require("./routes/movieRoutes");
const reviewRoutes = require("./routes/reviewRoutes");
const watchlistRoutes = require("./routes/watchlistRoutes");
const { authError } = require("./config/firebase");

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

// Outside production, any localhost port is allowed. Vite picks a different
// port whenever one is busy, and chasing that in a hard-coded list means the
// app intermittently looks broken on a developer's machine for a reason that
// has nothing to do with the code.
const isLocalhost = (origin) =>
  /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(origin);

const inProduction = process.env.NODE_ENV === "production";

app.use(cors({
  origin: function (origin, callback) {
    // No Origin header means a same-origin or non-browser caller (curl, a
    // health check); those are not what CORS is protecting against.
    if (!origin || origins.includes(origin) || (!inProduction && isLocalhost(origin))) {
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
app.use("/api/watchlist", watchlistRoutes);

// A readiness check worth polling: it reports the database connection and
// the upstream cache's hit rate, which is the number that says whether the
// daily OMDb quota is actually being protected.
app.get("/health", (_req, res) => {
  const states = ["disconnected", "connected", "connecting", "disconnecting"];
  const dbState = states[mongoose.connection.readyState] || "unknown";
  const dbReady = mongoose.connection.readyState === 1;
  const firebaseFault = authError();

  // Degraded, not down. The server is serving; one subsystem is not. The
  // body names which, so a failing deploy can be diagnosed from one curl
  // instead of from scrollback.
  const healthy = dbReady && !firebaseFault;

  res.status(healthy ? 200 : 503).json({
    status: healthy ? "ok" : "degraded",
    uptimeSeconds: Math.round(process.uptime()),
    database: dbState,
    databaseError: dbReady ? null : databaseError,
    auth: firebaseFault ? "unavailable" : "ok",
    authError: firebaseFault ? firebaseFault.message : null,
    upstreamCache: movieRoutes.cacheStats ? movieRoutes.cacheStats() : null,
  });
});

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
//
// This used to process.exit(1) on a failed connect. On a host that gives a
// new service a few seconds to bind a port, and redeploys on every commit,
// that turns one bad or absent MONGO_URI into a crash loop: the deploy is
// marked failed, a notification goes out, and the logs show only the driver
// error with no indication of which setting is wrong.
//
// So a failure is recorded instead of fatal. The server still binds, /health
// reports "degraded" with the reason, and mongoose retries in the
// background, which means a database that comes up late recovers on its own
// rather than needing a manual redeploy.
let databaseError = null;

if (!process.env.MONGO_URI) {
  databaseError = "MONGO_URI is not set.";
  console.error(
    "MONGO_URI is not set, so reviews are unavailable. Film browsing and " +
      "search are unaffected."
  );
} else {
  mongoose
    .connect(process.env.MONGO_URI)
    .then(() => {
      databaseError = null;
      console.log("MongoDB connected");
    })
    .catch((err) => {
      databaseError = err.message;
      console.error("MongoDB connection failed:", err.message);
    });
}

// Start Server
//
// Listening is unconditional and happens regardless of the database or the
// Firebase credential. A host that waits for a port and never sees one fails
// the deploy without ever reporting the real cause; binding first means the
// fault shows up in /health, where it names itself.
const PORT = process.env.PORT || 5001;
app.listen(PORT, () => console.log(`CineInfinity API running on port ${PORT}`));

module.exports = app;
