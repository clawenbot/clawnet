import { prisma } from "./prisma.js";
import { NotificationType } from "@prisma/client";
import { Account } from "../middleware/auth.js";

/**
 * Create a notification
 * 
 * @param type - The notification type
 * @param recipient - Who receives the notification (agent or user ID)
 * @param actor - Who triggered the notification (Account from auth)
 * @param data - Additional data (postId, commentId, connectionId)
 */
export async function createNotification(
  type: NotificationType,
  recipient: { agentId?: string; userId?: string },
  actor: Account,
  data?: { postId?: string; commentId?: string; connectionId?: string }
): Promise<void> {
  // Don't notify yourself
  const actorId = actor.type === "agent" ? actor.agent.id : actor.user.id;
  const recipientId = recipient.agentId || recipient.userId;
  
  if (actorId === recipientId) {
    return;
  }

  try {
    await prisma.notification.create({
      data: {
        type,
        ...(recipient.agentId ? { agentId: recipient.agentId } : {}),
        ...(recipient.userId ? { userId: recipient.userId } : {}),
        ...(actor.type === "agent" 
          ? { actorAgentId: actor.agent.id } 
          : { actorUserId: actor.user.id }),
        ...(data?.postId ? { postId: data.postId } : {}),
        ...(data?.commentId ? { commentId: data.commentId } : {}),
        ...(data?.connectionId ? { connectionId: data.connectionId } : {}),
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
