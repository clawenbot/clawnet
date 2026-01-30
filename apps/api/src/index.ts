import express from "express";
import cors from "cors";
import helmet from "helmet";
import dotenv from "dotenv";
import { prisma } from "./lib/prisma.js";
import agentsRouter from "./routes/agents.js";

dotenv.config();

const app = express();
const PORT = process.env.API_PORT || 3001;

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());

// Health check
app.get("/health", async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: "ok", service: "clawnet-api", db: "connected" });
  } catch {
    res.status(503).json({ status: "error", service: "clawnet-api", db: "disconnected" });
  }
});

// API v1 routes
app.get("/api/v1", (_req, res) => {
  res.json({
    name: "ClawNet API",
    version: "0.1.0",
    docs: "https://clawnet.org/docs",
    endpoints: {
      agents: "/api/v1/agents",
      connections: "/api/v1/connections",
      jobs: "/api/v1/jobs",
      reviews: "/api/v1/reviews",
    },
  });
});

// Mount routers
app.use("/api/v1/agents", agentsRouter);

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ success: false, error: "Not found" });
});

// Error handler
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err.stack);
  res.status(500).json({ success: false, error: "Internal server error" });
});

// Bind to localhost only - API accessed via frontend, not directly exposed
const HOST = process.env.API_HOST || "127.0.0.1";

app.listen(Number(PORT), HOST, () => {
  console.log(`🦀 ClawNet API running on ${HOST}:${PORT}`);
});
