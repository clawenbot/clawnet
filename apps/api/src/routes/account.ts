import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { authMiddleware, getAccountId, getAccountName } from "../middleware/auth.js";
import { validateContentForPost } from "../lib/content-safety.js";

const router = Router();

// GET /api/v1/account/me - Get current account profile (works for both humans and agents)
router.get("/me", authMiddleware, async (req, res) => {
  const account = req.account!;

  try {
    if (account.type === "agent") {
      const agent = account.agent;
      
      const [connectionsCount, reviewsData, followerCount] = await Promise.all([
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
        prisma.follow.count({ where: { agentId: agent.id } }),
      ]);

      return res.json({
        success: true,
        accountType: "agent",
        profile: {
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
            followerCount,
            reviewsCount: reviewsData._count,
            averageRating: reviewsData._avg.rating || 0,
          },
        },
      });
    }

    // Human account
    const user = account.user;
    
    const [followingCount, ownedAgentsCount, ownedAgents] = await Promise.all([
      prisma.follow.count({ where: { userId: user.id } }),
      prisma.agent.count({ where: { ownerId: user.id } }),
      prisma.agent.findMany({
        where: { ownerId: user.id },
        select: { id: true, name: true, avatarUrl: true, status: true },
      }),
    ]);

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
        stats: {
          followingCount,
          ownedAgentsCount,
        },
        ownedAgents,
      },
    });
  } catch (error) {
    console.error("Get profile error:", error);
    res.status(500).json({ success: false, error: "Failed to load profile" });
  }
});

// PATCH /api/v1/account/me - Update current account profile
router.patch("/me", authMiddleware, async (req, res) => {
  const account = req.account!;

  try {
    if (account.type === "agent") {
      // Skill schema: each skill is a portfolio item
      const skillSchema = z.object({
        name: z.string().min(1).max(100),
        description: z.string().max(500).optional(),
        installInstructions: z.string().max(2000).optional(),
        clawdhubUrl: z.string().url().max(500).optional(),
        githubUrl: z.string().url().max(500).optional(),
        version: z.string().max(20).optional(),
      });

      const updateSchema = z.object({
        description: z.string().min(10).max(500).optional(),
        // Skills can be array of strings (simple) or array of objects (rich)
        skills: z.union([
          z.array(z.string().max(100)).max(20),  // Simple string array (backwards compatible)
          z.array(skillSchema).max(20),           // Rich skill objects
        ]).optional(),
        avatarUrl: z.string().url().max(500).optional().nullable(),
      });

      const parsed = updateSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          success: false,
          error: "Validation failed",
          details: parsed.error.flatten().fieldErrors,
        });
      }

      // Check description for prompt injection patterns
      if (parsed.data.description) {
        const contentError = validateContentForPost(parsed.data.description);
        if (contentError) {
          return res.status(400).json({
            success: false,
            error: contentError,
            code: "CONTENT_SAFETY_VIOLATION",
          });
        }
      }

      // Normalize skills to rich format if provided as strings
      let normalizedSkills = parsed.data.skills;
      if (normalizedSkills) {
        normalizedSkills = normalizedSkills.map((skill: string | { name: string }) => {
          if (typeof skill === "string") {
            return { name: skill };
          }
          return skill;
        });
      }

      const updated = await prisma.agent.update({
        where: { id: account.agent.id },
        data: {
          ...parsed.data,
          ...(normalizedSkills ? { skills: normalizedSkills } : {}),
          updatedAt: new Date(),
        },
      });

      return res.json({
        success: true,
        profile: {
          id: updated.id,
          name: updated.name,
          description: updated.description,
          skills: updated.skills,
          avatarUrl: updated.avatarUrl,
        },
      });
    }

    // Human account
    const updateSchema = z.object({
      displayName: z.string().min(1).max(100).optional(),
      bio: z.string().max(500).optional().nullable(),
      avatarUrl: z.string().url().max(500).optional().nullable(),
    });

    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: "Validation failed",
        details: parsed.error.flatten().fieldErrors,
      });
    }

    // Check bio for prompt injection patterns
    if (parsed.data.bio) {
      const contentError = validateContentForPost(parsed.data.bio);
      if (contentError) {
        return res.status(400).json({
          success: false,
          error: contentError,
          code: "CONTENT_SAFETY_VIOLATION",
        });
      }
    }

    const updated = await prisma.user.update({
      where: { id: account.user.id },
      data: {
        ...parsed.data,
        updatedAt: new Date(),
      },
    });

    return res.json({
      success: true,
      profile: {
        id: updated.id,
        username: updated.username,
        displayName: updated.displayName,
        bio: updated.bio,
        avatarUrl: updated.avatarUrl,
      },
    });
  } catch (error) {
    console.error("Update profile error:", error);
    res.status(500).json({ success: false, error: "Failed to update profile" });
  }
});

export default router;
