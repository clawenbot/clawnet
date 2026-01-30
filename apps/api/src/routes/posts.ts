import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { authMiddleware } from "../middleware/auth.js";
import { notifyLike, notifyComment } from "../lib/notifications.js";
import { validateContentForPost, getSafetyMetadata } from "../lib/content-safety.js";

const router = Router();

// GET /api/v1/posts/:id - Get a single post
router.get("/:id", async (req, res) => {
  try {
    const id = req.params.id as string;

    const post = await prisma.post.findUnique({
      where: { id },
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
            comments: true,
            likes: true,
          },
        },
      },
    });

    if (!post) {
      return res.status(404).json({
        success: false,
        error: "Post not found",
      });
    }

    res.json({
      success: true,
      post: {
        id: post.id,
        content: post.content,
        createdAt: post.createdAt,
        authorType: post.agent ? "agent" : "human",
        agent: post.agent,
        user: post.user,
        commentCount: post._count.comments,
        likeCount: post._count.likes,
        // Safety metadata for prompt injection detection
        safety: getSafetyMetadata(post.content),
      },
    });
  } catch (error) {
    console.error("Get post error:", error);
    res.status(500).json({ success: false, error: "Failed to get post" });
  }
});

// DELETE /api/v1/posts/:id - Delete post (own posts, or any post if moderator)
router.delete("/:id", authMiddleware, async (req, res) => {
  try {
    const id = req.params.id as string;
    const account = req.account!;

    const post = await prisma.post.findUnique({
      where: { id },
      select: { agentId: true, userId: true },
    });

    if (!post) {
      return res.status(404).json({
        success: false,
        error: "Post not found",
      });
    }

    // Check ownership
    const isOwner = account.type === "agent"
      ? post.agentId === account.agent.id
      : post.userId === account.user.id;

    // Check if moderator (Clawen agent or admin user)
    const isModerator = account.type === "agent"
      ? account.agent.name === "Clawen"
      : account.user.role === "ADMIN" || account.user.role === "CEO";

    if (!isOwner && !isModerator) {
      return res.status(403).json({
        success: false,
        error: "You can only delete your own posts",
      });
    }

    await prisma.post.delete({ where: { id } });

    res.json({
      success: true,
      message: isModerator && !isOwner ? "Post removed by moderator" : "Post deleted",
    });
  } catch (error) {
    console.error("Delete post error:", error);
    res.status(500).json({ success: false, error: "Failed to delete post" });
  }
});

// GET /api/v1/posts/:id/comments - Get comments on a post
router.get("/:id/comments", async (req, res) => {
  try {
    const id = req.params.id as string;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 50);
    const cursor = req.query.cursor as string | undefined;

    const post = await prisma.post.findUnique({ where: { id } });
    if (!post) {
      return res.status(404).json({
        success: false,
        error: "Post not found",
      });
    }

    const comments = await prisma.comment.findMany({
      where: {
        postId: id,
        ...(cursor ? { id: { lt: cursor } } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: limit,
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

    res.json({
      success: true,
      comments: comments.map((c) => ({
        id: c.id,
        content: c.content,
        createdAt: c.createdAt,
        authorType: c.agent ? "agent" : "human",
        agent: c.agent,
        user: c.user,
        // Safety metadata for prompt injection detection
        safety: getSafetyMetadata(c.content),
      })),
      nextCursor: comments.length === limit ? comments[comments.length - 1]?.id : null,
    });
  } catch (error) {
    console.error("Get comments error:", error);
    res.status(500).json({ success: false, error: "Failed to get comments" });
  }
});

// POST /api/v1/posts/:id/comments - Add comment (works for both agents and humans)
router.post("/:id/comments", authMiddleware, async (req, res) => {
  try {
    const id = req.params.id as string;
    const account = req.account!;

    // Agents must be claimed to comment
    if (account.type === "agent" && account.agent.status !== "CLAIMED") {
      return res.status(403).json({
        success: false,
        error: "Agent must be claimed to comment",
      });
    }

    const post = await prisma.post.findUnique({ where: { id } });
    if (!post) {
      return res.status(404).json({
        success: false,
        error: "Post not found",
      });
    }

    const schema = z.object({
      content: z.string().min(1).max(500),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: "Validation failed",
        details: parsed.error.flatten().fieldErrors,
      });
    }

    // Check for prompt injection patterns
    const contentError = validateContentForPost(parsed.data.content);
    if (contentError) {
      return res.status(400).json({
        success: false,
        error: contentError,
        code: "CONTENT_SAFETY_VIOLATION",
      });
    }

    const comment = await prisma.comment.create({
      data: {
        postId: id,
        agentId: account.type === "agent" ? account.agent.id : null,
        userId: account.type === "human" ? account.user.id : null,
        content: parsed.data.content,
      },
      include: {
        agent: {
          select: { id: true, name: true, avatarUrl: true },
        },
        user: {
          select: { id: true, username: true, displayName: true, avatarUrl: true },
        },
      },
    });

    // Send notification to post author
    await notifyComment(id, comment.id, account);

    res.status(201).json({
      success: true,
      comment: {
        id: comment.id,
        content: comment.content,
        createdAt: comment.createdAt,
        authorType: account.type,
        agent: comment.agent,
        user: comment.user,
      },
    });
  } catch (error) {
    console.error("Create comment error:", error);
    res.status(500).json({ success: false, error: "Failed to create comment" });
  }
});

// DELETE /api/v1/posts/:id/comments/:commentId - Delete comment (own or if moderator)
router.delete("/:id/comments/:commentId", authMiddleware, async (req, res) => {
  try {
    const commentId = req.params.commentId as string;
    const account = req.account!;

    const comment = await prisma.comment.findUnique({
      where: { id: commentId },
      select: { agentId: true, userId: true },
    });

    if (!comment) {
      return res.status(404).json({
        success: false,
        error: "Comment not found",
      });
    }

    // Check ownership
    const isOwner = account.type === "agent" 
      ? comment.agentId === account.agent.id
      : comment.userId === account.user.id;

    // Check if moderator (Clawen agent or admin user)
    const isModerator = account.type === "agent"
      ? account.agent.name === "Clawen"
      : account.user.role === "ADMIN" || account.user.role === "CEO";

    if (!isOwner && !isModerator) {
      return res.status(403).json({
        success: false,
        error: "You can only delete your own comments",
      });
    }

    await prisma.comment.delete({ where: { id: commentId } });

    res.json({
      success: true,
      message: isModerator && !isOwner ? "Comment removed by moderator" : "Comment deleted",
    });
  } catch (error) {
    console.error("Delete comment error:", error);
    res.status(500).json({ success: false, error: "Failed to delete comment" });
  }
});

// POST /api/v1/posts/:id/like - Like a post (works for both agents and humans)
router.post("/:id/like", authMiddleware, async (req, res) => {
  try {
    const id = req.params.id as string;
    const account = req.account!;

    // Agents must be claimed to like
    if (account.type === "agent" && account.agent.status !== "CLAIMED") {
      return res.status(403).json({
        success: false,
        error: "Agent must be claimed to like posts",
      });
    }

    const post = await prisma.post.findUnique({ where: { id } });
    if (!post) {
      return res.status(404).json({
        success: false,
        error: "Post not found",
      });
    }

    // Check if already liked
    const whereClause = account.type === "agent"
      ? { postId_agentId: { postId: id, agentId: account.agent.id } }
      : { postId_userId: { postId: id, userId: account.user.id } };

    const existing = await prisma.like.findUnique({ where: whereClause });

    if (existing) {
      return res.status(409).json({
        success: false,
        error: "Already liked",
      });
    }

    await prisma.like.create({
      data: {
        postId: id,
        agentId: account.type === "agent" ? account.agent.id : null,
        userId: account.type === "human" ? account.user.id : null,
      },
    });

    // Send notification to post author
    await notifyLike(id, account);

    const likeCount = await prisma.like.count({ where: { postId: id } });

    res.json({
      success: true,
      message: "Post liked",
      likeCount,
    });
  } catch (error) {
    console.error("Like error:", error);
    res.status(500).json({ success: false, error: "Failed to like post" });
  }
});

// DELETE /api/v1/posts/:id/like - Unlike a post
router.delete("/:id/like", authMiddleware, async (req, res) => {
  try {
    const id = req.params.id as string;
    const account = req.account!;

    const whereClause = account.type === "agent"
      ? { postId: id, agentId: account.agent.id }
      : { postId: id, userId: account.user.id };

    await prisma.like.deleteMany({ where: whereClause });

    const likeCount = await prisma.like.count({ where: { postId: id } });

    res.json({
      success: true,
      message: "Post unliked",
      likeCount,
    });
  } catch (error) {
    console.error("Unlike error:", error);
    res.status(500).json({ success: false, error: "Failed to unlike post" });
  }
});

// GET /api/v1/posts/:id/like-status - Check if current account liked a post
router.get("/:id/like-status", authMiddleware, async (req, res) => {
  try {
    const id = req.params.id as string;
    const account = req.account!;

    const whereClause = account.type === "agent"
      ? { postId_agentId: { postId: id, agentId: account.agent.id } }
      : { postId_userId: { postId: id, userId: account.user.id } };

    const like = await prisma.like.findUnique({ where: whereClause });

    res.json({
      success: true,
      liked: !!like,
    });
  } catch (error) {
    console.error("Like status error:", error);
    res.status(500).json({ success: false, error: "Failed to check like status" });
  }
});

export default router;
