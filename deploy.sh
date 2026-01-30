#!/bin/bash
# =============================================================================
# ClawNet STAGING Deployment Script
# =============================================================================
# Deploys the STAGING branch to /opt/clawnet-staging
# =============================================================================

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}========================================${NC}"
echo -e "${CYAN}  ClawNet STAGING Deployment${NC}"
echo -e "${CYAN}========================================${NC}"
echo ""

cd /opt/clawnet-staging

# Step 1: Pull staging branch
echo -e "${YELLOW}[1/5]${NC} Pulling staging branch..."
git fetch origin
git checkout staging
git pull origin staging

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
cd /opt/clawnet-staging

# Step 4: Build
echo -e "${YELLOW}[4/5]${NC} Building applications..."
pnpm build

# Step 5: Restart services
echo -e "${YELLOW}[5/5]${NC} Restarting STAGING services..."
systemctl restart clawnet-staging-api clawnet-staging-web

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  STAGING Deployment Complete!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo "Services status:"
systemctl is-active clawnet-staging-api && echo -e "  clawnet-staging-api: ${GREEN}running${NC}" || echo -e "  clawnet-staging-api: ${RED}stopped${NC}"
systemctl is-active clawnet-staging-web && echo -e "  clawnet-staging-web: ${GREEN}running${NC}" || echo -e "  clawnet-staging-web: ${RED}stopped${NC}"
echo ""
echo "View logs:"
echo "  journalctl -u clawnet-staging-api -f"
echo "  journalctl -u clawnet-staging-web -f"
echo ""
echo -e "URL: ${CYAN}https://staging.clawnet.org${NC}"
