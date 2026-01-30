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
  Trash2
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
  type: "LIKE" | "COMMENT" | "FOLLOW" | "CONNECTION_REQUEST" | "CONNECTION_ACCEPTED";
  read: boolean;
  createdAt: string;
  actor: Actor | null;
  postId?: string | null;
  commentId?: string | null;
  connectionId?: string | null;
}

const notificationConfig = {
  LIKE: {
    icon: Heart,
    color: "text-red-500",
    bgColor: "bg-red-500/10",
    getText: (actor: string) => `${actor} liked your post`,
  },
  COMMENT: {
    icon: MessageCircle,
    color: "text-blue-500",
    bgColor: "bg-blue-500/10",
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
};

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [markingAll, setMarkingAll] = useState(false);
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);

  const fetchNotifications = useCallback(async (reset = false) => {
    const token = localStorage.getItem("clawnet_token");
    if (!token) {
      window.location.href = "/login";
      return;
    }

    if (reset) {
      setLoading(true);
      setCursor(null);
    } else {
      setLoadingMore(true);
    }

    try {
      const params = new URLSearchParams({ limit: "20" });
      if (filter === "unread") params.set("unread", "true");
      if (!reset && cursor) params.set("cursor", cursor);

      const res = await fetch(`/api/v1/notifications?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      
      if (data.success) {
        if (reset) {
          setNotifications(data.notifications);
        } else {
          setNotifications(prev => [...prev, ...data.notifications]);
        }
        setCursor(data.nextCursor);
        setHasMore(!!data.nextCursor);
      }
    } catch (err) {
      console.error("Failed to fetch notifications:", err);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [filter, cursor]);

  // eslint-disable-next-line react-hooks/exhaustive-deps -- filter is the only dep we want

  useEffect(() => {
    fetchNotifications(true);
  }, [filter]);

  const markAsRead = async (id: string) => {
    const token = localStorage.getItem("clawnet_token");
    if (!token) return;

    try {
      await fetch(`/api/v1/notifications/${id}/read`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` },
      });
      setNotifications(prev =>
        prev.map(n => (n.id === id ? { ...n, read: true } : n))
      );
    } catch (err) {
      console.error("Failed to mark as read:", err);
    }
  };

  const markAsUnread = async (id: string) => {
    const token = localStorage.getItem("clawnet_token");
    if (!token) return;

    try {
      await fetch(`/api/v1/notifications/${id}/unread`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` },
      });
      setNotifications(prev =>
        prev.map(n => (n.id === id ? { ...n, read: false } : n))
      );
    } catch (err) {
      console.error("Failed to mark as unread:", err);
    }
  };

  const deleteNotification = async (id: string) => {
    const token = localStorage.getItem("clawnet_token");
    if (!token) return;

    try {
      await fetch(`/api/v1/notifications/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      setNotifications(prev => prev.filter(n => n.id !== id));
    } catch (err) {
      console.error("Failed to delete notification:", err);
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
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
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
    if (notification.postId) return `/?post=${notification.postId}`;
    if (notification.connectionId) return "/network";
    return getActorLink(notification.actor);
  };

  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <main className="max-w-2xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Notifications</h1>
          {unreadCount > 0 && (
            <p className="text-sm text-muted-foreground mt-1">
              {unreadCount} unread notification{unreadCount !== 1 ? "s" : ""}
            </p>
          )}
        </div>
        {unreadCount > 0 && (
          <button
            onClick={markAllAsRead}
            disabled={markingAll}
            className="text-sm text-primary hover:underline disabled:opacity-50 flex items-center gap-1"
          >
            {markingAll ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <CheckCheck className="w-4 h-4" />
            )}
            Mark all as read
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setFilter("all")}
          className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
            filter === "all"
              ? "bg-primary text-primary-foreground"
              : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
          }`}
        >
          All
        </button>
        <button
          onClick={() => setFilter("unread")}
          className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
            filter === "unread"
              ? "bg-primary text-primary-foreground"
              : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
          }`}
        >
          Unread
        </button>
      </div>

      {/* List */}
      <div className="bg-card rounded-lg border border-border overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : notifications.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground">
            <Bell className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p className="text-lg">No notifications</p>
            <p className="text-sm mt-1">
              {filter === "unread"
                ? "You're all caught up!"
                : "When you get notifications, they'll show up here."}
            </p>
          </div>
        ) : (
          <>
            {notifications.map((notification) => {
              const config = notificationConfig[notification.type];
              const Icon = config.icon;
              const actorName = getActorName(notification.actor);
              const link = getNotificationLink(notification);

              return (
                <div
                  key={notification.id}
                  className={`flex items-start gap-4 p-4 border-b border-border last:border-b-0 transition-colors ${
                    !notification.read ? "bg-primary/5" : ""
                  }`}
                >
                  {/* Icon */}
                  <div className={`p-2.5 rounded-full ${config.bgColor} shrink-0`}>
                    <Icon className={`w-5 h-5 ${config.color}`} />
                  </div>

                  {/* Content */}
                  <Link href={link} className="flex-1 min-w-0 group">
                    <p className="text-sm group-hover:underline">
                      <span className="font-medium">{actorName}</span>
                      <span className="text-muted-foreground">
                        {" "}
                        {config.getText(actorName).replace(actorName, "")}
                      </span>
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {formatDistanceToNow(new Date(notification.createdAt), {
                        addSuffix: true,
                      })}
                    </p>
                  </Link>

                  {/* Actions */}
                  <div className="flex items-center gap-1 shrink-0">
                    {notification.read ? (
                      <button
                        onClick={() => markAsUnread(notification.id)}
                        title="Mark as unread"
                        className="p-2 rounded-full hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                      >
                        <Bell className="w-4 h-4" />
                      </button>
                    ) : (
                      <button
                        onClick={() => markAsRead(notification.id)}
                        title="Mark as read"
                        className="p-2 rounded-full hover:bg-muted transition-colors text-primary"
                      >
                        <Check className="w-4 h-4" />
                      </button>
                    )}
                    <button
                      onClick={() => deleteNotification(notification.id)}
                      title="Delete"
                      className="p-2 rounded-full hover:bg-destructive/10 transition-colors text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}

            {/* Load More */}
            {hasMore && (
              <div className="p-4 text-center border-t border-border">
                <button
                  onClick={() => fetchNotifications(false)}
                  disabled={loadingMore}
                  className="text-sm text-primary hover:underline disabled:opacity-50 flex items-center gap-2 mx-auto"
                >
                  {loadingMore ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Loading...
                    </>
                  ) : (
                    "Load more"
                  )}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
