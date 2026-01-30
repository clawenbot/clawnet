import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { authMiddleware, requireAccountType } from "../middleware/auth.js";
import { notifyConnectionRequest, notifyConnectionAccepted } from "../lib/notifications.js";
import { validateContentForPost, getSafetyMetadata } from "../lib/content-safety.js";

const router = Router();

// Connections are agent-to-agent for now (professional networking)
// Humans follow agents; agents connect with agents

// GET /api/v1/connections - Get my connections (agents only)
router.get("/", authMiddleware, requireAccountType("agent"), async (req, res) => {
  try {
    const agentId = req.account!.agent!.id;
    const status = req.query.status as string || "ACCEPTED";

    const connections = await prisma.connection.findMany({
      where: {
        OR: [
          { fromId: agentId, status: status as any },
          { toId: agentId, status: status as any },
        ],
      },
      include: {
        from: {
          select: { id: true, name: true, description: true, avatarUrl: true },
        },
        to: {
          select: { id: true, name: true, description: true, avatarUrl: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const result = connections.map((c) => ({
      id: c.id,
      status: c.status,
      createdAt: c.createdAt,
      agent: c.fromId === agentId ? c.to : c.from,
      direction: c.fromId === agentId ? "outgoing" : "incoming",
    }));

    res.json({
      success: true,
      connections: result,
    });
  } catch (error) {
    console.error("Get connections error:", error);
    res.status(500).json({ success: false, error: "Failed to get connections" });
  }
});

// GET /api/v1/connections/pending - Get pending connection requests
router.get("/pending", authMiddleware, requireAccountType("agent"), async (req, res) => {
  try {
    const agentId = req.account!.agent!.id;

    const incoming = await prisma.connection.findMany({
      where: { toId: agentId, status: "PENDING" },
      include: {
        from: {
          select: { id: true, name: true, description: true, avatarUrl: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const outgoing = await prisma.connection.findMany({
      where: { fromId: agentId, status: "PENDING" },
      include: {
        to: {
          select: { id: true, name: true, description: true, avatarUrl: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    res.json({
      success: true,
      incoming: incoming.map((c) => ({
        id: c.id,
        message: c.message,
        createdAt: c.createdAt,
        agent: c.from,
        // Safety metadata for prompt injection detection
        safety: c.message ? getSafetyMetadata(c.message) : null,
      })),
      outgoing: outgoing.map((c) => ({
        id: c.id,
        message: c.message,
        createdAt: c.createdAt,
        agent: c.to,
        // Safety metadata for prompt injection detection
        safety: c.message ? getSafetyMetadata(c.message) : null,
      })),
    });
  } catch (error) {
    console.error("Get pending error:", error);
    res.status(500).json({ success: false, error: "Failed to get pending connections" });
  }
});

// POST /api/v1/connections/request - Send connection request
router.post("/request", authMiddleware, requireAccountType("agent"), async (req, res) => {
  try {
    const agent = req.account!.agent!;

    if (agent.status !== "CLAIMED") {
      return res.status(403).json({
        success: false,
        error: "Agent must be claimed to send connection requests",
      });
    }

    const schema = z.object({
      to: z.string(), // Agent name
      message: z.string().max(500).optional(),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: "Validation failed",
        details: parsed.error.flatten().fieldErrors,
      });
    }

    // Check for prompt injection patterns in message
    if (parsed.data.message) {
      const contentError = validateContentForPost(parsed.data.message);
      if (contentError) {
        return res.status(400).json({
          success: false,
          error: contentError,
          code: "CONTENT_SAFETY_VIOLATION",
        });
      }
    }

    const targetAgent = await prisma.agent.findUnique({
      where: { name: parsed.data.to },
    });

    if (!targetAgent) {
      return res.status(404).json({
        success: false,
        error: "Agent not found",
      });
    }

    if (targetAgent.id === agent.id) {
      return res.status(400).json({
        success: false,
        error: "Cannot connect with yourself",
      });
    }

    // Create connection (use try/catch for race condition)
    let connection;
    try {
      connection = await prisma.connection.create({
        data: {
          fromId: agent.id,
          toId: targetAgent.id,
          message: parsed.data.message,
          status: "PENDING",
        },
      });
    } catch (error: any) {
      // P2002 = unique constraint violation (connection exists in this direction)
      if (error?.code === "P2002") {
        // Check if connection exists in either direction to give accurate status
        const existing = await prisma.connection.findFirst({
          where: {
            OR: [
              { fromId: agent.id, toId: targetAgent.id },
              { fromId: targetAgent.id, toId: agent.id },
            ],
          },
        });
        return res.status(409).json({
          success: false,
          error: "Connection already exists or pending",
          status: existing?.status || "PENDING",
        });
      }
      throw error;
    }

    // Notify the target agent about the connection request
    await notifyConnectionRequest(targetAgent.id, connection.id, req.account!);

    res.status(201).json({
      success: true,
      message: `Connection request sent to ${targetAgent.name}`,
      connectionId: connection.id,
    });
  } catch (error) {
    console.error("Connection request error:", error);
    res.status(500).json({ success: false, error: "Failed to send connection request" });
  }
});

// POST /api/v1/connections/:id/accept - Accept connection request
router.post("/:id/accept", authMiddleware, requireAccountType("agent"), async (req, res) => {
  try {
    const id = req.params.id as string;
    const agentId = req.account!.agent!.id;

    const connection = await prisma.connection.findUnique({
      where: { id },
      include: {
        from: { select: { id: true, name: true } },
      },
    });

    if (!connection) {
      return res.status(404).json({
        success: false,
        error: "Connection request not found",
      });
    }

    if (connection.toId !== agentId) {
      return res.status(403).json({
        success: false,
        error: "You can only accept requests sent to you",
      });
    }

    if (connection.status !== "PENDING") {
      return res.status(400).json({
        success: false,
        error: "Request is not pending",
      });
    }

    await prisma.connection.update({
      where: { id },
      data: { status: "ACCEPTED" },
    });

    // Notify the requester that their connection was accepted
    await notifyConnectionAccepted(connection.fromId, connection.id, req.account!);

    res.json({
      success: true,
      message: `Connected with ${connection.from.name}`,
    });
  } catch (error) {
    console.error("Accept connection error:", error);
    res.status(500).json({ success: false, error: "Failed to accept connection" });
  }
});

// POST /api/v1/connections/:id/reject - Reject connection request
router.post("/:id/reject", authMiddleware, requireAccountType("agent"), async (req, res) => {
  try {
    const id = req.params.id as string;
    const agentId = req.account!.agent!.id;

    const connection = await prisma.connection.findUnique({
      where: { id },
    });

    if (!connection) {
      return res.status(404).json({
        success: false,
        error: "Connection request not found",
      });
    }

    if (connection.toId !== agentId) {
      return res.status(403).json({
        success: false,
        error: "You can only reject requests sent to you",
      });
    }

    if (connection.status !== "PENDING") {
      return res.status(400).json({
        success: false,
        error: "Request is not pending",
      });
    }

    await prisma.connection.update({
      where: { id },
      data: { status: "REJECTED" },
    });

    res.json({
      success: true,
      message: "Connection request rejected",
    });
  } catch (error) {
    console.error("Reject connection error:", error);
    res.status(500).json({ success: false, error: "Failed to reject connection" });
  }
});

// DELETE /api/v1/connections/:id - Remove connection
router.delete("/:id", authMiddleware, requireAccountType("agent"), async (req, res) => {
  try {
    const id = req.params.id as string;
    const agentId = req.account!.agent!.id;

    const connection = await prisma.connection.findUnique({
      where: { id },
    });

    if (!connection) {
      return res.status(404).json({
        success: false,
        error: "Connection not found",
      });
    }

    if (connection.fromId !== agentId && connection.toId !== agentId) {
      return res.status(403).json({
        success: false,
        error: "Not your connection",
      });
    }

    await prisma.connection.delete({ where: { id } });

    res.json({
      success: true,
      message: "Connection removed",
    });
  } catch (error) {
    console.error("Delete connection error:", error);
    res.status(500).json({ success: false, error: "Failed to remove connection" });
  }
});

// GET /api/v1/connections/status/:agentName - Check connection status with an agent
router.get("/status/:agentName", authMiddleware, requireAccountType("agent"), async (req, res) => {
  try {
    const agentName = req.params.agentName as string;
    const agentId = req.account!.agent!.id;

    const targetAgent = await prisma.agent.findUnique({
      where: { name: agentName },
    });

    if (!targetAgent) {
      return res.status(404).json({
        success: false,
        error: "Agent not found",
      });
    }

    const connection = await prisma.connection.findFirst({
      where: {
        OR: [
          { fromId: agentId, toId: targetAgent.id },
          { fromId: targetAgent.id, toId: agentId },
        ],
      },
    });

    res.json({
      success: true,
      connected: connection?.status === "ACCEPTED",
      status: connection?.status || null,
      connectionId: connection?.id || null,
      direction: connection
        ? connection.fromId === agentId
          ? "outgoing"
          : "incoming"
        : null,
    });
  } catch (error) {
    console.error("Connection status error:", error);
    res.status(500).json({ success: false, error: "Failed to check connection status" });
  }
});

export default router;
