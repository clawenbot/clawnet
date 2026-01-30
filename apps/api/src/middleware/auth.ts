import { Request, Response, NextFunction } from "express";
import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma.js";
import { hashToken, parseApiKey } from "../lib/crypto.js";
import type { Agent, User } from "@prisma/client";

// Unified account type for both humans and agents
export type Account = 
  | { type: "agent"; agent: Agent; user?: never }
  | { type: "human"; user: User; agent?: never };

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      account?: Account;
      // Legacy support (deprecated - use req.account instead)
      agent?: Agent;
      user?: User;
    }
  }
}

// Throttle lastActiveAt updates (only update if >5 minutes old)
const LAST_ACTIVE_THROTTLE_MS = 5 * 60 * 1000;

function shouldUpdateLastActive(lastActiveAt: Date): boolean {
  return Date.now() - lastActiveAt.getTime() > LAST_ACTIVE_THROTTLE_MS;
}

// =============================================================================
// API KEY VERIFICATION CACHE
// bcrypt.compare is CPU-intensive (~100ms). Cache verified keys for 5 minutes.
// =============================================================================
const API_KEY_CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const API_KEY_CACHE_MAX = 50; // Max cached keys
const verifiedKeyCache = new Map<string, { agentId: string; expiresAt: number }>();

function getCachedKeyVerification(keyId: string, fullKey: string): string | null {
  const cacheKey = `${keyId}:${hashToken(fullKey).slice(0, 16)}`;
  const cached = verifiedKeyCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.agentId;
  }
  if (cached) {
    verifiedKeyCache.delete(cacheKey);
  }
  return null;
}

function cacheKeyVerification(keyId: string, fullKey: string, agentId: string): void {
  const cacheKey = `${keyId}:${hashToken(fullKey).slice(0, 16)}`;
  // LRU eviction
  if (verifiedKeyCache.size >= API_KEY_CACHE_MAX) {
    const firstKey = verifiedKeyCache.keys().next().value;
    if (firstKey) verifiedKeyCache.delete(firstKey);
  }
  verifiedKeyCache.set(cacheKey, { agentId, expiresAt: Date.now() + API_KEY_CACHE_TTL });
}

/**
 * Unified auth middleware - works for both agents and humans
 * 
 * Token formats:
 * - Agent API key: clawnet_KEYID_SECRET (O(1) lookup via keyId)
 * - Human session: clawnet_session_xxx... (O(1) lookup via hashed token)
 */
export async function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({
      success: false,
      error: "Missing or invalid Authorization header",
      hint: "Use: Authorization: Bearer YOUR_TOKEN",
    });
  }

  const token = authHeader.slice(7); // Remove "Bearer "

  if (!token.startsWith("clawnet_")) {
    return res.status(401).json({
      success: false,
      error: "Invalid token format",
    });
  }

  try {
    // Human session token (hashed lookup)
    if (token.startsWith("clawnet_session_")) {
      const tokenHash = hashToken(token);
      
      const session = await prisma.userSession.findUnique({
        where: { tokenHash },
        include: { user: true },
      });

      if (!session) {
        return res.status(401).json({
          success: false,
          error: "Invalid session",
        });
      }

      if (session.expiresAt < new Date()) {
        await prisma.userSession.delete({ where: { id: session.id } });
        return res.status(401).json({
          success: false,
          error: "Session expired",
        });
      }

      // Throttled lastActiveAt update
      if (shouldUpdateLastActive(session.user.lastActiveAt)) {
        await prisma.user.update({
          where: { id: session.user.id },
          data: { lastActiveAt: new Date() },
        });
      }

      req.account = { type: "human", user: session.user };
      req.user = session.user; // Legacy support
      return next();
    }

    // Agent API key (O(1) lookup via keyId)
    const parsed = parseApiKey(token);
    if (!parsed) {
      return res.status(401).json({
        success: false,
        error: "Invalid API key format",
      });
    }

    // Check cache first (avoids expensive bcrypt.compare)
    const cachedAgentId = getCachedKeyVerification(parsed.keyId, parsed.fullKey);
    
    let agent: Agent | null = null;
    
    if (cachedAgentId) {
      // Cache hit - just fetch agent by ID (no bcrypt needed)
      agent = await prisma.agent.findUnique({
        where: { id: cachedAgentId },
      });
    } else {
      // Cache miss - full verification flow
      agent = await prisma.agent.findUnique({
        where: { apiKeyId: parsed.keyId },
      });

      if (!agent || agent.status === "SUSPENDED") {
        return res.status(401).json({
          success: false,
          error: "Invalid API key",
        });
      }

      // Verify full key hash (CPU intensive - ~100ms)
      const valid = await bcrypt.compare(parsed.fullKey, agent.apiKeyHash);
      if (!valid) {
        return res.status(401).json({
          success: false,
          error: "Invalid API key",
        });
      }

      // Cache successful verification
      cacheKeyVerification(parsed.keyId, parsed.fullKey, agent.id);
    }

    if (!agent || agent.status === "SUSPENDED") {
      return res.status(401).json({
        success: false,
        error: "Invalid API key",
      });
    }

    // Throttled lastActiveAt update
    if (shouldUpdateLastActive(agent.lastActiveAt)) {
      await prisma.agent.update({
        where: { id: agent.id },
        data: { lastActiveAt: new Date() },
      });
    }

    req.account = { type: "agent", agent };
    req.agent = agent; // Legacy support
    return next();

  } catch (error) {
    console.error("Auth error:", error);
    return res.status(500).json({
      success: false,
      error: "Authentication failed",
    });
  }
}

/**
 * Optional auth - doesn't fail if no token provided
 */
export async function optionalAuthMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer clawnet_")) {
    return next();
  }

  return authMiddleware(req, res, next);
}

/**
 * Require specific account type
 */
export function requireAccountType(type: "agent" | "human") {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.account) {
      return res.status(401).json({
        success: false,
        error: "Authentication required",
      });
    }

    if (req.account.type !== type) {
      return res.status(403).json({
        success: false,
        error: `This endpoint requires a ${type} account`,
      });
    }

    next();
  };
}

// Helper to get account ID regardless of type
export function getAccountId(account: Account): string {
  return account.type === "agent" ? account.agent.id : account.user.id;
}

// Helper to get account name regardless of type
export function getAccountName(account: Account): string {
  return account.type === "agent" ? account.agent.name : account.user.username;
}
