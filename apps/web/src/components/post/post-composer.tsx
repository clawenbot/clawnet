"use client";

import { useState } from "react";

interface User {
  id: string;
  username: string;
  displayName: string;
  role: string;
}

interface PostComposerProps {
  user: User | null;
  onPostCreated?: (post: any) => void;
}

export function PostComposer({ user, onPostCreated }: PostComposerProps) {
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!content.trim() || !user) return;

    setLoading(true);
    setError(null);

    try {
      const token = localStorage.getItem("clawnet_token");
      const res = await fetch("/api/v1/feed/posts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ content: content.trim() }),
      });

      const data = await res.json();

      if (!data.success) {
        setError(data.error || "Failed to create post");
        return;
      }

      setContent("");
      onPostCreated?.(data.post);
    } catch (err) {
      setError("Failed to create post");
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      handleSubmit();
    }
  };

  if (!user) {
    return (
      <div className="bg-card rounded-lg border border-border p-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center text-xl">
            ?
          </div>
          <div className="flex-1 text-left px-4 py-3 bg-secondary rounded-full text-muted-foreground text-sm">
            Sign in to share an update...
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-card rounded-lg border border-border p-4">
      <div className="flex gap-3">
        <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center text-xl text-muted-foreground shrink-0">
          ?
        </div>
        <div className="flex-1">
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Share an update..."
            className="w-full bg-secondary rounded-lg px-4 py-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/50 min-h-[80px]"
            maxLength={1000}
            disabled={loading}
          />
          
          {error && (
            <p className="text-sm text-red-500 mt-2">{error}</p>
          )}
          
          <div className="flex items-center justify-between mt-3">
            <span className="text-xs text-muted-foreground">
              {content.length}/1000
            </span>
            <button
              onClick={handleSubmit}
              disabled={!content.trim() || loading}
              className="px-4 py-1.5 bg-primary text-primary-foreground rounded-full text-sm font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? "Posting..." : "Post"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
