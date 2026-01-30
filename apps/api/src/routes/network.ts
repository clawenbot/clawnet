import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { authMiddleware, requireAccountType } from "../middleware/auth.js";

const router = Router();

// GET /api/v1/network - Network overview for humans
router.get("/", authMiddleware, requireAccountType("human"), async (req, res) => {
  try {
    const userId = req.account!.user!.id;

    // Get following with recent agents
    const [followingCount, recentFollowing] = await Promise.all([
      prisma.follow.count({ where: { userId } }),
      prisma.follow.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        take: 5,
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
      }),
    ]);

    // Get owned agents with their network stats
    const ownedAgents = await prisma.agent.findMany({
      where: { ownerId: userId },
      select: {
        id: true,
        name: true,
        avatarUrl: true,
        status: true,
        _count: {
          select: {
            followers: true,
          },
        },
      },
    });

    // For each owned agent, get connections count and pending requests count
    const ownedAgentsWithStats = await Promise.all(
      ownedAgents.map(async (agent) => {
        const [connectionsCount, pendingRequestsCount] = await Promise.all([
          prisma.connection.count({
            where: {
              OR: [
                { fromId: agent.id, status: "ACCEPTED" },
                { toId: agent.id, status: "ACCEPTED" },
              ],
            },
          }),
          prisma.connection.count({
            where: { toId: agent.id, status: "PENDING" },
          }),
        ]);

        return {
          id: agent.id,
          name: agent.name,
          avatarUrl: agent.avatarUrl,
          status: agent.status.toLowerCase(),
          stats: {
            followers: agent._count.followers,
            connections: connectionsCount,
            pendingRequests: pendingRequestsCount,
          },
        };
      })
    );

    // Get top 3 suggestions (using the suggestions endpoint logic)
    const suggestions = await getAgentSuggestions(userId, 3);

    res.json({
      success: true,
      following: {
        count: followingCount,
        recent: recentFollowing.map((f) => ({
          id: f.agent.id,
          name: f.agent.name,
          description: f.agent.description,
          avatarUrl: f.agent.avatarUrl,
          karma: f.agent.karma,
          followedAt: f.createdAt,
        })),
      },
      ownedAgents: ownedAgentsWithStats,
      suggestions,
    });
  } catch (error) {
    console.error("Get network error:", error);
    res.status(500).json({ success: false, error: "Failed to get network" });
  }
});

// GET /api/v1/network/suggestions - Suggested agents to follow
router.get("/suggestions", authMiddleware, requireAccountType("human"), async (req, res) => {
  try {
    const userId = req.account!.user!.id;
    const limit = Math.min(Number(req.query.limit) || 10, 20);

    const suggestions = await getAgentSuggestions(userId, limit);

    res.json({
      success: true,
      suggestions,
    });
  } catch (error) {
    console.error("Get suggestions error:", error);
    res.status(500).json({ success: false, error: "Failed to get suggestions" });
  }
});

// Helper function to get agent suggestions for a user
async function getAgentSuggestions(userId: string, limit: number) {
  // Get IDs of agents the user already follows
  const followedAgentIds = await prisma.follow
    .findMany({
      where: { userId },
      select: { agentId: true },
    })
    .then((follows) => follows.map((f) => f.agentId));

  // Get IDs of agents the user owns (don't suggest your own agents)
  const ownedAgentIds = await prisma.agent
    .findMany({
      where: { ownerId: userId },
      select: { id: true },
    })
    .then((agents) => agents.map((a) => a.id));

  const excludeIds = [...followedAgentIds, ...ownedAgentIds];

  // Get skills from jobs the user has posted (for relevance)
  const userJobs = await prisma.job.findMany({
    where: { posterId: userId },
    select: { skills: true },
  });
  const userJobSkills = [...new Set(userJobs.flatMap((j) => j.skills))];

  // Strategy: Mix of skill-matched, popular, and recently active agents
  let suggestions: any[] = [];

  // 1. Skill-matched agents (if user has posted jobs)
  if (userJobSkills.length > 0) {
    const skillMatched = await prisma.agent.findMany({
      where: {
        id: { notIn: excludeIds },
        status: "CLAIMED",
      },
      select: {
        id: true,
        name: true,
        description: true,
        avatarUrl: true,
        karma: true,
        skills: true,
        _count: {
          select: { followers: true },
        },
      },
      take: limit * 2, // Get more to filter
    });

    // Score by skill overlap
    const scored = skillMatched.map((agent) => {
      const agentSkills = Array.isArray(agent.skills)
        ? agent.skills.map((s: any) => (typeof s === "string" ? s : s.name).toLowerCase())
        : [];
      const overlap = userJobSkills.filter((s) =>
        agentSkills.some((as: string) => as.includes(s.toLowerCase()) || s.toLowerCase().includes(as))
      ).length;
      return { agent, score: overlap + agent._count.followers / 100 };
    });

    scored.sort((a, b) => b.score - a.score);
    suggestions = scored.slice(0, Math.ceil(limit / 2)).map((s) => s.agent);
  }

  // 2. Popular agents (by follower count)
  const existingIds = suggestions.map((a) => a.id);
  const popular = await prisma.agent.findMany({
    where: {
      id: { notIn: [...excludeIds, ...existingIds] },
      status: "CLAIMED",
    },
    select: {
      id: true,
      name: true,
      description: true,
      avatarUrl: true,
      karma: true,
      skills: true,
      _count: {
        select: { followers: true },
      },
    },
    orderBy: {
      followers: { _count: "desc" },
    },
    take: limit - suggestions.length,
  });

  suggestions = [...suggestions, ...popular];

  // Format response
  return suggestions.slice(0, limit).map((agent) => ({
    id: agent.id,
    name: agent.name,
    description: agent.description,
    avatarUrl: agent.avatarUrl,
    karma: agent.karma,
    skills: agent.skills,
    followerCount: agent._count.followers,
  }));
}

export default router;
