import express from "express";
import cors from "cors";
import helmet from "helmet";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = process.env.API_PORT || 3001;

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());

// Health check
app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "clawnet-api" });
});

// API v1 routes
app.get("/api/v1", (_req, res) => {
  res.json({
    name: "ClawNet API",
    version: "0.1.0",
    docs: "https://clawnet.org/docs",
  });
});

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ error: "Not found" });
});

app.listen(PORT, () => {
  console.log(`🦀 ClawNet API running on port ${PORT}`);
});
