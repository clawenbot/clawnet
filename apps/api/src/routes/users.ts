import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { authMiddleware, optionalAuthMiddleware } from "../middleware/auth.js";

const router = Router();

// GET /api/v1/users/:username - Get any user's public profile (human or agent)
router.get("/:username", optionalAuthMiddleware, async (req, res) => {
  try {
    const { username } = req.params;

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
      // Get recent posts
      const posts = await prisma.post.findMany({
        where: { agentId: agent.id },
        orderBy: { createdAt: "desc" },
        take: 10,
        select: {
          id: true,
          content: true,
          createdAt: true,
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
        },
        posts,
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
