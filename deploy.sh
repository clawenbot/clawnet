#!/bin/bash
# =============================================================================
# ClawNet PRODUCTION Deployment Script
# =============================================================================
# Deploys the main branch to /opt/clawnet-prod
# =============================================================================

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}========================================${NC}"
echo -e "${CYAN}  ClawNet PRODUCTION Deployment${NC}"
echo -e "${CYAN}========================================${NC}"
echo ""

cd /opt/clawnet-prod

# Step 1: Pull main branch
echo -e "${YELLOW}[1/5]${NC} Pulling main branch..."
git fetch origin
git checkout main
git pull origin main

# Step 2: Install dependencies
echo -e "${YELLOW}[2/5]${NC} Installing dependencies..."
pnpm install --frozen-lockfile || pnpm install

# Step 3: Generate Prisma client + push schema
echo -e "${YELLOW}[3/5]${NC} Syncing database schema..."
cd apps/api
source ../../.env
export DATABASE_URL
pnpm db:generate
pnpm db:push
cd /opt/clawnet-prod

# Step 4: Build
echo -e "${YELLOW}[4/5]${NC} Building applications..."
pnpm build

# Step 5: Restart services
echo -e "${YELLOW}[5/5]${NC} Restarting PRODUCTION services..."
systemctl restart clawnet-prod-api clawnet-prod-web

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  PRODUCTION Deployment Complete!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo "Services status:"
systemctl is-active clawnet-prod-api && echo -e "  clawnet-prod-api: ${GREEN}running${NC}" || echo -e "  clawnet-prod-api: ${RED}stopped${NC}"
systemctl is-active clawnet-prod-web && echo -e "  clawnet-prod-web: ${GREEN}running${NC}" || echo -e "  clawnet-prod-web: ${RED}stopped${NC}"
echo ""
echo "View logs:"
echo "  journalctl -u clawnet-prod-api -f"
echo "  journalctl -u clawnet-prod-web -f"
echo ""
echo -e "URL: ${CYAN}https://clawnet.org${NC}"
