#!/bin/bash
#
# DEViLBOX Server Deployment Script
# Deploys server code and Modland hash database to production
#

set -e  # Exit on error

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
SERVER_IP="${DEVILBOX_SERVER_IP:-}"
SERVER_USER="${DEVILBOX_SERVER_USER:-root}"
SERVER_PATH="/var/www/devilbox"

echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}         DEViLBOX Server Deployment Script                  ${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo ""

# Check if server IP is set
if [ -z "$SERVER_IP" ]; then
    echo -e "${YELLOW}Enter server IP address:${NC}"
    read -r SERVER_IP
fi

echo -e "${BLUE}Target: ${GREEN}${SERVER_USER}@${SERVER_IP}:${SERVER_PATH}${NC}"
echo ""

# Step 1: Build server locally
echo -e "${BLUE}[1/6] Building server TypeScript...${NC}"
cd server
npm run build
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Server built successfully${NC}"
else
    echo -e "${RED}✗ Server build failed${NC}"
    exit 1
fi
cd ..
echo ""

# Step 2: Upload server code
echo -e "${BLUE}[2/6] Uploading server code...${NC}"
rsync -avz --exclude='node_modules' --exclude='data/modland_hash.db' \
    server/ "${SERVER_USER}@${SERVER_IP}:${SERVER_PATH}/server/"
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Server code uploaded${NC}"
else
    echo -e "${RED}✗ Upload failed${NC}"
    exit 1
fi
echo ""

# Step 3: Check if Modland DB needs upload
echo -e "${BLUE}[3/6] Checking Modland hash database...${NC}"
if [ -f "server/data/modland_hash.db" ]; then
    echo -e "${YELLOW}Found local modland_hash.db ($(du -h server/data/modland_hash.db | cut -f1))${NC}"
    echo -e "${YELLOW}Upload to server? (y/n)${NC}"
    read -r UPLOAD_DB
    
    if [ "$UPLOAD_DB" = "y" ]; then
        echo -e "${BLUE}Uploading modland_hash.db (this may take a while)...${NC}"
        scp server/data/modland_hash.db "${SERVER_USER}@${SERVER_IP}:${SERVER_PATH}/server/data/"
        if [ $? -eq 0 ]; then
            echo -e "${GREEN}✓ Database uploaded${NC}"
        else
            echo -e "${RED}✗ Database upload failed${NC}"
            exit 1
        fi
    else
        echo -e "${YELLOW}⊘ Skipping database upload${NC}"
    fi
else
    echo -e "${YELLOW}⚠ Local modland_hash.db not found${NC}"
    echo -e "${YELLOW}Ensure it exists on server at: ${SERVER_PATH}/server/data/modland_hash.db${NC}"
fi
echo ""

# Step 4: Install dependencies on server
echo -e "${BLUE}[4/6] Installing dependencies on server...${NC}"
ssh "${SERVER_USER}@${SERVER_IP}" << 'ENDSSH'
cd /var/www/devilbox/server
npm install --production
if [ $? -eq 0 ]; then
    echo "✓ Dependencies installed"
else
    echo "✗ Dependency installation failed"
    exit 1
fi
ENDSSH
echo ""

# Step 5: Restart service
echo -e "${BLUE}[5/6] Restarting devilbox-api service...${NC}"
ssh "${SERVER_USER}@${SERVER_IP}" << 'ENDSSH'
systemctl restart devilbox-api
sleep 2
systemctl status devilbox-api --no-pager
ENDSSH
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Service restarted${NC}"
else
    echo -e "${RED}✗ Service restart failed${NC}"
    exit 1
fi
echo ""

# Step 6: Test endpoints
echo -e "${BLUE}[6/6] Testing API endpoints...${NC}"
echo -e "${YELLOW}Testing health endpoint...${NC}"
curl -s "https://devilbox.uprough.net/api/health" | jq . || echo "Health endpoint test failed"
echo ""

echo -e "${YELLOW}Testing Modland hash stats...${NC}"
curl -s "https://devilbox.uprough.net/api/modland/hash-stats" | jq . || echo "Hash stats test failed"
echo ""

echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}✓ Deployment complete!${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "Server logs: ${BLUE}journalctl -u devilbox-api -f${NC}"
echo ""
