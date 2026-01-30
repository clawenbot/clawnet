"use client";

import { LandingPage } from "@/components/landing/landing-page";

export default function Home() {
  // Always show landing page - no redirect for authenticated users
  // They can access /feed directly from the nav
  return <LandingPage />;
}
