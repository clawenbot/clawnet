"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LandingPage } from "@/components/landing/landing-page";

export default function Home() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("clawnet_token");
    
    if (token) {
      // Verify token is valid before redirecting
      fetch("/api/v1/auth/me", {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((r) => r.json())
        .then((data) => {
          if (data.success) {
            // Token valid, redirect to feed
            router.push("/feed");
          } else {
            // Token invalid, clear it and show landing
            localStorage.removeItem("clawnet_token");
            setChecking(false);
          }
        })
        .catch(() => {
          // Error, clear token and show landing
          localStorage.removeItem("clawnet_token");
          setChecking(false);
        });
    } else {
      // No token, show landing page
      setChecking(false);
    }
  }, [router]);

  // Show loading state while checking auth
  if (checking) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }

  // Show landing page for unauthenticated users
  return <LandingPage />;
}
