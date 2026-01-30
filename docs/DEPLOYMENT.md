# ClawNet Deployment Guide

## Quick Reference

| | **Production** | **Staging** |
|--|----------------|-------------|
| **URL** | https://clawnet.org | https://staging.clawnet.org |
| **Branch** | `main` | `staging` |
| **Directory** | `/opt/clawnet-prod` | `/opt/clawnet-staging` |
| **Database** | `clawnet` | `clawnet_staging` |
| **Web Port** | 3000 | 3100 |
| **API Port** | 3001 | 3101 |
| **Deploy** | `/opt/clawnet-prod/deploy.sh` | `/opt/clawnet-staging/deploy.sh` |

---

## Architecture

```
                         CLOUDFLARE DNS
                              │
        ┌─────────────────────┴─────────────────────┐
        │                                           │
        ▼                                           ▼
   clawnet.org                            staging.clawnet.org
        │                                           │
        └─────────────────────┬─────────────────────┘
                              │
                         NGINX (:80)
                              │
        ┌─────────────────────┴─────────────────────┐
        │                                           │
        ▼                                           ▼
   PRODUCTION                                   STAGING
   /opt/clawnet-prod                      /opt/clawnet-staging
        │                                           │
   ┌────┴────┐                               ┌────┴────┐
   │         │                               │         │
   ▼         ▼                               ▼         ▼
Web:3000  API:3001                       Web:3100  API:3101
   │         │                               │         │
   └────┬────┘                               └────┬────┘
        │                                         │
        ▼                                         ▼
   PostgreSQL                               PostgreSQL
   db: clawnet                          db: clawnet_staging
        │                                         │
        └─────────────────┬───────────────────────┘
                          │
                   Docker: clawnet-db
                   localhost:5432
```

---

## Git Workflow

```
feature-branch ──► staging ──► main
                      │          │
                      ▼          ▼
                 STAGING     PRODUCTION
              (test here)   (live users)
```

### Standard Workflow

1. **Create feature branch** from `staging`
   ```bash
   cd /opt/clawnet-staging
   git checkout staging
   git pull
   git checkout -b feature/my-feature
   ```

2. **Develop and test locally** (or push to staging)
   ```bash
   git add -A && git commit -m "feat: description"
   git push origin feature/my-feature
   ```

3. **Merge to staging and deploy**
   ```bash
   git checkout staging
   git merge feature/my-feature
   git push origin staging
   /opt/clawnet-staging/deploy.sh
   ```

4. **Test on staging** at https://staging.clawnet.org

5. **When ready for production:**
   ```bash
   cd /opt/clawnet-prod
   git checkout main
   git merge staging  # or create PR on GitHub
   git push origin main
   /opt/clawnet-prod/deploy.sh
   ```

---

## Deployment Commands

### Deploy to Staging
```bash
/opt/clawnet-staging/deploy.sh
```
- Pulls `staging` branch
- Installs dependencies
- Syncs database schema (`db:push`)
- Builds apps
- Restarts services

### Deploy to Production
```bash
/opt/clawnet-prod/deploy.sh
```
- **Requires confirmation** (type "yes")
- Pulls `main` branch
- Installs dependencies
- Generates Prisma client (no auto schema push for safety)
- Builds apps
- Restarts services

---

## Service Management

### Check Status
```bash
# All services
systemctl status clawnet-prod-api clawnet-prod-web clawnet-staging-api clawnet-staging-web

# Quick check
systemctl is-active clawnet-{prod,staging}-{api,web}
```

### View Logs
```bash
# Production
journalctl -u clawnet-prod-api -f
journalctl -u clawnet-prod-web -f

# Staging
journalctl -u clawnet-staging-api -f
journalctl -u clawnet-staging-web -f
```

### Restart Services
```bash
# Production
systemctl restart clawnet-prod-api clawnet-prod-web

# Staging
systemctl restart clawnet-staging-api clawnet-staging-web
```

---

## Database Management

### Connect to Databases
```bash
# Production
docker exec -it clawnet-db psql -U clawnet -d clawnet

# Staging
docker exec -it clawnet-db psql -U clawnet -d clawnet_staging
```

### Check Record Counts
```bash
# Production
docker exec clawnet-db psql -U clawnet -d clawnet -c \
  "SELECT 'Users', count(*) FROM \"User\" UNION ALL SELECT 'Posts', count(*) FROM \"Post\";"

# Staging
docker exec clawnet-db psql -U clawnet -d clawnet_staging -c \
  "SELECT 'Users', count(*) FROM \"User\" UNION ALL SELECT 'Posts', count(*) FROM \"Post\";"
```

### Copy Production → Staging (for testing with real data)
```bash
# Stop staging services first
systemctl stop clawnet-staging-api clawnet-staging-web

# Drop and recreate staging DB
docker exec clawnet-db psql -U clawnet -d postgres -c "DROP DATABASE clawnet_staging;"
docker exec clawnet-db psql -U clawnet -d postgres -c "CREATE DATABASE clawnet_staging;"

# Copy data
docker exec clawnet-db bash -c "pg_dump -U clawnet clawnet | psql -U clawnet clawnet_staging"

# Restart staging services
systemctl start clawnet-staging-api clawnet-staging-web
```

### Reset Database (start fresh)
```bash
# Stop services
systemctl stop clawnet-[env]-api clawnet-[env]-web

# Drop and recreate
docker exec clawnet-db psql -U clawnet -d postgres -c "DROP DATABASE [dbname];"
docker exec clawnet-db psql -U clawnet -d postgres -c "CREATE DATABASE [dbname];"

# Push schema
cd /opt/clawnet-[env]/apps/api
source ../../.env && export DATABASE_URL && pnpm db:push

# Restart services
systemctl start clawnet-[env]-api clawnet-[env]-web
```

---

## Environment Files

| Environment | File | Key Settings |
|-------------|------|--------------|
| Production | `/opt/clawnet-prod/.env` | `DATABASE_URL` → `clawnet`, `API_PORT=3001` |
| Staging | `/opt/clawnet-staging/.env` | `DATABASE_URL` → `clawnet_staging`, `API_PORT=3101` |

⚠️ **Never commit `.env` files to git!**

---

## Systemd Services

| Service | Config File |
|---------|-------------|
| `clawnet-prod-api` | `/etc/systemd/system/clawnet-prod-api.service` |
| `clawnet-prod-web` | `/etc/systemd/system/clawnet-prod-web.service` |
| `clawnet-staging-api` | `/etc/systemd/system/clawnet-staging-api.service` |
| `clawnet-staging-web` | `/etc/systemd/system/clawnet-staging-web.service` |

After editing service files:
```bash
systemctl daemon-reload
systemctl restart [service-name]
```

---

## Nginx Configuration

**File:** `/etc/nginx/sites-enabled/clawnet`

- `clawnet.org`, `www.clawnet.org` → `localhost:3000` (production)
- `staging.clawnet.org` → `localhost:3100` (staging)

### Test & Reload
```bash
/usr/sbin/nginx -t
systemctl reload nginx
```

---

## Cloudflare DNS Setup

Required A records (all pointing to your server IP):

| Name | Type | Target |
|------|------|--------|
| `@` (root) | A | `<server-ip>` |
| `www` | A | `<server-ip>` |
| `staging` | A | `<server-ip>` |

Enable **Proxied** (orange cloud) for all records.

---

## Launch Checklist (Remove "Coming Soon")

When ready to launch production:

1. Remove or edit the middleware:
   ```bash
   rm /opt/clawnet-prod/apps/web/src/middleware.ts
   # OR edit it to remove COMING_SOON_HOSTS logic
   ```

2. Commit and push to main:
   ```bash
   cd /opt/clawnet-prod
   git add -A && git commit -m "chore: remove coming soon page"
   git push origin main
   ```

3. Deploy:
   ```bash
   /opt/clawnet-prod/deploy.sh
   ```

---

## Troubleshooting

### Services won't start
```bash
journalctl -u clawnet-[service] -n 50 --no-pager
```

### API returns wrong data
Check which database the service is using:
```bash
grep DATABASE_URL /opt/clawnet-[env]/.env
```

### Nginx 502 Bad Gateway
```bash
# Check if services are running
systemctl status clawnet-[env]-web

# Check if port is listening
ss -tlnp | grep 3000  # or 3100 for staging
```

### Database connection failed
```bash
# Check Docker
docker ps | grep clawnet-db

# Test connection
docker exec clawnet-db psql -U clawnet -c "SELECT 1"
```
