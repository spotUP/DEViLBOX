# DEViLBOX Deployment Guide

Complete guide for deploying DEViLBOX to Hetzner with subdomain `devilbox.uprough.net`

## System Architecture

### Three Operating Modes

1. **Electron (Desktop App)**
   - Local filesystem access
   - No account needed
   - Save anywhere on computer

2. **Web Browser (Anonymous)**
   - File System Access API or downloads
   - Can load demo files from server
   - No server storage

3. **Web Browser (Authenticated)**
   - Server storage with user account
   - Sync across devices
   - Access to demo library

### Server Structure

```
/var/www/devilbox/
├── dist/                      # Frontend build (from npm run build)
├── server/                    # Backend API
│   ├── src/                   # TypeScript source
│   ├── dist/                  # Compiled JavaScript
│   ├── data/                  # SQLite database
│   └── node_modules/
└── data/                      # User files
    ├── public/                # Demo content (symlinked to all users)
    │   ├── songs/
    │   └── instruments/
    └── users/
        └── {userId}/
            ├── demo -> ../../public/
            ├── songs/
            └── instruments/
```

## Prerequisites

- Hetzner server with Ubuntu/Debian
- Node.js 18+ installed
- Nginx installed
- Domain configured (uprough.net with A record for devilbox subdomain)

## Step 1: Build Frontend for Production

```bash
# On your local machine
cd /Users/spot/Code/DEViLBOX

# Update vite.config.ts - set base to '/'
# (Already done - using root path for subdomain)

# Build
npm run build
```

## Step 2: Deploy Frontend

```bash
# Upload built files to server
scp -r dist/* root@your-server-ip:/var/www/devilbox/dist/
```

## Step 3: Deploy Backend API

```bash
# Upload server code
scp -r server root@your-server-ip:/var/www/devilbox/

# SSH into server
ssh root@your-server-ip

# Install dependencies
cd /var/www/devilbox/server
npm install --production

# Create .env file
nano .env
```

Add to `.env`:
```env
PORT=3001
NODE_ENV=production
JWT_SECRET=$(openssl rand -hex 32)
CORS_ORIGIN=https://devilbox.uprough.net
DATA_ROOT=/var/www/devilbox/data
DB_DIR=/var/www/devilbox/server/data
```

```bash
# Build TypeScript
npm run build

# Test server
npm start
# Press Ctrl+C after verifying it starts
```

## Step 4: Create Systemd Service

```bash
nano /etc/systemd/system/devilbox-api.service
```

Add:
```ini
[Unit]
Description=DEViLBOX API Server
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/var/www/devilbox/server
ExecStart=/usr/bin/node dist/index.js
Restart=on-failure
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

Enable and start:
```bash
# Set permissions
chown -R www-data:www-data /var/www/devilbox

# Start service
systemctl daemon-reload
systemctl enable devilbox-api
systemctl start devilbox-api

# Check status
systemctl status devilbox-api
journalctl -u devilbox-api -f
```

## Step 5: Configure Nginx

```bash
nano /etc/nginx/sites-available/devilbox
```

Complete nginx configuration:
```nginx
server {
    listen 80;
    server_name devilbox.uprough.net;

    root /var/www/devilbox/dist;
    index index.html;

    # Frontend - SPA routing
    location / {
        try_files $uri $uri/ /index.html;
    }

    # API proxy
    location /api/ {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Increase body size for file uploads
        client_max_body_size 10M;
    }

    # Public demo files (read-only)
    location /data/public/ {
        alias /var/www/devilbox/data/public/;
        autoindex on;
        autoindex_format json;

        # CORS headers
        add_header Access-Control-Allow-Origin *;
        add_header Access-Control-Allow-Methods 'GET, OPTIONS';

        # Cache control
        expires 1h;
    }

    # Static asset caching
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|wasm|json)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # Prevent access to hidden files
    location ~ /\. {
        deny all;
    }
}
```

Enable and test:
```bash
ln -s /etc/nginx/sites-available/devilbox /etc/nginx/sites-enabled/
nginx -t
systemctl reload nginx
```

## Step 6: SSL Certificate (Let's Encrypt)

```bash
apt install certbot python3-certbot-nginx
certbot --nginx -d devilbox.uprough.net

# Test auto-renewal
certbot renew --dry-run
```

## Step 7: DNS Configuration

In your domain registrar (for uprough.net):
- Add A record: `devilbox` → Your Hetzner server IP
- Wait for DNS propagation (up to 24 hours, usually 5-10 minutes)

Test DNS:
```bash
dig devilbox.uprough.net
```

## Step 8: Add Demo Content

```bash
# Create demo songs
cd /var/www/devilbox/data/public/songs
# Upload demo .devilbox files here

# Create demo instruments
cd /var/www/devilbox/data/public/instruments
# Upload demo .json instrument files here

# Set permissions
chown -R www-data:www-data /var/www/devilbox/data
chmod -R 755 /var/www/devilbox/data/public
```

## Step 9: Environment Variables for Frontend

Add to your local `.env` file:
```env
VITE_API_URL=https://devilbox.uprough.net/api
```

Rebuild and redeploy:
```bash
npm run build
scp -r dist/* root@your-server-ip:/var/www/devilbox/dist/
```

## Deployment Checklist

- [ ] Frontend built with correct base URL
- [ ] Backend deployed and running
- [ ] Systemd service enabled and started
- [ ] Nginx configured correctly
- [ ] SSL certificate installed
- [ ] DNS A record configured
- [ ] Demo content uploaded
- [ ] Permissions set correctly
- [ ] API health endpoint accessible: `https://devilbox.uprough.net/api/health`

## Updating the App

### Frontend Update
```bash
# Local
npm run build
scp -r dist/* root@server-ip:/var/www/devilbox/dist/
```

### Backend Update
```bash
# Upload changes
scp -r server/src root@server-ip:/var/www/devilbox/server/

# On server
cd /var/www/devilbox/server
npm run build
systemctl restart devilbox-api
```

## Monitoring

```bash
# Check API logs
journalctl -u devilbox-api -f

# Check Nginx logs
tail -f /var/log/nginx/access.log
tail -f /var/log/nginx/error.log

# Check API status
systemctl status devilbox-api

# Test endpoints
curl https://devilbox.uprough.net/api/health
```

## Troubleshooting

### API not accessible
```bash
systemctl status devilbox-api
journalctl -u devilbox-api --since "10 minutes ago"
```

### Database issues
```bash
cd /var/www/devilbox/server
ls -la data/
# Database should be owned by www-data
```

### Permissions issues
```bash
chown -R www-data:www-data /var/www/devilbox
chmod -R 755 /var/www/devilbox/data
```

### CORS errors
Check `.env` file has correct `CORS_ORIGIN`

## Security Notes

- JWT secret is randomly generated - keep it safe
- Database is SQLite file - backup regularly
- User directories are isolated
- Rate limiting enabled on API
- Demo files are read-only (symlinked)
