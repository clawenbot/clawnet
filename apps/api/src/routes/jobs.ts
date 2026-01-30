import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { authMiddleware, requireAccountType, optionalAuthMiddleware } from "../middleware/auth.js";
import { validateContentForPost } from "../lib/content-safety.js";

const router = Router();

// ===========================================
// STATIC ROUTES (must come before /:id)
// ===========================================

// GET /api/v1/jobs - List open jobs (public, filterable)
router.get("/", optionalAuthMiddleware, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 50);
    const cursor = req.query.cursor as string | undefined;
    const skill = req.query.skill as string | undefined;
    const status = (req.query.status as string) || "OPEN";

    const jobs = await prisma.job.findMany({
      where: {
        status: status.toUpperCase() as any,
        ...(skill ? { skills: { has: skill } } : {}),
        ...(cursor ? { id: { lt: cursor } } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      include: {
        poster: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true,
          },
        },
        _count: {
          select: { applications: true },
        },
      },
    });

    res.json({
      success: true,
      jobs: jobs.map((j) => ({
        id: j.id,
        title: j.title,
        description: j.description,
        skills: j.skills,
        budget: j.budget,
        status: j.status.toLowerCase(),
        poster: j.poster,
        applicationCount: j._count.applications,
        createdAt: j.createdAt,
        expiresAt: j.expiresAt,
      })),
      nextCursor: jobs.length === limit ? jobs[jobs.length - 1]?.id : null,
    });
  } catch (error) {
    console.error("List jobs error:", error);
    res.status(500).json({ success: false, error: "Failed to list jobs" });
  }
});

// GET /api/v1/jobs/mine - Agent's applications and active jobs
// MUST be before /:id to avoid "mine" being matched as an ID
router.get("/mine", authMiddleware, requireAccountType("agent"), async (req, res) => {
  try {
    const agent = req.account!.agent;

    const applications = await prisma.jobApplication.findMany({
      where: { agentId: agent.id },
      orderBy: { createdAt: "desc" },
      include: {
        job: {
          include: {
            poster: {
              select: {
                id: true,
                username: true,
                displayName: true,
                avatarUrl: true,
              },
            },
          },
        },
      },
    });

    res.json({
      success: true,
      applications: applications.map((a) => ({
        id: a.id,
        status: a.status.toLowerCase(),
        pitch: a.coverNote,
        job: {
          id: a.job.id,
          title: a.job.title,
          description: a.job.description,
          skills: a.job.skills,
          budget: a.job.budget,
          status: a.job.status.toLowerCase(),
          poster: a.job.poster,
          createdAt: a.job.createdAt,
        },
        createdAt: a.createdAt,
      })),
    });
  } catch (error) {
    console.error("Get my jobs error:", error);
    res.status(500).json({ success: false, error: "Failed to get applications" });
  }
});

// GET /api/v1/jobs/posted - User's posted jobs
// MUST be before /:id to avoid "posted" being matched as an ID
router.get("/posted", authMiddleware, requireAccountType("human"), async (req, res) => {
  try {
    const user = req.account!.user;

    const jobs = await prisma.job.findMany({
      where: { posterId: user.id },
      orderBy: { createdAt: "desc" },
      include: {
        hiredAgent: {
          select: {
            id: true,
            name: true,
            avatarUrl: true,
          },
        },
        _count: {
          select: { applications: true },
        },
      },
    });

    res.json({
      success: true,
      jobs: jobs.map((j) => ({
        id: j.id,
        title: j.title,
        description: j.description,
        skills: j.skills,
        budget: j.budget,
        status: j.status.toLowerCase(),
        hiredAgent: j.hiredAgent,
        applicationCount: j._count.applications,
        createdAt: j.createdAt,
        updatedAt: j.updatedAt,
      })),
    });
  } catch (error) {
    console.error("Get posted jobs error:", error);
    res.status(500).json({ success: false, error: "Failed to get posted jobs" });
  }
});

// POST /api/v1/jobs - Create a new job (humans only)
const createJobSchema = z.object({
  title: z.string().min(5).max(100),
  description: z.string().min(20).max(5000),
  skills: z.array(z.string().max(50)).min(1).max(10),
  budget: z.string().max(100).optional(),
  expiresAt: z.string().datetime().optional(),
});

router.post("/", authMiddleware, requireAccountType("human"), async (req, res) => {
  try {
    const parsed = createJobSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: "Validation failed",
        details: parsed.error.flatten().fieldErrors,
      });
    }

    const { title, description, skills, budget, expiresAt } = parsed.data;
    const user = req.account!.user;

    // Check for prompt injection patterns
    const descriptionError = validateContentForPost(description);
    if (descriptionError) {
      return res.status(400).json({
        success: false,
        error: descriptionError,
        code: "CONTENT_SAFETY_VIOLATION",
      });
    }

    const job = await prisma.job.create({
      data: {
        title,
        description,
        skills,
        budget,
        posterId: user.id,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
      },
      include: {
        poster: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true,
          },
        },
      },
    });

    res.status(201).json({
      success: true,
      job: {
        id: job.id,
        title: job.title,
        description: job.description,
        skills: job.skills,
        budget: job.budget,
        status: job.status.toLowerCase(),
        poster: job.poster,
        createdAt: job.createdAt,
        expiresAt: job.expiresAt,
      },
    });
  } catch (error) {
    console.error("Create job error:", error);
    res.status(500).json({ success: false, error: "Failed to create job" });
  }
});

// ===========================================
// APPLICATION MANAGEMENT (static routes)
// ===========================================

// PATCH /api/v1/jobs/applications/:id - Accept/reject application (poster only)
router.patch("/applications/:id", authMiddleware, requireAccountType("human"), async (req, res) => {
  try {
    const id = req.params.id as string;
    const user = req.account!.user;

    const application = await prisma.jobApplication.findUnique({
      where: { id },
      include: {
        job: true,
        agent: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (!application) {
      return res.status(404).json({
        success: false,
        error: "Application not found",
      });
    }

    if (application.job.posterId !== user.id) {
      return res.status(403).json({
        success: false,
        error: "You can only manage applications for your own jobs",
      });
    }

    const updateSchema = z.object({
      status: z.enum(["ACCEPTED", "REJECTED"]),
    });

    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: "Status must be ACCEPTED or REJECTED",
      });
    }

    const { status } = parsed.data;

    // If accepting, update job and create conversation
    if (status === "ACCEPTED") {
      // Reject all other applications
      await prisma.jobApplication.updateMany({
        where: {
          jobId: application.jobId,
          id: { not: id },
        },
        data: { status: "REJECTED" },
      });

      // Update job status and set hired agent
      await prisma.job.update({
        where: { id: application.jobId },
        data: {
          status: "IN_PROGRESS",
          hiredAgentId: application.agentId,
        },
      });

      // Create conversation
      await prisma.conversation.create({
        data: {
          jobId: application.jobId,
          userId: user.id,
          agentId: application.agentId,
        },
      });

      // Notify rejected applicants
      const rejectedApps = await prisma.jobApplication.findMany({
        where: {
          jobId: application.jobId,
          id: { not: id },
        },
      });

      for (const app of rejectedApps) {
        await prisma.notification.create({
          data: {
            agentId: app.agentId,
            type: "JOB_REJECTED",
            actorUserId: user.id,
            jobId: application.jobId,
            applicationId: app.id,
          },
        });
      }
    }

    // Update the application
    const updated = await prisma.jobApplication.update({
      where: { id },
      data: { status },
    });

    // Notify the applicant
    await prisma.notification.create({
      data: {
        agentId: application.agentId,
        type: status === "ACCEPTED" ? "JOB_ACCEPTED" : "JOB_REJECTED",
        actorUserId: user.id,
        jobId: application.jobId,
        applicationId: id,
      },
    });

    res.json({
      success: true,
      application: {
        id: updated.id,
        status: updated.status.toLowerCase(),
        jobId: updated.jobId,
      },
      message: status === "ACCEPTED" 
        ? "Application accepted. Conversation started." 
        : "Application rejected.",
    });
  } catch (error) {
    console.error("Update application error:", error);
    res.status(500).json({ success: false, error: "Failed to update application" });
  }
});

// DELETE /api/v1/jobs/applications/:id - Withdraw application (agent only)
router.delete("/applications/:id", authMiddleware, requireAccountType("agent"), async (req, res) => {
  try {
    const id = req.params.id as string;
    const agent = req.account!.agent;

    const application = await prisma.jobApplication.findUnique({
      where: { id },
    });

    if (!application) {
      return res.status(404).json({
        success: false,
        error: "Application not found",
      });
    }

    if (application.agentId !== agent.id) {
      return res.status(403).json({
        success: false,
        error: "You can only withdraw your own applications",
      });
    }

    if (application.status !== "PENDING") {
      return res.status(400).json({
        success: false,
        error: "Can only withdraw pending applications",
      });
    }

    await prisma.jobApplication.update({
      where: { id },
      data: { status: "WITHDRAWN" },
    });

    res.json({
      success: true,
      message: "Application withdrawn",
    });
  } catch (error) {
    console.error("Withdraw application error:", error);
    res.status(500).json({ success: false, error: "Failed to withdraw application" });
  }
});

// ===========================================
// DYNAMIC ROUTES (/:id patterns)
// ===========================================

// GET /api/v1/jobs/:id - Get job details
router.get("/:id", optionalAuthMiddleware, async (req, res) => {
  try {
    const id = req.params.id as string;

    const job = await prisma.job.findUnique({
      where: { id },
      include: {
        poster: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true,
          },
        },
        hiredAgent: {
          select: {
            id: true,
            name: true,
            description: true,
            avatarUrl: true,
            karma: true,
          },
        },
        _count: {
          select: { applications: true },
        },
      },
    });

    if (!job) {
      return res.status(404).json({
        success: false,
        error: "Job not found",
      });
    }

    // Check if current user is the poster
    const isPoster = req.account?.type === "human" && req.account.user.id === job.posterId;

    // Check if current agent has applied
    let hasApplied = false;
    let myApplication = null;
    if (req.account?.type === "agent") {
      const application = await prisma.jobApplication.findUnique({
        where: {
          jobId_agentId: {
            jobId: id,
            agentId: req.account.agent.id,
          },
        },
      });
      hasApplied = !!application;
      myApplication = application ? {
        id: application.id,
        status: application.status.toLowerCase(),
        coverNote: application.coverNote,
        createdAt: application.createdAt,
      } : null;
    }

    res.json({
      success: true,
      job: {
        id: job.id,
        title: job.title,
        description: job.description,
        skills: job.skills,
        budget: job.budget,
        status: job.status.toLowerCase(),
        poster: job.poster,
        hiredAgent: job.hiredAgent,
        applicationCount: job._count.applications,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
        expiresAt: job.expiresAt,
      },
      isPoster,
      hasApplied,
      myApplication,
    });
  } catch (error) {
    console.error("Get job error:", error);
    res.status(500).json({ success: false, error: "Failed to get job" });
  }
});

// PATCH /api/v1/jobs/:id - Update job (poster only)
router.patch("/:id", authMiddleware, requireAccountType("human"), async (req, res) => {
  try {
    const id = req.params.id as string;
    const user = req.account!.user;

    const job = await prisma.job.findUnique({ where: { id } });
    if (!job) {
      return res.status(404).json({
        success: false,
        error: "Job not found",
      });
    }

    if (job.posterId !== user.id) {
      return res.status(403).json({
        success: false,
        error: "You can only update your own jobs",
      });
    }

    const updateSchema = z.object({
      title: z.string().min(5).max(100).optional(),
      description: z.string().min(20).max(5000).optional(),
      skills: z.array(z.string().max(50)).min(1).max(10).optional(),
      budget: z.string().max(100).optional(),
      status: z.enum(["OPEN", "IN_PROGRESS", "COMPLETED", "CANCELLED"]).optional(),
    });

    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: "Validation failed",
        details: parsed.error.flatten().fieldErrors,
      });
    }

    // Check description for prompt injection if provided
    if (parsed.data.description) {
      const descriptionError = validateContentForPost(parsed.data.description);
      if (descriptionError) {
        return res.status(400).json({
          success: false,
          error: descriptionError,
          code: "CONTENT_SAFETY_VIOLATION",
        });
      }
    }

    const updated = await prisma.job.update({
      where: { id },
      data: parsed.data,
      include: {
        poster: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true,
          },
        },
      },
    });

    res.json({
      success: true,
      job: {
        id: updated.id,
        title: updated.title,
        description: updated.description,
        skills: updated.skills,
        budget: updated.budget,
        status: updated.status.toLowerCase(),
        poster: updated.poster,
        createdAt: updated.createdAt,
        updatedAt: updated.updatedAt,
      },
    });
  } catch (error) {
    console.error("Update job error:", error);
    res.status(500).json({ success: false, error: "Failed to update job" });
  }
});

// POST /api/v1/jobs/:id/apply - Agent applies to job
const applySchema = z.object({
  pitch: z.string().min(10).max(2000),
});

router.post("/:id/apply", authMiddleware, requireAccountType("agent"), async (req, res) => {
  try {
    const id = req.params.id as string;
    const agent = req.account!.agent;

    // Agent must be claimed
    if (agent.status !== "CLAIMED") {
      return res.status(403).json({
        success: false,
        error: "Agent must be claimed to apply for jobs",
      });
    }

    const job = await prisma.job.findUnique({ where: { id } });
    if (!job) {
      return res.status(404).json({
        success: false,
        error: "Job not found",
      });
    }

    if (job.status !== "OPEN") {
      return res.status(400).json({
        success: false,
        error: "Job is not accepting applications",
      });
    }

    // Check if already applied
    const existing = await prisma.jobApplication.findUnique({
      where: {
        jobId_agentId: {
          jobId: id,
          agentId: agent.id,
        },
      },
    });

    if (existing) {
      return res.status(409).json({
        success: false,
        error: "Already applied to this job",
        applicationId: existing.id,
      });
    }

    const parsed = applySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: "Validation failed",
        details: parsed.error.flatten().fieldErrors,
      });
    }

    // Check pitch for prompt injection
    const pitchError = validateContentForPost(parsed.data.pitch);
    if (pitchError) {
      return res.status(400).json({
        success: false,
        error: pitchError,
        code: "CONTENT_SAFETY_VIOLATION",
      });
    }

    const application = await prisma.jobApplication.create({
      data: {
        jobId: id,
        agentId: agent.id,
        coverNote: parsed.data.pitch,
      },
    });

    // Create notification for job poster
    await prisma.notification.create({
      data: {
        userId: job.posterId,
        type: "JOB_APPLICATION",
        actorAgentId: agent.id,
        jobId: job.id,
        applicationId: application.id,
      },
    });

    res.status(201).json({
      success: true,
      application: {
        id: application.id,
        jobId: application.jobId,
        status: application.status.toLowerCase(),
        pitch: application.coverNote,
        createdAt: application.createdAt,
      },
    });
  } catch (error) {
    console.error("Apply error:", error);
    res.status(500).json({ success: false, error: "Failed to apply" });
  }
});

// GET /api/v1/jobs/:id/applications - Get applications (poster only)
router.get("/:id/applications", authMiddleware, requireAccountType("human"), async (req, res) => {
  try {
    const id = req.params.id as string;
    const user = req.account!.user;

    const job = await prisma.job.findUnique({ where: { id } });
    if (!job) {
      return res.status(404).json({
        success: false,
        error: "Job not found",
      });
    }

    if (job.posterId !== user.id) {
      return res.status(403).json({
        success: false,
        error: "You can only view applications for your own jobs",
      });
    }

    const applications = await prisma.jobApplication.findMany({
      where: { jobId: id },
      orderBy: { createdAt: "desc" },
      include: {
        agent: {
          select: {
            id: true,
            name: true,
            description: true,
            avatarUrl: true,
            karma: true,
            skills: true,
          },
        },
      },
    });

    res.json({
      success: true,
      applications: applications.map((a) => ({
        id: a.id,
        status: a.status.toLowerCase(),
        pitch: a.coverNote,
        agent: a.agent,
        createdAt: a.createdAt,
      })),
    });
  } catch (error) {
    console.error("Get applications error:", error);
    res.status(500).json({ success: false, error: "Failed to get applications" });
  }
});

// POST /api/v1/jobs/:id/complete - Mark job as complete (poster only)
router.post("/:id/complete", authMiddleware, requireAccountType("human"), async (req, res) => {
  try {
    const id = req.params.id as string;
    const user = req.account!.user;

    const job = await prisma.job.findUnique({ where: { id } });
    if (!job) {
      return res.status(404).json({
        success: false,
        error: "Job not found",
      });
    }

    if (job.posterId !== user.id) {
      return res.status(403).json({
        success: false,
        error: "You can only complete your own jobs",
      });
    }

    if (job.status !== "IN_PROGRESS") {
      return res.status(400).json({
        success: false,
        error: "Job must be in progress to complete",
      });
    }

    await prisma.job.update({
      where: { id },
      data: { status: "COMPLETED" },
    });

    // Notify hired agent
    if (job.hiredAgentId) {
      await prisma.notification.create({
        data: {
          agentId: job.hiredAgentId,
          type: "JOB_COMPLETED",
          actorUserId: user.id,
          jobId: job.id,
        },
      });
    }

    res.json({
      success: true,
      message: "Job marked as complete",
    });
  } catch (error) {
    console.error("Complete job error:", error);
    res.status(500).json({ success: false, error: "Failed to complete job" });
  }
});

export default router;
