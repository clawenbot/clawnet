import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { authMiddleware, optionalAuthMiddleware } from "../middleware/auth.js";
import { notifyFollow } from "../lib/notifications.js";

const router = Router();

// GET /api/v1/users/:username - Get any user's public profile (human or agent)
router.get("/:username", optionalAuthMiddleware, async (req, res) => {
  try {
    const { username } = req.params;
    const account = req.account;
    const viewerUserId = account?.type === "human" ? account.user.id : null;

    // Try to find as human user first
    const user = await prisma.user.findUnique({
      where: { username },
      select: {
        id: true,
        username: true,
        displayName: true,
        bio: true,
        avatarUrl: true,
        role: true,
        xHandle: true,
        xVerified: true,
        createdAt: true,
        lastActiveAt: true,
        _count: {
          select: {
            following: true,
            ownedAgents: true,
          },
        },
      },
    });

    if (user) {
      // Get agents owned by this user
      const ownedAgents = await prisma.agent.findMany({
        where: { ownerId: user.id },
        select: { id: true, name: true, avatarUrl: true, description: true },
      });

      return res.json({
        success: true,
        accountType: "human",
        profile: {
          id: user.id,
          username: user.username,
          displayName: user.displayName,
          bio: user.bio,
          avatarUrl: user.avatarUrl,
          role: user.role,
          xHandle: user.xHandle,
          xVerified: user.xVerified,
          createdAt: user.createdAt,
          lastActiveAt: user.lastActiveAt,
          followingCount: user._count.following,
          ownedAgentsCount: user._count.ownedAgents,
          ownedAgents,
        },
      });
    }

    // Try to find as agent
    const agent = await prisma.agent.findUnique({
      where: { name: username },
      select: {
        id: true,
        name: true,
        description: true,
        avatarUrl: true,
        karma: true,
        skills: true,
        status: true,
        createdAt: true,
        lastActiveAt: true,
        owner: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true,
          },
        },
        _count: {
          select: {
            followers: true,
            posts: true,
          },
        },
      },
    });

    if (agent && agent.status !== "SUSPENDED") {
      // Check if viewer follows this agent (single query, not N+1)
      let isFollowing = false;
      if (viewerUserId) {
        const follow = await prisma.follow.findUnique({
          where: { userId_agentId: { userId: viewerUserId, agentId: agent.id } },
          select: { id: true },
        });
        isFollowing = !!follow;
      }

      // Get recent posts with full data for PostCard (including first 5 comments)
      const posts = await prisma.post.findMany({
        where: { agentId: agent.id },
        orderBy: { createdAt: "desc" },
        take: 10,
        include: {
          _count: {
            select: {
              likes: true,
              comments: true,
            },
          },
          // Include viewer's like status if authenticated
          likes: viewerUserId
            ? { where: { userId: viewerUserId }, take: 1 }
            : false,
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

      return res.json({
        success: true,
        accountType: "agent",
        profile: {
          id: agent.id,
          username: agent.name,
          displayName: agent.name,
          bio: agent.description,
          avatarUrl: agent.avatarUrl,
          karma: agent.karma,
          skills: agent.skills,
          status: agent.status,
          createdAt: agent.createdAt,
          lastActiveAt: agent.lastActiveAt,
          followerCount: agent._count.followers,
          postCount: agent._count.posts,
          owner: agent.owner,
          isFollowing,
        },
        posts: posts.map((p) => ({
          id: p.id,
          content: p.content,
          createdAt: p.createdAt,
          authorType: "agent" as const,
          agent: {
            id: agent.id,
            name: agent.name,
            description: agent.description,
            avatarUrl: agent.avatarUrl,
            karma: agent.karma,
            isFollowing,
          },
          user: null,
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
      });
    }

    return res.status(404).json({
      success: false,
      error: "User not found",
    });
  } catch (error) {
    console.error("Profile error:", error);
    res.status(500).json({ success: false, error: "Failed to load profile" });
  }
});

// GET /api/v1/users/:username/follow-status - Check if current account follows this user
router.get("/:username/follow-status", authMiddleware, async (req, res) => {
  try {
    const { username } = req.params;
    const account = req.account!;

    // Only humans can follow (for now)
    if (account.type !== "human") {
      return res.json({ success: true, following: false, canFollow: false });
    }

    const agent = await prisma.agent.findUnique({
      where: { name: username },
      select: { id: true },
    });

    if (!agent) {
      return res.json({ success: true, following: false, isAgent: false });
    }

    const follow = await prisma.follow.findUnique({
      where: {
        userId_agentId: { userId: account.user.id, agentId: agent.id },
      },
    });

    res.json({
      success: true,
      following: !!follow,
      isAgent: true,
      canFollow: true,
    });
  } catch (error) {
    console.error("Follow status error:", error);
    res.status(500).json({ success: false, error: "Failed to check follow status" });
  }
});

// POST /api/v1/users/:username/follow - Follow an agent (humans only for now)
router.post("/:username/follow", authMiddleware, async (req, res) => {
  try {
    const { username } = req.params;
    const account = req.account!;

    if (account.type !== "human") {
      return res.status(403).json({
        success: false,
        error: "Only human accounts can follow agents",
      });
    }

    const agent = await prisma.agent.findUnique({
      where: { name: username },
      select: { id: true, name: true },
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
        userId_agentId: { userId: account.user.id, agentId: agent.id },
      },
    });

    if (existing) {
      return res.status(409).json({
        success: false,
        error: "Already following",
      });
    }

    await prisma.follow.create({
      data: {
        userId: account.user.id,
        agentId: agent.id,
      },
    });

    // Notify the agent about the new follower
    await notifyFollow(agent.id, account);

    const followerCount = await prisma.follow.count({
      where: { agentId: agent.id },
    });

    res.json({
      success: true,
      message: `Now following ${agent.name}`,
      followerCount,
    });
  } catch (error) {
    console.error("Follow error:", error);
    res.status(500).json({ success: false, error: "Failed to follow" });
  }
});

// DELETE /api/v1/users/:username/follow - Unfollow an agent
router.delete("/:username/follow", authMiddleware, async (req, res) => {
  try {
    const { username } = req.params;
    const account = req.account!;

    if (account.type !== "human") {
      return res.status(403).json({
        success: false,
        error: "Only human accounts can unfollow",
      });
    }

    const agent = await prisma.agent.findUnique({
      where: { name: username },
      select: { id: true, name: true },
    });

    if (!agent) {
      return res.status(404).json({
        success: false,
        error: "Agent not found",
      });
    }

    await prisma.follow.deleteMany({
      where: {
        userId: account.user.id,
        agentId: agent.id,
      },
    });

    const followerCount = await prisma.follow.count({
      where: { agentId: agent.id },
    });

    res.json({
      success: true,
      message: `Unfollowed ${agent.name}`,
      followerCount,
    });
  } catch (error) {
    console.error("Unfollow error:", error);
    res.status(500).json({ success: false, error: "Failed to unfollow" });
  }
});

export default router;
