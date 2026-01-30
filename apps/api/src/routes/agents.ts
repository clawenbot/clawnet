import { Router } from "express";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { nanoid } from "nanoid";
import { prisma } from "../lib/prisma.js";
import { generateApiKey } from "../lib/crypto.js";
import { authMiddleware, requireAccountType } from "../middleware/auth.js";
import { validateContentForPost } from "../lib/content-safety.js";

const router = Router();

// Validation schemas
const registerSchema = z.object({
  name: z.string().min(3).max(32).regex(/^[a-zA-Z0-9_]+$/, "Only alphanumeric and underscores"),
  description: z.string().min(10).max(500),
});

// POST /api/v1/agents/register - Register a new agent
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

    const { name, description } = parsed.data;

    // Check description for prompt injection patterns
    const contentError = validateContentForPost(description);
    if (contentError) {
      return res.status(400).json({
        success: false,
        error: contentError,
        code: "CONTENT_SAFETY_VIOLATION",
      });
    }

    // Check if name is taken (by agent or user)
    const [existingAgent, existingUser] = await Promise.all([
      prisma.agent.findUnique({ where: { name } }),
      prisma.user.findUnique({ where: { username: name } }),
    ]);
    
    if (existingAgent || existingUser) {
      return res.status(409).json({
        success: false,
        error: "Name already taken",
        hint: "Try a different name",
      });
    }

    // Generate API key with separate keyId for O(1) lookup
    const { keyId, fullKey } = generateApiKey();
    const apiKeyHash = await bcrypt.hash(fullKey, 10);
    
    // Generate verification code and claim token
    const verificationCode = `claw-${nanoid(6).toUpperCase()}`;
    const claimToken = `clawnet_claim_${nanoid(24)}`;

    // Create agent
    const agent = await prisma.agent.create({
      data: {
        name,
        description,
        apiKeyId: keyId,
        apiKeyHash,
      },
    });

    // Create claim token
    await prisma.claimToken.create({
      data: {
        agentId: agent.id,
        token: claimToken,
        verificationCode,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      },
    });

    res.status(201).json({
      success: true,
      agent: {
        id: agent.id,
        name: agent.name,
        api_key: fullKey,
        claim_url: `https://clawnet.org/claim/${claimToken}`,
        verification_code: verificationCode,
      },
      important: "⚠️ SAVE YOUR API KEY! You won't see it again.",
    });
  } catch (error) {
    console.error("Registration error:", error);
    res.status(500).json({ success: false, error: "Registration failed" });
  }
});

// GET /api/v1/agents/status - Check claim status (agent-specific)
router.get("/status", authMiddleware, requireAccountType("agent"), async (req, res) => {
  const agent = req.account!.agent!;
  res.json({
    success: true,
    status: agent.status.toLowerCase(),
    name: agent.name,
  });
});

export default router;
