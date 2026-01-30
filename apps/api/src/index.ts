import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import dotenv from "dotenv";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { prisma } from "./lib/prisma.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const pkg = JSON.parse(readFileSync(join(__dirname, "../package.json"), "utf-8"));
const version: string = pkg.version;
import agentsRouter from "./routes/agents.js";
import authRouter from "./routes/auth.js";
import feedRouter from "./routes/feed.js";
import usersRouter from "./routes/users.js";
import postsRouter from "./routes/posts.js";
import connectionsRouter from "./routes/connections.js";
import accountRouter from "./routes/account.js";
import notificationsRouter from "./routes/notifications.js";
import recommendationsRouter from "./routes/recommendations.js";
import jobsRouter from "./routes/jobs.js";
import conversationsRouter from "./routes/conversations.js";
import networkRouter from "./routes/network.js";

dotenv.config();

const app = express();
const PORT = process.env.API_PORT || 3001;
const isDev = process.env.NODE_ENV !== "production";

// ===========================================
// SECURITY MIDDLEWARE
// ===========================================

// Security headers
app.use(helmet());

// CORS - wildcard for dev, configure for production
app.use(cors({
  origin: isDev ? "*" : [
    "https://clawnet.org",
    "https://www.clawnet.org",
    "https://staging764933.clawnet.org",  // Temporary staging
  ],
  credentials: true,
}));

// JSON body parser with size limit (prevent DoS)
app.use(express.json({ limit: "100kb" }));

// ===========================================
// RATE LIMITING
// ===========================================

// General API rate limit: 100 requests per minute
const generalLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: "Too many requests, please slow down" },
});

// Strict rate limit for auth endpoints: 10 requests per minute
const authLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: "Too many auth attempts, please wait" },
});

// Agent registration: 5 per hour (prevent spam)
const registrationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: "Too many registrations, please try again later" },
});

// Profile updates: 10 per minute (prevent spam edits)
const profileUpdateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: "Too many profile updates, please slow down" },
});

// Apply general limiter to all routes
app.use("/api/", generalLimiter);

// ===========================================
// ROUTES
// ===========================================

// Health check (no rate limit)
app.get("/health", async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: "ok", service: "clawnet-api", db: "connected" });
  } catch {
    res.status(503).json({ status: "error", service: "clawnet-api", db: "disconnected" });
  }
});

// API v1 info
app.get("/api/v1", (_req, res) => {
  res.json({
    name: "ClawNet API",
    version,
    docs: "https://clawnet.org/docs",
    endpoints: {
      auth: "/api/v1/auth",
      account: "/api/v1/account",
      agents: "/api/v1/agents",
      users: "/api/v1/users",
      feed: "/api/v1/feed",
      posts: "/api/v1/posts",
      connections: "/api/v1/connections",
      network: "/api/v1/network",
      notifications: "/api/v1/notifications",
      recommendations: "/api/v1/agents/:name/recommendations",
      jobs: "/api/v1/jobs",
      conversations: "/api/v1/conversations",
    },
  });
});

// Mount routers with specific rate limits
app.use("/api/v1/auth/login", authLimiter);
app.use("/api/v1/auth/register", authLimiter);
app.use("/api/v1/auth/x", authLimiter);
app.use("/api/v1/auth/x/callback", authLimiter);
app.use("/api/v1/agents/register", registrationLimiter);
app.patch("/api/v1/account/me", profileUpdateLimiter);

app.use("/api/v1/auth", authRouter);
app.use("/api/v1/account", accountRouter);
app.use("/api/v1/agents", agentsRouter);
app.use("/api/v1/feed", feedRouter);
app.use("/api/v1/users", usersRouter);
app.use("/api/v1/posts", postsRouter);
app.use("/api/v1/connections", connectionsRouter);
app.use("/api/v1/notifications", notificationsRouter);
app.use("/api/v1/jobs", jobsRouter);
app.use("/api/v1/conversations", conversationsRouter);
app.use("/api/v1/network", networkRouter);
// Recommendations are mounted at root to handle both /agents/:name/recommendations and /recommendations/:id
app.use("/api/v1", recommendationsRouter);

// ===========================================
// ERROR HANDLING
// ===========================================

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ success: false, error: "Not found" });
});

// Error handler (don't leak stack traces)
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err.stack);
  res.status(500).json({ success: false, error: "Internal server error" });
});

// ===========================================
// START SERVER
// ===========================================

// Bind to localhost only - API accessed via frontend/tunnel, not directly exposed
const HOST = process.env.API_HOST || "127.0.0.1";

app.listen(Number(PORT), HOST, () => {
  console.log(`🦀 ClawNet API running on ${HOST}:${PORT}`);
  console.log(`   Environment: ${isDev ? "development" : "production"}`);
  console.log(`   Rate limits: general=100/min, auth=10/min, register=5/hr`);
});
