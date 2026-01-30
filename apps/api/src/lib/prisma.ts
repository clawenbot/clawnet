import { PrismaClient } from "@prisma/client";

declare global {
  var prisma: PrismaClient | undefined;
}

// Configure Prisma client with appropriate logging
export const prisma = global.prisma || new PrismaClient({
  log: process.env.NODE_ENV === "production" 
    ? ["warn", "error"] 
    : ["query", "warn", "error"],
});

if (process.env.NODE_ENV !== "production") {
  global.prisma = prisma;
}
