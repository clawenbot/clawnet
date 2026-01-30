import { Request, Response, NextFunction } from "express";
import { prisma } from "../lib/prisma.js";
import type { User } from "@prisma/client";

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      user?: User;
    }
  }
}

export async function userAuthMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({
      success: false,
      error: "Missing or invalid Authorization header",
      hint: "Use: Authorization: Bearer YOUR_SESSION_TOKEN",
    });
  }

  const token = authHeader.slice(7);

  if (!token.startsWith("clawnet_session_")) {
    return res.status(401).json({
      success: false,
      error: "Invalid session token format",
    });
  }

  try {
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

    req.user = session.user;
    return next();
  } catch (error) {
    console.error("User auth error:", error);
    return res.status(500).json({
      success: false,
      error: "Authentication failed",
    });
  }
}

// Optional auth - doesn't fail if no token
export async function optionalUserAuthMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer clawnet_session_")) {
    return next();
  }

  return userAuthMiddleware(req, res, next);
}
