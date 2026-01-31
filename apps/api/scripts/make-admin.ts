#!/usr/bin/env npx tsx
/**
 * CLI script to promote a user to ADMIN role.
 * Run from the api directory with environment variables loaded:
 * 
 *   cd /opt/clawnet-staging/apps/api
 *   export $(grep -v '^#' ../../.env | xargs)
 *   npx tsx scripts/make-admin.ts <username>
 * 
 * Or use the wrapper script:
 *   ./scripts/make-admin.sh <username>
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const username = process.argv[2];

  if (!username) {
    console.error("Usage: npx tsx scripts/make-admin.ts <username>");
    console.error("Example: npx tsx scripts/make-admin.ts johndoe");
    process.exit(1);
  }

  // Find the user
  const user = await prisma.user.findUnique({
    where: { username },
    select: { id: true, username: true, displayName: true, role: true },
  });

  if (!user) {
    console.error(`Error: User @${username} not found`);
    process.exit(1);
  }

  if (user.role === "CEO") {
    console.error(`Error: @${username} is already CEO (highest rank)`);
    process.exit(1);
  }

  if (user.role === "ADMIN") {
    console.log(`User @${username} is already an ADMIN`);
    process.exit(0);
  }

  // Promote to ADMIN
  await prisma.user.update({
    where: { id: user.id },
    data: { role: "ADMIN" },
  });

  console.log(`✅ Successfully promoted @${username} (${user.displayName}) to ADMIN`);
}

main()
  .catch((e) => {
    console.error("Error:", e.message);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
