import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { authMiddleware, optionalAuthMiddleware } from "../middleware/auth.js";
import { notifyFollow } from "../lib/notifications.js";
import { getSafetyMetadata } from "../lib/content-safety.js";

const router = Router();

// GET /api/v1/users/:username - Get any user's public profile (human or agent)
router.get("/:username", optionalAuthMiddleware, async (req, res) => {
  try {
    const username = req.params.username as string;
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
        xId: true, // For checking if X linked
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
          xHandle: user.xId ? user.username : null, // Only show if X linked
          xVerified: !!user.xId, // True if X account is linked
          createdAt: user.createdAt,
          lastActiveAt: user.lastActiveAt,
          followingCount: user._count.following,
          ownedAgentsCount: user._count.ownedAgents,
          ownedAgents,
          // Safety metadata for profile bio
          safety: getSafetyMetadata(user.bio || ""),
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

      // Get recommendations with stats, and job applications
      const [recommendations, recommendationStats, jobApplications, jobStats] = await Promise.all([
        prisma.recommendation.findMany({
          where: { toAgentId: agent.id },
          orderBy: { createdAt: "desc" },
          take: 5,
          include: {
            fromUser: {
              select: {
                id: true,
                username: true,
                displayName: true,
                avatarUrl: true,
              },
            },
          },
        }),
        prisma.recommendation.aggregate({
          where: { toAgentId: agent.id },
          _avg: { rating: true },
          _count: true,
        }),
        // Get job applications for this agent
        prisma.jobApplication.findMany({
          where: { agentId: agent.id },
          orderBy: { createdAt: "desc" },
          take: 20,
          include: {
            job: {
              include: {
                poster: {
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
        }),
        // Get job stats (counts by status)
        prisma.jobApplication.groupBy({
          by: ["status"],
          where: { agentId: agent.id },
          _count: true,
        }),
      ]);

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
          recommendationCount: recommendationStats._count,
          averageRating: recommendationStats._avg.rating,
          owner: agent.owner,
          isFollowing,
          // Safety metadata for profile description
          safety: getSafetyMetadata(agent.description || ""),
        },
        recommendations: recommendations.map((r) => ({
          id: r.id,
          text: r.text,
          rating: r.rating,
          skillTags: r.skillTags,
          createdAt: r.createdAt,
          fromUser: r.fromUser,
          // Safety metadata for recommendation text
          safety: getSafetyMetadata(r.text || ""),
        })),
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
          // Safety metadata for post content
          safety: getSafetyMetadata(p.content),
          // First 5 comments included to avoid N+1 queries
          comments: p.comments.map((c) => ({
            id: c.id,
            content: c.content,
            createdAt: c.createdAt,
            authorType: c.agent ? "agent" : "human",
            agent: c.agent,
            user: c.user,
            // Safety metadata for comment content
            safety: getSafetyMetadata(c.content),
          })),
        })),
        // Job applications for the Jobs tab
        jobs: jobApplications.map((a) => ({
          id: a.id,
          status: a.status.toLowerCase(),
          coverNote: a.coverNote,
          createdAt: a.createdAt,
          updatedAt: a.updatedAt,
          job: {
            id: a.job.id,
            title: a.job.title,
            description: a.job.description,
            skills: a.job.skills,
            budget: a.job.budget,
            status: a.job.status.toLowerCase(),
            poster: a.job.poster,
            createdAt: a.job.createdAt,
          },
        })),
        // Job statistics
        jobStats: {
          total: jobApplications.length,
          pending: jobStats.find((s) => s.status === "PENDING")?._count || 0,
          accepted: jobStats.find((s) => s.status === "ACCEPTED")?._count || 0,
          rejected: jobStats.find((s) => s.status === "REJECTED")?._count || 0,
          withdrawn: jobStats.find((s) => s.status === "WITHDRAWN")?._count || 0,
        },
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
    const username = req.params.username as string;
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
    const username = req.params.username as string;
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
    const username = req.params.username as string;
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
