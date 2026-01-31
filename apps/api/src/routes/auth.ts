import { Router } from "express";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { nanoid } from "nanoid";
import crypto from "crypto";
import { prisma } from "../lib/prisma.js";
import { hashToken } from "../lib/crypto.js";

const router = Router();

// Session duration: 30 days
const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000;

// X OAuth 2.0 configuration
const X_CLIENT_ID = process.env.TWITTER_CLIENT_ID || "";
const X_CLIENT_SECRET = process.env.TWITTER_CLIENT_SECRET || "";
const X_CALLBACK_URL = process.env.X_CALLBACK_URL || "http://localhost:3000/auth/x/callback";

// In-memory store for OAuth state (use Redis in production)
const oauthStates = new Map<string, { codeVerifier: string; expiresAt: number }>();

// Clean up expired states periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of oauthStates) {
    if (value.expiresAt < now) {
      oauthStates.delete(key);
    }
  }
}, 60000);

// Generate PKCE code verifier and challenge
function generatePKCE() {
  const codeVerifier = crypto.randomBytes(32).toString("base64url");
  const codeChallenge = crypto
    .createHash("sha256")
    .update(codeVerifier)
    .digest("base64url");
  return { codeVerifier, codeChallenge };
}

// =============================================
// CLOUDFLARE TURNSTILE (captcha)
// =============================================

const TURNSTILE_SECRET_KEY = process.env.TURNSTILE_SECRET_KEY || "";
const TURNSTILE_SITE_KEY = process.env.TURNSTILE_SITE_KEY || "";

interface TurnstileResponse {
  success: boolean;
  "error-codes"?: string[];
  challenge_ts?: string;
  hostname?: string;
}

async function verifyTurnstile(token: string): Promise<{ success: boolean; error?: string }> {
  if (!TURNSTILE_SECRET_KEY) {
    console.warn("Turnstile not configured - skipping captcha verification");
    return { success: true }; // Allow in dev if not configured
  }

  try {
    const response = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          secret: TURNSTILE_SECRET_KEY,
          response: token,
        }),
      }
    );

    const result = await response.json() as TurnstileResponse;
    
    if (!result.success) {
      console.warn("Turnstile verification failed:", result["error-codes"]);
      return { success: false, error: "Captcha verification failed" };
    }

    return { success: true };
  } catch (error) {
    console.error("Turnstile verification error:", error);
    return { success: false, error: "Captcha verification unavailable" };
  }
}

// =============================================
// PASSWORD AUTH
// =============================================

const registerSchema = z.object({
  username: z
    .string()
    .min(3)
    .max(24)
    .regex(/^[a-zA-Z0-9_]+$/, "Only alphanumeric and underscores"),
  password: z.string().min(8).max(128),
  displayName: z.string().min(1).max(50),
  turnstileToken: z.string().min(1, "Captcha is required"),
});

const loginSchema = z.object({
  username: z.string(),
  password: z.string(),
});

// POST /api/v1/auth/register - Register with password
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

    const { username, password, displayName, turnstileToken } = parsed.data;

    // Verify Turnstile captcha
    const turnstileResult = await verifyTurnstile(turnstileToken);
    if (!turnstileResult.success) {
      return res.status(400).json({
        success: false,
        error: turnstileResult.error || "Captcha verification failed",
      });
    }

    // Check if username taken
    const [existingUser, existingAgent] = await Promise.all([
      prisma.user.findUnique({ where: { username } }),
      prisma.agent.findUnique({ where: { name: username } }),
    ]);

    if (existingUser || existingAgent) {
      return res.status(409).json({
        success: false,
        error: "Username already taken",
      });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const user = await prisma.user.create({
      data: {
        username,
        passwordHash,
        displayName,
      },
    });

    const sessionToken = `clawnet_session_${nanoid(48)}`;
    const tokenHash = hashToken(sessionToken);

    await prisma.userSession.create({
      data: {
        userId: user.id,
        tokenHash,
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

// POST /api/v1/auth/login - Login with password
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

    const user = await prisma.user.findUnique({ where: { username } });
    if (!user || !user.passwordHash) {
      return res.status(401).json({
        success: false,
        error: "Invalid username or password",
      });
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return res.status(401).json({
        success: false,
        error: "Invalid username or password",
      });
    }

    // Check if user is banned
    if (user.status === "BANNED") {
      return res.status(403).json({
        success: false,
        error: "This account has been banned",
        code: "ACCOUNT_BANNED",
      });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { lastActiveAt: new Date() },
    });

    const sessionToken = `clawnet_session_${nanoid(48)}`;
    const tokenHash = hashToken(sessionToken);

    await prisma.userSession.create({
      data: {
        userId: user.id,
        tokenHash,
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
        xLinked: !!user.xId,
      },
      token: sessionToken,
      expiresAt: new Date(Date.now() + SESSION_DURATION_MS).toISOString(),
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ success: false, error: "Login failed" });
  }
});

// =============================================
// X OAUTH (preferred method)
// =============================================

// GET /api/v1/auth/x - Start X OAuth flow
router.get("/x", (_req, res) => {
  if (!X_CLIENT_ID) {
    return res.status(503).json({
      success: false,
      error: "X OAuth not configured",
    });
  }

  const state = nanoid(32);
  const { codeVerifier, codeChallenge } = generatePKCE();

  oauthStates.set(state, {
    codeVerifier,
    expiresAt: Date.now() + 10 * 60 * 1000,
  });

  const params = new URLSearchParams({
    response_type: "code",
    client_id: X_CLIENT_ID,
    redirect_uri: X_CALLBACK_URL,
    scope: "tweet.read users.read offline.access",
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  });

  const authUrl = `https://twitter.com/i/oauth2/authorize?${params}`;

  res.json({
    success: true,
    authUrl,
    state,
  });
});

// POST /api/v1/auth/x/callback - Exchange code for tokens
router.post("/x/callback", async (req, res) => {
  try {
    const { code, state } = req.body;

    if (!code || !state) {
      return res.status(400).json({
        success: false,
        error: "Missing code or state",
      });
    }

    const storedState = oauthStates.get(state);
    if (!storedState || storedState.expiresAt < Date.now()) {
      oauthStates.delete(state);
      return res.status(400).json({
        success: false,
        error: "Invalid or expired state",
      });
    }

    const { codeVerifier } = storedState;
    oauthStates.delete(state);

    // Exchange code for tokens
    const tokenResponse = await fetch("https://api.twitter.com/2/oauth2/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${Buffer.from(`${X_CLIENT_ID}:${X_CLIENT_SECRET}`).toString("base64")}`,
      },
      body: new URLSearchParams({
        code,
        grant_type: "authorization_code",
        redirect_uri: X_CALLBACK_URL,
        code_verifier: codeVerifier,
      }),
    });

    if (!tokenResponse.ok) {
      const error = await tokenResponse.text();
      console.error("X token exchange failed:", error);
      return res.status(401).json({
        success: false,
        error: "Failed to authenticate with X",
      });
    }

    const tokens = await tokenResponse.json() as {
      access_token: string;
      refresh_token?: string;
      expires_in: number;
      token_type: string;
      scope: string;
    };
    const { access_token, refresh_token, expires_in } = tokens;

    // Fetch user profile from X
    const userResponse = await fetch(
      "https://api.twitter.com/2/users/me?user.fields=id,username,name,profile_image_url,description",
      {
        headers: {
          Authorization: `Bearer ${access_token}`,
        },
      }
    );

    if (!userResponse.ok) {
      console.error("X user fetch failed:", await userResponse.text());
      return res.status(401).json({
        success: false,
        error: "Failed to fetch X profile",
      });
    }

    const { data: xUser } = await userResponse.json() as {
      data: {
        id: string;
        username: string;
        name: string;
        profile_image_url?: string;
        description?: string;
      };
    };
    const xId = xUser.id;
    const xHandle = xUser.username;
    const displayName = xUser.name;
    const avatarUrl = xUser.profile_image_url?.replace("_normal", "_400x400");
    const bio = xUser.description || null;
    const xTokenExpiry = new Date(Date.now() + expires_in * 1000);

    // Find existing user by xId or username
    let user = await prisma.user.findFirst({
      where: {
        OR: [
          { xId },
          { username: xHandle },
        ],
      },
    });

    // Check if existing user is banned
    if (user && user.status === "BANNED") {
      return res.status(403).json({
        success: false,
        error: "This account has been banned",
        code: "ACCOUNT_BANNED",
      });
    }

    if (user) {
      // Update existing user with X data
      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          username: xHandle,
          displayName,
          avatarUrl,
          xId,
          xAccessToken: access_token,
          xRefreshToken: refresh_token || user.xRefreshToken,
          xTokenExpiry,
          lastActiveAt: new Date(),
        },
      });
    } else {
      // Check if username conflicts with an agent
      const existingAgent = await prisma.agent.findUnique({
        where: { name: xHandle },
      });

      if (existingAgent) {
        return res.status(409).json({
          success: false,
          error: `Username @${xHandle} is already taken by an agent`,
        });
      }

      // Create new user via X
      user = await prisma.user.create({
        data: {
          username: xHandle,
          displayName,
          avatarUrl,
          bio,
          xId,
          xAccessToken: access_token,
          xRefreshToken: refresh_token,
          xTokenExpiry,
        },
      });
    }

    const sessionToken = `clawnet_session_${nanoid(48)}`;
    const tokenHash = hashToken(sessionToken);

    await prisma.userSession.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt: new Date(Date.now() + SESSION_DURATION_MS),
      },
    });

    res.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
        bio: user.bio,
        role: user.role,
        xLinked: true,
      },
      token: sessionToken,
      expiresAt: new Date(Date.now() + SESSION_DURATION_MS).toISOString(),
    });
  } catch (error) {
    console.error("X OAuth callback error:", error);
    res.status(500).json({ success: false, error: "Authentication failed" });
  }
});

// =============================================
// COMMON ENDPOINTS
// =============================================

// POST /api/v1/auth/logout
router.post("/logout", async (req, res) => {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    const tokenHash = hashToken(token);
    await prisma.userSession.deleteMany({ where: { tokenHash } });
  }
  res.json({ success: true });
});

// GET /api/v1/auth/me
router.get("/me", async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ success: false, error: "Not authenticated" });
  }

  const token = authHeader.slice(7);
  const tokenHash = hashToken(token);

  const session = await prisma.userSession.findUnique({
    where: { tokenHash },
    include: { user: true },
  });

  if (!session || session.expiresAt < new Date()) {
    if (session) {
      await prisma.userSession.delete({ where: { id: session.id } });
    }
    return res.status(401).json({ success: false, error: "Session expired" });
  }

  const user = session.user;

  // Check if user is banned
  if (user.status === "BANNED") {
    // Clean up their session
    await prisma.userSession.delete({ where: { id: session.id } });
    return res.status(403).json({
      success: false,
      error: "This account has been banned",
      code: "ACCOUNT_BANNED",
    });
  }

  const followingCount = await prisma.follow.count({
    where: { userId: user.id },
  });

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
      xLinked: !!user.xId,
      createdAt: user.createdAt,
      followingCount,
      ownedAgents,
    },
  });
});

// GET /api/v1/auth/x/status - Check if X OAuth is available
router.get("/x/status", (_req, res) => {
  res.json({
    success: true,
    available: !!X_CLIENT_ID,
  });
});

// GET /api/v1/auth/turnstile - Get Turnstile site key for frontend
router.get("/turnstile", (_req, res) => {
  res.json({
    success: true,
    siteKey: TURNSTILE_SITE_KEY || null,
    enabled: !!TURNSTILE_SECRET_KEY,
  });
});

export default router;
