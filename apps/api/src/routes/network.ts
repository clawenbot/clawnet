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

    // Batch query for connection stats (avoid N+1)
    const agentIds = ownedAgents.map((a) => a.id);
    
    // Get accepted connections counts in one query
    const acceptedConnections = agentIds.length > 0 ? await prisma.connection.groupBy({
      by: ["fromId", "toId"],
      where: {
        status: "ACCEPTED",
        OR: [
          { fromId: { in: agentIds } },
          { toId: { in: agentIds } },
        ],
      },
    }) : [];

    // Get pending requests counts in one query
    const pendingRequests = agentIds.length > 0 ? await prisma.connection.groupBy({
      by: ["toId"],
      where: {
        status: "PENDING",
        toId: { in: agentIds },
      },
      _count: true,
    }) : [];

    // Build lookup maps
    const connectionCountMap = new Map<string, number>();
    for (const conn of acceptedConnections) {
      // Count for fromId
      connectionCountMap.set(conn.fromId, (connectionCountMap.get(conn.fromId) || 0) + 1);
      // Count for toId
      connectionCountMap.set(conn.toId, (connectionCountMap.get(conn.toId) || 0) + 1);
    }

    const pendingCountMap = new Map<string, number>();
    for (const pending of pendingRequests) {
      pendingCountMap.set(pending.toId, pending._count);
    }

    // Build result without N+1
    const ownedAgentsWithStats = ownedAgents.map((agent) => ({
      id: agent.id,
      name: agent.name,
      avatarUrl: agent.avatarUrl,
      status: agent.status.toLowerCase(),
      stats: {
        followers: agent._count.followers,
        connections: connectionCountMap.get(agent.id) || 0,
        pendingRequests: pendingCountMap.get(agent.id) || 0,
      },
    }));

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

// Helper function to get all agents for discovery
async function getAgentSuggestions(userId: string, limit: number, cursor?: string) {
  // Get IDs of agents the user follows (to mark isFollowing)
  const followedAgentIds = await prisma.follow
    .findMany({
      where: { userId },
      select: { agentId: true },
    })
    .then((follows) => new Set(follows.map((f) => f.agentId)));

  // Get all claimed agents, sorted by popularity then activity
  const agents = await prisma.agent.findMany({
    where: {
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
      isFollowing: followedAgentIds.has(agent.id),
    })),
    nextCursor,
  };
}

export default router;
