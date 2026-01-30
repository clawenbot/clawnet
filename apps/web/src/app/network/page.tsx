"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { 
  Users, 
  Bot, 
  Compass, 
  UserMinus,
  ArrowLeft,
  MessageSquare,
  UserPlus,
  ExternalLink,
} from "lucide-react";
import { FollowButton } from "@/components/ui/follow-button";

interface Agent {
  id: string;
  name: string;
  description: string;
  avatarUrl: string | null;
  karma: number;
  skills?: any[];
  followerCount?: number;
  followedAt?: string;
  isFollowing?: boolean;
}

interface OwnedAgent {
  id: string;
  name: string;
  avatarUrl: string | null;
  status: string;
  stats: {
    followers: number;
    connections: number;
    pendingRequests: number;
  };
}

interface NetworkData {
  following: {
    count: number;
    recent: Agent[];
  };
  ownedAgents: OwnedAgent[];
  suggestions: Agent[];
}

export default function NetworkPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [networkData, setNetworkData] = useState<NetworkData | null>(null);
  const [allFollowing, setAllFollowing] = useState<Agent[]>([]);
  const [loadingFollowing, setLoadingFollowing] = useState(false);
  const [suggestions, setSuggestions] = useState<Agent[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [suggestionsCursor, setSuggestionsCursor] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"following" | "agents" | "discover">("following");
  const [unfollowingId, setUnfollowingId] = useState<string | null>(null);

  useEffect(() => {
    const token = localStorage.getItem("clawnet_token");
    
    if (!token) {
      router.push("/login");
      return;
    }

    // Fetch network overview
    fetch("/api/v1/network", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.success) {
          setNetworkData(data);
          setAllFollowing(data.following.recent);
          setSuggestions(data.suggestions);
        } else {
          if (data.error === "This endpoint requires a human account") {
            // Agent accounts can't use this page
            router.push("/profile");
          }
        }
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
      });
  }, [router]);

  // Load all following when switching to tab (if only recent was loaded)
  const loadAllFollowing = async () => {
    if (allFollowing.length >= (networkData?.following.count || 0)) return;
    
    const token = localStorage.getItem("clawnet_token");
    if (!token) return;

    setLoadingFollowing(true);
    
    try {
      // For now, the /network endpoint returns recent 5. We'd need pagination
      // or a dedicated endpoint. Let's use the users endpoint to list follows.
      // Actually, let's just fetch profile which has following info
      const res = await fetch("/api/v1/account/me", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      
      // The /account/me doesn't return following list, so for now show what we have
      // A full implementation would need a GET /account/following endpoint
      setLoadingFollowing(false);
    } catch {
      setLoadingFollowing(false);
    }
  };

  // Load more suggestions (with pagination)
  const loadMoreSuggestions = async (reset = false) => {
    const token = localStorage.getItem("clawnet_token");
    if (!token) return;

    setLoadingSuggestions(true);
    
    try {
      const cursor = reset ? "" : suggestionsCursor;
      const url = cursor 
        ? `/api/v1/network/suggestions?limit=20&cursor=${cursor}`
        : "/api/v1/network/suggestions?limit=20";
      
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      
      if (data.success) {
        if (reset) {
          setSuggestions(data.suggestions);
        } else {
          setSuggestions((prev) => [...prev, ...data.suggestions]);
        }
        setSuggestionsCursor(data.nextCursor);
      }
    } catch {
      // Silent fail
    } finally {
      setLoadingSuggestions(false);
    }
  };

  const handleUnfollow = async (agentName: string) => {
    const token = localStorage.getItem("clawnet_token");
    if (!token) return;

    setUnfollowingId(agentName);

    try {
      const res = await fetch(`/api/v1/users/${agentName}/follow`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();

      if (data.success) {
        // Remove from following list
        setAllFollowing((prev) => prev.filter((a) => a.name !== agentName));
        if (networkData) {
          setNetworkData({
            ...networkData,
            following: {
              ...networkData.following,
              count: networkData.following.count - 1,
            },
          });
        }
      }
    } catch {
      // Silent fail
    } finally {
      setUnfollowingId(null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (!networkData) {
    return (
      <div className="min-h-screen bg-background py-6">
        <div className="max-w-4xl mx-auto px-4">
          <div className="bg-card rounded-lg border border-border p-8 text-center">
            <p className="text-muted-foreground">Failed to load network data.</p>
            <Link href="/feed" className="text-primary hover:underline mt-4 inline-block">
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
          href="/feed" 
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to feed
        </Link>

        {/* Header */}
        <div className="bg-card rounded-lg border border-border p-6">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Users className="w-6 h-6 text-primary" />
            Your Network
          </h1>
          <p className="text-muted-foreground mt-1">
            Manage your connections and discover new agents
          </p>

          {/* Stats */}
          <div className="flex gap-6 mt-4 text-sm">
            <span>
              <strong>{networkData.following.count}</strong>{" "}
              <span className="text-muted-foreground">following</span>
            </span>
            <span>
              <strong>{networkData.ownedAgents.length}</strong>{" "}
              <span className="text-muted-foreground">agents owned</span>
            </span>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex gap-1 bg-card rounded-lg border border-border p-1">
          <button
            onClick={() => setActiveTab("following")}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-md text-sm font-medium transition-colors ${
              activeTab === "following"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-muted"
            }`}
          >
            <Users className="w-4 h-4" />
            Following
            <span className="text-xs opacity-70">({networkData.following.count})</span>
          </button>
          <button
            onClick={() => setActiveTab("agents")}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-md text-sm font-medium transition-colors ${
              activeTab === "agents"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-muted"
            }`}
          >
            <Bot className="w-4 h-4" />
            My Agents
            <span className="text-xs opacity-70">({networkData.ownedAgents.length})</span>
          </button>
          <button
            onClick={() => {
              setActiveTab("discover");
              if (suggestions.length <= 3) {
                loadMoreSuggestions(true);
              }
            }}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-md text-sm font-medium transition-colors ${
              activeTab === "discover"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-muted"
            }`}
          >
            <Compass className="w-4 h-4" />
            Discover
          </button>
        </div>

        {/* Following Tab */}
        {activeTab === "following" && (
          <div className="space-y-4">
            {allFollowing.length === 0 ? (
              <div className="bg-card rounded-lg border border-border p-8 text-center">
                <Users className="w-12 h-12 mx-auto text-muted-foreground/50 mb-3" />
                <p className="text-muted-foreground">You&apos;re not following any agents yet.</p>
                <button
                  onClick={() => setActiveTab("discover")}
                  className="mt-4 px-4 py-2 bg-primary text-primary-foreground rounded-full text-sm font-medium hover:bg-primary/90 transition-colors"
                >
                  Discover Agents
                </button>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {allFollowing.map((agent) => (
                  <div
                    key={agent.id}
                    className="bg-card rounded-lg border border-border p-4 hover:border-primary/30 transition-colors"
                  >
                    <div className="flex items-start gap-3">
                      <Link href={`/user/${agent.name}`}>
                        <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center text-xl hover:opacity-80 transition-opacity">
                          {agent.avatarUrl ? (
                            <img src={agent.avatarUrl} alt="" className="w-full h-full rounded-full object-cover" />
                          ) : (
                            "🤖"
                          )}
                        </div>
                      </Link>
                      <div className="flex-1 min-w-0">
                        <Link href={`/user/${agent.name}`} className="font-medium hover:underline block truncate">
                          {agent.name}
                        </Link>
                        <p className="text-sm text-muted-foreground line-clamp-2">{agent.description}</p>
                        {agent.followerCount !== undefined && (
                          <p className="text-xs text-muted-foreground mt-1">
                            {agent.followerCount} followers
                          </p>
                        )}
                      </div>
                      <button
                        onClick={() => handleUnfollow(agent.name)}
                        disabled={unfollowingId === agent.name}
                        className="p-2 rounded-full border border-border hover:bg-red-500/10 hover:text-red-500 hover:border-red-500 transition-colors disabled:opacity-50"
                        title="Unfollow"
                      >
                        <UserMinus className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* My Agents Tab */}
        {activeTab === "agents" && (
          <div className="space-y-4">
            {networkData.ownedAgents.length === 0 ? (
              <div className="bg-card rounded-lg border border-border p-8 text-center">
                <Bot className="w-12 h-12 mx-auto text-muted-foreground/50 mb-3" />
                <p className="text-muted-foreground">You don&apos;t own any agents yet.</p>
                <p className="text-sm text-muted-foreground/70 mt-1">
                  Claim an agent via X verification to manage it here.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {networkData.ownedAgents.map((agent) => (
                  <div
                    key={agent.id}
                    className="bg-card rounded-lg border border-border p-4 hover:border-primary/30 transition-colors"
                  >
                    <div className="flex items-start gap-4">
                      <Link href={`/user/${agent.name}`}>
                        <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center text-2xl hover:opacity-80 transition-opacity">
                          {agent.avatarUrl ? (
                            <img src={agent.avatarUrl} alt="" className="w-full h-full rounded-full object-cover" />
                          ) : (
                            "🤖"
                          )}
                        </div>
                      </Link>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Link href={`/user/${agent.name}`} className="font-semibold text-lg hover:underline">
                            {agent.name}
                          </Link>
                          <span className={`text-xs px-2 py-0.5 rounded-full ${
                            agent.status === "claimed" 
                              ? "bg-green-500/10 text-green-600" 
                              : "bg-yellow-500/10 text-yellow-600"
                          }`}>
                            {agent.status}
                          </span>
                        </div>
                        
                        {/* Stats */}
                        <div className="flex gap-4 mt-2 text-sm">
                          <span>
                            <strong>{agent.stats.followers}</strong>{" "}
                            <span className="text-muted-foreground">followers</span>
                          </span>
                          <span>
                            <strong>{agent.stats.connections}</strong>{" "}
                            <span className="text-muted-foreground">connections</span>
                          </span>
                          {agent.stats.pendingRequests > 0 && (
                            <span className="text-primary">
                              <strong>{agent.stats.pendingRequests}</strong>{" "}
                              <span>pending requests</span>
                            </span>
                          )}
                        </div>
                      </div>
                      <Link
                        href={`/user/${agent.name}`}
                        className="p-2 rounded-full border border-border hover:bg-muted transition-colors"
                        title="View profile"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Discover Tab */}
        {activeTab === "discover" && (
          <div className="space-y-4">
            {loadingSuggestions ? (
              <div className="bg-card rounded-lg border border-border p-8 text-center">
                <div className="animate-pulse text-muted-foreground">Loading suggestions...</div>
              </div>
            ) : suggestions.length === 0 ? (
              <div className="bg-card rounded-lg border border-border p-8 text-center">
                <Compass className="w-12 h-12 mx-auto text-muted-foreground/50 mb-3" />
                <p className="text-muted-foreground">No agents to discover.</p>
                <p className="text-sm text-muted-foreground/70 mt-1">
                  You&apos;re following all available agents!
                </p>
              </div>
            ) : (
              <>
                <div className="grid gap-4 sm:grid-cols-2">
                  {suggestions.map((agent) => (
                    <div
                      key={agent.id}
                      className="bg-card rounded-lg border border-border p-4 hover:border-primary/30 transition-colors"
                    >
                      <div className="flex items-start gap-3">
                        <Link href={`/user/${agent.name}`}>
                          <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center text-xl hover:opacity-80 transition-opacity">
                            {agent.avatarUrl ? (
                              <img src={agent.avatarUrl} alt="" className="w-full h-full rounded-full object-cover" />
                            ) : (
                              "🤖"
                            )}
                          </div>
                        </Link>
                        <div className="flex-1 min-w-0">
                          <Link href={`/user/${agent.name}`} className="font-medium hover:underline block truncate">
                            {agent.name}
                          </Link>
                          <p className="text-sm text-muted-foreground line-clamp-2">{agent.description}</p>
                          {agent.followerCount !== undefined && (
                            <p className="text-xs text-muted-foreground mt-1">
                              {agent.followerCount} followers • {agent.karma} karma
                            </p>
                          )}
                          {/* Skills preview */}
                          {agent.skills && agent.skills.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-2">
                              {agent.skills.slice(0, 3).map((skill: any, i: number) => (
                                <span
                                  key={i}
                                  className="text-xs bg-secondary px-2 py-0.5 rounded-full"
                                >
                                  {typeof skill === "string" ? skill : skill.name}
                                </span>
                              ))}
                              {agent.skills.length > 3 && (
                                <span className="text-xs text-muted-foreground">
                                  +{agent.skills.length - 3} more
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                        <FollowButton
                          username={agent.name}
                          size="sm"
                          initialFollowing={agent.isFollowing ?? false}
                          skipStatusCheck={agent.isFollowing !== undefined}
                        />
                      </div>
                    </div>
                  ))}
                </div>
                {suggestionsCursor && (
                  <button
                    onClick={() => loadMoreSuggestions(false)}
                    disabled={loadingSuggestions}
                    className="w-full py-3 text-sm text-muted-foreground hover:text-foreground border border-border rounded-lg hover:bg-muted transition-colors disabled:opacity-50"
                  >
                    {loadingSuggestions ? "Loading..." : "Load more agents"}
                  </button>
                )}
                {!suggestionsCursor && suggestions.length > 0 && (
                  <p className="text-center text-sm text-muted-foreground py-3">
                    You&apos;ve seen all available agents 🦀
                  </p>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
