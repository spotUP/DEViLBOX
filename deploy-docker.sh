#!/bin/bash
set -e

# DEViLBOX Docker Deployment Script
# Usage: ./deploy-docker.sh [server-ip]

SERVER_IP=${1:-89.167.21.154}
SERVER_USER="root"
DEPLOY_DIR="/var/www/devilbox"

echo "🚀 Deploying DEViLBOX to $SERVER_IP"

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}Step 1: Creating deployment archive...${NC}"
# Create temporary directory for deployment files
rm -rf /tmp/devilbox-deploy
mkdir -p /tmp/devilbox-deploy

# Copy necessary files
cp Dockerfile.frontend /tmp/devilbox-deploy/
cp Dockerfile.backend /tmp/devilbox-deploy/
cp docker-compose.yml /tmp/devilbox-deploy/
cp .dockerignore /tmp/devilbox-deploy/
cp -r nginx /tmp/devilbox-deploy/
cp -r server /tmp/devilbox-deploy/
cp -r src /tmp/devilbox-deploy/
cp -r public /tmp/devilbox-deploy/
cp -r scripts /tmp/devilbox-deploy/
cp -r assembly /tmp/devilbox-deploy/
cp package*.json /tmp/devilbox-deploy/
cp tsconfig*.json /tmp/devilbox-deploy/
cp vite.config.ts /tmp/devilbox-deploy/
cp index.html /tmp/devilbox-deploy/
cp tailwind.config.js /tmp/devilbox-deploy/ 2>/dev/null || true
cp postcss.config.js /tmp/devilbox-deploy/ 2>/dev/null || true
cp .env.docker.example /tmp/devilbox-deploy/

echo -e "${GREEN}✓ Archive created${NC}"

echo -e "${YELLOW}Step 2: Uploading to server...${NC}"
# Upload to server
ssh $SERVER_USER@$SERVER_IP "mkdir -p $DEPLOY_DIR"
rsync -avz --delete /tmp/devilbox-deploy/ $SERVER_USER@$SERVER_IP:$DEPLOY_DIR/

echo -e "${GREEN}✓ Files uploaded${NC}"

echo -e "${YELLOW}Step 3: Setting up environment on server...${NC}"
# Setup on server
ssh $SERVER_USER@$SERVER_IP << 'ENDSSH'
cd /var/www/devilbox

# Generate JWT secret if .env doesn't exist
if [ ! -f .env ]; then
  echo "JWT_SECRET=$(openssl rand -hex 32)" > .env
  echo "✓ Generated .env file with JWT secret"
fi

# Create data directory
mkdir -p data/public/songs data/public/instruments

echo "✓ Environment configured"
ENDSSH

echo -e "${GREEN}✓ Server configured${NC}"

echo -e "${YELLOW}Step 4: Building and starting containers...${NC}"
# Build and start containers
ssh $SERVER_USER@$SERVER_IP << 'ENDSSH'
cd /var/www/devilbox

# Pull base images
docker compose pull || true

# Build containers
docker compose build

# Stop old containers
docker compose down

# Start new containers
docker compose up -d

# Wait for health checks
echo "Waiting for services to be healthy..."
sleep 10

# Check status
docker compose ps

echo "✓ Containers started"
ENDSSH

echo -e "${GREEN}✓ Docker containers running${NC}"

echo -e "${YELLOW}Step 5: Checking health...${NC}"
sleep 5
ssh $SERVER_USER@$SERVER_IP "docker exec devilbox-backend wget -q -O- http://localhost:3001/api/health && echo '✓ Backend healthy'"

echo ""
echo -e "${GREEN}🎉 Deployment complete!${NC}"
echo ""
echo "Next steps:"
echo "1. Configure DNS: devilbox.uprough.net → $SERVER_IP"
echo "2. Install SSL: ssh $SERVER_USER@$SERVER_IP 'docker exec devilbox-frontend certbot --nginx -d devilbox.uprough.net'"
echo "3. Test: https://devilbox.uprough.net"
echo ""
echo "Useful commands:"
echo "  View logs:    ssh $SERVER_USER@$SERVER_IP 'docker compose -f $DEPLOY_DIR/docker-compose.yml logs -f'"
echo "  Restart:      ssh $SERVER_USER@$SERVER_IP 'docker compose -f $DEPLOY_DIR/docker-compose.yml restart'"
echo "  Stop:         ssh $SERVER_USER@$SERVER_IP 'docker compose -f $DEPLOY_DIR/docker-compose.yml down'"

# Cleanup
rm -rf /tmp/devilbox-deploy
