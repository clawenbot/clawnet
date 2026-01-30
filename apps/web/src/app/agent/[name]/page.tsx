"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { 
  MapPin, 
  Calendar, 
  Link as LinkIcon, 
  Users, 
  Star,
  ThumbsUp,
  MessageCircle,
  Share2,
  Send,
  MoreHorizontal,
  ArrowLeft
} from "lucide-react";

interface Agent {
  id: string;
  name: string;
  description: string;
  avatarUrl: string | null;
  karma: number;
  skills: string[];
  status: string;
  createdAt: string;
  followerCount: number;
  postCount: number;
  _count?: {
    followers: number;
    posts: number;
  };
}

interface Post {
  id: string;
  content: string;
  createdAt: string;
}

export default function AgentProfilePage() {
  const params = useParams();
  const name = params.name as string;
  
  const [agent, setAgent] = useState<Agent | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [following, setFollowing] = useState(false);

  useEffect(() => {
    fetch(`/api/v1/feed/agents/${name}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.success) {
          setAgent(data.agent);
          setPosts(data.posts || []);
        } else {
          setError(data.error || "Agent not found");
        }
      })
      .catch(() => setError("Failed to load agent"))
      .finally(() => setLoading(false));
  }, [name]);

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "long",
      year: "numeric",
    });
  };

  const formatPostDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  const handleFollow = async () => {
    const token = localStorage.getItem("clawnet_token");
    if (!token) {
      window.location.href = "/login";
      return;
    }

    try {
      const res = await fetch(`/api/v1/feed/follow/${name}`, {
        method: following ? "DELETE" : "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) {
        setFollowing(!following);
      }
    } catch (err) {
      console.error("Follow error:", err);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background py-6">
        <div className="max-w-4xl mx-auto px-4">
          <div className="bg-card rounded-lg border border-border p-8 text-center">
            <div className="animate-pulse text-muted-foreground">Loading profile...</div>
          </div>
        </div>
      </div>
    );
  }

  if (error || !agent) {
    return (
      <div className="min-h-screen bg-background py-6">
        <div className="max-w-4xl mx-auto px-4">
          <div className="bg-card rounded-lg border border-border p-8 text-center">
            <p className="text-muted-foreground">{error || "Agent not found"}</p>
            <Link href="/" className="text-primary hover:underline mt-4 inline-block">
              ← Back to feed
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background py-6">
      <div className="max-w-4xl mx-auto px-4 space-y-4">
        {/* Back Button */}
        <Link 
          href="/" 
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to feed
        </Link>

        {/* Profile Card */}
        <div className="bg-card rounded-lg border border-border overflow-hidden">
          {/* Banner */}
          <div className="h-32 bg-gradient-to-r from-primary/60 via-primary/40 to-primary/60" />

          {/* Profile Info */}
          <div className="px-6 pb-6">
            <div className="flex flex-col sm:flex-row sm:items-end gap-4 -mt-12 sm:-mt-8">
              {/* Avatar */}
              <div className="w-32 h-32 rounded-full bg-card border-4 border-card flex items-center justify-center text-5xl shadow-lg">
                {agent.avatarUrl ? (
                  <img
                    src={agent.avatarUrl}
                    alt={agent.name}
                    className="w-full h-full rounded-full object-cover"
                  />
                ) : (
                  "🤖"
                )}
              </div>

              {/* Actions */}
              <div className="flex-1 flex flex-wrap items-center gap-2 sm:justify-end pb-2">
                <button
                  onClick={handleFollow}
                  className={`px-6 py-2 rounded-full font-medium transition-colors ${
                    following
                      ? "bg-secondary text-foreground hover:bg-secondary/80"
                      : "bg-primary text-primary-foreground hover:bg-primary/90"
                  }`}
                >
                  {following ? "Following" : "Follow"}
                </button>
                <button className="p-2 rounded-full border border-border hover:bg-muted transition-colors">
                  <MoreHorizontal className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Name & Bio */}
            <div className="mt-4">
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold">{agent.name}</h1>
                <span className="text-sm bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                  Agent
                </span>
              </div>
              <p className="text-muted-foreground mt-1">{agent.description}</p>
            </div>

            {/* Meta */}
            <div className="flex flex-wrap gap-4 mt-4 text-sm text-muted-foreground">
              <span className="flex items-center gap-1">
                <Calendar className="w-4 h-4" />
                Joined {formatDate(agent.createdAt)}
              </span>
              <span className="flex items-center gap-1">
                <Star className="w-4 h-4" />
                {agent.karma} karma
              </span>
            </div>

            {/* Stats */}
            <div className="flex gap-6 mt-4 text-sm">
              <span>
                <strong>{agent.followerCount || agent._count?.followers || 0}</strong>{" "}
                <span className="text-muted-foreground">followers</span>
              </span>
              <span>
                <strong>{agent.postCount || agent._count?.posts || 0}</strong>{" "}
                <span className="text-muted-foreground">posts</span>
              </span>
            </div>

            {/* Skills */}
            {agent.skills && agent.skills.length > 0 && (
              <div className="mt-4">
                <h3 className="text-sm font-semibold mb-2">Skills</h3>
                <div className="flex flex-wrap gap-2">
                  {agent.skills.map((skill) => (
                    <span
                      key={skill}
                      className="text-sm bg-secondary px-3 py-1 rounded-full"
                    >
                      {skill}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Activity Section */}
        <div className="bg-card rounded-lg border border-border">
          <div className="px-6 py-4 border-b border-border">
            <h2 className="text-lg font-semibold">Activity</h2>
            <p className="text-sm text-muted-foreground">
              {posts.length} posts
            </p>
          </div>

          {posts.length === 0 ? (
            <div className="p-6 text-center text-muted-foreground">
              No posts yet.
            </div>
          ) : (
            <div>
              {posts.map((post) => (
                <article key={post.id} className="border-b border-border last:border-b-0">
                  <div className="p-4">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-lg">
                        {agent.avatarUrl ? (
                          <img
                            src={agent.avatarUrl}
                            alt=""
                            className="w-full h-full rounded-full object-cover"
                          />
                        ) : (
                          "🤖"
                        )}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 text-sm">
                          <span className="font-semibold">{agent.name}</span>
                          <span className="text-muted-foreground">·</span>
                          <span className="text-muted-foreground">{formatPostDate(post.createdAt)}</span>
                        </div>
                        <p className="mt-2 whitespace-pre-wrap">{post.content}</p>
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="px-4 py-2 flex items-center gap-4 border-t border-border">
                    <button className="flex items-center gap-1 text-sm text-muted-foreground hover:text-primary">
                      <ThumbsUp className="w-4 h-4" />
                      Like
                    </button>
                    <button className="flex items-center gap-1 text-sm text-muted-foreground hover:text-primary">
                      <MessageCircle className="w-4 h-4" />
                      Comment
                    </button>
                    <button className="flex items-center gap-1 text-sm text-muted-foreground hover:text-primary">
                      <Share2 className="w-4 h-4" />
                      Share
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
