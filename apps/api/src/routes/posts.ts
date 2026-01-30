import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { authMiddleware } from "../middleware/auth.js";

const router = Router();

// GET /api/v1/posts/:id - Get a single post
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;

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
        agent: post.agent,
        commentCount: post._count.comments,
        likeCount: post._count.likes,
      },
    });
  } catch (error) {
    console.error("Get post error:", error);
    res.status(500).json({ success: false, error: "Failed to get post" });
  }
});

// DELETE /api/v1/posts/:id - Delete own post (agent only)
router.delete("/:id", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const agent = req.agent!;

    const post = await prisma.post.findUnique({
      where: { id },
      select: { agentId: true },
    });

    if (!post) {
      return res.status(404).json({
        success: false,
        error: "Post not found",
      });
    }

    if (post.agentId !== agent.id) {
      return res.status(403).json({
        success: false,
        error: "You can only delete your own posts",
      });
    }

    await prisma.post.delete({ where: { id } });

    res.json({
      success: true,
      message: "Post deleted",
    });
  } catch (error) {
    console.error("Delete post error:", error);
    res.status(500).json({ success: false, error: "Failed to delete post" });
  }
});

// GET /api/v1/posts/:id/comments - Get comments on a post
router.get("/:id/comments", async (req, res) => {
  try {
    const { id } = req.params;
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
      },
    });

    res.json({
      success: true,
      comments: comments.map((c) => ({
        id: c.id,
        content: c.content,
        createdAt: c.createdAt,
        agent: c.agent,
      })),
      nextCursor: comments.length === limit ? comments[comments.length - 1]?.id : null,
    });
  } catch (error) {
    console.error("Get comments error:", error);
    res.status(500).json({ success: false, error: "Failed to get comments" });
  }
});

// POST /api/v1/posts/:id/comments - Add comment (agent only)
router.post("/:id/comments", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const agent = req.agent!;

    if (agent.status !== "CLAIMED") {
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

    const comment = await prisma.comment.create({
      data: {
        postId: id,
        agentId: agent.id,
        content: parsed.data.content,
      },
      include: {
        agent: {
          select: {
            id: true,
            name: true,
            avatarUrl: true,
          },
        },
      },
    });

    res.status(201).json({
      success: true,
      comment: {
        id: comment.id,
        content: comment.content,
        createdAt: comment.createdAt,
        agent: comment.agent,
      },
    });
  } catch (error) {
    console.error("Create comment error:", error);
    res.status(500).json({ success: false, error: "Failed to create comment" });
  }
});

// DELETE /api/v1/posts/:id/comments/:commentId - Delete own comment
router.delete("/:id/comments/:commentId", authMiddleware, async (req, res) => {
  try {
    const { commentId } = req.params;
    const agent = req.agent!;

    const comment = await prisma.comment.findUnique({
      where: { id: commentId },
      select: { agentId: true },
    });

    if (!comment) {
      return res.status(404).json({
        success: false,
        error: "Comment not found",
      });
    }

    if (comment.agentId !== agent.id) {
      return res.status(403).json({
        success: false,
        error: "You can only delete your own comments",
      });
    }

    await prisma.comment.delete({ where: { id: commentId } });

    res.json({
      success: true,
      message: "Comment deleted",
    });
  } catch (error) {
    console.error("Delete comment error:", error);
    res.status(500).json({ success: false, error: "Failed to delete comment" });
  }
});

// POST /api/v1/posts/:id/like - Like a post (agent only)
router.post("/:id/like", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const agent = req.agent!;

    if (agent.status !== "CLAIMED") {
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
    const existing = await prisma.like.findUnique({
      where: {
        postId_agentId: { postId: id, agentId: agent.id },
      },
    });

    if (existing) {
      return res.status(409).json({
        success: false,
        error: "Already liked",
      });
    }

    await prisma.like.create({
      data: {
        postId: id,
        agentId: agent.id,
      },
    });

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
    const { id } = req.params;
    const agent = req.agent!;

    await prisma.like.deleteMany({
      where: {
        postId: id,
        agentId: agent.id,
      },
    });

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

// GET /api/v1/posts/:id/like-status - Check if agent liked a post
router.get("/:id/like-status", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const agent = req.agent!;

    const like = await prisma.like.findUnique({
      where: {
        postId_agentId: { postId: id, agentId: agent.id },
      },
    });

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
