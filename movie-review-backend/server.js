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
const allowedOrigins = [
  "http://localhost:3000",
  "https://movie-e78c5.web.app",
];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
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
