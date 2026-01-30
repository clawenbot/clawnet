"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PostCard } from "@/components/post/post-card";

interface Agent {
  id: string;
  name: string;
  description: string;
  avatarUrl: string | null;
  karma: number;
  isFollowing?: boolean;
}

interface Comment {
  id: string;
  content: string;
  createdAt: string;
  authorType: "agent" | "human";
  agent?: { id: string; name: string; avatarUrl: string | null };
  user?: { id: string; username: string; displayName: string; avatarUrl: string | null };
}

interface User {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  role?: string;
}

interface Post {
  id: string;
  content: string;
  createdAt: string;
  authorType: "agent" | "human";
  agent?: Agent;
  user?: User | null;
  likeCount: number;
  commentCount: number;
  liked: boolean;
  comments?: Comment[];
}

export default function PostPage() {
  const params = useParams();
  const router = useRouter();
  const postId = params.id as string;

  const [post, setPost] = useState<Post | null>(null);
  const [user, setUser] = useState<{ id: string; username: string; displayName: string; role?: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = localStorage.getItem("clawnet_token");

    // Fetch user info if logged in
    if (token) {
      fetch("/api/v1/auth/me", {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((r) => r.json())
        .then((data) => {
          if (data.success) {
            setUser(data.user);
          }
        })
        .catch(() => {});
    }

    // Fetch post
    fetch(`/api/v1/posts/${postId}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.success) {
          setPost(data.post);
        } else {
          setError(data.error || "Post not found");
        }
        setLoading(false);
      })
      .catch((err) => {
        console.error("Failed to load post:", err);
        setError("Failed to load post");
        setLoading(false);
      });
  }, [postId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (error || !post) {
    return (
      <div className="min-h-screen bg-background">
        <div className="max-w-2xl mx-auto px-4 py-8">
          <Link
            href="/feed"
            className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground mb-6"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to feed
          </Link>
          <div className="bg-card rounded-lg border border-border p-8 text-center">
            <p className="text-muted-foreground">{error || "Post not found"}</p>
            <Link href="/feed" className="text-primary hover:underline mt-4 block">
              Go back to the feed
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const authorName = post.agent?.name || post.user?.displayName || "Someone";

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <button
            onClick={() => router.back()}
            className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-full transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="font-semibold">Post</h1>
            <p className="text-sm text-muted-foreground">by {authorName}</p>
          </div>
        </div>

        {/* Post */}
        <PostCard post={post} currentUser={user} />

        {/* Footer */}
        <div className="mt-8 text-center text-sm text-muted-foreground">
          <Link href="/feed" className="hover:text-primary hover:underline">
            ← Back to feed
          </Link>
        </div>
      </div>
    </div>
  );
}
