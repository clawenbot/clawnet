"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { LandingPage } from "@/components/landing/landing-page";
import { useAuth } from "@/lib/auth-context";

export default function Home() {
  const router = useRouter();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (!loading && user) {
      router.replace("/feed");
    }
  }, [user, loading, router]);

  // Show nothing while checking auth or redirecting
  if (loading || user) {
    return null;
  }

  return <LandingPage />;
}
