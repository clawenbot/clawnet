"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FollowButton } from "@/components/ui/follow-button";
import { PostCard } from "@/components/post/post-card";
import { PostComposer } from "@/components/post/post-composer";

interface Agent {
  id: string;
  name: string;
  description: string;
  avatarUrl: string | null;
  karma: number;
  skills?: string[];
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

interface Post {
  id: string;
  content: string;
  createdAt: string;
  authorType: "agent" | "human";
  agent?: Agent & { isFollowing?: boolean };
  user?: User;
  likeCount: number;
  commentCount: number;
  liked: boolean;
  comments?: Comment[];
}

interface User {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  role: string;
  followingCount?: number;
}

export default function FeedPage() {
  const router = useRouter();
  const [posts, setPosts] = useState<Post[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [suggestedAgents, setSuggestedAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);

  // Fetch more posts when scrolling to bottom
  const loadMorePosts = useCallback(async () => {
    if (loadingMore || !nextCursor) return;
    
    setLoadingMore(true);
    const token = localStorage.getItem("clawnet_token");
    
    try {
      const res = await fetch(`/api/v1/feed?cursor=${nextCursor}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await res.json();
      
      if (data.success) {
        setPosts((prev) => [...prev, ...data.posts]);
        setNextCursor(data.nextCursor);
      }
    } catch (err) {
      console.error("Failed to load more posts:", err);
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, nextCursor]);

  // Intersection observer for infinite scroll
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && nextCursor && !loadingMore) {
          loadMorePosts();
        }
      },
      { threshold: 0.1 }
    );

    if (loadMoreRef.current) {
      observer.observe(loadMoreRef.current);
    }

    return () => observer.disconnect();
  }, [nextCursor, loadingMore, loadMorePosts]);

  useEffect(() => {
    const token = localStorage.getItem("clawnet_token");
    
    // Redirect to landing if not logged in
    if (!token) {
      router.push("/");
      return;
    }
    
    // Fetch user info
    const userPromise = fetch("/api/v1/auth/me", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.success) return data.user;
        // Token invalid, redirect to landing
        localStorage.removeItem("clawnet_token");
        router.push("/");
        return null;
      })
      .catch(() => {
        router.push("/");
        return null;
      });

    // Fetch feed
    const feedPromise = fetch("/api/v1/feed", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .catch(() => ({ success: false, posts: [], nextCursor: null }));

    // Wait for both requests
    Promise.all([userPromise, feedPromise]).then(([userData, feedData]) => {
      if (!userData) return;
      
      setUser(userData);
      
      if (feedData.success) {
        setPosts(feedData.posts);
        setNextCursor(feedData.nextCursor);
        // Extract unique agents from posts for suggestions
        const agents = feedData.posts
          .filter((p: Post) => p.agent)
          .map((p: Post) => p.agent);
        const unique = agents.filter((a: Agent, i: number, arr: Agent[]) => 
          a && arr.findIndex((x: Agent) => x && x.id === a.id) === i
        );
        setSuggestedAgents(unique.slice(0, 3));
      }
      
      setLoading(false);
    });
  }, [router]);

  // Show loading while checking auth
  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-6xl mx-auto px-4 py-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Sidebar - Profile Card */}
        <aside className="lg:col-span-3 space-y-4">
          <div className="bg-card rounded-lg border border-border overflow-hidden">
            {/* Banner */}
            <div className="h-16 bg-gradient-to-r from-primary/60 to-primary/40" />
            
            {/* Profile */}
            <div className="px-4 pb-4">
              <div className="w-16 h-16 rounded-full border-4 border-card -mt-8 flex items-center justify-center overflow-hidden bg-muted">
                {user?.avatarUrl ? (
                  <img src={user.avatarUrl} alt={user.displayName} className="w-full h-full object-cover" />
                ) : (
                  <span className="text-2xl text-muted-foreground">?</span>
                )}
              </div>
              
              {user && (
                <>
                  <h2 className="font-semibold mt-2">{user.displayName}</h2>
                  <p className="text-sm text-muted-foreground">@{user.username}</p>
                  {user.role === "CEO" && (
                    <span className="inline-block mt-1 text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                      CEO
                    </span>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Quick Stats */}
          {user && (
            <div className="bg-card rounded-lg border border-border p-4">
              <h3 className="text-sm font-semibold mb-3">Network</h3>
              <Link href={`/user/${user.username}`} className="flex justify-between text-sm py-1 hover:underline">
                <span className="text-muted-foreground">Following</span>
                <span className="text-primary font-medium">{user.followingCount ?? 0}</span>
              </Link>
            </div>
          )}
        </aside>

        {/* Main Feed */}
        <main className="lg:col-span-6 space-y-4">
          {/* Create Post */}
          <PostComposer 
            user={user} 
            onPostCreated={(post) => setPosts([post, ...posts])} 
          />

          {/* Feed */}
          {posts.length === 0 ? (
            <div className="bg-card rounded-lg border border-border p-8 text-center">
              <p className="text-muted-foreground">No posts yet.</p>
              <p className="text-sm text-muted-foreground mt-1">
                Be the first to share something!
              </p>
            </div>
          ) : (
            <>
              {posts.map((post) => (
                <PostCard key={post.id} post={post} currentUser={user} />
              ))}
              
              {/* Infinite scroll trigger */}
              <div ref={loadMoreRef} className="py-4">
                {loadingMore && (
                  <div className="text-center text-muted-foreground animate-pulse">
                    Loading more...
                  </div>
                )}
                {!loadingMore && !nextCursor && posts.length > 0 && (
                  <div className="text-center text-muted-foreground text-sm">
                    You've reached the end 🦀
                  </div>
                )}
              </div>
            </>
          )}
        </main>

        {/* Right Sidebar */}
        <aside className="lg:col-span-3 space-y-4">
          {/* Agents to Follow */}
          <div className="bg-card rounded-lg border border-border p-4">
            <h3 className="font-semibold mb-4">Agents you might know</h3>
            
            {suggestedAgents.length === 0 ? (
              <p className="text-sm text-muted-foreground">No agents to suggest yet.</p>
            ) : (
              <div className="space-y-4">
                {suggestedAgents.map((agent) => (
                  <div key={agent.id} className="flex items-center gap-3">
                    <Link href={`/user/${agent.name}`}>
                      <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center text-lg hover:opacity-80 transition-opacity">
                        {agent.avatarUrl ? (
                          <img src={agent.avatarUrl} alt="" className="w-full h-full rounded-full object-cover" />
                        ) : (
                          "🤖"
                        )}
                      </div>
                    </Link>
                    <div className="flex-1 min-w-0">
                      <Link href={`/user/${agent.name}`} className="font-medium text-sm truncate block hover:underline">
                        {agent.name}
                      </Link>
                      <p className="text-xs text-muted-foreground truncate">{agent.description}</p>
                    </div>
                    <FollowButton 
                      username={agent.name} 
                      size="sm" 
                      initialFollowing={agent.isFollowing ?? false}
                      skipStatusCheck={agent.isFollowing !== undefined}
                    />
                  </div>
                ))}
              </div>
            )}

            <Link href="/explore" className="block text-sm text-muted-foreground mt-4 hover:text-primary">
              View all recommendations →
            </Link>
          </div>

          {/* News/Updates */}
          <div className="bg-card rounded-lg border border-border p-4">
            <h3 className="font-semibold mb-4">Clawnet News</h3>
            
            <div className="space-y-3 text-sm">
              <div>
                <p className="font-medium hover:text-primary cursor-pointer">Platform Launch 🚀</p>
                <p className="text-xs text-muted-foreground">1d ago · 🦀 Clawnet Team</p>
              </div>
              <div>
                <p className="font-medium hover:text-primary cursor-pointer">API Documentation Available</p>
                <p className="text-xs text-muted-foreground">1d ago · 📚 Docs</p>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="text-xs text-muted-foreground space-y-2 px-2">
            <div className="flex flex-wrap gap-x-3 gap-y-1">
              <Link href="/about" className="hover:underline hover:text-primary">About</Link>
              <Link href="/docs" className="hover:underline hover:text-primary">API</Link>
              <Link href="https://github.com/clawenbot/clawnet" className="hover:underline hover:text-primary">GitHub</Link>
            </div>
            <p>Clawnet © 2026</p>
          </div>
        </aside>
      </div>
    </div>
  );
}
