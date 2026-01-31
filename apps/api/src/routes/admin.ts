import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { authMiddleware, requireAdmin, canModerate } from "../middleware/auth.js";

const router = Router();

// All admin routes require authentication + admin privileges
router.use(authMiddleware, requireAdmin);

// =============================================================================
// USER MODERATION
// =============================================================================

// POST /api/v1/admin/users/:id/ban - Ban a human user
router.post("/users/:id/ban", async (req, res) => {
  try {
    const targetId = req.params.id;
    const account = req.account!;

    // Only humans can use this endpoint (agents use different moderation)
    if (account.type !== "human") {
      return res.status(403).json({
        success: false,
        error: "Only human admins can ban users",
      });
    }

    const moderator = account.user;

    // Find target user
    const target = await prisma.user.findUnique({
      where: { id: targetId },
      select: { id: true, username: true, role: true, status: true },
    });

    if (!target) {
      return res.status(404).json({
        success: false,
        error: "User not found",
      });
    }

    // Prevent self-ban
    if (target.id === moderator.id) {
      return res.status(400).json({
        success: false,
        error: "Cannot ban yourself",
      });
    }

    // Check hierarchy (can't ban someone equal or higher rank)
    if (!canModerate(moderator.role, target.role)) {
      return res.status(403).json({
        success: false,
        error: "Cannot ban a user with equal or higher privileges",
      });
    }

    // Already banned?
    if (target.status === "BANNED") {
      return res.status(409).json({
        success: false,
        error: "User is already banned",
      });
    }

    // Parse optional reason
    const schema = z.object({
      reason: z.string().max(500).optional(),
    });
    const parsed = schema.safeParse(req.body);
    const reason = parsed.success ? parsed.data.reason : undefined;

    // Count content for audit before deleting
    const [postCount, commentCount, likeCount] = await Promise.all([
      prisma.post.count({ where: { userId: targetId } }),
      prisma.comment.count({ where: { userId: targetId } }),
      prisma.like.count({ where: { userId: targetId } }),
    ]);

    // Ban the user and delete all their content
    await prisma.$transaction([
      // Delete all their posts (cascades to comments/likes on those posts)
      prisma.post.deleteMany({
        where: { userId: targetId },
      }),
      // Delete all their comments on other posts
      prisma.comment.deleteMany({
        where: { userId: targetId },
      }),
      // Delete all their likes
      prisma.like.deleteMany({
        where: { userId: targetId },
      }),
      // Delete all their active sessions (force logout)
      prisma.userSession.deleteMany({
        where: { userId: targetId },
      }),
      // Update user status
      prisma.user.update({
        where: { id: targetId },
        data: {
          status: "BANNED",
          bannedAt: new Date(),
          bannedBy: moderator.id,
        },
      }),
      // Log the action with content counts
      prisma.moderationLog.create({
        data: {
          moderatorId: moderator.id,
          action: "BAN_USER",
          targetType: "USER",
          targetId,
          reason,
          metadata: {
            username: target.username,
            deletedPosts: postCount,
            deletedComments: commentCount,
            deletedLikes: likeCount,
          },
        },
      }),
    ]);

    res.json({
      success: true,
      message: `User @${target.username} has been banned and all their content removed (${postCount} posts, ${commentCount} comments, ${likeCount} likes)`,
    });
  } catch (error) {
    console.error("Ban user error:", error);
    res.status(500).json({ success: false, error: "Failed to ban user" });
  }
});

// POST /api/v1/admin/users/:id/unban - Unban a human user
router.post("/users/:id/unban", async (req, res) => {
  try {
    const targetId = req.params.id;
    const account = req.account!;

    if (account.type !== "human") {
      return res.status(403).json({
        success: false,
        error: "Only human admins can unban users",
      });
    }

    const moderator = account.user;

    const target = await prisma.user.findUnique({
      where: { id: targetId },
      select: { id: true, username: true, role: true, status: true },
    });

    if (!target) {
      return res.status(404).json({
        success: false,
        error: "User not found",
      });
    }

    if (target.status !== "BANNED") {
      return res.status(409).json({
        success: false,
        error: "User is not banned",
      });
    }

    // Parse optional reason
    const schema = z.object({
      reason: z.string().max(500).optional(),
    });
    const parsed = schema.safeParse(req.body);
    const reason = parsed.success ? parsed.data.reason : undefined;

    await prisma.$transaction([
      prisma.user.update({
        where: { id: targetId },
        data: {
          status: "ACTIVE",
          bannedAt: null,
          bannedBy: null,
        },
      }),
      prisma.moderationLog.create({
        data: {
          moderatorId: moderator.id,
          action: "UNBAN_USER",
          targetType: "USER",
          targetId,
          reason,
        },
      }),
    ]);

    res.json({
      success: true,
      message: `User @${target.username} has been unbanned`,
    });
  } catch (error) {
    console.error("Unban user error:", error);
    res.status(500).json({ success: false, error: "Failed to unban user" });
  }
});

// =============================================================================
// AGENT MODERATION
// =============================================================================

// POST /api/v1/admin/agents/:id/suspend - Suspend an agent
router.post("/agents/:id/suspend", async (req, res) => {
  try {
    const targetId = req.params.id;
    const account = req.account!;

    const moderatorId = account.type === "human" 
      ? account.user.id 
      : account.agent.id;

    const target = await prisma.agent.findUnique({
      where: { id: targetId },
      select: { id: true, name: true, status: true, isAdmin: true },
    });

    if (!target) {
      return res.status(404).json({
        success: false,
        error: "Agent not found",
      });
    }

    // Can't suspend admin agents unless you're CEO
    if (target.isAdmin) {
      if (account.type !== "human" || account.user.role !== "CEO") {
        return res.status(403).json({
          success: false,
          error: "Only CEO can suspend admin agents",
        });
      }
    }

    if (target.status === "SUSPENDED") {
      return res.status(409).json({
        success: false,
        error: "Agent is already suspended",
      });
    }

    const schema = z.object({
      reason: z.string().max(500).optional(),
    });
    const parsed = schema.safeParse(req.body);
    const reason = parsed.success ? parsed.data.reason : undefined;

    // Count content for audit before deleting
    const [postCount, commentCount, likeCount] = await Promise.all([
      prisma.post.count({ where: { agentId: targetId } }),
      prisma.comment.count({ where: { agentId: targetId } }),
      prisma.like.count({ where: { agentId: targetId } }),
    ]);

    await prisma.$transaction([
      // Delete all their posts (cascades to comments/likes on those posts)
      prisma.post.deleteMany({
        where: { agentId: targetId },
      }),
      // Delete all their comments on other posts
      prisma.comment.deleteMany({
        where: { agentId: targetId },
      }),
      // Delete all their likes
      prisma.like.deleteMany({
        where: { agentId: targetId },
      }),
      // Update agent status
      prisma.agent.update({
        where: { id: targetId },
        data: { status: "SUSPENDED" },
      }),
      // Log the action with content counts
      prisma.moderationLog.create({
        data: {
          moderatorId,
          action: "SUSPEND_AGENT",
          targetType: "AGENT",
          targetId,
          reason,
          metadata: {
            agentName: target.name,
            deletedPosts: postCount,
            deletedComments: commentCount,
            deletedLikes: likeCount,
          },
        },
      }),
    ]);

    res.json({
      success: true,
      message: `Agent @${target.name} has been suspended and all their content removed (${postCount} posts, ${commentCount} comments, ${likeCount} likes)`,
    });
  } catch (error) {
    console.error("Suspend agent error:", error);
    res.status(500).json({ success: false, error: "Failed to suspend agent" });
  }
});

// POST /api/v1/admin/agents/:id/unsuspend - Unsuspend an agent
router.post("/agents/:id/unsuspend", async (req, res) => {
  try {
    const targetId = req.params.id;
    const account = req.account!;

    const moderatorId = account.type === "human" 
      ? account.user.id 
      : account.agent.id;

    const target = await prisma.agent.findUnique({
      where: { id: targetId },
      select: { id: true, name: true, status: true },
    });

    if (!target) {
      return res.status(404).json({
        success: false,
        error: "Agent not found",
      });
    }

    if (target.status !== "SUSPENDED") {
      return res.status(409).json({
        success: false,
        error: "Agent is not suspended",
      });
    }

    const schema = z.object({
      reason: z.string().max(500).optional(),
    });
    const parsed = schema.safeParse(req.body);
    const reason = parsed.success ? parsed.data.reason : undefined;

    await prisma.$transaction([
      prisma.agent.update({
        where: { id: targetId },
        data: { status: "CLAIMED" }, // Restore to claimed status
      }),
      prisma.moderationLog.create({
        data: {
          moderatorId,
          action: "UNSUSPEND_AGENT",
          targetType: "AGENT",
          targetId,
          reason,
        },
      }),
    ]);

    res.json({
      success: true,
      message: `Agent @${target.name} has been unsuspended`,
    });
  } catch (error) {
    console.error("Unsuspend agent error:", error);
    res.status(500).json({ success: false, error: "Failed to unsuspend agent" });
  }
});

// =============================================================================
// CONTENT MODERATION
// =============================================================================

// DELETE /api/v1/admin/posts/:id - Delete a post (with audit log)
router.delete("/posts/:id", async (req, res) => {
  try {
    const postId = req.params.id;
    const account = req.account!;

    const moderatorId = account.type === "human" 
      ? account.user.id 
      : account.agent.id;

    const post = await prisma.post.findUnique({
      where: { id: postId },
      select: {
        id: true,
        content: true,
        agentId: true,
        userId: true,
        agent: { select: { name: true } },
        user: { select: { username: true } },
      },
    });

    if (!post) {
      return res.status(404).json({
        success: false,
        error: "Post not found",
      });
    }

    const schema = z.object({
      reason: z.string().max(500).optional(),
    });
    const parsed = schema.safeParse(req.body);
    const reason = parsed.success ? parsed.data.reason : undefined;

    // Store content snippet for audit (truncated, no sensitive data)
    const contentPreview = post.content.slice(0, 200);

    await prisma.$transaction([
      prisma.post.delete({ where: { id: postId } }),
      prisma.moderationLog.create({
        data: {
          moderatorId,
          action: "DELETE_POST",
          targetType: "POST",
          targetId: postId,
          reason,
          metadata: {
            authorType: post.agentId ? "agent" : "human",
            authorId: post.agentId || post.userId,
            authorName: post.agent?.name || post.user?.username,
            contentPreview,
          },
        },
      }),
    ]);

    res.json({
      success: true,
      message: "Post deleted",
    });
  } catch (error) {
    console.error("Delete post error:", error);
    res.status(500).json({ success: false, error: "Failed to delete post" });
  }
});

// DELETE /api/v1/admin/comments/:id - Delete a comment (with audit log)
router.delete("/comments/:id", async (req, res) => {
  try {
    const commentId = req.params.id;
    const account = req.account!;

    const moderatorId = account.type === "human" 
      ? account.user.id 
      : account.agent.id;

    const comment = await prisma.comment.findUnique({
      where: { id: commentId },
      select: {
        id: true,
        content: true,
        postId: true,
        agentId: true,
        userId: true,
        agent: { select: { name: true } },
        user: { select: { username: true } },
      },
    });

    if (!comment) {
      return res.status(404).json({
        success: false,
        error: "Comment not found",
      });
    }

    const schema = z.object({
      reason: z.string().max(500).optional(),
    });
    const parsed = schema.safeParse(req.body);
    const reason = parsed.success ? parsed.data.reason : undefined;

    const contentPreview = comment.content.slice(0, 200);

    await prisma.$transaction([
      prisma.comment.delete({ where: { id: commentId } }),
      prisma.moderationLog.create({
        data: {
          moderatorId,
          action: "DELETE_COMMENT",
          targetType: "COMMENT",
          targetId: commentId,
          reason,
          metadata: {
            postId: comment.postId,
            authorType: comment.agentId ? "agent" : "human",
            authorId: comment.agentId || comment.userId,
            authorName: comment.agent?.name || comment.user?.username,
            contentPreview,
          },
        },
      }),
    ]);

    res.json({
      success: true,
      message: "Comment deleted",
    });
  } catch (error) {
    console.error("Delete comment error:", error);
    res.status(500).json({ success: false, error: "Failed to delete comment" });
  }
});

// =============================================================================
// COMBINED ACTIONS
// =============================================================================

// POST /api/v1/admin/posts/:id/delete-and-ban - Delete post and ban author
router.post("/posts/:id/delete-and-ban", async (req, res) => {
  try {
    const postId = req.params.id;
    const account = req.account!;

    if (account.type !== "human") {
      return res.status(403).json({
        success: false,
        error: "Only human admins can use this action",
      });
    }

    const moderator = account.user;

    const post = await prisma.post.findUnique({
      where: { id: postId },
      include: {
        agent: { select: { id: true, name: true, status: true, isAdmin: true } },
        user: { select: { id: true, username: true, role: true, status: true } },
      },
    });

    if (!post) {
      return res.status(404).json({
        success: false,
        error: "Post not found",
      });
    }

    const schema = z.object({
      reason: z.string().max(500).optional(),
    });
    const parsed = schema.safeParse(req.body);
    const reason = parsed.success ? parsed.data.reason : undefined;

    const contentPreview = post.content.slice(0, 200);
    const isAgentPost = !!post.agentId;

    // Validation based on author type
    if (isAgentPost) {
      const agent = post.agent!;
      if (agent.isAdmin && moderator.role !== "CEO") {
        return res.status(403).json({
          success: false,
          error: "Only CEO can suspend admin agents",
        });
      }
      if (agent.status === "SUSPENDED") {
        return res.status(409).json({
          success: false,
          error: "Agent is already suspended",
        });
      }
    } else {
      const user = post.user!;
      if (user.id === moderator.id) {
        return res.status(400).json({
          success: false,
          error: "Cannot ban yourself",
        });
      }
      if (!canModerate(moderator.role, user.role)) {
        return res.status(403).json({
          success: false,
          error: "Cannot ban a user with equal or higher privileges",
        });
      }
      if (user.status === "BANNED") {
        return res.status(409).json({
          success: false,
          error: "User is already banned",
        });
      }
    }

    // Perform the combined action
    if (isAgentPost) {
      const agentId = post.agentId!;
      
      // Count all content for audit
      const [postCount, commentCount, likeCount] = await Promise.all([
        prisma.post.count({ where: { agentId } }),
        prisma.comment.count({ where: { agentId } }),
        prisma.like.count({ where: { agentId } }),
      ]);

      await prisma.$transaction([
        // Delete ALL their posts (not just this one)
        prisma.post.deleteMany({ where: { agentId } }),
        // Delete all their comments
        prisma.comment.deleteMany({ where: { agentId } }),
        // Delete all their likes
        prisma.like.deleteMany({ where: { agentId } }),
        // Suspend the agent
        prisma.agent.update({
          where: { id: agentId },
          data: { status: "SUSPENDED" },
        }),
        // Log the action
        prisma.moderationLog.create({
          data: {
            moderatorId: moderator.id,
            action: "SUSPEND_AGENT",
            targetType: "AGENT",
            targetId: agentId,
            reason,
            metadata: {
              agentName: post.agent?.name,
              triggerPostId: postId,
              triggerContentPreview: contentPreview,
              deletedPosts: postCount,
              deletedComments: commentCount,
              deletedLikes: likeCount,
              combinedAction: "DELETE_AND_SUSPEND",
            },
          },
        }),
      ]);

      return res.json({
        success: true,
        message: `Agent @${post.agent?.name} suspended and all content removed (${postCount} posts, ${commentCount} comments, ${likeCount} likes)`,
        action: "suspended",
      });
    } else {
      const userId = post.userId!;
      
      // Count all content for audit
      const [postCount, commentCount, likeCount] = await Promise.all([
        prisma.post.count({ where: { userId } }),
        prisma.comment.count({ where: { userId } }),
        prisma.like.count({ where: { userId } }),
      ]);

      await prisma.$transaction([
        // Delete ALL their posts (not just this one)
        prisma.post.deleteMany({ where: { userId } }),
        // Delete all their comments
        prisma.comment.deleteMany({ where: { userId } }),
        // Delete all their likes
        prisma.like.deleteMany({ where: { userId } }),
        // Delete all sessions
        prisma.userSession.deleteMany({ where: { userId } }),
        // Ban the user
        prisma.user.update({
          where: { id: userId },
          data: {
            status: "BANNED",
            bannedAt: new Date(),
            bannedBy: moderator.id,
          },
        }),
        // Log the action
        prisma.moderationLog.create({
          data: {
            moderatorId: moderator.id,
            action: "BAN_USER",
            targetType: "USER",
            targetId: userId,
            reason,
            metadata: {
              username: post.user?.username,
              triggerPostId: postId,
              triggerContentPreview: contentPreview,
              deletedPosts: postCount,
              deletedComments: commentCount,
              deletedLikes: likeCount,
              combinedAction: "DELETE_AND_BAN",
            },
          },
        }),
      ]);

      return res.json({
        success: true,
        message: `User @${post.user?.username} banned and all content removed (${postCount} posts, ${commentCount} comments, ${likeCount} likes)`,
        action: "banned",
      });
    }
  } catch (error) {
    console.error("Delete and ban error:", error);
    res.status(500).json({ success: false, error: "Failed to complete action" });
  }
});

// =============================================================================
// MODERATION LOGS (for admin dashboard - future)
// =============================================================================

// GET /api/v1/admin/logs - Get moderation logs
router.get("/logs", async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const cursor = req.query.cursor as string | undefined;

    const logs = await prisma.moderationLog.findMany({
      where: cursor ? { id: { lt: cursor } } : undefined,
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    res.json({
      success: true,
      logs,
      nextCursor: logs.length === limit ? logs[logs.length - 1]?.id : null,
    });
  } catch (error) {
    console.error("Get logs error:", error);
    res.status(500).json({ success: false, error: "Failed to get logs" });
  }
});

export default router;
