# DEViLBOX Docker Deployment Guide

Simplified deployment using Docker containers.

## Architecture

```
┌─────────────────────────────────────┐
│   Nginx (Frontend Container)        │
│   - Serves React app                │
│   - Proxies /api to backend         │
│   - Port 80/443                     │
└────────────┬────────────────────────┘
             │
             ├─── /api/* ───────────┐
             │                      │
             │              ┌───────▼──────────┐
             │              │  Backend API     │
             │              │  - Express       │
             │              │  - SQLite DB     │
             │              │  - User files    │
             │              └──────────────────┘
             │
             └─── / ───> React App
```

## Prerequisites

**On your local machine:**
- Docker (optional, for testing)

**On Hetzner server (89.167.21.154):**
```bash
# Install Docker
curl -fsSL https://get.docker.com | sh

# Install Docker Compose
apt install docker-compose

# Start Docker
systemctl enable docker
systemctl start docker
```

## Quick Deployment (Automated)

```bash
# From your local machine
cd /Users/spot/Code/DEViLBOX
./deploy-docker.sh
```

That's it! The script will:
1. ✅ Package all files
2. ✅ Upload to server
3. ✅ Build Docker images
4. ✅ Start containers
5. ✅ Run health checks

## Manual Deployment

### Step 1: Upload Files

```bash
# Create deployment archive
tar -czf devilbox-deploy.tar.gz \
  Dockerfile.frontend \
  Dockerfile.backend \
  docker-compose.yml \
  nginx/ \
  server/ \
  src/ \
  public/ \
  package*.json \
  tsconfig.json \
  vite.config.ts \
  index.html

# Upload
scp devilbox-deploy.tar.gz root@89.167.21.154:/var/www/
```

### Step 2: Setup on Server

```bash
ssh root@89.167.21.154

# Extract
cd /var/www
tar -xzf devilbox-deploy.tar.gz -C devilbox/
cd devilbox

# Create .env file
echo "JWT_SECRET=$(openssl rand -hex 32)" > .env

# Create data directories
mkdir -p data/public/{songs,instruments}
```

### Step 3: Build and Start

```bash
# Build images
docker-compose build

# Start containers
docker-compose up -d

# Check status
docker-compose ps
docker-compose logs -f
```

## SSL Setup with Let's Encrypt

### Option 1: Using Certbot in Container

```bash
# SSH to server
ssh root@89.167.21.154

# Install certbot on host
apt install certbot

# Get certificate
certbot certonly --standalone -d devilbox.uprough.net

# Update docker-compose.yml to mount certificates
# (Already configured in volumes section)

# Restart frontend
docker-compose restart frontend
```

### Option 2: Manual Nginx SSL Config

Create `/var/www/devilbox/nginx/ssl.conf`:

```nginx
server {
    listen 443 ssl http2;
    server_name devilbox.uprough.net;

    ssl_certificate /etc/letsencrypt/live/devilbox.uprough.net/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/devilbox.uprough.net/privkey.pem;

    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    # Include main config
    include /etc/nginx/conf.d/default.conf;
}

# Redirect HTTP to HTTPS
server {
    listen 80;
    server_name devilbox.uprough.net;
    return 301 https://$server_name$request_uri;
}
```

Then restart:
```bash
docker-compose restart frontend
```

## Managing the Deployment

### View Logs

```bash
# All services
docker-compose logs -f

# Backend only
docker-compose logs -f backend

# Frontend only
docker-compose logs -f frontend
```

### Restart Services

```bash
# Restart all
docker-compose restart

# Restart backend only
docker-compose restart backend

# Restart frontend only
docker-compose restart frontend
```

### Update Application

```bash
# From local machine - run deployment script
./deploy-docker.sh

# Or manually on server
cd /var/www/devilbox
git pull  # if using git
docker-compose build
docker-compose up -d
```

### Database Backup

```bash
# Backup database
docker exec devilbox-backend cp /data/db/devilbox.db /data/backup-$(date +%Y%m%d).db

# Copy to host
docker cp devilbox-backend:/data/backup-$(date +%Y%m%d).db ./
```

### Access Containers

```bash
# Backend shell
docker exec -it devilbox-backend sh

# Frontend shell
docker exec -it devilbox-frontend sh

# View backend environment
docker exec devilbox-backend env
```

## Troubleshooting

### Containers won't start

```bash
# Check logs
docker-compose logs

# Check individual service
docker-compose logs backend

# Rebuild from scratch
docker-compose down
docker-compose build --no-cache
docker-compose up -d
```

### API not accessible

```bash
# Check backend health
docker exec devilbox-backend wget -q -O- http://localhost:3001/api/health

# Check if backend is running
docker-compose ps

# Check backend logs
docker-compose logs backend
```

### Frontend shows 502 Bad Gateway

```bash
# Backend might not be ready - check health
docker-compose ps

# Check nginx logs
docker-compose logs frontend

# Restart in order
docker-compose restart backend
sleep 5
docker-compose restart frontend
```

## Environment Variables

Create `.env` in `/var/www/devilbox/`:

```env
# Required
JWT_SECRET=your-random-secret-here

# Optional
FRONTEND_PORT=80
FRONTEND_SSL_PORT=443
```

## Volumes and Persistence

### Data Volume

User files and database are stored in Docker volume `devilbox-data`:

```bash
# List volumes
docker volume ls

# Inspect volume
docker volume inspect devilbox-data

# Backup volume
docker run --rm -v devilbox-data:/data -v $(pwd):/backup alpine tar czf /backup/devilbox-data-backup.tar.gz /data

# Restore volume
docker run --rm -v devilbox-data:/data -v $(pwd):/backup alpine tar xzf /backup/devilbox-data-backup.tar.gz
```

## Performance Tuning

### Resource Limits

Edit `docker-compose.yml`:

```yaml
services:
  backend:
    deploy:
      resources:
        limits:
          cpus: '1'
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

## Security Checklist

- [ ] JWT_SECRET is randomly generated
- [ ] SSL certificate installed
- [ ] Firewall configured (UFW)
- [ ] Containers run as non-root user
- [ ] Regular backups scheduled
- [ ] Docker daemon secure
- [ ] Logs monitored

## Monitoring

```bash
# Container stats
docker stats

# Health checks
docker ps --format "table {{.Names}}\t{{.Status}}"

# Disk usage
docker system df
```

## Clean Up

```bash
# Stop and remove containers
docker-compose down

# Remove volumes (WARNING: deletes all data!)
docker-compose down -v

# Remove images
docker rmi devilbox-backend devilbox-frontend

# Clean up Docker system
docker system prune -a
```
