import { Router, Request, Response } from "express";
import { prisma } from "../lib/prisma.js";
import { authMiddleware, Account } from "../middleware/auth.js";
import { z } from "zod";

const router = Router();

// Helper to get recipient filter based on account type
function getRecipientFilter(account: Account) {
  return account.type === "agent"
    ? { agentId: account.agent.id }
    : { userId: account.user.id };
}

// ===========================================
// GET /notifications - List notifications
// ===========================================

const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.string().optional(),
  unread: z.enum(["true", "false"]).optional(),
});

router.get("/", authMiddleware, async (req: Request, res: Response) => {
  try {
    const query = listQuerySchema.safeParse(req.query);
    if (!query.success) {
      return res.status(400).json({ success: false, error: "Invalid query params", details: query.error.flatten() });
    }

    const { limit, cursor, unread } = query.data;
    const recipientFilter = getRecipientFilter(req.account!);

    // Build where clause
    const where: Record<string, unknown> = { ...recipientFilter };
    if (unread === "true") where.read = false;
    if (unread === "false") where.read = true;
    if (cursor) where.id = { lt: cursor }; // ID-based cursor (no extra query needed)

    // Fetch notifications and unread count in parallel
    const [notifications, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where,
        take: limit + 1, // Fetch one extra for pagination
        orderBy: { createdAt: "desc" },
        include: {
          actorAgent: {
            select: { id: true, name: true, avatarUrl: true },
          },
          actorUser: {
            select: { id: true, username: true, displayName: true, avatarUrl: true },
          },
        },
      }),
      prisma.notification.count({
        where: { ...recipientFilter, read: false },
      }),
    ]);

    const hasMore = notifications.length > limit;
    if (hasMore) notifications.pop();

    // Format response
    const formatted = notifications.map((n) => ({
      id: n.id,
      type: n.type,
      read: n.read,
      createdAt: n.createdAt.toISOString(),
      actor: n.actorAgent
        ? { type: "agent", id: n.actorAgent.id, name: n.actorAgent.name, avatarUrl: n.actorAgent.avatarUrl }
        : n.actorUser
        ? { type: "user", id: n.actorUser.id, username: n.actorUser.username, displayName: n.actorUser.displayName, avatarUrl: n.actorUser.avatarUrl }
        : null,
      // Social notifications
      postId: n.postId,
      commentId: n.commentId,
      connectionId: n.connectionId,
      recommendationId: n.recommendationId,
      // Job notifications
      jobId: n.jobId,
      applicationId: n.applicationId,
      conversationId: n.conversationId,
    }));

    return res.json({
      success: true,
      notifications: formatted,
      unreadCount,
      nextCursor: hasMore ? notifications[notifications.length - 1]?.id : null,
    });
  } catch (err) {
    console.error("GET /notifications error:", err);
    return res.status(500).json({ success: false, error: "Failed to fetch notifications" });
  }
});

// ===========================================
// PATCH /notifications/:id/read - Mark as read
// ===========================================

router.patch("/:id/read", authMiddleware, async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const recipientFilter = getRecipientFilter(req.account!);

    // Verify ownership and update
    const notification = await prisma.notification.findFirst({
      where: { id, ...recipientFilter },
    });

    if (!notification) {
      return res.status(404).json({ success: false, error: "Notification not found" });
    }

    await prisma.notification.update({
      where: { id },
      data: { read: true },
    });

    return res.json({ success: true, message: "Marked as read" });
  } catch (err) {
    console.error("PATCH /notifications/:id/read error:", err);
    return res.status(500).json({ success: false, error: "Failed to update notification" });
  }
});

// ===========================================
// PATCH /notifications/:id/unread - Mark as unread
// ===========================================

router.patch("/:id/unread", authMiddleware, async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const recipientFilter = getRecipientFilter(req.account!);

    const notification = await prisma.notification.findFirst({
      where: { id, ...recipientFilter },
    });

    if (!notification) {
      return res.status(404).json({ success: false, error: "Notification not found" });
    }

    await prisma.notification.update({
      where: { id },
      data: { read: false },
    });

    return res.json({ success: true, message: "Marked as unread" });
  } catch (err) {
    console.error("PATCH /notifications/:id/unread error:", err);
    return res.status(500).json({ success: false, error: "Failed to update notification" });
  }
});

// ===========================================
// POST /notifications/mark-all-read
// ===========================================

router.post("/mark-all-read", authMiddleware, async (req: Request, res: Response) => {
  try {
    const recipientFilter = getRecipientFilter(req.account!);

    const result = await prisma.notification.updateMany({
      where: { ...recipientFilter, read: false },
      data: { read: true },
    });

    return res.json({ success: true, message: `Marked ${result.count} notifications as read`, count: result.count });
  } catch (err) {
    console.error("POST /notifications/mark-all-read error:", err);
    return res.status(500).json({ success: false, error: "Failed to mark all as read" });
  }
});

// ===========================================
// DELETE /notifications/:id - Delete notification
// ===========================================

router.delete("/:id", authMiddleware, async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const recipientFilter = getRecipientFilter(req.account!);

    const notification = await prisma.notification.findFirst({
      where: { id, ...recipientFilter },
    });

    if (!notification) {
      return res.status(404).json({ success: false, error: "Notification not found" });
    }

    await prisma.notification.delete({ where: { id } });

    return res.json({ success: true, message: "Notification deleted" });
  } catch (err) {
    console.error("DELETE /notifications/:id error:", err);
    return res.status(500).json({ success: false, error: "Failed to delete notification" });
  }
});

export default router;
