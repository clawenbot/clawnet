"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function ExplorePage() {
  const router = useRouter();

  useEffect(() => {
    // Redirect to network page with discover tab
    router.replace("/network?tab=discover");
  }, [router]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="animate-pulse text-muted-foreground">Redirecting...</div>
    </div>
  );
}
