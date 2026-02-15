# DEViLBOX Caddy Deployment Guide

## Server Information

**Hetzner Server:**
- IP: `89.167.21.154`
- OS: Ubuntu 24.04.3 LTS
- Web Server: Caddy (automatic HTTPS)
- SSH Access: `ssh root@89.167.21.154`

**Existing Sites:**
- `bbs.uprough.net` → localhost:3001 (amiexpress-web)
- `retroranks.uprough.net` → localhost:3002
- `devilbox.uprough.net` → localhost:8080 (DEViLBOX Docker frontend)

## Architecture

```
                    Internet
                       │
                       ▼
              ┌────────────────┐
              │  Caddy (443)   │
              │ Automatic SSL  │
              └────────┬───────┘
                       │
       ┌───────────────┼────────────────┐
       │               │                │
       ▼               ▼                ▼
   localhost:3001  localhost:3002  localhost:8080
   (bbs.uprough)   (retroranks)    (DEViLBOX)
                                        │
                                        ▼
                              ┌──────────────────┐
                              │  Docker Compose  │
                              │                  │
                              │  ┌────────────┐  │
                              │  │  Frontend  │  │
                              │  │  (Nginx)   │  │
                              │  │  Port 80   │  │
                              │  └─────┬──────┘  │
                              │        │         │
                              │  ┌─────▼──────┐  │
                              │  │  Backend   │  │
                              │  │  (Express) │  │
                              │  │  Port 3001 │  │
                              │  └────────────┘  │
                              │                  │
                              │  ┌────────────┐  │
                              │  │   SQLite   │  │
                              │  │   Volume   │  │
                              │  └────────────┘  │
                              └──────────────────┘
```

## Prerequisites

**On local machine:**
- SSH access to server
- rsync installed

**On server (already installed):**
- Docker and Docker Compose
- Caddy web server
- systemd

## Quick Deployment

```bash
# From local machine
cd /Users/spot/Code/DEViLBOX
./deploy-docker.sh
```

The script will:
1. ✅ Create deployment archive
2. ✅ Upload to server via rsync
3. ✅ Generate JWT secret
4. ✅ Build Docker images
5. ✅ Start containers
6. ✅ Run health checks

## Caddy Configuration

### Main Caddyfile

Location: `/etc/caddy/Caddyfile`

```caddy
# BBS Site (amiexpress-web)
bbs.uprough.net {
    reverse_proxy localhost:3001
}

# RetroRanks Site
retroranks.uprough.net {
    reverse_proxy localhost:3002
}

# DEViLBOX Application
devilbox.uprough.net {
    reverse_proxy localhost:8080
}
```

### How Caddy Works

1. **Automatic HTTPS:** Caddy automatically obtains and renews Let's Encrypt SSL certificates
2. **Zero Configuration:** No need to manually run certbot or configure SSL
3. **HTTP → HTTPS Redirect:** Automatically redirects HTTP to HTTPS
4. **Reverse Proxy:** Routes traffic from subdomain to local Docker container

### Adding a New Site

```bash
# 1. Edit Caddyfile
sudo nano /etc/caddy/Caddyfile

# 2. Add new site block
newsite.uprough.net {
    reverse_proxy localhost:PORT
}

# 3. Reload Caddy
sudo systemctl reload caddy

# 4. Check status
sudo systemctl status caddy
```

Caddy will automatically:
- Request SSL certificate from Let's Encrypt
- Configure HTTPS with modern TLS settings
- Set up HTTP → HTTPS redirect

### Caddy Commands

```bash
# Reload configuration (no downtime)
sudo systemctl reload caddy

# Restart Caddy
sudo systemctl restart caddy

# Check status
sudo systemctl status caddy

# View logs
sudo journalctl -u caddy -f

# Test configuration
sudo caddy validate --config /etc/caddy/Caddyfile

# Format Caddyfile
sudo caddy fmt --overwrite /etc/caddy/Caddyfile
```

## Docker Deployment

### Initial Setup

```bash
# SSH to server
ssh root@89.167.21.154

# Create deployment directory
mkdir -p /var/www/devilbox

# Exit and run deployment from local machine
./deploy-docker.sh
```

### Manual Deployment

```bash
# 1. Package files locally
cd /Users/spot/Code/DEViLBOX
rm -rf /tmp/devilbox-deploy
mkdir -p /tmp/devilbox-deploy
cp Dockerfile.frontend Dockerfile.backend docker-compose.yml /tmp/devilbox-deploy/
cp -r nginx server src public /tmp/devilbox-deploy/
cp package*.json tsconfig.json vite.config.ts index.html /tmp/devilbox-deploy/

# 2. Upload to server
rsync -avz --delete /tmp/devilbox-deploy/ root@89.167.21.154:/var/www/devilbox/

# 3. Setup on server
ssh root@89.167.21.154 << 'EOF'
cd /var/www/devilbox

# Generate JWT secret if needed
if [ ! -f .env ]; then
  echo "JWT_SECRET=$(openssl rand -hex 32)" > .env
fi

# Create data directories
mkdir -p data/public/songs data/public/instruments

# Build and start containers
docker compose build
docker compose up -d

# Check status
docker compose ps
docker compose logs -f
EOF
```

### Docker Compose Services

**Frontend Container:**
- Name: `devilbox-frontend`
- Image: Built from Dockerfile.frontend (multi-stage: Node.js builder → Nginx)
- Port: 8080 (host) → 80 (container)
- Function: Serves React SPA, proxies /api/ to backend

**Backend Container:**
- Name: `devilbox-backend`
- Image: Built from Dockerfile.backend (Node.js + TypeScript + Express)
- Port: 3001 (internal only, accessed via frontend proxy)
- Function: REST API, user auth, file management

**Volume:**
- Name: `devilbox-data`
- Mount: `/data` inside backend container
- Contains: SQLite database, user files, demo content (symlinked)

### Managing Containers

```bash
# View logs
docker compose -f /var/www/devilbox/docker-compose.yml logs -f

# Restart all services
docker compose -f /var/www/devilbox/docker-compose.yml restart

# Stop services
docker compose -f /var/www/devilbox/docker-compose.yml down

# Rebuild and restart (after code changes)
docker compose -f /var/www/devilbox/docker-compose.yml build
docker compose -f /var/www/devilbox/docker-compose.yml up -d

# Check health
docker compose -f /var/www/devilbox/docker-compose.yml ps
docker exec devilbox-backend wget -q -O- http://localhost:3001/api/health
```

### Environment Variables

File: `/var/www/devilbox/.env`

```env
# Required
JWT_SECRET=<generated-by-deploy-script>

# Optional (has defaults)
DATA_ROOT=/data
```

The JWT secret is automatically generated during first deployment using:
```bash
openssl rand -hex 32
```

## SSL/TLS Configuration

### Automatic HTTPS (Default)

Caddy automatically handles SSL:
- Obtains certificates from Let's Encrypt
- Renews certificates automatically (60 days before expiry)
- Uses modern TLS 1.2 and 1.3
- Enables OCSP stapling
- Redirects HTTP → HTTPS

No manual configuration needed!

### Certificate Locations

Caddy stores certificates at:
```
/var/lib/caddy/.local/share/caddy/certificates/
```

You don't need to access these directly - Caddy manages everything.

### Checking SSL Status

```bash
# View certificate info
curl -vI https://devilbox.uprough.net

# Test SSL configuration
openssl s_client -connect devilbox.uprough.net:443 -servername devilbox.uprough.net

# Check certificate expiry
echo | openssl s_client -connect devilbox.uprough.net:443 -servername devilbox.uprough.net 2>/dev/null | openssl x509 -noout -dates
```

## DNS Configuration

### Prerequisites

Before deployment, ensure DNS is configured:

```bash
# Check DNS propagation
dig devilbox.uprough.net
nslookup devilbox.uprough.net

# Should resolve to:
# 89.167.21.154
```

### Adding New Subdomain

1. Add DNS A record: `newsite.uprough.net` → `89.167.21.154`
2. Wait for DNS propagation (usually < 5 minutes)
3. Add Caddy config and reload
4. Caddy automatically obtains SSL certificate

## Troubleshooting

### Site Not Accessible

```bash
# Check if Caddy is running
sudo systemctl status caddy

# Check Caddy logs
sudo journalctl -u caddy -n 50

# Check if Docker containers are running
docker ps

# Check container logs
docker compose -f /var/www/devilbox/docker-compose.yml logs backend
docker compose -f /var/www/devilbox/docker-compose.yml logs frontend
```

### SSL Certificate Issues

```bash
# Check Caddy logs for certificate errors
sudo journalctl -u caddy | grep -i certificate

# Common causes:
# - DNS not pointing to server
# - Port 443 blocked by firewall
# - Let's Encrypt rate limits (5 certs/week per domain)

# Test certificate renewal manually
sudo caddy reload --config /etc/caddy/Caddyfile
```

### Backend API Not Responding

```bash
# Check backend health from inside container
docker exec devilbox-backend wget -q -O- http://localhost:3001/api/health

# Check backend logs
docker compose -f /var/www/devilbox/docker-compose.yml logs backend

# Restart backend
docker compose -f /var/www/devilbox/docker-compose.yml restart backend
```

### Frontend Shows 502 Bad Gateway

```bash
# Backend might not be ready
docker compose -f /var/www/devilbox/docker-compose.yml ps

# Wait for backend to be healthy
docker compose -f /var/www/devilbox/docker-compose.yml logs -f backend

# Restart in order (backend first, then frontend)
docker compose -f /var/www/devilbox/docker-compose.yml restart backend
sleep 5
docker compose -f /var/www/devilbox/docker-compose.yml restart frontend
```

### Port Already in Use

```bash
# Check what's using port 8080
sudo lsof -i :8080

# If needed, change frontend port in docker-compose.yml:
# ports:
#   - "8081:80"  # Use 8081 instead of 8080

# Update Caddyfile to match:
# reverse_proxy localhost:8081

# Reload Caddy
sudo systemctl reload caddy
```

## Backup and Recovery

### Database Backup

```bash
# Create backup
docker exec devilbox-backend cp /data/db/devilbox.db /data/backup-$(date +%Y%m%d).db

# Copy to host
docker cp devilbox-backend:/data/backup-$(date +%Y%m%d).db /root/backups/

# Restore from backup
docker cp /root/backups/backup-20260213.db devilbox-backend:/data/db/devilbox.db
docker compose -f /var/www/devilbox/docker-compose.yml restart backend
```

### Volume Backup

```bash
# Backup entire data volume
docker run --rm \
  -v devilbox-data:/data \
  -v /root/backups:/backup \
  alpine tar czf /backup/devilbox-data-$(date +%Y%m%d).tar.gz /data

# Restore volume
docker run --rm \
  -v devilbox-data:/data \
  -v /root/backups:/backup \
  alpine tar xzf /backup/devilbox-data-20260213.tar.gz
```

### Full Deployment Backup

```bash
# Backup configuration and code
cd /var/www
tar czf /root/backups/devilbox-full-$(date +%Y%m%d).tar.gz devilbox/

# Restore
cd /var/www
tar xzf /root/backups/devilbox-full-20260213.tar.gz
cd devilbox
docker compose up -d
```

## Monitoring

### Container Stats

```bash
# Real-time resource usage
docker stats

# Container status
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

# Disk usage
docker system df
```

### Logs

```bash
# Follow all container logs
docker compose -f /var/www/devilbox/docker-compose.yml logs -f

# Follow specific service
docker compose -f /var/www/devilbox/docker-compose.yml logs -f backend

# View last 100 lines
docker compose -f /var/www/devilbox/docker-compose.yml logs --tail=100

# Caddy logs
sudo journalctl -u caddy -f
```

### Health Checks

```bash
# Automated health check script
#!/bin/bash
echo "=== DEViLBOX Health Check ==="

# Check Caddy
systemctl is-active --quiet caddy && echo "✓ Caddy running" || echo "✗ Caddy down"

# Check containers
docker ps | grep -q devilbox-frontend && echo "✓ Frontend running" || echo "✗ Frontend down"
docker ps | grep -q devilbox-backend && echo "✓ Backend running" || echo "✗ Backend down"

# Check backend API
curl -sf https://devilbox.uprough.net/api/health > /dev/null && echo "✓ API healthy" || echo "✗ API down"

# Check SSL expiry
EXPIRY=$(echo | openssl s_client -connect devilbox.uprough.net:443 -servername devilbox.uprough.net 2>/dev/null | openssl x509 -noout -enddate | cut -d= -f2)
echo "SSL expires: $EXPIRY"
```

## Performance Tuning

### Resource Limits

Edit `docker-compose.yml` to add resource constraints:

```yaml
services:
  backend:
    deploy:
      resources:
        limits:
          cpus: '1.0'
          memory: 512M
        reservations:
          cpus: '0.5'
          memory: 256M
```

### Log Rotation

```yaml
services:
  backend:
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"
```

### Caddy Performance

Caddy's default settings are production-ready, but you can tune:

```caddy
devilbox.uprough.net {
    # Enable HTTP/3
    encode gzip zstd

    # Custom timeouts
    reverse_proxy localhost:8080 {
        timeout 30s
    }
}
```

## Security Checklist

- [x] Caddy automatic HTTPS enabled
- [x] JWT secret randomly generated (32 bytes)
- [x] Backend not exposed directly (only via Nginx proxy)
- [x] Docker containers run as non-root users
- [x] SQLite database inside Docker volume (not exposed)
- [ ] Firewall configured (ufw) - confirm with hosting provider
- [ ] Regular backups scheduled (cron job)
- [ ] Log monitoring set up
- [ ] Rate limiting enabled in backend

## Updating the Application

### Minor Updates (code changes)

```bash
# From local machine
./deploy-docker.sh

# Or manually on server
ssh root@89.167.21.154
cd /var/www/devilbox
docker compose build
docker compose up -d
```

### Major Updates (dependency changes)

```bash
# Rebuild without cache
ssh root@89.167.21.154
cd /var/www/devilbox
docker compose down
docker compose build --no-cache
docker compose up -d
```

## Multiple Environments

To run staging and production on the same server:

```bash
# Create staging directory
mkdir -p /var/www/devilbox-staging

# Update docker-compose.yml ports:
# Frontend: 8081 (staging) vs 8080 (production)

# Add Caddy config:
staging.devilbox.uprough.net {
    reverse_proxy localhost:8081
}
```

## Clean Up

```bash
# Stop and remove containers (preserves data volume)
docker compose -f /var/www/devilbox/docker-compose.yml down

# Remove containers AND data volume (WARNING: deletes all data!)
docker compose -f /var/www/devilbox/docker-compose.yml down -v

# Clean up unused Docker resources
docker system prune -a

# Remove images
docker rmi devilbox-backend devilbox-frontend
```

## Quick Reference

```bash
# Deploy
./deploy-docker.sh

# View logs
ssh root@89.167.21.154 'docker compose -f /var/www/devilbox/docker-compose.yml logs -f'

# Restart
ssh root@89.167.21.154 'docker compose -f /var/www/devilbox/docker-compose.yml restart'

# Backup
ssh root@89.167.21.154 'docker exec devilbox-backend cp /data/db/devilbox.db /data/backup-$(date +%Y%m%d).db'

# Reload Caddy
ssh root@89.167.21.154 'sudo systemctl reload caddy'
```

## Support

**Server Access:**
- SSH: `root@89.167.21.154`
- Caddy config: `/etc/caddy/Caddyfile`
- Application: `/var/www/devilbox/`
- Logs: `journalctl -u caddy -f`

**DEViLBOX URLs:**
- Production: https://devilbox.uprough.net
- API Health: https://devilbox.uprough.net/api/health

**Other Sites on Server:**
- https://bbs.uprough.net (port 3001)
- https://retroranks.uprough.net (port 3002)
