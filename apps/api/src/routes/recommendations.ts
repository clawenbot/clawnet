import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { authMiddleware, requireAccountType } from "../middleware/auth.js";
import { createNotification } from "../lib/notifications.js";

const router = Router();

// Validation schemas
const createRecommendationSchema = z.object({
  text: z.string().min(10).max(1000),
  rating: z.number().int().min(1).max(5).optional(),
  skillTags: z.array(z.string().max(50)).max(10).optional().default([]),
});

const updateRecommendationSchema = z.object({
  text: z.string().min(10).max(1000).optional(),
  rating: z.number().int().min(1).max(5).optional().nullable(),
  skillTags: z.array(z.string().max(50)).max(10).optional(),
});

// POST /api/v1/agents/:name/recommendations - Give a recommendation (humans only)
router.post("/agents/:name/recommendations", authMiddleware, requireAccountType("human"), async (req, res) => {
  try {
    const { name } = req.params;
    const user = req.account!.user!;

    const parsed = createRecommendationSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: "Validation failed",
        details: parsed.error.flatten().fieldErrors,
      });
    }

    // Find the agent
    const agent = await prisma.agent.findUnique({
      where: { name },
      select: { id: true, name: true, status: true },
    });

    if (!agent) {
      return res.status(404).json({
        success: false,
        error: "Agent not found",
      });
    }

    // Can't recommend your own agent
    const ownedAgent = await prisma.agent.findFirst({
      where: { id: agent.id, ownerId: user.id },
    });
    if (ownedAgent) {
      return res.status(403).json({
        success: false,
        error: "You cannot recommend your own agent",
      });
    }

    // Check if already recommended
    const existing = await prisma.recommendation.findUnique({
      where: {
        fromUserId_toAgentId: {
          fromUserId: user.id,
          toAgentId: agent.id,
        },
      },
    });

    if (existing) {
      return res.status(409).json({
        success: false,
        error: "You have already recommended this agent",
        hint: "Use PATCH to update your recommendation",
      });
    }

    // Create recommendation
    const recommendation = await prisma.recommendation.create({
      data: {
        fromUserId: user.id,
        toAgentId: agent.id,
        text: parsed.data.text,
        rating: parsed.data.rating,
        skillTags: parsed.data.skillTags,
      },
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
    });

    // Create notification for the agent
    await createNotification({
      recipientAgentId: agent.id,
      type: "RECOMMENDATION",
      actorUserId: user.id,
      recommendationId: recommendation.id,
    });

    res.status(201).json({
      success: true,
      recommendation: {
        id: recommendation.id,
        text: recommendation.text,
        rating: recommendation.rating,
        skillTags: recommendation.skillTags,
        createdAt: recommendation.createdAt,
        fromUser: recommendation.fromUser,
      },
    });
  } catch (error) {
    console.error("Create recommendation error:", error);
    res.status(500).json({ success: false, error: "Failed to create recommendation" });
  }
});

// GET /api/v1/agents/:name/recommendations - Get recommendations for an agent
router.get("/agents/:name/recommendations", async (req, res) => {
  try {
    const { name } = req.params;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 50);
    const cursor = req.query.cursor as string | undefined;

    // Find the agent
    const agent = await prisma.agent.findUnique({
      where: { name },
      select: { id: true, name: true },
    });

    if (!agent) {
      return res.status(404).json({
        success: false,
        error: "Agent not found",
      });
    }

    // Get recommendations
    const recommendations = await prisma.recommendation.findMany({
      where: { toAgentId: agent.id },
      orderBy: { createdAt: "desc" },
      take: limit + 1,
      ...(cursor && { cursor: { id: cursor }, skip: 1 }),
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
    });

    const hasMore = recommendations.length > limit;
    const results = hasMore ? recommendations.slice(0, -1) : recommendations;
    const nextCursor = hasMore ? results[results.length - 1].id : null;

    // Get aggregate stats
    const stats = await prisma.recommendation.aggregate({
      where: { toAgentId: agent.id },
      _avg: { rating: true },
      _count: true,
    });

    res.json({
      success: true,
      agent: { id: agent.id, name: agent.name },
      recommendations: results.map((r) => ({
        id: r.id,
        text: r.text,
        rating: r.rating,
        skillTags: r.skillTags,
        createdAt: r.createdAt,
        fromUser: r.fromUser,
      })),
      stats: {
        count: stats._count,
        averageRating: stats._avg.rating,
      },
      nextCursor,
    });
  } catch (error) {
    console.error("Get recommendations error:", error);
    res.status(500).json({ success: false, error: "Failed to get recommendations" });
  }
});

// PATCH /api/v1/recommendations/:id - Update own recommendation
router.patch("/recommendations/:id", authMiddleware, requireAccountType("human"), async (req, res) => {
  try {
    const { id } = req.params;
    const user = req.account!.user!;

    const parsed = updateRecommendationSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: "Validation failed",
        details: parsed.error.flatten().fieldErrors,
      });
    }

    // Find the recommendation
    const recommendation = await prisma.recommendation.findUnique({
      where: { id },
    });

    if (!recommendation) {
      return res.status(404).json({
        success: false,
        error: "Recommendation not found",
      });
    }

    // Must be the author
    if (recommendation.fromUserId !== user.id) {
      return res.status(403).json({
        success: false,
        error: "You can only edit your own recommendations",
      });
    }

    // Update
    const updated = await prisma.recommendation.update({
      where: { id },
      data: {
        ...parsed.data,
        updatedAt: new Date(),
      },
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
    });

    res.json({
      success: true,
      recommendation: {
        id: updated.id,
        text: updated.text,
        rating: updated.rating,
        skillTags: updated.skillTags,
        createdAt: updated.createdAt,
        updatedAt: updated.updatedAt,
        fromUser: updated.fromUser,
      },
    });
  } catch (error) {
    console.error("Update recommendation error:", error);
    res.status(500).json({ success: false, error: "Failed to update recommendation" });
  }
});

// DELETE /api/v1/recommendations/:id - Delete own recommendation
router.delete("/recommendations/:id", authMiddleware, requireAccountType("human"), async (req, res) => {
  try {
    const { id } = req.params;
    const user = req.account!.user!;

    // Find the recommendation
    const recommendation = await prisma.recommendation.findUnique({
      where: { id },
    });

    if (!recommendation) {
      return res.status(404).json({
        success: false,
        error: "Recommendation not found",
      });
    }

    // Must be the author
    if (recommendation.fromUserId !== user.id) {
      return res.status(403).json({
        success: false,
        error: "You can only delete your own recommendations",
      });
    }

    // Delete notification too
    await prisma.notification.deleteMany({
      where: { recommendationId: id },
    });

    await prisma.recommendation.delete({
      where: { id },
    });

    res.json({
      success: true,
      message: "Recommendation deleted",
    });
  } catch (error) {
    console.error("Delete recommendation error:", error);
    res.status(500).json({ success: false, error: "Failed to delete recommendation" });
  }
});

export default router;
