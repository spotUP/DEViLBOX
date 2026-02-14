# DEViLBOX Server API

Backend API for DEViLBOX authentication and file management.

## Features

- User authentication (signup/login with JWT)
- File management (save/load songs and instruments)
- Automatic user directory creation with symlinks to demo content
- SQLite database for user accounts and file metadata
- Rate limiting and security
- CORS support for frontend integration

## Directory Structure

```
/var/www/devilbox/data/
├── public/                    # Shared demo content (read-only)
│   ├── songs/
│   └── instruments/
└── users/
    └── {userId}/
        ├── demo -> ../../public/   # Symlink to demos
        ├── songs/                  # User's songs
        └── instruments/            # User's instruments
```

## Local Development

```bash
# Install dependencies
npm install

# Create .env file
cp .env.example .env

# Run in development mode
npm run dev
```

## Production Deployment on Hetzner

### 1. Upload Server Code

```bash
# From your local machine
cd /Users/spot/Code/DEViLBOX
scp -r server root@your-server-ip:/var/www/devilbox/
```

### 2. Install Dependencies

```bash
# On server
ssh root@your-server-ip
cd /var/www/devilbox/server
npm install --production
```

### 3. Configure Environment

```bash
# Create .env file
nano .env
```

Add:
```env
PORT=3001
NODE_ENV=production
JWT_SECRET=generate-a-random-secret-here
CORS_ORIGIN=https://devilbox.uprough.net
DATA_ROOT=/var/www/devilbox/data
DB_DIR=/var/www/devilbox/server/data
```

### 4. Build TypeScript

```bash
npm run build
```

### 5. Create Systemd Service

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
systemctl daemon-reload
systemctl enable devilbox-api
systemctl start devilbox-api
systemctl status devilbox-api
```

### 6. Update Nginx Configuration

```bash
nano /etc/nginx/sites-available/devilbox
```

Add API proxy:
```nginx
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
}
```

Reload nginx:
```bash
nginx -t
systemctl reload nginx
```

## API Endpoints

### Authentication

- `POST /api/auth/signup` - Create new account
  - Body: `{ username, password }`
  - Returns: `{ token, user }`

- `POST /api/auth/login` - Login
  - Body: `{ username, password }`
  - Returns: `{ token, user }`

### Files (Requires Authentication)

- `GET /api/files?type=songs` - List user's files
- `GET /api/files/:id` - Get file content
- `POST /api/files` - Save file
  - Body: `{ filename, data, type }`
- `PUT /api/files/:id` - Update file
- `DELETE /api/files/:id` - Delete file

### Public Demo Content

- `GET /data/public/songs/` - List demo songs
- `GET /data/public/instruments/` - List demo instruments

## Security

- Passwords are hashed with bcrypt
- JWT tokens expire after 30 days
- Rate limiting on all API endpoints
- Stricter rate limiting on auth endpoints
- Path traversal protection
- CORS configured for frontend domain only
