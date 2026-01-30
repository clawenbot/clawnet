import { prisma } from "./prisma.js";
import { NotificationType } from "@prisma/client";
import { Account } from "../middleware/auth.js";

interface CreateNotificationParams {
  type?: NotificationType;
  recipientAgentId?: string;
  recipientUserId?: string;
  actorAgentId?: string;
  actorUserId?: string;
  postId?: string;
  commentId?: string;
  connectionId?: string;
  recommendationId?: string;
}

/**
 * Create a notification (flexible params version)
 */
export async function createNotification(params: CreateNotificationParams): Promise<void>;

/**
 * Create a notification (legacy signature for backwards compatibility)
 */
export async function createNotification(
  type: NotificationType,
  recipient: { agentId?: string; userId?: string },
  actor: Account,
  data?: { postId?: string; commentId?: string; connectionId?: string }
): Promise<void>;

export async function createNotification(
  typeOrParams: NotificationType | CreateNotificationParams,
  recipient?: { agentId?: string; userId?: string },
  actor?: Account,
  data?: { postId?: string; commentId?: string; connectionId?: string }
): Promise<void> {
  let params: CreateNotificationParams;

  // Handle new params-object signature
  if (typeof typeOrParams === "object") {
    params = typeOrParams;
  } else {
    // Legacy signature
    params = {
      type: typeOrParams,
      recipientAgentId: recipient?.agentId,
      recipientUserId: recipient?.userId,
      actorAgentId: actor?.type === "agent" ? actor.agent.id : undefined,
      actorUserId: actor?.type === "human" ? actor.user.id : undefined,
      postId: data?.postId,
      commentId: data?.commentId,
      connectionId: data?.connectionId,
    };
  }

  // Don't notify yourself
  const actorId = params.actorAgentId || params.actorUserId;
  const recipientId = params.recipientAgentId || params.recipientUserId;
  
  if (actorId === recipientId) {
    return;
  }

  try {
    await prisma.notification.create({
      data: {
        type: params.type!,
        ...(params.recipientAgentId ? { agentId: params.recipientAgentId } : {}),
        ...(params.recipientUserId ? { userId: params.recipientUserId } : {}),
        ...(params.actorAgentId ? { actorAgentId: params.actorAgentId } : {}),
        ...(params.actorUserId ? { actorUserId: params.actorUserId } : {}),
        ...(params.postId ? { postId: params.postId } : {}),
        ...(params.commentId ? { commentId: params.commentId } : {}),
        ...(params.connectionId ? { connectionId: params.connectionId } : {}),
        ...(params.recommendationId ? { recommendationId: params.recommendationId } : {}),
      },
    });
  } catch (err) {
    // Log but don't fail the main operation if notification creation fails
    console.error("Failed to create notification:", err);
  }
}

/**
 * Create notification for a like on a post
 */
export async function notifyLike(postId: string, actor: Account): Promise<void> {
  const post = await prisma.post.findUnique({
    where: { id: postId },
    select: { agentId: true, userId: true },
  });

  if (!post) return;

  await createNotification(
    "LIKE",
    { agentId: post.agentId ?? undefined, userId: post.userId ?? undefined },
    actor,
    { postId }
  );
}

/**
 * Create notification for a comment on a post
 */
export async function notifyComment(
  postId: string,
  commentId: string,
  actor: Account
): Promise<void> {
  const post = await prisma.post.findUnique({
    where: { id: postId },
    select: { agentId: true, userId: true },
  });

  if (!post) return;

  await createNotification(
    "COMMENT",
    { agentId: post.agentId ?? undefined, userId: post.userId ?? undefined },
    actor,
    { postId, commentId }
  );
}

/**
 * Create notification for a new follower
 */
export async function notifyFollow(agentId: string, actor: Account): Promise<void> {
  await createNotification("FOLLOW", { agentId }, actor);
}

/**
 * Create notification for a connection request
 */
export async function notifyConnectionRequest(
  toAgentId: string,
  connectionId: string,
  actor: Account
): Promise<void> {
  await createNotification("CONNECTION_REQUEST", { agentId: toAgentId }, actor, { connectionId });
}

/**
 * Create notification for an accepted connection request
 */
export async function notifyConnectionAccepted(
  toAgentId: string,
  connectionId: string,
  actor: Account
): Promise<void> {
  await createNotification("CONNECTION_ACCEPTED", { agentId: toAgentId }, actor, { connectionId });
}
