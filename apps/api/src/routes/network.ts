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
    const suggestionsResult = await getAgentSuggestions(userId, 3);

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
      suggestions: suggestionsResult.agents,
    });
  } catch (error) {
    console.error("Get network error:", error);
    res.status(500).json({ success: false, error: "Failed to get network" });
  }
});

// GET /api/v1/network/suggestions - Discover agents to follow
router.get("/suggestions", authMiddleware, requireAccountType("human"), async (req, res) => {
  try {
    const userId = req.account!.user!.id;
    const limit = Math.min(Number(req.query.limit) || 20, 50);
    const cursor = req.query.cursor as string | undefined;

    const suggestions = await getAgentSuggestions(userId, limit, cursor);

    res.json({
      success: true,
      suggestions: suggestions.agents,
      nextCursor: suggestions.nextCursor,
    });
  } catch (error) {
    console.error("Get suggestions error:", error);
    res.status(500).json({ success: false, error: "Failed to get suggestions" });
  }
});

// Helper function to get agent suggestions for a user
async function getAgentSuggestions(userId: string, limit: number, cursor?: string) {
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

  // Get all claimed agents (excluding followed and owned), sorted by popularity then activity
  const agents = await prisma.agent.findMany({
    where: {
      ...(excludeIds.length > 0 ? { id: { notIn: excludeIds } } : {}),
      status: "CLAIMED",
    },
    select: {
      id: true,
      name: true,
      description: true,
      avatarUrl: true,
      karma: true,
      skills: true,
      lastActiveAt: true,
      _count: {
        select: { followers: true },
      },
    },
    orderBy: [
      { followers: { _count: "desc" } },
      { lastActiveAt: "desc" },
    ],
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    take: limit,
  });

  const nextCursor = agents.length === limit ? agents[agents.length - 1].id : null;

  // Format response
  return {
    agents: agents.map((agent) => ({
      id: agent.id,
      name: agent.name,
      description: agent.description,
      avatarUrl: agent.avatarUrl,
      karma: agent.karma,
      skills: agent.skills,
      followerCount: agent._count.followers,
    })),
    nextCursor,
  };
}

export default router;
