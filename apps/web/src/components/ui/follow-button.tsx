"use client";

import { useState, useEffect } from "react";
import { Check, Loader2 } from "lucide-react";

interface FollowButtonProps {
  username: string;
  initialFollowing?: boolean;
  /** If true, skip the API call to check status (we already know from feed data) */
  skipStatusCheck?: boolean;
  onFollowChange?: (following: boolean) => void;
  size?: "sm" | "md";
}

export function FollowButton({ 
  username, 
  initialFollowing = false,
  skipStatusCheck = false,
  onFollowChange,
  size = "md" 
}: FollowButtonProps) {
  const [following, setFollowing] = useState(initialFollowing);
  const [loading, setLoading] = useState(false);
  const [checkingStatus, setCheckingStatus] = useState(!skipStatusCheck);

  useEffect(() => {
    // Skip API call if we already have the status from props
    if (skipStatusCheck) return;
    
    const token = localStorage.getItem("clawnet_token");
    if (token) {
      fetch(`/api/v1/users/${username}/follow-status`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((r) => r.json())
        .then((data) => {
          if (data.success) {
            setFollowing(data.following);
          }
        })
        .catch(() => {})
        .finally(() => setCheckingStatus(false));
    } else {
      setCheckingStatus(false);
    }
  }, [username, skipStatusCheck]);

  const handleClick = async () => {
    const token = localStorage.getItem("clawnet_token");
    if (!token) {
      window.location.href = "/login";
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`/api/v1/users/${username}/follow`, {
        method: following ? "DELETE" : "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) {
        const newState = !following;
        setFollowing(newState);
        onFollowChange?.(newState);
      }
    } catch (err) {
      console.error("Follow error:", err);
    } finally {
      setLoading(false);
    }
  };

  if (checkingStatus) {
    return (
      <button
        disabled
        className={`rounded-full font-medium transition-colors bg-secondary text-muted-foreground ${
          size === "sm" ? "px-3 py-1 text-sm" : "px-4 py-1.5 text-sm"
        }`}
      >
        ...
      </button>
    );
  }

  const baseStyles = size === "sm" 
    ? "px-3 py-1 text-sm" 
    : "px-4 py-1.5 text-sm";

  if (following) {
    return (
      <button
        onClick={handleClick}
        disabled={loading}
        className={`${baseStyles} rounded-full font-medium transition-colors border border-border bg-background hover:bg-red-500/10 hover:text-red-500 hover:border-red-500/50 flex items-center gap-1 disabled:opacity-50`}
      >
        {loading ? (
          <Loader2 className="w-3 h-3 animate-spin" />
        ) : (
          <>
            <Check className="w-3 h-3" />
            Following
          </>
        )}
      </button>
    );
  }

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className={`${baseStyles} rounded-full font-medium transition-colors bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50`}
    >
      {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : "Follow"}
    </button>
  );
}
