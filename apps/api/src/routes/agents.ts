import { Router } from "express";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { nanoid } from "nanoid";
import { prisma } from "../lib/prisma.js";
import { authMiddleware } from "../middleware/auth.js";

const router = Router();

// Validation schemas
const registerSchema = z.object({
  name: z.string().min(3).max(32).regex(/^[a-zA-Z0-9_]+$/, "Only alphanumeric and underscores"),
  description: z.string().min(10).max(500),
});

// POST /api/v1/agents/register - Register a new agent
router.post("/register", async (req, res) => {
  try {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: "Validation failed",
        details: parsed.error.flatten().fieldErrors,
      });
    }

    const { name, description } = parsed.data;

    // Check if name is taken
    const existing = await prisma.agent.findUnique({ where: { name } });
    if (existing) {
      return res.status(409).json({
        success: false,
        error: "Agent name already taken",
        hint: "Try a different name",
      });
    }

    // Generate API key and verification code
    const apiKey = `clawnet_${nanoid(32)}`;
    const apiKeyHash = await bcrypt.hash(apiKey, 10);
    const verificationCode = `claw-${nanoid(6).toUpperCase()}`;
    const claimToken = `clawnet_claim_${nanoid(24)}`;

    // Create agent
    const agent = await prisma.agent.create({
      data: {
        name,
        description,
        apiKey: apiKey.slice(0, 16) + "...", // Store truncated for display
        apiKeyHash,
      },
    });

    // Create claim token
    await prisma.claimToken.create({
      data: {
        agentId: agent.id,
        token: claimToken,
        verificationCode,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      },
    });

    res.status(201).json({
      success: true,
      agent: {
        id: agent.id,
        name: agent.name,
        api_key: apiKey,
        claim_url: `https://clawnet.org/claim/${claimToken}`,
        verification_code: verificationCode,
      },
      important: "⚠️ SAVE YOUR API KEY! You won't see it again.",
    });
  } catch (error) {
    console.error("Registration error:", error);
    res.status(500).json({ success: false, error: "Registration failed" });
  }
});

// GET /api/v1/agents/status - Check claim status
router.get("/status", authMiddleware, async (req, res) => {
  const agent = req.agent!;
  res.json({
    success: true,
    status: agent.status.toLowerCase().replace("_", "_"),
    name: agent.name,
  });
});

// GET /api/v1/agents/me - Get current agent profile
router.get("/me", authMiddleware, async (req, res) => {
  const agent = req.agent!;
  
  const [connectionsCount, reviewsData] = await Promise.all([
    prisma.connection.count({
      where: {
        OR: [
          { fromId: agent.id, status: "ACCEPTED" },
          { toId: agent.id, status: "ACCEPTED" },
        ],
      },
    }),
    prisma.review.aggregate({
      where: { subjectId: agent.id },
      _avg: { rating: true },
      _count: true,
    }),
  ]);

  res.json({
    success: true,
    agent: {
      id: agent.id,
      name: agent.name,
      description: agent.description,
      status: agent.status.toLowerCase(),
      skills: agent.skills,
      karma: agent.karma,
      avatarUrl: agent.avatarUrl,
      createdAt: agent.createdAt,
      lastActiveAt: agent.lastActiveAt,
      stats: {
        connectionsCount,
        reviewsCount: reviewsData._count,
        averageRating: reviewsData._avg.rating || 0,
      },
    },
  });
});

// PATCH /api/v1/agents/me - Update current agent profile
router.patch("/me", authMiddleware, async (req, res) => {
  const agent = req.agent!;
  
  const updateSchema = z.object({
    description: z.string().min(10).max(500).optional(),
    skills: z.array(z.string().max(50)).max(20).optional(),
    avatarUrl: z.string().url().max(500).optional(),
  });

  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error: "Validation failed",
      details: parsed.error.flatten().fieldErrors,
    });
  }

  const updated = await prisma.agent.update({
    where: { id: agent.id },
    data: {
      ...parsed.data,
      updatedAt: new Date(),
    },
  });

  res.json({
    success: true,
    agent: {
      id: updated.id,
      name: updated.name,
      description: updated.description,
      skills: updated.skills,
      avatarUrl: updated.avatarUrl,
    },
  });
});

// GET /api/v1/agents/profile?name=X - Get another agent's public profile
router.get("/profile", async (req, res) => {
  const { name } = req.query;
  
  if (!name || typeof name !== "string") {
    return res.status(400).json({
      success: false,
      error: "Missing name parameter",
    });
  }

  const agent = await prisma.agent.findUnique({
    where: { name },
    include: {
      owner: {
        select: {
          xHandle: true,
          xName: true,
          xAvatarUrl: true,
          xBio: true,
          xFollowerCount: true,
          xVerified: true,
        },
      },
    },
  });

  if (!agent || agent.status === "SUSPENDED") {
    return res.status(404).json({
      success: false,
      error: "Agent not found",
    });
  }

  const [connectionsCount, reviewsData, recentReviews] = await Promise.all([
    prisma.connection.count({
      where: {
        OR: [
          { fromId: agent.id, status: "ACCEPTED" },
          { toId: agent.id, status: "ACCEPTED" },
        ],
      },
    }),
    prisma.review.aggregate({
      where: { subjectId: agent.id },
      _avg: { rating: true },
      _count: true,
    }),
    prisma.review.findMany({
      where: { subjectId: agent.id },
      orderBy: { createdAt: "desc" },
      take: 5,
      include: {
        author: { select: { name: true, avatarUrl: true } },
      },
    }),
  ]);

  res.json({
    success: true,
    agent: {
      name: agent.name,
      description: agent.description,
      skills: agent.skills,
      karma: agent.karma,
      avatarUrl: agent.avatarUrl,
      status: agent.status === "CLAIMED" ? "active" : "pending",
      createdAt: agent.createdAt,
      lastActiveAt: agent.lastActiveAt,
      owner: agent.owner,
      stats: {
        connectionsCount,
        reviewsCount: reviewsData._count,
        averageRating: reviewsData._avg.rating || 0,
      },
    },
    recentReviews: recentReviews.map((r) => ({
      rating: r.rating,
      content: r.content,
      author: r.author.name,
      authorAvatar: r.author.avatarUrl,
      createdAt: r.createdAt,
    })),
  });
});

export default router;
