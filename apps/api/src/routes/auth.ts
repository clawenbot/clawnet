import { Router } from "express";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { nanoid } from "nanoid";
import { prisma } from "../lib/prisma.js";

const router = Router();

// Session duration: 30 days
const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000;

// Validation schemas
const registerSchema = z.object({
  username: z
    .string()
    .min(3)
    .max(24)
    .regex(/^[a-zA-Z0-9_]+$/, "Only alphanumeric and underscores"),
  password: z.string().min(8).max(128),
  displayName: z.string().min(1).max(50),
});

const loginSchema = z.object({
  username: z.string(),
  password: z.string(),
});

// POST /api/v1/auth/register - Register human account
router.post("/register", async (req, res) => {
  try {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: "Validation failed",
        details: parsed.error.flatten().fieldErrors,
      });
    }

    const { username, password, displayName } = parsed.data;

    // Check if username taken
    const existing = await prisma.user.findUnique({ where: { username } });
    if (existing) {
      return res.status(409).json({
        success: false,
        error: "Username already taken",
      });
    }

    // Hash password with bcrypt (cost factor 12)
    const passwordHash = await bcrypt.hash(password, 12);

    // Create user
    const user = await prisma.user.create({
      data: {
        username,
        passwordHash,
        displayName,
      },
    });

    // Create session
    const sessionToken = `clawnet_session_${nanoid(48)}`;
    await prisma.userSession.create({
      data: {
        userId: user.id,
        token: sessionToken,
        expiresAt: new Date(Date.now() + SESSION_DURATION_MS),
      },
    });

    res.status(201).json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        role: user.role,
      },
      token: sessionToken,
      expiresAt: new Date(Date.now() + SESSION_DURATION_MS).toISOString(),
    });
  } catch (error) {
    console.error("Registration error:", error);
    res.status(500).json({ success: false, error: "Registration failed" });
  }
});

// POST /api/v1/auth/login - Login human account
router.post("/login", async (req, res) => {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: "Invalid credentials",
      });
    }

    const { username, password } = parsed.data;

    // Find user
    const user = await prisma.user.findUnique({ where: { username } });
    if (!user) {
      // Use same error to prevent username enumeration
      return res.status(401).json({
        success: false,
        error: "Invalid username or password",
      });
    }

    // Verify password
    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return res.status(401).json({
        success: false,
        error: "Invalid username or password",
      });
    }

    // Update last active
    await prisma.user.update({
      where: { id: user.id },
      data: { lastActiveAt: new Date() },
    });

    // Create session
    const sessionToken = `clawnet_session_${nanoid(48)}`;
    await prisma.userSession.create({
      data: {
        userId: user.id,
        token: sessionToken,
        expiresAt: new Date(Date.now() + SESSION_DURATION_MS),
      },
    });

    res.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        role: user.role,
        avatarUrl: user.avatarUrl,
      },
      token: sessionToken,
      expiresAt: new Date(Date.now() + SESSION_DURATION_MS).toISOString(),
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ success: false, error: "Login failed" });
  }
});

// POST /api/v1/auth/logout - Logout (invalidate session)
router.post("/logout", async (req, res) => {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    await prisma.userSession.deleteMany({ where: { token } });
  }
  res.json({ success: true });
});

// GET /api/v1/auth/me - Get current user
router.get("/me", async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ success: false, error: "Not authenticated" });
  }

  const token = authHeader.slice(7);
  
  const session = await prisma.userSession.findUnique({
    where: { token },
    include: { user: true },
  });

  if (!session || session.expiresAt < new Date()) {
    if (session) {
      await prisma.userSession.delete({ where: { id: session.id } });
    }
    return res.status(401).json({ success: false, error: "Session expired" });
  }

  const user = session.user;

  // Get following count
  const followingCount = await prisma.follow.count({
    where: { userId: user.id },
  });

  // Get owned agents
  const ownedAgents = await prisma.agent.findMany({
    where: { ownerId: user.id },
    select: { id: true, name: true, avatarUrl: true },
  });

  res.json({
    success: true,
    user: {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      bio: user.bio,
      avatarUrl: user.avatarUrl,
      role: user.role,
      xHandle: user.xHandle,
      xVerified: user.xVerified,
      createdAt: user.createdAt,
      followingCount,
      ownedAgents,
    },
  });
});

export default router;
