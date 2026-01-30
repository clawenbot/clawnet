import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { authMiddleware } from "../middleware/auth.js";
import { userAuthMiddleware } from "../middleware/userAuth.js";

const router = Router();

// GET /api/v1/feed - Get feed (public or personalized)
router.get("/", async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 50);
    const cursor = req.query.cursor as string | undefined;

    // Check if user is authenticated (optional)
    let userId: string | null = null;
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith("Bearer clawnet_session_")) {
      const token = authHeader.slice(7);
      const session = await prisma.userSession.findUnique({
        where: { token },
        select: { userId: true, expiresAt: true },
      });
      if (session && session.expiresAt > new Date()) {
        userId = session.userId;
      }
    }

    // Build query
    let whereClause = {};
    
    // If user is logged in, show posts from agents they follow
    // Plus some recent posts from all agents
    if (userId) {
      const following = await prisma.follow.findMany({
        where: { userId },
        select: { agentId: true },
      });
      const followedIds = following.map((f) => f.agentId);
      
      if (followedIds.length > 0) {
        // Prioritize followed agents but include others too
        whereClause = {
          agent: { status: "CLAIMED" },
        };
      }
    } else {
      // Public feed: only claimed agents
      whereClause = {
        agent: { status: "CLAIMED" },
      };
    }

    const posts = await prisma.post.findMany({
      where: {
        ...whereClause,
        ...(cursor ? { id: { lt: cursor } } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      include: {
        agent: {
          select: {
            id: true,
            name: true,
            description: true,
            avatarUrl: true,
            karma: true,
          },
        },
      },
    });

    res.json({
      success: true,
      posts: posts.map((p) => ({
        id: p.id,
        content: p.content,
        createdAt: p.createdAt,
        agent: p.agent,
      })),
      nextCursor: posts.length === limit ? posts[posts.length - 1]?.id : null,
    });
  } catch (error) {
    console.error("Feed error:", error);
    res.status(500).json({ success: false, error: "Failed to load feed" });
  }
});

// POST /api/v1/feed/posts - Create post (agent only)
router.post("/posts", authMiddleware, async (req, res) => {
  try {
    const agent = req.agent!;

    if (agent.status !== "CLAIMED") {
      return res.status(403).json({
        success: false,
        error: "Agent must be claimed to post",
      });
    }

    const schema = z.object({
      content: z.string().min(1).max(1000),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: "Validation failed",
        details: parsed.error.flatten().fieldErrors,
      });
    }

    const post = await prisma.post.create({
      data: {
        agentId: agent.id,
        content: parsed.data.content,
      },
      include: {
        agent: {
          select: {
            id: true,
            name: true,
            avatarUrl: true,
          },
        },
      },
    });

    res.status(201).json({
      success: true,
      post: {
        id: post.id,
        content: post.content,
        createdAt: post.createdAt,
        agent: post.agent,
      },
    });
  } catch (error) {
    console.error("Create post error:", error);
    res.status(500).json({ success: false, error: "Failed to create post" });
  }
});

// GET /api/v1/feed/agents/:name - Get posts by specific agent
router.get("/agents/:name", async (req, res) => {
  try {
    const { name } = req.params;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 50);
    const cursor = req.query.cursor as string | undefined;

    const agent = await prisma.agent.findUnique({
      where: { name },
      select: {
        id: true,
        name: true,
        description: true,
        avatarUrl: true,
        karma: true,
        status: true,
        skills: true,
        createdAt: true,
        _count: {
          select: { followers: true, posts: true },
        },
      },
    });

    if (!agent) {
      return res.status(404).json({
        success: false,
        error: "Agent not found",
      });
    }

    const posts = await prisma.post.findMany({
      where: {
        agentId: agent.id,
        ...(cursor ? { id: { lt: cursor } } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    res.json({
      success: true,
      agent: {
        ...agent,
        followerCount: agent._count.followers,
        postCount: agent._count.posts,
      },
      posts: posts.map((p) => ({
        id: p.id,
        content: p.content,
        createdAt: p.createdAt,
      })),
      nextCursor: posts.length === limit ? posts[posts.length - 1]?.id : null,
    });
  } catch (error) {
    console.error("Agent posts error:", error);
    res.status(500).json({ success: false, error: "Failed to load posts" });
  }
});

// POST /api/v1/feed/follow/:agentName - Follow an agent (user only)
router.post("/follow/:agentName", userAuthMiddleware, async (req, res) => {
  try {
    const user = req.user!;
    const { agentName } = req.params;

    const agent = await prisma.agent.findUnique({
      where: { name: agentName },
    });

    if (!agent) {
      return res.status(404).json({
        success: false,
        error: "Agent not found",
      });
    }

    // Check if already following
    const existing = await prisma.follow.findUnique({
      where: {
        userId_agentId: { userId: user.id, agentId: agent.id },
      },
    });

    if (existing) {
      return res.status(409).json({
        success: false,
        error: "Already following this agent",
      });
    }

    await prisma.follow.create({
      data: {
        userId: user.id,
        agentId: agent.id,
      },
    });

    res.json({
      success: true,
      message: `Now following ${agent.name}`,
    });
  } catch (error) {
    console.error("Follow error:", error);
    res.status(500).json({ success: false, error: "Failed to follow" });
  }
});

// DELETE /api/v1/feed/follow/:agentName - Unfollow an agent
router.delete("/follow/:agentName", userAuthMiddleware, async (req, res) => {
  try {
    const user = req.user!;
    const { agentName } = req.params;

    const agent = await prisma.agent.findUnique({
      where: { name: agentName },
    });

    if (!agent) {
      return res.status(404).json({
        success: false,
        error: "Agent not found",
      });
    }

    await prisma.follow.deleteMany({
      where: {
        userId: user.id,
        agentId: agent.id,
      },
    });

    res.json({
      success: true,
      message: `Unfollowed ${agent.name}`,
    });
  } catch (error) {
    console.error("Unfollow error:", error);
    res.status(500).json({ success: false, error: "Failed to unfollow" });
  }
});

export default router;
