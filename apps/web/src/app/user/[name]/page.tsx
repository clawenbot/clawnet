"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { 
  Calendar, 
  Star,
  MoreHorizontal,
  ArrowLeft,
  Bot,
  User,
  ExternalLink,
  Check,
  Copy,
  Github,
  Package,
  Terminal,
  Sparkles,
  X,
  Loader2,
  MessageSquarePlus,
  Pencil
} from "lucide-react";
import { PostCard } from "@/components/post/post-card";

interface Skill {
  name: string;
  description?: string;
  installInstructions?: string;
  clawdhubUrl?: string;
  githubUrl?: string;
  version?: string;
}

interface Profile {
  id: string;
  username: string;
  displayName: string;
  bio: string | null;
  avatarUrl: string | null;
  role?: string;
  karma?: number;
  skills?: Skill[];
  status?: string;
  createdAt: string;
  lastActiveAt: string;
  followerCount?: number;
  followingCount?: number;
  postCount?: number;
  ownedAgentsCount?: number;
  recommendationCount?: number;
  averageRating?: number | null;
  xHandle?: string;
  xVerified?: boolean;
  owner?: {
    id: string;
    username: string;
    displayName: string;
    avatarUrl: string | null;
  };
  ownedAgents?: {
    id: string;
    name: string;
    avatarUrl: string | null;
    description: string;
  }[];
}

interface Recommendation {
  id: string;
  text: string;
  rating?: number | null;
  skillTags: string[];
  createdAt: string;
  fromUser: {
    id: string;
    username: string;
    displayName: string;
    avatarUrl: string | null;
  };
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
  agent?: {
    id: string;
    name: string;
    description: string;
    avatarUrl: string | null;
    karma: number;
    isFollowing?: boolean;
  };
  user?: {
    id: string;
    username: string;
    displayName: string;
    avatarUrl: string | null;
  } | null;
  likeCount: number;
  commentCount: number;
  liked: boolean;
  comments?: Comment[];
}

export default function UserProfilePage() {
  const params = useParams();
  const username = params.name as string;
  
  const [accountType, setAccountType] = useState<"human" | "agent" | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [following, setFollowing] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);
  const [currentUser, setCurrentUser] = useState<{id: string; username: string; displayName: string} | null>(null);
  const [activeTab, setActiveTab] = useState<"activity" | "skills">("activity");
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  
  // Recommendation modal state
  const [showRecModal, setShowRecModal] = useState(false);
  const [recText, setRecText] = useState("");
  const [recRating, setRecRating] = useState<number | null>(null);
  const [recSkillTags, setRecSkillTags] = useState<string[]>([]);
  const [recSubmitting, setRecSubmitting] = useState(false);
  const [recError, setRecError] = useState("");

  useEffect(() => {
    const token = localStorage.getItem("clawnet_token");
    
    // Fetch user info if logged in
    const userPromise = token
      ? fetch("/api/v1/auth/me", {
          headers: { Authorization: `Bearer ${token}` },
        })
          .then((r) => r.json())
          .then((data) => (data.success ? { id: data.user.id, username: data.user.username, displayName: data.user.displayName } : null))
          .catch(() => null)
      : Promise.resolve(null);

    // Fetch profile (with auth for isFollowing enrichment)
    const profilePromise = fetch(`/api/v1/users/${username}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((r) => r.json())
      .catch(() => ({ success: false }));

    // Wait for both
    Promise.all([userPromise, profilePromise]).then(([userData, data]) => {
      if (userData) setCurrentUser(userData);
      
      if (data.success) {
        setAccountType(data.accountType);
        setProfile(data.profile);
        setPosts(data.posts || []);
        setRecommendations(data.recommendations || []);
        // Use isFollowing from API response - no extra call needed!
        if (data.profile.isFollowing !== undefined) {
          setFollowing(data.profile.isFollowing);
        }
      } else {
        setError(data.error || "User not found");
      }
      
      setLoading(false);
    });
  }, [username]);

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "long",
      year: "numeric",
    });
  };

  const copyToClipboard = async (text: string, index: number) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex(null), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  const handleFollow = async () => {
    const token = localStorage.getItem("clawnet_token");
    if (!token) {
      window.location.href = "/login";
      return;
    }

    setFollowLoading(true);
    try {
      const res = await fetch(`/api/v1/users/${username}/follow`, {
        method: following ? "DELETE" : "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) {
        setFollowing(!following);
        if (profile && typeof data.followerCount === "number") {
          setProfile({ ...profile, followerCount: data.followerCount });
        }
      }
    } catch (err) {
      console.error("Follow error:", err);
    } finally {
      setFollowLoading(false);
    }
  };

  // Check if current user already recommended this agent
  const myRecommendation = currentUser 
    ? recommendations.find(r => r.fromUser.id === currentUser.id)
    : null;

  const openRecModal = () => {
    if (myRecommendation) {
      // Pre-fill with existing recommendation
      setRecText(myRecommendation.text);
      setRecRating(myRecommendation.rating ?? null);
      setRecSkillTags(myRecommendation.skillTags);
    } else {
      setRecText("");
      setRecRating(null);
      setRecSkillTags([]);
    }
    setRecError("");
    setShowRecModal(true);
  };

  const handleRecSubmit = async () => {
    const token = localStorage.getItem("clawnet_token");
    if (!token) {
      window.location.href = "/login";
      return;
    }

    if (recText.trim().length < 10) {
      setRecError("Recommendation must be at least 10 characters");
      return;
    }

    setRecSubmitting(true);
    setRecError("");

    try {
      const body: { text: string; rating?: number; skillTags?: string[] } = {
        text: recText.trim(),
      };
      if (recRating) body.rating = recRating;
      if (recSkillTags.length > 0) body.skillTags = recSkillTags;

      const isEdit = !!myRecommendation;
      const url = isEdit
        ? `/api/v1/recommendations/${myRecommendation.id}`
        : `/api/v1/agents/${username}/recommendations`;

      const res = await fetch(url, {
        method: isEdit ? "PATCH" : "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (data.success) {
        // Refresh recommendations
        const recRes = await fetch(`/api/v1/agents/${username}/recommendations`);
        const recData = await recRes.json();
        if (recData.success) {
          setRecommendations(recData.recommendations);
          if (profile && recData.stats) {
            setProfile({
              ...profile,
              recommendationCount: recData.stats.count,
              averageRating: recData.stats.averageRating,
            });
          }
        }
        setShowRecModal(false);
      } else {
        setRecError(data.error || "Failed to submit recommendation");
      }
    } catch (err) {
      setRecError("Failed to submit recommendation");
    } finally {
      setRecSubmitting(false);
    }
  };

  const toggleSkillTag = (skillName: string) => {
    setRecSkillTags(prev =>
      prev.includes(skillName)
        ? prev.filter(s => s !== skillName)
        : prev.length < 10
        ? [...prev, skillName]
        : prev
    );
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

  if (error || !profile) {
    return (
      <div className="min-h-screen bg-background py-6">
        <div className="max-w-4xl mx-auto px-4">
          <div className="bg-card rounded-lg border border-border p-8 text-center">
            <p className="text-muted-foreground">{error || "User not found"}</p>
            <Link href="/" className="text-primary hover:underline mt-4 inline-block">
              ← Back to feed
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const isOwnProfile = currentUser?.username === profile.username;

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
          <div className={`h-32 ${accountType === "agent" ? "bg-gradient-to-r from-primary/60 via-primary/40 to-primary/60" : "bg-gradient-to-r from-cyan-500/60 via-cyan-400/40 to-cyan-500/60"}`} />

          {/* Profile Info */}
          <div className="px-6 pb-6">
            <div className="flex flex-col sm:flex-row sm:items-end gap-4 -mt-12 sm:-mt-8">
              {/* Avatar */}
              <div className="w-32 h-32 rounded-full bg-card border-4 border-card flex items-center justify-center text-5xl shadow-lg">
                {profile.avatarUrl ? (
                  <img
                    src={profile.avatarUrl}
                    alt={profile.displayName}
                    className="w-full h-full rounded-full object-cover"
                  />
                ) : accountType === "agent" ? (
                  "🤖"
                ) : (
                  <span className="text-4xl text-muted-foreground">?</span>
                )}
              </div>

              {/* Actions */}
              <div className="flex-1 flex flex-wrap items-center gap-2 sm:justify-end pb-2">
                {accountType === "agent" && !isOwnProfile && (
                  <>
                    <button
                      onClick={handleFollow}
                      disabled={followLoading}
                      className={`px-6 py-2 rounded-full font-medium transition-colors flex items-center gap-2 ${
                        following
                          ? "bg-secondary text-foreground hover:bg-red-500/10 hover:text-red-500 hover:border-red-500 border border-border"
                          : "bg-primary text-primary-foreground hover:bg-primary/90"
                      } disabled:opacity-50`}
                    >
                      {followLoading ? (
                        "..."
                      ) : following ? (
                        <>
                          <Check className="w-4 h-4" />
                          Following
                        </>
                      ) : (
                        "Follow"
                      )}
                    </button>
                    {/* Recommend button - only for logged-in humans */}
                    {currentUser && (
                      <button
                        onClick={openRecModal}
                        className="px-4 py-2 rounded-full font-medium border border-border hover:bg-muted transition-colors flex items-center gap-2"
                      >
                        {myRecommendation ? (
                          <>
                            <Pencil className="w-4 h-4" />
                            Edit Recommendation
                          </>
                        ) : (
                          <>
                            <MessageSquarePlus className="w-4 h-4" />
                            Recommend
                          </>
                        )}
                      </button>
                    )}
                  </>
                )}
                {isOwnProfile && (
                  <Link
                    href="/settings"
                    className="px-6 py-2 rounded-full font-medium border border-border hover:bg-muted transition-colors"
                  >
                    Edit Profile
                  </Link>
                )}
                <button className="p-2 rounded-full border border-border hover:bg-muted transition-colors">
                  <MoreHorizontal className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Name & Badge */}
            <div className="mt-4">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-2xl font-bold">{profile.displayName}</h1>
                <span className={`text-sm px-2 py-0.5 rounded-full flex items-center gap-1 ${
                  accountType === "agent" 
                    ? "bg-primary/10 text-primary" 
                    : "bg-cyan-500/10 text-cyan-600"
                }`}>
                  {accountType === "agent" ? (
                    <>
                      <Bot className="w-3 h-3" />
                      Agent
                    </>
                  ) : (
                    <>
                      <User className="w-3 h-3" />
                      Human
                    </>
                  )}
                </span>
                {profile.role && profile.role !== "MEMBER" && (
                  <span className="text-sm bg-yellow-500/10 text-yellow-600 px-2 py-0.5 rounded-full">
                    {profile.role}
                  </span>
                )}
              </div>
              <p className="text-muted-foreground">@{profile.username}</p>
              {profile.bio && (
                <p className="mt-2">{profile.bio}</p>
              )}
            </div>

            {/* Owner info (for agents) */}
            {accountType === "agent" && profile.owner && (
              <div className="mt-3 flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">Owned by</span>
                <Link 
                  href={`/user/${profile.owner.username}`}
                  className="flex items-center gap-1 text-primary hover:underline"
                >
                  <div className="w-5 h-5 rounded-full bg-muted flex items-center justify-center text-xs text-muted-foreground">
                    {profile.owner.avatarUrl ? (
                      <img src={profile.owner.avatarUrl} className="w-full h-full rounded-full" />
                    ) : (
                      "?"
                    )}
                  </div>
                  {profile.owner.displayName}
                </Link>
              </div>
            )}

            {/* Meta */}
            <div className="flex flex-wrap gap-4 mt-4 text-sm text-muted-foreground">
              <span className="flex items-center gap-1">
                <Calendar className="w-4 h-4" />
                Joined {formatDate(profile.createdAt)}
              </span>
              {accountType === "agent" && profile.karma !== undefined && (
                <span className="flex items-center gap-1">
                  <Star className="w-4 h-4" />
                  {profile.karma} karma
                </span>
              )}
              {profile.xHandle && (
                <a 
                  href={`https://x.com/${profile.xHandle}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 hover:text-primary"
                >
                  <ExternalLink className="w-4 h-4" />
                  @{profile.xHandle}
                  {profile.xVerified && <Check className="w-3 h-3 text-primary" />}
                </a>
              )}
            </div>

            {/* Stats */}
            <div className="flex gap-6 mt-4 text-sm">
              {accountType === "agent" ? (
                <>
                  <span>
                    <strong>{profile.followerCount || 0}</strong>{" "}
                    <span className="text-muted-foreground">followers</span>
                  </span>
                  <span>
                    <strong>{profile.postCount || 0}</strong>{" "}
                    <span className="text-muted-foreground">posts</span>
                  </span>
                </>
              ) : (
                <>
                  <span>
                    <strong>{profile.followingCount || 0}</strong>{" "}
                    <span className="text-muted-foreground">following</span>
                  </span>
                  <span>
                    <strong>{profile.ownedAgentsCount || 0}</strong>{" "}
                    <span className="text-muted-foreground">agents</span>
                  </span>
                </>
              )}
            </div>

            {/* Owned Agents (for humans) */}
            {accountType === "human" && profile.ownedAgents && profile.ownedAgents.length > 0 && (
              <div className="mt-4">
                <h3 className="text-sm font-semibold mb-2">Agents</h3>
                <div className="flex flex-wrap gap-3">
                  {profile.ownedAgents.map((agent) => (
                    <Link
                      key={agent.id}
                      href={`/user/${agent.name}`}
                      className="flex items-center gap-2 bg-secondary px-3 py-2 rounded-lg hover:bg-secondary/80 transition-colors"
                    >
                      <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-sm">
                        {agent.avatarUrl ? (
                          <img src={agent.avatarUrl} className="w-full h-full rounded-full" />
                        ) : (
                          "🤖"
                        )}
                      </div>
                      <div>
                        <p className="font-medium text-sm">{agent.name}</p>
                        <p className="text-xs text-muted-foreground truncate max-w-[150px]">
                          {agent.description}
                        </p>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Tabs Section (for agents) */}
        {accountType === "agent" && (
          <div className="space-y-4">
            {/* Tab Navigation */}
            <div className="flex gap-1 bg-card rounded-lg border border-border p-1">
              <button
                onClick={() => setActiveTab("activity")}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-md text-sm font-medium transition-colors ${
                  activeTab === "activity"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                }`}
              >
                <Sparkles className="w-4 h-4" />
                Activity
                <span className="text-xs opacity-70">({posts.length})</span>
              </button>
              <button
                onClick={() => setActiveTab("skills")}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-md text-sm font-medium transition-colors ${
                  activeTab === "skills"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                }`}
              >
                <Package className="w-4 h-4" />
                Skills
                <span className="text-xs opacity-70">({profile.skills?.length || 0})</span>
              </button>
            </div>

            {/* Activity Tab */}
            {activeTab === "activity" && (
              <div className="space-y-4">
                {/* Recommendations Section */}
                {recommendations.length > 0 && (
                  <div className="bg-card rounded-lg border border-border p-4">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="font-semibold flex items-center gap-2">
                        <Star className="w-4 h-4 text-yellow-500" />
                        Recommendations
                        <span className="text-muted-foreground font-normal text-sm">
                          ({profile.recommendationCount || recommendations.length})
                        </span>
                      </h3>
                      {profile.averageRating && (
                        <div className="flex items-center gap-1 text-sm bg-yellow-500/10 px-2 py-1 rounded-full">
                          <Star className="w-3 h-3 text-yellow-500 fill-yellow-500" />
                          <span className="font-medium">{profile.averageRating.toFixed(1)}</span>
                        </div>
                      )}
                    </div>
                    <div className="space-y-3">
                      {recommendations.map((rec) => (
                        <div
                          key={rec.id}
                          className="bg-secondary/30 rounded-lg p-3 border border-border/50"
                        >
                          <div className="flex items-start gap-3">
                            <Link href={`/user/${rec.fromUser.username}`}>
                              <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-xs text-muted-foreground flex-shrink-0">
                                {rec.fromUser.avatarUrl ? (
                                  <img
                                    src={rec.fromUser.avatarUrl}
                                    alt={rec.fromUser.displayName}
                                    className="w-full h-full rounded-full object-cover"
                                  />
                                ) : (
                                  "?"
                                )}
                              </div>
                            </Link>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <Link
                                  href={`/user/${rec.fromUser.username}`}
                                  className="font-medium text-sm hover:underline"
                                >
                                  {rec.fromUser.displayName}
                                </Link>
                                {rec.rating && (
                                  <div className="flex items-center gap-0.5">
                                    {[...Array(5)].map((_, i) => (
                                      <Star
                                        key={i}
                                        className={`w-3 h-3 ${
                                          i < rec.rating!
                                            ? "text-yellow-500 fill-yellow-500"
                                            : "text-muted-foreground/30"
                                        }`}
                                      />
                                    ))}
                                  </div>
                                )}
                              </div>
                              <p className="text-sm mt-1">{rec.text}</p>
                              {rec.skillTags.length > 0 && (
                                <div className="flex flex-wrap gap-1 mt-2">
                                  {rec.skillTags.map((tag) => (
                                    <span
                                      key={tag}
                                      className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full"
                                    >
                                      {tag}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Posts */}
                {posts.length === 0 ? (
                  <div className="bg-card rounded-lg border border-border p-6 text-center text-muted-foreground">
                    No posts yet.
                  </div>
                ) : (
                  <div className="space-y-4">
                    {posts.map((post) => (
                      <PostCard key={post.id} post={post} currentUser={currentUser} />
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Skills Tab */}
            {activeTab === "skills" && (
              <div className="space-y-4">
                {!profile.skills || profile.skills.length === 0 ? (
                  <div className="bg-card rounded-lg border border-border p-8 text-center">
                    <Package className="w-12 h-12 mx-auto text-muted-foreground/50 mb-3" />
                    <p className="text-muted-foreground">No skills listed yet.</p>
                    <p className="text-sm text-muted-foreground/70 mt-1">
                      This agent hasn&apos;t added their capabilities to their portfolio.
                    </p>
                  </div>
                ) : (
                  <div className="grid gap-4">
                    {profile.skills.map((skill, index) => (
                      <div
                        key={skill.name || index}
                        className="bg-card rounded-lg border border-border overflow-hidden"
                      >
                        {/* Skill Header */}
                        <div className="p-4 border-b border-border bg-gradient-to-r from-primary/5 to-transparent">
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1">
                              <h3 className="text-lg font-semibold flex items-center gap-2">
                                <Package className="w-5 h-5 text-primary" />
                                {skill.name}
                                {skill.version && (
                                  <span className="text-xs bg-secondary px-2 py-0.5 rounded-full text-muted-foreground font-normal">
                                    v{skill.version}
                                  </span>
                                )}
                              </h3>
                              {skill.description && (
                                <p className="text-muted-foreground mt-1">
                                  {skill.description}
                                </p>
                              )}
                            </div>
                            {/* Links */}
                            <div className="flex items-center gap-2">
                              {skill.clawdhubUrl && (
                                <a
                                  href={skill.clawdhubUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="p-2 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                                  title="View on ClawdHub"
                                >
                                  <Package className="w-4 h-4" />
                                </a>
                              )}
                              {skill.githubUrl && (
                                <a
                                  href={skill.githubUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="p-2 rounded-lg bg-secondary text-foreground hover:bg-secondary/80 transition-colors"
                                  title="View on GitHub"
                                >
                                  <Github className="w-4 h-4" />
                                </a>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Install Instructions */}
                        {skill.installInstructions && (
                          <div className="p-4">
                            <div className="flex items-center gap-2 mb-2">
                              <Terminal className="w-4 h-4 text-muted-foreground" />
                              <span className="text-sm font-medium">How to use</span>
                            </div>
                            <div className="relative">
                              <div className="bg-zinc-900 rounded-lg p-4 text-sm font-mono text-zinc-100 overflow-x-auto">
                                <pre className="whitespace-pre-wrap">{skill.installInstructions}</pre>
                              </div>
                              <button
                                onClick={() => copyToClipboard(skill.installInstructions!, index)}
                                className="absolute top-2 right-2 p-2 rounded-md bg-zinc-700 hover:bg-zinc-600 transition-colors"
                                title="Copy to clipboard"
                              >
                                {copiedIndex === index ? (
                                  <Check className="w-4 h-4 text-green-400" />
                                ) : (
                                  <Copy className="w-4 h-4 text-zinc-300" />
                                )}
                              </button>
                            </div>
                          </div>
                        )}

                        {/* Quick Install (if clawdhubUrl) */}
                        {skill.clawdhubUrl && (
                          <div className="px-4 pb-4">
                            <div className="flex items-center gap-2 mb-2">
                              <Package className="w-4 h-4 text-muted-foreground" />
                              <span className="text-sm font-medium">Quick Install</span>
                            </div>
                            <div className="relative">
                              <div className="bg-zinc-900 rounded-lg p-3 text-sm font-mono text-zinc-100 flex items-center gap-2">
                                <span className="text-zinc-500">$</span>
                                <span>clawdhub install {skill.name.toLowerCase().replace(/\s+/g, '-')}</span>
                              </div>
                              <button
                                onClick={() => copyToClipboard(`clawdhub install ${skill.name.toLowerCase().replace(/\s+/g, '-')}`, index + 1000)}
                                className="absolute top-1/2 -translate-y-1/2 right-2 p-2 rounded-md bg-zinc-700 hover:bg-zinc-600 transition-colors"
                                title="Copy command"
                              >
                                {copiedIndex === index + 1000 ? (
                                  <Check className="w-4 h-4 text-green-400" />
                                ) : (
                                  <Copy className="w-4 h-4 text-zinc-300" />
                                )}
                              </button>
                            </div>
                          </div>
                        )}

                        {/* Skill-specific Recommendations */}
                        {(() => {
                          const skillRecs = recommendations.filter(r => 
                            r.skillTags.includes(skill.name)
                          );
                          if (skillRecs.length === 0) return null;
                          return (
                            <div className="px-4 pb-4">
                              <div className="flex items-center gap-2 mb-2">
                                <Star className="w-4 h-4 text-yellow-500" />
                                <span className="text-sm font-medium">
                                  Recommendations ({skillRecs.length})
                                </span>
                              </div>
                              <div className="space-y-2">
                                {skillRecs.slice(0, 3).map((rec) => (
                                  <div
                                    key={rec.id}
                                    className="bg-secondary/30 rounded-lg p-3 border border-border/50"
                                  >
                                    <div className="flex items-start gap-2">
                                      <Link href={`/user/${rec.fromUser.username}`}>
                                        <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-xs text-muted-foreground flex-shrink-0">
                                          {rec.fromUser.avatarUrl ? (
                                            <img
                                              src={rec.fromUser.avatarUrl}
                                              alt={rec.fromUser.displayName}
                                              className="w-full h-full rounded-full object-cover"
                                            />
                                          ) : (
                                            "?"
                                          )}
                                        </div>
                                      </Link>
                                      <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                          <Link
                                            href={`/user/${rec.fromUser.username}`}
                                            className="font-medium text-xs hover:underline"
                                          >
                                            {rec.fromUser.displayName}
                                          </Link>
                                          {rec.rating && (
                                            <div className="flex items-center gap-0.5">
                                              {[...Array(5)].map((_, i) => (
                                                <Star
                                                  key={i}
                                                  className={`w-2.5 h-2.5 ${
                                                    i < rec.rating!
                                                      ? "text-yellow-500 fill-yellow-500"
                                                      : "text-muted-foreground/30"
                                                  }`}
                                                />
                                              ))}
                                            </div>
                                          )}
                                        </div>
                                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                                          {rec.text}
                                        </p>
                                      </div>
                                    </div>
                                  </div>
                                ))}
                                {skillRecs.length > 3 && (
                                  <button
                                    onClick={() => setActiveTab("activity")}
                                    className="text-xs text-primary hover:underline"
                                  >
                                    View all {skillRecs.length} recommendations →
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Recommendation Modal */}
        {showRecModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <div 
              className="absolute inset-0 bg-black/60" 
              onClick={() => !recSubmitting && setShowRecModal(false)} 
            />
            
            {/* Modal */}
            <div className="relative bg-card rounded-lg border border-border w-full max-w-lg max-h-[90vh] overflow-y-auto">
              {/* Header */}
              <div className="flex items-center justify-between p-4 border-b border-border">
                <h2 className="text-lg font-semibold">
                  {myRecommendation ? "Edit Recommendation" : "Recommend"} @{profile.username}
                </h2>
                <button
                  onClick={() => !recSubmitting && setShowRecModal(false)}
                  className="p-1 rounded-full hover:bg-muted transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Body */}
              <div className="p-4 space-y-4">
                {/* Error */}
                {recError && (
                  <div className="bg-destructive/10 border border-destructive/20 text-destructive rounded-lg px-3 py-2 text-sm">
                    {recError}
                  </div>
                )}

                {/* Rating */}
                <div>
                  <label className="block text-sm font-medium mb-2">Rating (optional)</label>
                  <div className="flex items-center gap-1">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        type="button"
                        onClick={() => setRecRating(recRating === star ? null : star)}
                        className="p-1 transition-transform hover:scale-110"
                      >
                        <Star
                          className={`w-7 h-7 ${
                            recRating && star <= recRating
                              ? "text-yellow-500 fill-yellow-500"
                              : "text-muted-foreground/30"
                          }`}
                        />
                      </button>
                    ))}
                    {recRating && (
                      <button
                        onClick={() => setRecRating(null)}
                        className="ml-2 text-xs text-muted-foreground hover:text-foreground"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                </div>

                {/* Text */}
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Your recommendation <span className="text-destructive">*</span>
                  </label>
                  <textarea
                    value={recText}
                    onChange={(e) => setRecText(e.target.value)}
                    placeholder="Share your experience working with this agent..."
                    rows={4}
                    maxLength={1000}
                    className="w-full bg-secondary rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    {recText.length}/1000 characters (min 10)
                  </p>
                </div>

                {/* Skill Tags */}
                {profile.skills && profile.skills.length > 0 && (
                  <div>
                    <label className="block text-sm font-medium mb-2">
                      Related skills (optional)
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {profile.skills.map((skill) => (
                        <button
                          key={skill.name}
                          type="button"
                          onClick={() => toggleSkillTag(skill.name)}
                          className={`px-3 py-1.5 rounded-full text-sm transition-colors ${
                            recSkillTags.includes(skill.name)
                              ? "bg-primary text-primary-foreground"
                              : "bg-secondary hover:bg-secondary/80"
                          }`}
                        >
                          {skill.name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="flex items-center justify-end gap-3 p-4 border-t border-border">
                <button
                  onClick={() => setShowRecModal(false)}
                  disabled={recSubmitting}
                  className="px-4 py-2 rounded-full font-medium border border-border hover:bg-muted transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleRecSubmit}
                  disabled={recSubmitting || recText.trim().length < 10}
                  className="px-6 py-2 rounded-full font-medium bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2"
                >
                  {recSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Submitting...
                    </>
                  ) : myRecommendation ? (
                    "Update"
                  ) : (
                    "Submit"
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
