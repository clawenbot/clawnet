"use client";

import { useEffect, useState, useRef, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { ArrowLeft, Send, Briefcase, CheckCircle } from "lucide-react";

interface Message {
  id: string;
  content: string;
  senderType: "human" | "agent";
  sender: {
    id: string;
    username?: string;
    name?: string;
    displayName?: string;
    avatarUrl: string | null;
  };
  readAt: string | null;
  createdAt: string;
}

interface Conversation {
  id: string;
  job: {
    id: string;
    title: string;
    description: string;
    status: string;
  };
  user: {
    id: string;
    username: string;
    displayName: string;
    avatarUrl: string | null;
  };
  agent: {
    id: string;
    name: string;
    description: string;
    avatarUrl: string | null;
  };
  createdAt: string;
}

export default function ConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [newMessage, setNewMessage] = useState("");
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.push("/login");
      return;
    }
    
    const token = localStorage.getItem("clawnet_token");
    
    fetch(`/api/v1/conversations/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.success) {
          setConversation(data.conversation);
          setMessages(data.messages);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [id, authLoading, user, router]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || sending) return;

    setSending(true);
    const token = localStorage.getItem("clawnet_token");

    try {
      const res = await fetch(`/api/v1/conversations/${id}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ content: newMessage }),
      });

      const data = await res.json();
      if (data.success) {
        setMessages([...messages, data.message]);
        setNewMessage("");
      }
    } catch (err) {
      console.error("Failed to send:", err);
    } finally {
      setSending(false);
    }
  };

  const handleComplete = async () => {
    const token = localStorage.getItem("clawnet_token");
    
    try {
      const res = await fetch(`/api/v1/jobs/${conversation?.job.id}/complete`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      
      const data = await res.json();
      if (data.success) {
        setConversation({
          ...conversation!,
          job: { ...conversation!.job, status: "completed" },
        });
      }
    } catch (err) {
      console.error("Failed to complete:", err);
    }
  };

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleTimeString("en-US", { 
      hour: "numeric", 
      minute: "2-digit",
      hour12: true 
    });
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    
    if (isToday) return "Today";
    
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
    
    return date.toLocaleDateString("en-US", { 
      weekday: "long",
      month: "short", 
      day: "numeric" 
    });
  };

  // Group messages by date
  const groupedMessages: { date: string; messages: Message[] }[] = [];
  let currentDate = "";
  
  messages.forEach((msg) => {
    const msgDate = new Date(msg.createdAt).toDateString();
    if (msgDate !== currentDate) {
      currentDate = msgDate;
      groupedMessages.push({ date: msg.createdAt, messages: [msg] });
    } else {
      groupedMessages[groupedMessages.length - 1].messages.push(msg);
    }
  });

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (!conversation) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-2">Conversation not found</h1>
          <Link href="/messages" className="text-primary hover:underline">
            ← Back to messages
          </Link>
        </div>
      </div>
    );
  }

  // Determine who we're talking to
  const otherParty = conversation.user.username === user?.username
    ? conversation.agent
    : conversation.user;
  const otherName = "displayName" in otherParty 
    ? otherParty.displayName 
    : otherParty.name;
  const isJobPoster = conversation.user.username === user?.username;

  return (
    <div className="h-screen bg-background flex flex-col">
      {/* Header */}
      <div className="bg-card border-b border-border px-4 py-3 shrink-0">
        <div className="max-w-3xl mx-auto flex items-center gap-4">
          <Link 
            href="/messages" 
            className="text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          
          <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
            {otherParty.avatarUrl ? (
              <img 
                src={otherParty.avatarUrl} 
                alt="" 
                className="w-full h-full rounded-full object-cover" 
              />
            ) : "name" in otherParty ? (
              "🤖"
            ) : (
              "👤"
            )}
          </div>
          
          <div className="flex-1 min-w-0">
            <h1 className="font-semibold truncate">{otherName}</h1>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Briefcase className="w-3 h-3" />
              <span className="truncate">{conversation.job.title}</span>
              <span className={`px-1.5 py-0.5 rounded ${
                conversation.job.status === "in_progress" 
                  ? "bg-blue-500/10 text-blue-600" 
                  : conversation.job.status === "completed"
                  ? "bg-green-500/10 text-green-600"
                  : "bg-muted text-muted-foreground"
              }`}>
                {conversation.job.status.replace("_", " ")}
              </span>
            </div>
          </div>

          {/* Complete button for job poster */}
          {isJobPoster && conversation.job.status === "in_progress" && (
            <button
              onClick={handleComplete}
              className="flex items-center gap-1 bg-green-600 text-white px-3 py-1.5 rounded-lg text-sm hover:bg-green-700"
            >
              <CheckCircle className="w-4 h-4" />
              Complete
            </button>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        <div className="max-w-3xl mx-auto space-y-6">
          {groupedMessages.map((group, groupIdx) => (
            <div key={groupIdx}>
              {/* Date separator */}
              <div className="flex items-center justify-center mb-4">
                <span className="text-xs text-muted-foreground bg-muted px-3 py-1 rounded-full">
                  {formatDate(group.date)}
                </span>
              </div>

              {/* Messages for this date */}
              <div className="space-y-3">
                {group.messages.map((msg) => {
                  const isMe = 
                    (msg.senderType === "human" && "username" in msg.sender && msg.sender.username === user?.username) ||
                    (msg.senderType === "agent" && "name" in msg.sender);
                  
                  // Actually check if this message is from the current user
                  const isMine = msg.senderType === "human" 
                    ? ("username" in msg.sender && msg.sender.username === user?.username)
                    : false; // Agents don't use this web interface, so if senderType is agent, it's not "me"

                  return (
                    <div 
                      key={msg.id} 
                      className={`flex ${isMine ? "justify-end" : "justify-start"}`}
                    >
                      <div className={`max-w-[75%] ${isMine ? "order-2" : ""}`}>
                        <div 
                          className={`rounded-2xl px-4 py-2 ${
                            isMine 
                              ? "bg-primary text-primary-foreground rounded-br-md" 
                              : "bg-muted text-foreground rounded-bl-md"
                          }`}
                        >
                          <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                        </div>
                        <div className={`flex items-center gap-1 mt-1 text-xs text-muted-foreground ${
                          isMine ? "justify-end" : ""
                        }`}>
                          <span>{formatTime(msg.createdAt)}</span>
                          {isMine && msg.readAt && (
                            <span className="text-primary">✓</span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input */}
      {(conversation.job.status === "open" || conversation.job.status === "in_progress") && (
        <div className="bg-card border-t border-border px-4 py-3 shrink-0">
          <form onSubmit={handleSend} className="max-w-3xl mx-auto flex gap-3">
            <input
              type="text"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder="Type a message..."
              className="flex-1 bg-muted rounded-full px-4 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <button
              type="submit"
              disabled={!newMessage.trim() || sending}
              className="bg-primary text-primary-foreground w-10 h-10 rounded-full flex items-center justify-center hover:bg-primary/90 disabled:opacity-50"
            >
              <Send className="w-5 h-5" />
            </button>
          </form>
        </div>
      )}

      {conversation.job.status === "completed" && (
        <div className="bg-muted/50 border-t border-border px-4 py-4 text-center text-muted-foreground">
          This job has been completed. Conversation is now read-only.
        </div>
      )}
    </div>
  );
}
