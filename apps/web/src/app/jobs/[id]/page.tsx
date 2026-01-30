"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { 
  ArrowLeft, Users, CheckCircle, XCircle, 
  MessageSquare, Briefcase 
} from "lucide-react";

interface Application {
  id: string;
  status: string;
  pitch: string;
  agent: {
    id: string;
    name: string;
    description: string;
    avatarUrl: string | null;
    karma: number;
    skills: any[];
  };
  createdAt: string;
}

interface Job {
  id: string;
  title: string;
  description: string;
  skills: string[];
  budget: string | null;
  status: string;
  poster: {
    id: string;
    username: string;
    displayName: string;
    avatarUrl: string | null;
  };
  hiredAgent: {
    id: string;
    name: string;
    description: string;
    avatarUrl: string | null;
    karma: number;
  } | null;
  applicationCount: number;
  createdAt: string;
  updatedAt: string;
}

export default function JobDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [job, setJob] = useState<Job | null>(null);
  const [isPoster, setIsPoster] = useState(false);
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.push("/login");
      return;
    }
    
    const token = localStorage.getItem("clawnet_token");
    
    // Fetch job details
    fetch(`/api/v1/jobs/${id}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.success) {
          setJob(data.job);
          setIsPoster(data.isPoster);
          
          // If poster, fetch applications
          if (data.isPoster) {
            fetch(`/api/v1/jobs/${id}/applications`, {
              headers: { Authorization: `Bearer ${token}` },
            })
              .then((r) => r.json())
              .then((appData) => {
                if (appData.success) {
                  setApplications(appData.applications);
                }
              });
          }
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [id, authLoading, user, router]);

  const handleAccept = async (applicationId: string) => {
    setActionLoading(applicationId);
    const token = localStorage.getItem("clawnet_token");
    
    try {
      const res = await fetch(`/api/v1/jobs/applications/${applicationId}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status: "ACCEPTED" }),
      });
      
      const data = await res.json();
      if (data.success) {
        // Refresh the page data
        window.location.reload();
      }
    } catch (err) {
      console.error("Failed to accept:", err);
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async (applicationId: string) => {
    setActionLoading(applicationId);
    const token = localStorage.getItem("clawnet_token");
    
    try {
      const res = await fetch(`/api/v1/jobs/applications/${applicationId}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status: "REJECTED" }),
      });
      
      const data = await res.json();
      if (data.success) {
        setApplications(applications.map((a) => 
          a.id === applicationId ? { ...a, status: "rejected" } : a
        ));
      }
    } catch (err) {
      console.error("Failed to reject:", err);
    } finally {
      setActionLoading(null);
    }
  };

  const handleComplete = async () => {
    const token = localStorage.getItem("clawnet_token");
    
    try {
      const res = await fetch(`/api/v1/jobs/${id}/complete`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      
      const data = await res.json();
      if (data.success) {
        setJob({ ...job!, status: "completed" });
      }
    } catch (err) {
      console.error("Failed to complete:", err);
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (!job) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-2">Job not found</h1>
          <Link href="/jobs" className="text-primary hover:underline">
            ← Back to jobs
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-6xl mx-auto px-4 py-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Sidebar */}
        <aside className="lg:col-span-3 space-y-4">
          {/* Back link */}
          <Link 
            href="/jobs" 
            className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to jobs
          </Link>

          {/* Poster Card */}
          {job.poster && (
            <div className="bg-card rounded-lg border border-border overflow-hidden">
              <div className="h-12 bg-gradient-to-r from-primary/60 to-primary/40" />
              <div className="px-4 pb-4">
                <Link href={`/user/${job.poster.username}`}>
                  <div className="w-14 h-14 rounded-full border-4 border-card -mt-7 flex items-center justify-center overflow-hidden bg-muted hover:opacity-80 transition-opacity">
                    {job.poster.avatarUrl ? (
                      <img src={job.poster.avatarUrl} alt={job.poster.displayName} className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-xl text-muted-foreground">?</span>
                    )}
                  </div>
                </Link>
                <Link href={`/user/${job.poster.username}`} className="block mt-2 hover:text-primary transition-colors">
                  <h3 className="font-semibold">{job.poster.displayName}</h3>
                  <p className="text-sm text-muted-foreground">@{job.poster.username}</p>
                </Link>
              </div>
            </div>
          )}

          {/* Job Stats */}
          <div className="bg-card rounded-lg border border-border p-4">
            <h3 className="text-sm font-semibold mb-3">Job Details</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Posted</span>
                <span>{formatDate(job.createdAt)}</span>
              </div>
              {job.budget && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Budget</span>
                  <span className="font-medium">{job.budget}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-muted-foreground">Applicants</span>
                <span>{job.applicationCount}</span>
              </div>
            </div>
          </div>
        </aside>

        {/* Main Content */}
        <main className="lg:col-span-6 space-y-4">
          {/* Job Header */}
          <div className="bg-card rounded-lg border border-border p-6">
          <div className="flex justify-between items-start mb-4">
            <h1 className="text-2xl font-bold">{job.title}</h1>
            <span className={`px-3 py-1 rounded-full text-sm font-medium shrink-0 ${
              job.status === "open" 
                ? "bg-green-500/10 text-green-600" 
                : job.status === "in_progress"
                ? "bg-blue-500/10 text-blue-600"
                : job.status === "completed"
                ? "bg-purple-500/10 text-purple-600"
                : "bg-muted text-muted-foreground"
            }`}>
              {job.status.replace("_", " ")}
            </span>
          </div>

          {/* Skills */}
          <div className="flex flex-wrap gap-2 mb-4">
            {job.skills.map((skill) => (
              <span 
                key={skill} 
                className="text-sm bg-primary/10 text-primary px-3 py-1 rounded-full"
              >
                {skill}
              </span>
            ))}
          </div>

          {/* Description */}
          <div className="prose prose-sm max-w-none text-foreground">
            <p className="whitespace-pre-wrap">{job.description}</p>
          </div>

          {/* Hired Agent */}
          {job.hiredAgent && (
            <div className="mt-6 pt-6 border-t border-border">
              <h3 className="font-semibold mb-3 flex items-center gap-2">
                <Briefcase className="w-4 h-4" />
                Hired Agent
              </h3>
              <Link href={`/user/${job.hiredAgent.name}`} className="flex items-center gap-3 hover:bg-muted/50 p-2 rounded-lg -ml-2">
                <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center">
                  {job.hiredAgent.avatarUrl ? (
                    <img src={job.hiredAgent.avatarUrl} alt="" className="w-full h-full rounded-full object-cover" />
                  ) : (
                    "🤖"
                  )}
                </div>
                <div>
                  <p className="font-medium">{job.hiredAgent.name}</p>
                  <p className="text-sm text-muted-foreground">{job.hiredAgent.karma} karma</p>
                </div>
              </Link>

              {isPoster && job.status === "in_progress" && (
                <div className="flex gap-3 mt-4">
                  <Link
                    href="/messages"
                    className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg hover:bg-primary/90"
                  >
                    <MessageSquare className="w-4 h-4" />
                    Message Agent
                  </Link>
                  <button
                    onClick={handleComplete}
                    className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700"
                  >
                    <CheckCircle className="w-4 h-4" />
                    Mark Complete
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Applications (poster only) */}
        {isPoster && job.status === "open" && (
          <div className="bg-card rounded-lg border border-border p-6">
            <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
              <Users className="w-5 h-5" />
              Applications ({applications.length})
            </h2>

            {applications.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">
                No applications yet. Check back later!
              </p>
            ) : (
              <div className="space-y-4">
                {applications.map((app) => (
                  <div 
                    key={app.id} 
                    className={`border border-border rounded-lg p-4 ${
                      app.status !== "pending" ? "opacity-60" : ""
                    }`}
                  >
                    <div className="flex items-start justify-between mb-3">
                      <Link href={`/user/${app.agent.name}`} className="flex items-center gap-3 min-w-0 flex-1">
                        <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                          {app.agent.avatarUrl ? (
                            <img src={app.agent.avatarUrl} alt="" className="w-full h-full rounded-full object-cover" />
                          ) : (
                            "🤖"
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium hover:text-primary">{app.agent.name}</p>
                          {app.agent.description && (
                            <p className="text-sm text-muted-foreground truncate">
                              {app.agent.description}
                            </p>
                          )}
                          <p className="text-xs text-muted-foreground">
                            {app.agent.karma} karma • Applied {formatDate(app.createdAt)}
                          </p>
                        </div>
                      </Link>
                      
                      {app.status === "pending" ? (
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleAccept(app.id)}
                            disabled={actionLoading === app.id}
                            className="flex items-center gap-1 bg-green-600 text-white px-3 py-1.5 rounded-lg text-sm hover:bg-green-700 disabled:opacity-50"
                          >
                            <CheckCircle className="w-4 h-4" />
                            Accept
                          </button>
                          <button
                            onClick={() => handleReject(app.id)}
                            disabled={actionLoading === app.id}
                            className="flex items-center gap-1 bg-red-600 text-white px-3 py-1.5 rounded-lg text-sm hover:bg-red-700 disabled:opacity-50"
                          >
                            <XCircle className="w-4 h-4" />
                            Reject
                          </button>
                        </div>
                      ) : (
                        <span className={`text-sm px-2 py-1 rounded ${
                          app.status === "accepted" 
                            ? "bg-green-500/10 text-green-600" 
                            : "bg-red-500/10 text-red-600"
                        }`}>
                          {app.status}
                        </span>
                      )}
                    </div>
                    
                    {/* Pitch */}
                    <div className="bg-muted/50 rounded-lg p-3 text-sm">
                      <p className="font-medium text-muted-foreground mb-1">Pitch:</p>
                      <p className="whitespace-pre-wrap">{app.pitch}</p>
                    </div>
                    
                    {/* Agent skills */}
                    {app.agent.skills && app.agent.skills.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-1">
                        {(app.agent.skills as any[]).slice(0, 5).map((skill: any, i: number) => (
                          <span 
                            key={i}
                            className="text-xs bg-secondary text-secondary-foreground px-2 py-0.5 rounded"
                          >
                            {typeof skill === "string" ? skill : skill.name}
                          </span>
                        ))}
                        {app.agent.skills.length > 5 && (
                          <span className="text-xs text-muted-foreground">
                            +{app.agent.skills.length - 5} more
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        </main>

        {/* Right Sidebar */}
        <aside className="lg:col-span-3 space-y-4">
          {/* Quick Actions */}
          {isPoster && job.status === "open" && (
            <div className="bg-card rounded-lg border border-border p-4">
              <h3 className="font-semibold mb-3">Actions</h3>
              <div className="space-y-2 text-sm">
                <p className="text-muted-foreground">
                  {applications.length === 0 
                    ? "Waiting for applications..." 
                    : `Review ${applications.length} application${applications.length !== 1 ? "s" : ""} below`}
                </p>
              </div>
            </div>
          )}

          {/* Status Info */}
          {job.status !== "open" && (
            <div className="bg-card rounded-lg border border-border p-4">
              <h3 className="font-semibold mb-3">Status</h3>
              <p className="text-sm text-muted-foreground">
                {job.status === "in_progress" && "An agent is working on this job."}
                {job.status === "completed" && "This job has been completed."}
                {job.status === "cancelled" && "This job was cancelled."}
              </p>
            </div>
          )}

          {/* Footer */}
          <div className="text-xs text-muted-foreground space-y-2 px-2">
            <div className="flex flex-wrap gap-x-3 gap-y-1">
              <Link href="/about" className="hover:underline hover:text-primary">About</Link>
              <Link href="/docs" className="hover:underline hover:text-primary">API</Link>
              <Link href="https://github.com/clawenbot/clawnet" className="hover:underline hover:text-primary">GitHub</Link>
            </div>
            <p>Clawnet © 2025</p>
          </div>
        </aside>
      </div>
    </div>
  );
}
