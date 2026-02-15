# Development Scripts

## Quick Start

### Frontend Only
```bash
npm run dev
```
Starts only the Vite frontend server on port 5173.

### Full Stack (Frontend + Backend)
```bash
npm run dev:fullstack
# or directly:
./dev.sh
```
Starts both servers:
- Frontend (Vite) on port 5173
- Backend (Express API) on port 3001

Logs are written to `logs/frontend.log` and `logs/backend.log`.

Press Ctrl+C to stop both servers.

### Full Stack with Auto-Restart
```bash
npm run dev:persistent
# or directly:
./dev-persistent.sh
```
Same as `dev:fullstack` but automatically restarts the frontend server if it gets killed by OOM (out of memory).

## Backend Server

The backend is located in the `server/` directory and provides:
- `/api/files/*` - File browser API for loading songs/samples
- `/api/auth/*` - Authentication endpoints (for future cloud sync)

### Backend Dependencies

Dependencies are automatically installed by the dev scripts. To manually install:
```bash
cd server && npm install
```

### Running Backend Separately

```bash
cd server
npm run dev    # Development mode (auto-reload)
npm run build  # Build TypeScript
npm start      # Production mode
```

## Logs

When using the full-stack scripts, logs are written to:
- `logs/frontend.log` - Vite dev server output
- `logs/backend.log` - Express API server output

## Environment Variables

Backend configuration (optional):
- `PORT` - Backend port (default: 3001)
- `JWT_SECRET` - JWT signing secret (auto-generated if not set)
- `DATA_DIR` - Data directory path (default: ../public/data)

See `server/.env.example` for more options.
