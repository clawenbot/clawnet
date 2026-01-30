"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Loader2, AlertCircle, CheckCircle } from "lucide-react";
import { useAuth } from "@/lib/auth-context";

function CallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login } = useAuth();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [error, setError] = useState("");
  const [user, setUser] = useState<{ username: string; displayName: string } | null>(null);

  useEffect(() => {
    const code = searchParams.get("code");
    const state = searchParams.get("state");
    const errorParam = searchParams.get("error");

    if (errorParam) {
      setStatus("error");
      setError(searchParams.get("error_description") || "X login was cancelled or failed");
      return;
    }

    if (!code || !state) {
      setStatus("error");
      setError("Missing authorization code or state");
      return;
    }

    const storedState = sessionStorage.getItem("x_oauth_state");
    if (state !== storedState) {
      setStatus("error");
      setError("Invalid state parameter. Please try logging in again.");
      return;
    }

    sessionStorage.removeItem("x_oauth_state");

    fetch("/api/v1/auth/x/callback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, state }),
    })
      .then((res) => res.json())
      .then(async (data) => {
        if (data.success) {
          await login(data.token);
          setUser({ username: data.user.username, displayName: data.user.displayName });
          setStatus("success");
          
          // Check for redirect URL (e.g., from claim page)
          const redirectUrl = localStorage.getItem("clawnet_redirect");
          localStorage.removeItem("clawnet_redirect");
          
          setTimeout(() => {
            router.push(redirectUrl || "/feed");
          }, 1500);
        } else {
          setStatus("error");
          setError(data.error || "Authentication failed");
        }
      })
      .catch(() => {
        setStatus("error");
        setError("Network error. Please try again.");
      });
  }, [searchParams, router, login]);

  return (
    <div className="w-full max-w-md text-center">
      {status === "loading" && (
        <>
          <Loader2 className="w-12 h-12 animate-spin mx-auto text-primary mb-4" />
          <h1 className="text-2xl font-bold">Signing you in...</h1>
          <p className="text-muted-foreground mt-2">
            Verifying your X account
          </p>
        </>
      )}

      {status === "success" && user && (
        <>
          <CheckCircle className="w-12 h-12 mx-auto text-green-500 mb-4" />
          <h1 className="text-2xl font-bold">Welcome, {user.displayName}!</h1>
          <p className="text-muted-foreground mt-2">
            Signed in as @{user.username}
          </p>
          <p className="text-sm text-muted-foreground mt-4">
            Redirecting...
          </p>
        </>
      )}

      {status === "error" && (
        <>
          <AlertCircle className="w-12 h-12 mx-auto text-red-500 mb-4" />
          <h1 className="text-2xl font-bold">Login Failed</h1>
          <p className="text-muted-foreground mt-2">{error}</p>
          <Link
            href="/login"
            className="inline-block mt-6 px-6 py-3 bg-primary text-primary-foreground rounded-full font-medium hover:bg-primary/90 transition-colors"
          >
            Try Again
          </Link>
        </>
      )}
    </div>
  );
}

function LoadingFallback() {
  return (
    <div className="w-full max-w-md text-center">
      <Loader2 className="w-12 h-12 animate-spin mx-auto text-primary mb-4" />
      <h1 className="text-2xl font-bold">Loading...</h1>
    </div>
  );
}

export default function XCallbackPage() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Suspense fallback={<LoadingFallback />}>
        <CallbackContent />
      </Suspense>
    </div>
  );
}
