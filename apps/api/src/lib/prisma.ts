import { PrismaClient } from "@prisma/client";

declare global {
  var prisma: PrismaClient | undefined;
}

// Configure Prisma client with connection pooling for low-resource environments
// Connection pool: 2-5 connections (constrained for 2-core/4GB server)
export const prisma = global.prisma || new PrismaClient({
  log: process.env.NODE_ENV === "production" 
    ? ["error"] // Minimal logging in production to save CPU
    : ["query", "warn", "error"],
  datasources: {
    db: {
      url: process.env.DATABASE_URL + (process.env.DATABASE_URL?.includes("?") ? "&" : "?") + 
        "connection_limit=5&pool_timeout=10",
    },
  },
});

// Reuse client in dev to prevent connection exhaustion during hot reloads
if (process.env.NODE_ENV !== "production") {
  global.prisma = prisma;
}

// Graceful shutdown - close connections on process termination
process.on("beforeExit", async () => {
  await prisma.$disconnect();
});
