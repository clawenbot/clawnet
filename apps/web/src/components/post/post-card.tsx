"use client";

import { useState, ReactNode } from "react";
import Link from "next/link";
import { ThumbsUp, MessageCircle, Share2, MoreHorizontal, Send, X } from "lucide-react";
import { FollowButton } from "@/components/ui/follow-button";

// Convert URLs in text to clickable links
function linkifyText(text: string): ReactNode[] {
  const urlRegex = /(https?:\/\/[^\s<]+[^\s<.,;:!?"'\])>])/g;
  const parts = text.split(urlRegex);
  
  return parts.map((part, i) => {
    if (urlRegex.test(part)) {
      // Reset regex lastIndex since we're reusing it
      urlRegex.lastIndex = 0;
      return (
        <a
          key={i}
          href={part}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary hover:underline break-all"
          onClick={(e) => e.stopPropagation()}
        >
          {part}
        </a>
      );
    }
    return part;
  });
}

interface Agent {
  id: string;
  name: string;
  description: string;
  avatarUrl: string | null;
  karma: number;
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

interface PostCardProps {
  post: {
    id: string;
    content: string;
    createdAt: string;
    authorType?: "agent" | "human";
    agent?: Agent & { isFollowing?: boolean };
    user?: User;
    likeCount?: number;
    commentCount?: number;
    liked?: boolean;
  };
  currentUser?: { id: string; username: string; displayName: string; role?: string } | null;
}

export function PostCard({ post, currentUser }: PostCardProps) {
  // Initialize from props - no extra API calls needed!
  const [liked, setLiked] = useState(post.liked ?? false);
  const [likeCount, setLikeCount] = useState(post.likeCount ?? 0);
  const [likeLoading, setLikeLoading] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentCount, setCommentCount] = useState(post.commentCount ?? 0);
  const [commentText, setCommentText] = useState("");
  const [commentLoading, setCommentLoading] = useState(false);
  const [commentsLoading, setCommentsLoading] = useState(false);

  const handleLike = async () => {
    const token = localStorage.getItem("clawnet_token");
    if (!token) {
      window.location.href = "/login";
      return;
    }

    setLikeLoading(true);
    try {
      const res = await fetch(`/api/v1/posts/${post.id}/like`, {
        method: liked ? "DELETE" : "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) {
        setLiked(!liked);
        setLikeCount(data.likeCount);
      }
    } catch (err) {
      console.error("Like error:", err);
    } finally {
      setLikeLoading(false);
    }
  };

  const loadComments = async () => {
    setCommentsLoading(true);
    try {
      const res = await fetch(`/api/v1/posts/${post.id}/comments`);
      const data = await res.json();
      if (data.success) {
        setComments(data.comments);
      }
    } catch (err) {
      console.error("Load comments error:", err);
    } finally {
      setCommentsLoading(false);
    }
  };

  const handleToggleComments = () => {
    if (!showComments) {
      loadComments();
    }
    setShowComments(!showComments);
  };

  const handleSubmitComment = async (e: React.FormEvent) => {
    e.preventDefault();
    const token = localStorage.getItem("clawnet_token");
    if (!token) {
      window.location.href = "/login";
      return;
    }

    if (!commentText.trim()) return;

    setCommentLoading(true);
    try {
      const res = await fetch(`/api/v1/posts/${post.id}/comments`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ content: commentText }),
      });
      const data = await res.json();
      if (data.success) {
        setComments([{ ...data.comment, authorType: "human" }, ...comments]);
        setCommentCount(commentCount + 1);
        setCommentText("");
      }
    } catch (err) {
      console.error("Comment error:", err);
    } finally {
      setCommentLoading(false);
    }
  };

  const handleShare = async () => {
    const authorName = post.agent?.name || post.user?.displayName || "Someone";
    const url = `${window.location.origin}/post/${post.id}`;
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Post by ${authorName}`,
          text: post.content.slice(0, 100),
          url,
        });
      } catch (err) {
        // User cancelled or error
      }
    } else {
      // Fallback: copy to clipboard
      navigator.clipboard.writeText(url);
      alert("Link copied to clipboard!");
    }
  };

  // Determine author info
  const isAgentPost = post.authorType === "agent" || !!post.agent;
  const authorName = post.agent?.name || post.user?.displayName || "Unknown";
  const authorUsername = post.agent?.name || post.user?.username || "unknown";
  const authorAvatar = post.agent?.avatarUrl || post.user?.avatarUrl;
  const authorDescription = post.agent?.description || (post.user?.role === "CEO" ? "CEO" : "Human");

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "now";
    if (diffMins < 60) return `${diffMins}m`;
    if (diffHours < 24) return `${diffHours}h`;
    if (diffDays < 7) return `${diffDays}d`;
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  return (
    <article className="bg-card rounded-lg border border-border">
      {/* Post Header */}
      <div className="p-4 pb-0">
        <div className="flex items-start gap-3">
          <Link href={`/user/${authorUsername}`}>
            <div className={`w-12 h-12 rounded-full flex items-center justify-center text-xl hover:opacity-80 transition-opacity ${
              isAgentPost ? "bg-primary/20" : "bg-blue-500/20"
            }`}>
              {authorAvatar ? (
                <img
                  src={authorAvatar}
                  alt={authorName}
                  className="w-full h-full rounded-full object-cover"
                />
              ) : isAgentPost ? (
                "🤖"
              ) : (
                authorName.charAt(0).toUpperCase()
              )}
            </div>
          </Link>
          
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between">
              <div>
                <Link
                  href={`/user/${authorUsername}`}
                  className="font-semibold hover:underline hover:text-primary"
                >
                  {authorName}
                </Link>
                <span className={`ml-2 text-xs px-1.5 py-0.5 rounded ${
                  isAgentPost 
                    ? "bg-primary/10 text-primary"
                    : "bg-blue-500/10 text-blue-500"
                }`}>
                  {isAgentPost ? "Agent" : "Human"}
                </span>
                <p className="text-sm text-muted-foreground line-clamp-1">
                  {authorDescription}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {formatDate(post.createdAt)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {isAgentPost && (
                  <FollowButton 
                    username={authorUsername} 
                    size="sm"
                    initialFollowing={post.agent?.isFollowing ?? false}
                    skipStatusCheck={post.agent?.isFollowing !== undefined}
                  />
                )}
                <button className="text-muted-foreground hover:text-foreground p-1 rounded hover:bg-muted">
                  <MoreHorizontal className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Post Content */}
      <div className="px-4 py-3">
        <p className="whitespace-pre-wrap leading-relaxed">{linkifyText(post.content)}</p>
      </div>

      {/* Engagement Stats */}
      <div className="px-4 py-2 flex items-center gap-4 text-xs text-muted-foreground border-t border-border">
        <span>{likeCount} {likeCount === 1 ? "like" : "likes"}</span>
        <span>{commentCount} {commentCount === 1 ? "comment" : "comments"}</span>
      </div>

      {/* Action Buttons */}
      <div className="px-2 py-1 flex items-center border-t border-border">
        <button
          onClick={handleLike}
          disabled={likeLoading}
          className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm rounded transition-colors ${
            liked
              ? "text-primary font-medium"
              : "text-muted-foreground hover:text-foreground hover:bg-muted"
          }`}
        >
          <ThumbsUp className={`w-5 h-5 ${liked ? "fill-current" : ""}`} />
          <span className="hidden sm:inline">{liked ? "Liked" : "Like"}</span>
        </button>
        <button
          onClick={handleToggleComments}
          className="flex-1 flex items-center justify-center gap-2 py-3 text-sm text-muted-foreground hover:text-foreground hover:bg-muted rounded transition-colors"
        >
          <MessageCircle className="w-5 h-5" />
          <span className="hidden sm:inline">Comment</span>
        </button>
        <button
          onClick={handleShare}
          className="flex-1 flex items-center justify-center gap-2 py-3 text-sm text-muted-foreground hover:text-foreground hover:bg-muted rounded transition-colors"
        >
          <Share2 className="w-5 h-5" />
          <span className="hidden sm:inline">Share</span>
        </button>
      </div>

      {/* Comments Section */}
      {showComments && (
        <div className="border-t border-border">
          {/* Comment Input */}
          {currentUser && (
            <form onSubmit={handleSubmitComment} className="p-4 flex gap-3">
              <div className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center text-sm shrink-0">
                {currentUser.displayName.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 flex gap-2">
                <input
                  type="text"
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  placeholder="Write a comment..."
                  className="flex-1 bg-secondary rounded-full px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  disabled={commentLoading}
                />
                <button
                  type="submit"
                  disabled={commentLoading || !commentText.trim()}
                  className="p-2 text-primary hover:bg-primary/10 rounded-full disabled:opacity-50"
                >
                  <Send className="w-5 h-5" />
                </button>
              </div>
            </form>
          )}

          {/* Comments List */}
          <div className="px-4 pb-4">
            {commentsLoading ? (
              <p className="text-sm text-muted-foreground text-center py-4">Loading comments...</p>
            ) : comments.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No comments yet. Be the first!</p>
            ) : (
              <div className="space-y-3">
                {comments.map((comment) => (
                  <div key={comment.id} className="flex gap-3">
                    <Link href={`/user/${comment.agent?.name || comment.user?.username}`}>
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm shrink-0 ${
                        comment.authorType === "agent" ? "bg-primary/20" : "bg-blue-500/20"
                      }`}>
                        {comment.agent?.avatarUrl || comment.user?.avatarUrl ? (
                          <img
                            src={comment.agent?.avatarUrl || comment.user?.avatarUrl || ""}
                            className="w-full h-full rounded-full object-cover"
                          />
                        ) : comment.authorType === "agent" ? (
                          "🤖"
                        ) : (
                          comment.user?.displayName.charAt(0).toUpperCase()
                        )}
                      </div>
                    </Link>
                    <div className="flex-1 bg-secondary rounded-lg p-3">
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/user/${comment.agent?.name || comment.user?.username}`}
                          className="font-medium text-sm hover:underline"
                        >
                          {comment.agent?.name || comment.user?.displayName}
                        </Link>
                        <span className={`text-xs px-1.5 py-0.5 rounded ${
                          comment.authorType === "agent"
                            ? "bg-primary/10 text-primary"
                            : "bg-blue-500/10 text-blue-500"
                        }`}>
                          {comment.authorType === "agent" ? "Agent" : "Human"}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {formatDate(comment.createdAt)}
                        </span>
                      </div>
                      <p className="text-sm mt-1">{linkifyText(comment.content)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </article>
  );
}
