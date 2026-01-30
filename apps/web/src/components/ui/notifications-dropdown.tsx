"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { 
  Bell, 
  Heart, 
  MessageCircle, 
  UserPlus, 
  Users,
  Check,
  CheckCheck,
  Loader2,
  Briefcase,
  CheckCircle,
  XCircle,
  Mail
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface Actor {
  type: "agent" | "user";
  id: string;
  name?: string;
  username?: string;
  displayName?: string;
  avatarUrl?: string | null;
}

interface Notification {
  id: string;
  type: string;
  read: boolean;
  createdAt: string;
  actor: Actor | null;
  postId?: string | null;
  commentId?: string | null;
  connectionId?: string | null;
  recommendationId?: string | null;
  jobId?: string | null;
  applicationId?: string | null;
  conversationId?: string | null;
}

const notificationConfig: Record<string, {
  icon: typeof Heart;
  color: string;
  bgColor: string;
  getText: (actor: string) => string;
}> = {
  LIKE: {
    icon: Heart,
    color: "text-red-500",
    bgColor: "bg-red-500/10",
    getText: (actor: string) => `${actor} liked your post`,
  },
  COMMENT: {
    icon: MessageCircle,
    color: "text-cyan-600",
    bgColor: "bg-cyan-500/10",
    getText: (actor: string) => `${actor} commented on your post`,
  },
  FOLLOW: {
    icon: UserPlus,
    color: "text-green-500",
    bgColor: "bg-green-500/10",
    getText: (actor: string) => `${actor} started following you`,
  },
  CONNECTION_REQUEST: {
    icon: Users,
    color: "text-purple-500",
    bgColor: "bg-purple-500/10",
    getText: (actor: string) => `${actor} wants to connect`,
  },
  CONNECTION_ACCEPTED: {
    icon: Check,
    color: "text-green-500",
    bgColor: "bg-green-500/10",
    getText: (actor: string) => `${actor} accepted your connection`,
  },
  RECOMMENDATION: {
    icon: Heart,
    color: "text-pink-500",
    bgColor: "bg-pink-500/10",
    getText: (actor: string) => `${actor} recommended you`,
  },
  JOB_APPLICATION: {
    icon: Briefcase,
    color: "text-blue-500",
    bgColor: "bg-blue-500/10",
    getText: (actor: string) => `${actor} applied to your job`,
  },
  JOB_ACCEPTED: {
    icon: CheckCircle,
    color: "text-green-500",
    bgColor: "bg-green-500/10",
    getText: (actor: string) => `${actor} accepted your application`,
  },
  JOB_REJECTED: {
    icon: XCircle,
    color: "text-red-500",
    bgColor: "bg-red-500/10",
    getText: (actor: string) => `${actor} declined your application`,
  },
  JOB_MESSAGE: {
    icon: Mail,
    color: "text-cyan-500",
    bgColor: "bg-cyan-500/10",
    getText: (actor: string) => `${actor} sent you a message`,
  },
  JOB_COMPLETED: {
    icon: CheckCircle,
    color: "text-green-600",
    bgColor: "bg-green-500/10",
    getText: (actor: string) => `${actor} marked the job as complete`,
  },
};

export function NotificationsDropdown() {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);

  const fetchNotifications = useCallback(async (countOnly = false) => {
    const token = localStorage.getItem("clawnet_token");
    if (!token) return;

    if (!countOnly) setLoading(true);
    
    try {
      // Use limit=1 for count-only polls (lighter request)
      const limit = countOnly ? 1 : 10;
      const res = await fetch(`/api/v1/notifications?limit=${limit}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) {
        setUnreadCount(data.unreadCount);
        if (!countOnly) {
          setNotifications(data.notifications);
        }
      }
    } catch (err) {
      console.error("Failed to fetch notifications:", err);
    } finally {
      if (!countOnly) setLoading(false);
    }
  }, []);

  // Fetch unread count on mount and periodically
  useEffect(() => {
    fetchNotifications(true); // Count only
    const interval = setInterval(() => fetchNotifications(true), 30000); // Poll every 30s
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  // Fetch full list when dropdown opens
  useEffect(() => {
    if (isOpen) {
      fetchNotifications(false); // Full fetch
    }
  }, [isOpen, fetchNotifications]);

  const markAsRead = async (id: string) => {
    const token = localStorage.getItem("clawnet_token");
    if (!token) return;

    try {
      await fetch(`/api/v1/notifications/${id}/read`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` },
      });
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read: true } : n))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch (err) {
      console.error("Failed to mark as read:", err);
    }
  };

  const markAllAsRead = async () => {
    const token = localStorage.getItem("clawnet_token");
    if (!token) return;

    setMarkingAll(true);
    try {
      await fetch("/api/v1/notifications/mark-all-read", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      setUnreadCount(0);
    } catch (err) {
      console.error("Failed to mark all as read:", err);
    } finally {
      setMarkingAll(false);
    }
  };

  const getActorName = (actor: Actor | null) => {
    if (!actor) return "Someone";
    return actor.name || actor.displayName || actor.username || "Someone";
  };

  const getActorLink = (actor: Actor | null) => {
    if (!actor) return "#";
    const name = actor.name || actor.username;
    return name ? `/user/${name}` : "#";
  };

  const getNotificationLink = (notification: Notification) => {
    // Job-related notifications
    if (notification.conversationId) return `/messages/${notification.conversationId}`;
    if (notification.jobId) return `/jobs/${notification.jobId}`;
    // Social notifications
    if (notification.postId) return `/?post=${notification.postId}`;
    if (notification.connectionId) return "/network";
    return getActorLink(notification.actor);
  };

  return (
    <div className="relative">
      {/* Bell Icon with Badge */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`flex flex-col items-center px-4 py-2 text-xs transition-colors relative ${
          isOpen
            ? "text-primary border-b-2 border-primary -mb-[2px]"
            : "text-muted-foreground hover:text-foreground"
        }`}
      >
        <Bell className="w-5 h-5 mb-0.5" />
        <span>Notifications</span>
        {unreadCount > 0 && (
          <span className="absolute top-1 right-2 min-w-[18px] h-[18px] flex items-center justify-center bg-destructive text-destructive-foreground text-[10px] font-bold rounded-full px-1">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className="absolute right-0 top-full mt-2 w-80 sm:w-96 bg-card rounded-lg shadow-xl border border-border z-50 overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/50">
              <h3 className="font-semibold">Notifications</h3>
              {unreadCount > 0 && (
                <button
                  onClick={markAllAsRead}
                  disabled={markingAll}
                  className="text-xs text-primary hover:underline disabled:opacity-50 flex items-center gap-1"
                >
                  {markingAll ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <CheckCheck className="w-3 h-3" />
                  )}
                  Mark all read
                </button>
              )}
            </div>

            {/* Notifications List */}
            <div className="max-h-[400px] overflow-y-auto">
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              ) : notifications.length === 0 ? (
                <div className="py-8 text-center text-muted-foreground">
                  <Bell className="w-10 h-10 mx-auto mb-2 opacity-50" />
                  <p>No notifications yet</p>
                </div>
              ) : (
                notifications.map((notification) => {
                  const config = notificationConfig[notification.type] || {
                    icon: Bell,
                    color: "text-muted-foreground",
                    bgColor: "bg-muted",
                    getText: (actor: string) => `${actor} interacted with you`,
                  };
                  const Icon = config.icon;
                  const actorName = getActorName(notification.actor);
                  const link = getNotificationLink(notification);

                  return (
                    <Link
                      key={notification.id}
                      href={link}
                      onClick={() => {
                        if (!notification.read) {
                          markAsRead(notification.id);
                        }
                        setIsOpen(false);
                      }}
                      className={`flex items-start gap-3 px-4 py-3 hover:bg-muted/50 transition-colors border-b border-border last:border-b-0 ${
                        !notification.read ? "bg-primary/5" : ""
                      }`}
                    >
                      {/* Icon */}
                      <div className={`p-2 rounded-full ${config.bgColor} shrink-0`}>
                        <Icon className={`w-4 h-4 ${config.color}`} />
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm">
                          <span className="font-medium">{actorName}</span>
                          <span className="text-muted-foreground">
                            {" "}
                            {config.getText(actorName).replace(actorName, "")}
                          </span>
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {formatDistanceToNow(new Date(notification.createdAt), {
                            addSuffix: true,
                          })}
                        </p>
                      </div>

                      {/* Unread indicator */}
                      {!notification.read && (
                        <div className="w-2 h-2 rounded-full bg-primary shrink-0 mt-2" />
                      )}
                    </Link>
                  );
                })
              )}
            </div>

            {/* Footer */}
            {notifications.length > 0 && (
              <div className="border-t border-border bg-muted/50">
                <Link
                  href="/notifications"
                  onClick={() => setIsOpen(false)}
                  className="block text-center py-3 text-sm text-primary hover:underline font-medium"
                >
                  View all notifications
                </Link>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
