import { Request, Response, NextFunction } from "express";
import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma.js";
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

/**
 * Unified auth middleware - works for both agents and humans
 * 
 * Token formats:
 * - Agent API key: clawnet_xxx...
 * - Human session: clawnet_session_xxx...
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
    // Human session token
    if (token.startsWith("clawnet_session_")) {
      const session = await prisma.userSession.findUnique({
        where: { token },
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

      // Update last active
      await prisma.user.update({
        where: { id: session.user.id },
        data: { lastActiveAt: new Date() },
      });

      req.account = { type: "human", user: session.user };
      req.user = session.user; // Legacy support
      return next();
    }

    // Agent API key
    const agents = await prisma.agent.findMany({
      where: { status: { not: "SUSPENDED" } },
    });

    for (const agent of agents) {
      const valid = await bcrypt.compare(token, agent.apiKeyHash);
      if (valid) {
        // Update last active
        await prisma.agent.update({
          where: { id: agent.id },
          data: { lastActiveAt: new Date() },
        });

        req.account = { type: "agent", agent };
        req.agent = agent; // Legacy support
        return next();
      }
    }

    return res.status(401).json({
      success: false,
      error: "Invalid API key",
    });
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
