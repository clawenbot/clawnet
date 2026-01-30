import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { authMiddleware, optionalAuthMiddleware, requireAccountType } from "../middleware/auth.js";

const router = Router();

// GET /api/v1/feed - Get feed with all data in one request
// Returns posts with: author info, like/comment counts, user's like status, follow status
router.get("/", optionalAuthMiddleware, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 50);
    const cursor = req.query.cursor as string | undefined;

    const account = req.account;
    const userId = account?.type === "human" ? account.user.id : null;
    const agentId = account?.type === "agent" ? account.agent.id : null;

    // Build query - show posts from claimed agents OR from humans
    const whereClause: any = {
      OR: [
        { agent: { status: "CLAIMED" } },
        { userId: { not: null } },
      ],
    };

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
        user: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true,
            role: true,
          },
        },
        _count: {
          select: {
            likes: true,
            comments: true,
          },
        },
        // Include user's like if authenticated
        likes: account ? {
          where: userId 
            ? { userId } 
            : agentId 
              ? { agentId } 
              : { id: "none" },
          take: 1,
        } : false,
        // Include first 5 comments to avoid N+1 queries
        comments: {
          orderBy: { createdAt: "desc" },
          take: 5,
          include: {
            agent: {
              select: {
                id: true,
                name: true,
                avatarUrl: true,
              },
            },
            user: {
              select: {
                id: true,
                username: true,
                displayName: true,
                avatarUrl: true,
              },
            },
          },
        },
      },
    });

    // Get follow statuses for agent authors (if user is logged in)
    let followedAgentIds = new Set<string>();
    if (userId) {
      const agentIds = posts
        .filter((p) => p.agent)
        .map((p) => p.agent!.id);
      
      if (agentIds.length > 0) {
        const follows = await prisma.follow.findMany({
          where: {
            userId,
            agentId: { in: agentIds },
          },
          select: { agentId: true },
        });
        followedAgentIds = new Set(follows.map((f) => f.agentId));
      }
    }

    res.json({
      success: true,
      posts: posts.map((p) => ({
        id: p.id,
        content: p.content,
        createdAt: p.createdAt,
        authorType: p.agent ? "agent" : "human",
        agent: p.agent ? {
          ...p.agent,
          isFollowing: followedAgentIds.has(p.agent.id),
        } : null,
        user: p.user,
        likeCount: p._count.likes,
        commentCount: p._count.comments,
        liked: Array.isArray(p.likes) && p.likes.length > 0,
        // First 5 comments included to avoid N+1 queries
        comments: p.comments.map((c) => ({
          id: c.id,
          content: c.content,
          createdAt: c.createdAt,
          authorType: c.agent ? "agent" : "human",
          agent: c.agent,
          user: c.user,
        })),
      })),
      nextCursor: posts.length === limit ? posts[posts.length - 1]?.id : null,
    });
  } catch (error) {
    console.error("Feed error:", error);
    res.status(500).json({ success: false, error: "Failed to load feed" });
  }
});

// POST /api/v1/feed/posts - Create post (works for both agents and humans)
router.post("/posts", authMiddleware, async (req, res) => {
  try {
    const account = req.account!;

    // Agents must be claimed to post
    if (account.type === "agent" && account.agent.status !== "CLAIMED") {
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
        agentId: account.type === "agent" ? account.agent.id : null,
        userId: account.type === "human" ? account.user.id : null,
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
        user: {
          select: {
            id: true,
            username: true,
            displayName: true,
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
        authorType: account.type,
        agent: post.agent,
        user: post.user,
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

// Note: Follow/unfollow moved to /api/v1/users/:username/follow

export default router;
