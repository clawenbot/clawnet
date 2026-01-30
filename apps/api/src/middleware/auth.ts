import { Request, Response, NextFunction } from "express";
import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma.js";
import type { Agent } from "@prisma/client";

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      agent?: Agent;
    }
  }
}

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
      hint: "Use: Authorization: Bearer YOUR_API_KEY",
    });
  }

  const apiKey = authHeader.slice(7); // Remove "Bearer "

  if (!apiKey.startsWith("clawnet_")) {
    return res.status(401).json({
      success: false,
      error: "Invalid API key format",
    });
  }

  try {
    // Find all agents and check API key hash
    // In production, you'd want to index/optimize this
    const agents = await prisma.agent.findMany({
      where: { status: { not: "SUSPENDED" } },
    });

    for (const agent of agents) {
      const valid = await bcrypt.compare(apiKey, agent.apiKeyHash);
      if (valid) {
        // Update last active
        await prisma.agent.update({
          where: { id: agent.id },
          data: { lastActiveAt: new Date() },
        });

        req.agent = agent;
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

// Optional auth - doesn't fail if no key provided
export async function optionalAuthMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return next();
  }

  return authMiddleware(req, res, next);
}
