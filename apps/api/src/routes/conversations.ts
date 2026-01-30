import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { authMiddleware } from "../middleware/auth.js";
import { validateContentForPost } from "../lib/content-safety.js";

const router = Router();

// ===========================================
// LIST CONVERSATIONS (INBOX)
// ===========================================

// GET /api/v1/conversations - List my conversations
router.get("/", authMiddleware, async (req, res) => {
  try {
    const account = req.account!;

    const whereClause = account.type === "agent"
      ? { agentId: account.agent.id }
      : { userId: account.user.id };

    const conversations = await prisma.conversation.findMany({
      where: whereClause,
      orderBy: { createdAt: "desc" },
      include: {
        job: {
          select: {
            id: true,
            title: true,
            status: true,
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
        agent: {
          select: {
            id: true,
            name: true,
            description: true,
            avatarUrl: true,
          },
        },
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: {
            id: true,
            content: true,
            createdAt: true,
            readAt: true,
            senderUserId: true,
            senderAgentId: true,
          },
        },
      },
    });

    // Count unread messages with a single grouped query (avoids N+1)
    const conversationIds = conversations.map((c) => c.id);
    const unreadCounts = await prisma.conversationMessage.groupBy({
      by: ["conversationId"],
      where: {
        conversationId: { in: conversationIds },
        readAt: null,
        // Unread means sent by the other party
        ...(account.type === "agent"
          ? { senderUserId: { not: null } }
          : { senderAgentId: { not: null } }),
      },
      _count: { id: true },
    });

    const unreadMap = new Map(unreadCounts.map((u) => [u.conversationId, u._count.id]));

    res.json({
      success: true,
      conversations: conversations.map((c) => {
        const lastMessage = c.messages[0];
        const isMyMessage = account.type === "agent"
          ? lastMessage?.senderAgentId === account.agent.id
          : lastMessage?.senderUserId === account.user.id;

        return {
          id: c.id,
          job: {
            id: c.job.id,
            title: c.job.title,
            status: c.job.status.toLowerCase(),
          },
          // Show the other party
          with: account.type === "agent" ? c.user : c.agent,
          withType: account.type === "agent" ? "human" : "agent",
          lastMessage: lastMessage ? {
            id: lastMessage.id,
            content: lastMessage.content.slice(0, 100) + (lastMessage.content.length > 100 ? "..." : ""),
            createdAt: lastMessage.createdAt,
            isRead: !!lastMessage.readAt,
            fromMe: isMyMessage,
          } : null,
          unreadCount: unreadMap.get(c.id) || 0,
          createdAt: c.createdAt,
        };
      }),
    });
  } catch (error) {
    console.error("List conversations error:", error);
    res.status(500).json({ success: false, error: "Failed to list conversations" });
  }
});

// ===========================================
// GET CONVERSATION / MESSAGES
// ===========================================

// GET /api/v1/conversations/:id - Get conversation messages
router.get("/:id", authMiddleware, async (req, res) => {
  try {
    const id = req.params.id as string;
    const account = req.account!;
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const cursor = req.query.cursor as string | undefined;

    const conversation = await prisma.conversation.findUnique({
      where: { id },
      include: {
        job: {
          select: {
            id: true,
            title: true,
            description: true,
            status: true,
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
        agent: {
          select: {
            id: true,
            name: true,
            description: true,
            avatarUrl: true,
          },
        },
      },
    });

    if (!conversation) {
      return res.status(404).json({
        success: false,
        error: "Conversation not found",
      });
    }

    // Check access
    const hasAccess = account.type === "agent"
      ? conversation.agentId === account.agent.id
      : conversation.userId === account.user.id;

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        error: "You don't have access to this conversation",
      });
    }

    // Get messages
    const messages = await prisma.conversationMessage.findMany({
      where: {
        conversationId: id,
        ...(cursor ? { id: { lt: cursor } } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      include: {
        senderUser: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true,
          },
        },
        senderAgent: {
          select: {
            id: true,
            name: true,
            avatarUrl: true,
          },
        },
      },
    });

    // Mark messages as read (from the other party)
    const unreadFromOther = messages.filter((m) => {
      if (m.readAt) return false;
      return account.type === "agent" 
        ? m.senderUserId !== null 
        : m.senderAgentId !== null;
    });

    if (unreadFromOther.length > 0) {
      await prisma.conversationMessage.updateMany({
        where: {
          id: { in: unreadFromOther.map((m) => m.id) },
        },
        data: { readAt: new Date() },
      });
    }

    res.json({
      success: true,
      conversation: {
        id: conversation.id,
        job: conversation.job,
        user: conversation.user,
        agent: conversation.agent,
        createdAt: conversation.createdAt,
      },
      messages: messages.reverse().map((m) => ({
        id: m.id,
        content: m.content,
        senderType: m.senderUser ? "human" : "agent",
        sender: m.senderUser || m.senderAgent,
        readAt: m.readAt,
        createdAt: m.createdAt,
      })),
      nextCursor: messages.length === limit ? messages[messages.length - 1]?.id : null,
    });
  } catch (error) {
    console.error("Get conversation error:", error);
    res.status(500).json({ success: false, error: "Failed to get conversation" });
  }
});

// ===========================================
// SEND MESSAGE
// ===========================================

const sendMessageSchema = z.object({
  content: z.string().min(1).max(5000),
});

// POST /api/v1/conversations/:id - Send message
router.post("/:id", authMiddleware, async (req, res) => {
  try {
    const id = req.params.id as string;
    const account = req.account!;

    const conversation = await prisma.conversation.findUnique({
      where: { id },
      include: {
        job: true,
      },
    });

    if (!conversation) {
      return res.status(404).json({
        success: false,
        error: "Conversation not found",
      });
    }

    // Check access
    const hasAccess = account.type === "agent"
      ? conversation.agentId === account.agent.id
      : conversation.userId === account.user.id;

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        error: "You don't have access to this conversation",
      });
    }

    // Check if job is still active
    if (conversation.job.status === "COMPLETED" || conversation.job.status === "CANCELLED") {
      return res.status(400).json({
        success: false,
        error: "Cannot send messages to completed/cancelled jobs",
      });
    }

    const parsed = sendMessageSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: "Validation failed",
        details: parsed.error.flatten().fieldErrors,
      });
    }

    // Check for prompt injection
    const contentError = validateContentForPost(parsed.data.content);
    if (contentError) {
      return res.status(400).json({
        success: false,
        error: contentError,
        code: "CONTENT_SAFETY_VIOLATION",
      });
    }

    const message = await prisma.conversationMessage.create({
      data: {
        conversationId: id,
        content: parsed.data.content,
        senderUserId: account.type === "human" ? account.user.id : null,
        senderAgentId: account.type === "agent" ? account.agent.id : null,
      },
      include: {
        senderUser: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true,
          },
        },
        senderAgent: {
          select: {
            id: true,
            name: true,
            avatarUrl: true,
          },
        },
      },
    });

    // Create notification for the other party
    const recipientIsAgent = account.type === "human";
    await prisma.notification.create({
      data: {
        agentId: recipientIsAgent ? conversation.agentId : null,
        userId: recipientIsAgent ? null : conversation.userId,
        type: "JOB_MESSAGE",
        actorAgentId: account.type === "agent" ? account.agent.id : null,
        actorUserId: account.type === "human" ? account.user.id : null,
        jobId: conversation.jobId,
        conversationId: conversation.id,
      },
    });

    res.status(201).json({
      success: true,
      message: {
        id: message.id,
        content: message.content,
        senderType: message.senderUser ? "human" : "agent",
        sender: message.senderUser || message.senderAgent,
        createdAt: message.createdAt,
      },
    });
  } catch (error) {
    console.error("Send message error:", error);
    res.status(500).json({ success: false, error: "Failed to send message" });
  }
});

// ===========================================
// GET CONVERSATION BY JOB ID (CONVENIENCE)
// ===========================================

// GET /api/v1/conversations/job/:jobId - Get conversation for a job
router.get("/job/:jobId", authMiddleware, async (req, res) => {
  try {
    const jobId = req.params.jobId as string;
    const account = req.account!;

    const conversation = await prisma.conversation.findUnique({
      where: { jobId },
      include: {
        job: {
          select: {
            id: true,
            title: true,
            status: true,
          },
        },
      },
    });

    if (!conversation) {
      return res.status(404).json({
        success: false,
        error: "No conversation found for this job",
      });
    }

    // Check access
    const hasAccess = account.type === "agent"
      ? conversation.agentId === account.agent.id
      : conversation.userId === account.user.id;

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        error: "You don't have access to this conversation",
      });
    }

    // Redirect to the main conversation endpoint
    res.json({
      success: true,
      conversationId: conversation.id,
      job: conversation.job,
    });
  } catch (error) {
    console.error("Get conversation by job error:", error);
    res.status(500).json({ success: false, error: "Failed to get conversation" });
  }
});

// ===========================================
// UNREAD COUNT (FOR POLLING)
// ===========================================

// GET /api/v1/conversations/unread - Get unread message count
router.get("/unread", authMiddleware, async (req, res) => {
  try {
    const account = req.account!;

    // Get all my conversations
    const whereClause = account.type === "agent"
      ? { agentId: account.agent.id }
      : { userId: account.user.id };

    const conversations = await prisma.conversation.findMany({
      where: whereClause,
      select: { id: true },
    });

    // Count unread messages
    const unreadCount = await prisma.conversationMessage.count({
      where: {
        conversationId: { in: conversations.map((c) => c.id) },
        readAt: null,
        // Unread means sent by the other party
        ...(account.type === "agent"
          ? { senderUserId: { not: null } }
          : { senderAgentId: { not: null } }),
      },
    });

    res.json({
      success: true,
      unreadCount,
    });
  } catch (error) {
    console.error("Get unread count error:", error);
    res.status(500).json({ success: false, error: "Failed to get unread count" });
  }
});

export default router;
