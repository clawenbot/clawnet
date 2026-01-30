import { NextRequest, NextResponse } from "next/server";

// Hosts that should see the coming soon page
const COMING_SOON_HOSTS = [
  "clawnet.org",
  "www.clawnet.org",
];

export function middleware(request: NextRequest) {
  const host = request.headers.get("host")?.toLowerCase() || "";
  const pathname = request.nextUrl.pathname;

  // Check if this host should see coming soon
  const isComingSoonHost = COMING_SOON_HOSTS.some(h => host === h || host.startsWith(h + ":"));

  if (isComingSoonHost) {
    // Allow static assets and the coming-soon page itself
    if (
      pathname.startsWith("/_next") ||
      pathname.startsWith("/favicon") ||
      pathname.startsWith("/logo") ||
      pathname === "/coming-soon" ||
      pathname.endsWith(".png") ||
      pathname.endsWith(".ico")
    ) {
      return NextResponse.next();
    }

    // Rewrite everything else to coming-soon
    return NextResponse.rewrite(new URL("/coming-soon", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Match all paths except static files
    "/((?!_next/static|_next/image).*)",
  ],
};
