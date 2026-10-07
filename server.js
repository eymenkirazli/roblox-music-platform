const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const path = require("path");
const fs = require("fs");
require("dotenv").config();

const authRoutes = require("./routes/auth");
const musicRoutes = require("./routes/music");
const adminRoutes = require("./routes/admin");
const userRoutes = require("./routes/user");
const { router: robloxRoutes } = require("./routes/roblox");

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(
  cors({
    origin: true,
    credentials: true,
  })
);
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// MongoDB connection: safely and asynchronously without crashing the app
const connectMongo = async () => {
  const mongoUri = process.env.MONGODB_URI;

  if (!mongoUri) {
    console.warn(
      "⚠️ MONGODB_URI is not defined. MongoDB connection was not established; app will continue running."
    );
    return false;
  }

  try {
    await mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      maxPoolSize: 10,
    });

    console.log("✅ MongoDB connected successfully");
    return true;
  } catch (error) {
    console.error("❌ MongoDB connection failed:", error.message);
    return false;
  }
};

connectMongo();

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/music", musicRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/user", userRoutes);
app.use("/api/roblox", robloxRoutes);

// Health check
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "ok",
    mongo: mongoose.connection.readyState === 1 ? "connected" : "disconnected",
  });
});

// Static frontend
app.use(express.static(path.join(__dirname, "public")));

// SPA fallback
app.get("*", (req, res) => {
  const indexPath = path.join(__dirname, "public", "index.html");

  if (fs.existsSync(indexPath)) {
    return res.sendFile(indexPath);
  }

  return res.status(200).json({
    message: "ROID server is running",
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err && (err.stack || err.message));
  res.status(500).json({
    message: "Internal Server Error",
  });
});

// Local development only
if (process.env.NODE_ENV !== "production" && !process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`🚀 ROID Server running on http://localhost:${PORT}`);
  });
}

// Vercel serverless export
module.exports = app;
