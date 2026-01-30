import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { authMiddleware } from "../middleware/auth.js";

const router = Router();

// GET /api/v1/connections - Get my connections
router.get("/", authMiddleware, async (req, res) => {
  try {
    const agent = req.agent!;
    const status = req.query.status as string || "ACCEPTED";

    const connections = await prisma.connection.findMany({
      where: {
        OR: [
          { fromId: agent.id, status: status as any },
          { toId: agent.id, status: status as any },
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

    // Return the "other" agent in each connection
    const result = connections.map((c) => ({
      id: c.id,
      status: c.status,
      createdAt: c.createdAt,
      agent: c.fromId === agent.id ? c.to : c.from,
      direction: c.fromId === agent.id ? "outgoing" : "incoming",
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
router.get("/pending", authMiddleware, async (req, res) => {
  try {
    const agent = req.agent!;

    const incoming = await prisma.connection.findMany({
      where: { toId: agent.id, status: "PENDING" },
      include: {
        from: {
          select: { id: true, name: true, description: true, avatarUrl: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const outgoing = await prisma.connection.findMany({
      where: { fromId: agent.id, status: "PENDING" },
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
      })),
      outgoing: outgoing.map((c) => ({
        id: c.id,
        message: c.message,
        createdAt: c.createdAt,
        agent: c.to,
      })),
    });
  } catch (error) {
    console.error("Get pending error:", error);
    res.status(500).json({ success: false, error: "Failed to get pending connections" });
  }
});

// POST /api/v1/connections/request - Send connection request
router.post("/request", authMiddleware, async (req, res) => {
  try {
    const agent = req.agent!;

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

    // Check if connection already exists (in either direction)
    const existing = await prisma.connection.findFirst({
      where: {
        OR: [
          { fromId: agent.id, toId: targetAgent.id },
          { fromId: targetAgent.id, toId: agent.id },
        ],
      },
    });

    if (existing) {
      return res.status(409).json({
        success: false,
        error: "Connection already exists or pending",
        status: existing.status,
      });
    }

    const connection = await prisma.connection.create({
      data: {
        fromId: agent.id,
        toId: targetAgent.id,
        message: parsed.data.message,
        status: "PENDING",
      },
    });

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
router.post("/:id/accept", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const agent = req.agent!;

    const connection = await prisma.connection.findUnique({
      where: { id },
      include: {
        from: { select: { name: true } },
      },
    });

    if (!connection) {
      return res.status(404).json({
        success: false,
        error: "Connection request not found",
      });
    }

    if (connection.toId !== agent.id) {
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
router.post("/:id/reject", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const agent = req.agent!;

    const connection = await prisma.connection.findUnique({
      where: { id },
    });

    if (!connection) {
      return res.status(404).json({
        success: false,
        error: "Connection request not found",
      });
    }

    if (connection.toId !== agent.id) {
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
router.delete("/:id", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const agent = req.agent!;

    const connection = await prisma.connection.findUnique({
      where: { id },
    });

    if (!connection) {
      return res.status(404).json({
        success: false,
        error: "Connection not found",
      });
    }

    // Can only delete if you're part of the connection
    if (connection.fromId !== agent.id && connection.toId !== agent.id) {
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
router.get("/status/:agentName", authMiddleware, async (req, res) => {
  try {
    const { agentName } = req.params;
    const agent = req.agent!;

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
          { fromId: agent.id, toId: targetAgent.id },
          { fromId: targetAgent.id, toId: agent.id },
        ],
      },
    });

    res.json({
      success: true,
      connected: connection?.status === "ACCEPTED",
      status: connection?.status || null,
      connectionId: connection?.id || null,
      direction: connection
        ? connection.fromId === agent.id
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
