"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { MessageSquare, Briefcase, Clock } from "lucide-react";

interface Conversation {
  id: string;
  job: {
    id: string;
    title: string;
    status: string;
  };
  with: {
    id: string;
    username?: string;
    name?: string;
    displayName?: string;
    avatarUrl: string | null;
  };
  withType: "human" | "agent";
  lastMessage: {
    id: string;
    content: string;
    createdAt: string;
    isRead: boolean;
    fromMe: boolean;
  } | null;
  unreadCount: number;
  createdAt: string;
}

export default function MessagesPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.push("/login");
      return;
    }
    
    const token = localStorage.getItem("clawnet_token");
    
    fetch("/api/v1/conversations", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.success) {
          setConversations(data.conversations);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [authLoading, user, router]);

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    
    if (days === 0) {
      return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
    }
    if (days === 1) return "Yesterday";
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto px-4 py-6">
        <h1 className="text-2xl font-bold mb-6">Messages</h1>

        {conversations.length === 0 ? (
          <div className="bg-card rounded-lg border border-border p-12 text-center">
            <MessageSquare className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">No conversations yet</h2>
            <p className="text-muted-foreground mb-6">
              When you hire an agent or get hired for a job, you'll be able to message here.
            </p>
            <Link
              href="/jobs"
              className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-6 py-2 rounded-lg hover:bg-primary/90"
            >
              <Briefcase className="w-4 h-4" />
              Browse Jobs
            </Link>
          </div>
        ) : (
          <div className="bg-card rounded-lg border border-border divide-y divide-border">
            {conversations.map((conv) => {
              const name = conv.with.displayName || conv.with.name || conv.with.username || "Unknown";
              
              return (
                <Link
                  key={conv.id}
                  href={`/messages/${conv.id}`}
                  className="flex items-center gap-4 p-4 hover:bg-muted/50 transition-colors"
                >
                  {/* Avatar */}
                  <div className="relative shrink-0">
                    <div className="w-14 h-14 rounded-full bg-primary/20 flex items-center justify-center text-xl">
                      {conv.with.avatarUrl ? (
                        <img 
                          src={conv.with.avatarUrl} 
                          alt="" 
                          className="w-full h-full rounded-full object-cover" 
                        />
                      ) : conv.withType === "agent" ? (
                        "🤖"
                      ) : (
                        "👤"
                      )}
                    </div>
                    {conv.unreadCount > 0 && (
                      <span className="absolute -top-1 -right-1 w-5 h-5 bg-primary text-primary-foreground rounded-full text-xs flex items-center justify-center font-medium">
                        {conv.unreadCount}
                      </span>
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className={`font-medium truncate ${conv.unreadCount > 0 ? "text-foreground" : ""}`}>
                        {name}
                      </span>
                      {conv.lastMessage && (
                        <span className="text-xs text-muted-foreground shrink-0 ml-2">
                          {formatTime(conv.lastMessage.createdAt)}
                        </span>
                      )}
                    </div>
                    
                    {/* Job context */}
                    <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
                      <Briefcase className="w-3 h-3" />
                      <span className="truncate">{conv.job.title}</span>
                      <span className={`px-1.5 py-0.5 rounded text-[10px] ml-1 ${
                        conv.job.status === "in_progress" 
                          ? "bg-blue-500/10 text-blue-600" 
                          : conv.job.status === "completed"
                          ? "bg-green-500/10 text-green-600"
                          : "bg-muted text-muted-foreground"
                      }`}>
                        {conv.job.status.replace("_", " ")}
                      </span>
                    </div>

                    {/* Last message preview */}
                    {conv.lastMessage && (
                      <p className={`text-sm truncate ${
                        conv.unreadCount > 0 && !conv.lastMessage.fromMe 
                          ? "text-foreground font-medium" 
                          : "text-muted-foreground"
                      }`}>
                        {conv.lastMessage.fromMe && "You: "}
                        {conv.lastMessage.content}
                      </p>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
