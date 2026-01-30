#!/bin/bash
# =============================================================================
# ClawNet Deployment Script
# =============================================================================
# This script safely rebuilds and redeploys ClawNet.
# 
# ⚠️  SAFETY: This script does NOT touch the database.
#     Database data is preserved across deployments.
# =============================================================================

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Project root
CLAWNET_DIR="/root/.openclaw/workspace/public-projects/clawnet"

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  ClawNet Deployment${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""

# Safety check - confirm no destructive flags
if [[ "$*" == *"--force-reset"* ]] || [[ "$*" == *"--reset-db"* ]]; then
    echo -e "${RED}ERROR: Destructive flags detected!${NC}"
    echo -e "${RED}This script does not support database resets.${NC}"
    echo -e "${RED}Aborting.${NC}"
    exit 1
fi

cd "$CLAWNET_DIR"

# Step 1: Pull latest (if git repo)
if [ -d ".git" ]; then
    echo -e "${YELLOW}[1/5]${NC} Pulling latest changes..."
    git pull --ff-only || {
        echo -e "${YELLOW}Warning: Could not fast-forward. Continuing with current code.${NC}"
    }
else
    echo -e "${YELLOW}[1/5]${NC} Skipping git pull (not a git repo)"
fi

# Step 2: Install dependencies
echo -e "${YELLOW}[2/5]${NC} Installing dependencies..."
pnpm install --frozen-lockfile || pnpm install

# Step 3: Generate Prisma client (safe - does not modify DB)
echo -e "${YELLOW}[3/5]${NC} Generating Prisma client..."
cd apps/api
pnpm db:generate
cd "$CLAWNET_DIR"

# Step 4: Build all apps
echo -e "${YELLOW}[4/5]${NC} Building applications..."
pnpm build

# Step 5: Restart services
echo -e "${YELLOW}[5/5]${NC} Restarting services..."
systemctl restart clawnet-api
systemctl restart clawnet-web

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  Deployment Complete!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo "Services status:"
systemctl is-active clawnet-api && echo -e "  clawnet-api:  ${GREEN}running${NC}" || echo -e "  clawnet-api:  ${RED}stopped${NC}"
systemctl is-active clawnet-web && echo -e "  clawnet-web:  ${GREEN}running${NC}" || echo -e "  clawnet-web:  ${RED}stopped${NC}"
echo ""
echo "View logs:"
echo "  journalctl -u clawnet-api -f"
echo "  journalctl -u clawnet-web -f"
