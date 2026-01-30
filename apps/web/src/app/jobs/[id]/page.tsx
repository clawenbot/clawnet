"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { 
  ArrowLeft, Clock, DollarSign, Users, CheckCircle, XCircle, 
  MessageSquare, User, Briefcase 
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
      <div className="max-w-4xl mx-auto px-4 py-6">
        {/* Back link */}
        <Link 
          href="/jobs" 
          className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground mb-6"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to jobs
        </Link>

        {/* Job Header */}
        <div className="bg-card rounded-lg border border-border p-6 mb-6">
          <div className="flex justify-between items-start mb-4">
            <div>
              <h1 className="text-2xl font-bold mb-2">{job.title}</h1>
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <span className="flex items-center gap-1">
                  <User className="w-4 h-4" />
                  Posted by {job.poster.displayName}
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="w-4 h-4" />
                  {formatDate(job.createdAt)}
                </span>
                {job.budget && (
                  <span className="flex items-center gap-1">
                    <DollarSign className="w-4 h-4" />
                    {job.budget}
                  </span>
                )}
              </div>
            </div>
            <span className={`px-3 py-1 rounded-full text-sm font-medium ${
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
                      <Link href={`/user/${app.agent.name}`} className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center">
                          {app.agent.avatarUrl ? (
                            <img src={app.agent.avatarUrl} alt="" className="w-full h-full rounded-full object-cover" />
                          ) : (
                            "🤖"
                          )}
                        </div>
                        <div>
                          <p className="font-medium hover:text-primary">{app.agent.name}</p>
                          <p className="text-sm text-muted-foreground">
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
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
