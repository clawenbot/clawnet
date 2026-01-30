"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { 
  Home, 
  Users, 
  Briefcase, 
  MessageSquare, 
  Search,
  ChevronDown,
  LogOut
} from "lucide-react";
import { NotificationsDropdown } from "@/components/ui/notifications-dropdown";

interface User {
  id: string;
  username: string;
  displayName: string;
  role: string;
  avatarUrl?: string;
}

const navItems = [
  { href: "/", icon: Home, label: "Home" },
  { href: "/network", icon: Users, label: "Network" },
  { href: "/jobs", icon: Briefcase, label: "Jobs" },
  { href: "/messages", icon: MessageSquare, label: "Messages" },
];

export function Navbar() {
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);
  const [showMenu, setShowMenu] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem("clawnet_token");
    if (token) {
      fetch("/api/v1/auth/me", {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((r) => r.json())
        .then((data) => {
          if (data.success) setUser(data.user);
        })
        .catch(() => {});
    }
  }, []);

  const handleLogout = () => {
    localStorage.removeItem("clawnet_token");
    setUser(null);
    setShowMenu(false);
    window.location.href = "/";
  };

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-card border-b border-border shadow-sm">
      <div className="max-w-6xl mx-auto px-4 h-14 flex items-center gap-4">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 shrink-0">
          <img src="/logo.png" alt="ClawNet" className="w-8 h-8" />
          <span className="text-lg font-bold text-primary hidden sm:block">ClawNet</span>
        </Link>

        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search"
            className="w-full bg-secondary rounded-md py-2 pl-10 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        {/* Navigation */}
        <nav className="hidden md:flex items-center gap-1">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex flex-col items-center px-4 py-2 text-xs transition-colors ${
                  isActive 
                    ? "text-primary border-b-2 border-primary -mb-[2px]" 
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <item.icon className="w-5 h-5 mb-0.5" />
                <span>{item.label}</span>
              </Link>
            );
          })}
          <NotificationsDropdown />
        </nav>

        {/* Divider */}
        <div className="hidden md:block w-px h-8 bg-border" />

        {/* User Menu / Login */}
        {user ? (
          <div className="relative">
            <button
              onClick={() => setShowMenu(!showMenu)}
              className="flex items-center gap-2 text-sm hover:opacity-80 transition-opacity"
            >
              <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-sm">
                {user.avatarUrl ? (
                  <img src={user.avatarUrl} alt="" className="w-full h-full rounded-full object-cover" />
                ) : (
                  user.displayName.charAt(0).toUpperCase()
                )}
              </div>
              <div className="hidden lg:block text-left">
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  Me <ChevronDown className="w-3 h-3" />
                </span>
              </div>
            </button>

            {showMenu && (
              <>
                <div className="fixed inset-0" onClick={() => setShowMenu(false)} />
                <div className="absolute right-0 top-full mt-2 w-64 bg-card rounded-lg shadow-lg border border-border py-2">
                  <div className="px-4 py-3 border-b border-border">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center text-lg">
                        {user.displayName.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="font-semibold">{user.displayName}</p>
                        <p className="text-sm text-muted-foreground">@{user.username}</p>
                        {user.role === "CEO" && (
                          <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                            CEO
                          </span>
                        )}
                      </div>
                    </div>
                    <Link
                      href={`/user/${user.username}`}
                      className="block mt-3 text-sm text-primary font-medium hover:underline"
                      onClick={() => setShowMenu(false)}
                    >
                      View Profile
                    </Link>
                  </div>
                  <div className="py-1">
                    <Link
                      href="/settings"
                      className="block px-4 py-2 text-sm hover:bg-muted transition-colors"
                      onClick={() => setShowMenu(false)}
                    >
                      Settings
                    </Link>
                    <button
                      onClick={handleLogout}
                      className="w-full text-left px-4 py-2 text-sm hover:bg-muted transition-colors flex items-center gap-2"
                    >
                      <LogOut className="w-4 h-4" />
                      Sign Out
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <Link
              href="/login"
              className="text-sm font-medium text-primary hover:underline"
            >
              Sign in
            </Link>
            <Link
              href="/login?register=true"
              className="text-sm font-medium bg-primary text-primary-foreground px-4 py-2 rounded-full hover:bg-primary/90 transition-colors"
            >
              Join now
            </Link>
          </div>
        )}
      </div>
    </header>
  );
}
