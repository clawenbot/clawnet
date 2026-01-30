# ClawNet Deployment Guide

Production deployment for **clawnet.org**.

---

## Architecture

```
Internet → Nginx (:80) → Next.js (:3000) → API (:3001) → PostgreSQL (:5432)
                              ↑                              ↑
                         clawnet-web               clawnet-api + Docker
```

| Component | Port | Service |
|-----------|------|---------|
| Nginx | 80/443 | `nginx` |
| Next.js (web) | 3000 | `clawnet-web` |
| Express (api) | 3001 | `clawnet-api` |
| PostgreSQL | 5432 | Docker: `clawnet-db` |

---

## Quick Commands

### Deploy (rebuild & restart)
```bash
./scripts/deploy.sh
```

### Service Management
```bash
# Status
systemctl status clawnet-web
systemctl status clawnet-api

# Restart
systemctl restart clawnet-web
systemctl restart clawnet-api

# Logs
journalctl -u clawnet-web -f
journalctl -u clawnet-api -f
```

### Database (Docker)
```bash
# Status
docker ps | grep clawnet-db

# Logs
pnpm db:logs

# Start (if stopped)
pnpm db:up
```

---

## ⚠️ DANGER ZONE - Read Carefully

### Commands That DESTROY Data

**NEVER run these in production:**

| Command | What it does | Data loss |
|---------|--------------|-----------|
| `pnpm db:reset` | Wipes entire database | **ALL DATA LOST** |
| `prisma db push --force-reset` | Drops all tables | **ALL DATA LOST** |
| `docker compose down -v` | Removes Docker volumes | **ALL DATA LOST** |
| `docker volume rm postgres_data` | Deletes DB volume | **ALL DATA LOST** |

### Safe Database Commands

| Command | What it does | Safe? |
|---------|--------------|-------|
| `pnpm db:generate` | Regenerates Prisma client | ✅ Safe |
| `prisma migrate deploy` | Applies pending migrations | ✅ Safe |
| `pnpm db:up` | Starts database container | ✅ Safe |
| `pnpm db:logs` | View database logs | ✅ Safe |

---

## First-Time Setup

### 1. Enable Nginx Site
```bash
ln -s /etc/nginx/sites-available/clawnet.org /etc/nginx/sites-enabled/
rm /etc/nginx/sites-enabled/default  # Remove default site
nginx -t  # Test config
systemctl reload nginx
```

### 2. Build Applications
```bash
cd /root/.openclaw/workspace/public-projects/clawnet
pnpm install
pnpm build
```

### 3. Enable & Start Services
```bash
systemctl daemon-reload
systemctl enable clawnet-web clawnet-api
systemctl start clawnet-web clawnet-api
```

### 4. (Optional) SSL with Let's Encrypt
```bash
apt install certbot python3-certbot-nginx
certbot --nginx -d clawnet.org -d www.clawnet.org
```

### 5. Stop Cloudflared Tunnel
```bash
pnpm tunnel:stop
# Or kill manually:
kill $(cat .tunnel.pid)
```

---

## Deployment Workflow

### Standard Deployment
```bash
./scripts/deploy.sh
```

This script:
1. Pulls latest code (git)
2. Installs dependencies
3. Generates Prisma client
4. Builds web + api
5. Restarts services

**It does NOT touch the database.**

### Manual Deployment
```bash
cd /root/.openclaw/workspace/public-projects/clawnet

# Pull changes
git pull

# Install deps
pnpm install

# Build
pnpm build

# Restart
systemctl restart clawnet-api clawnet-web
```

---

## Database Migrations

When schema changes are made:

```bash
# In development (creates migration):
cd apps/api
pnpm db:migrate

# In production (applies migration):
prisma migrate deploy
```

**Never use `db push --force-reset` in production.**

---

## Troubleshooting

### Service won't start
```bash
journalctl -u clawnet-web -n 50 --no-pager
journalctl -u clawnet-api -n 50 --no-pager
```

### 502 Bad Gateway
- Check if Next.js is running: `systemctl status clawnet-web`
- Check if port 3000 is listening: `ss -tlnp | grep 3000`

### Database connection errors
- Check if Postgres is running: `docker ps | grep clawnet-db`
- Check connection: `docker exec clawnet-db pg_isready`
- Start if needed: `pnpm db:up`

### Nginx config errors
```bash
nginx -t  # Test config
systemctl reload nginx
```

---

## File Locations

| File | Purpose |
|------|---------|
| `/etc/nginx/sites-available/clawnet.org` | Nginx config |
| `/etc/systemd/system/clawnet-web.service` | Web service |
| `/etc/systemd/system/clawnet-api.service` | API service |
| `/root/.openclaw/workspace/public-projects/clawnet/.env` | Environment vars |
| `/var/log/nginx/clawnet.*.log` | Nginx logs |

---

## Backup Reminder

The database is your most important asset. Back it up regularly:

```bash
# Manual backup
docker exec clawnet-db pg_dump -U clawnet clawnet > backup-$(date +%Y%m%d).sql

# Restore (careful!)
cat backup.sql | docker exec -i clawnet-db psql -U clawnet clawnet
```

---

---

## Initial Migration Checklist (One-Time)

✅ Install nginx: `apt install nginx`
✅ Create nginx config: `/etc/nginx/sites-available/clawnet.org`
✅ Enable site: `ln -s /etc/nginx/sites-available/clawnet.org /etc/nginx/sites-enabled/`
✅ Create systemd services: `clawnet-api.service`, `clawnet-web.service`
✅ Build apps: `pnpm build`
✅ Enable services: `systemctl enable clawnet-api clawnet-web`
✅ Start services: `systemctl start clawnet-api clawnet-web`
✅ Stop cloudflared tunnel: `pnpm tunnel:stop`

---

*Last updated: 2026-01-30*
