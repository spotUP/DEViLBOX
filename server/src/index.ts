/**
 * DEViLBOX Server - Auth and File Management API
 */

// Load environment variables FIRST — before any route modules read process.env constants
import 'dotenv/config';

// Initialize database tables BEFORE importing route modules — several routes
// call db.prepare() at module scope which fails if tables don't exist yet.
import { initDatabase } from './db/database';
initDatabase();

import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import authRoutes from './routes/auth';
import filesRoutes from './routes/files';
import modlandRoutes from './routes/modland';
import hvscRoutes from './routes/hvsc';
import songdbRoutes from './routes/songdb';
import scRoutes from './routes/sc';
import deepsidRoutes from './routes/deepsid';
import aiRoutes from './routes/ai';
import analysisRoutes from './routes/analysis';
import renderRoutes from './routes/render';
import djsetsRoutes from './routes/djsets';
import playlistsRoutes from './routes/playlists';
import ratingsRoutes from './routes/ratings';
import nksRoutes from './routes/nks';
import devilboxPresetRoutes from './routes/devilbox-presets';
import { handleStreamConnection, checkFfmpeg } from './routes/stream';
import { initDataDirectories } from './utils/fileSystem';
import { initModlandIndex, scheduleModlandUpdates } from './services/modlandIndexer';
import { initSongDB, scheduleSongDBUpdates } from './services/songdbIndexer';
import { startRelay as startMcpRelay } from './mcp/wsRelay';

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
function parseCorsOrigin(envVal: string | undefined): string | string[] | RegExp {
  if (!envVal || envVal === '*') return '*';
  // Support comma-separated list for multiple dev ports
  const parts = envVal.split(',').map(s => s.trim()).filter(Boolean);
  return parts.length === 1 ? parts[0] : parts;
}

app.use(cors({
  origin: parseCorsOrigin(process.env.CORS_ORIGIN),
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));

// Rate limiting
// Rate limiting only for auth endpoints (brute-force protection)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: 'Too many auth attempts, please try again later'
});
app.use('/api/auth/', authLimiter as unknown as express.RequestHandler);

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/files', filesRoutes);
app.use('/api/modland', modlandRoutes);
app.use('/api/hvsc', hvscRoutes);
app.use('/api/songdb', songdbRoutes);
app.use('/api/sc', scRoutes);
app.use('/api/deepsid', deepsidRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/analysis', analysisRoutes);
app.use('/api/render', express.raw({ type: 'application/octet-stream', limit: '10mb' }), renderRoutes);
app.use('/api/djsets', djsetsRoutes);
app.use('/api/playlists', playlistsRoutes);
app.use('/api/ratings', ratingsRoutes);
app.use('/api/nks', nksRoutes);
app.use('/api/devilbox-presets', devilboxPresetRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

// Local network IP for controller QR code pairing
app.get('/api/network/local-ip', (_req, res) => {
  const os = require('os');
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] ?? []) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return res.json({ ip: iface.address });
      }
    }
  }
  res.json({ ip: 'localhost' });
});

// Public demo file browsing (no auth required)
import fs from 'fs';
import path from 'path';

// Resolve data root once — works in both direct deploy (relative to dist/) and Docker
const dataRoot = path.resolve(process.env.DATA_ROOT || path.join(__dirname, '..', 'data'));

app.get('/api/demo/:type/*', (req, res) => {
  try {
    const { type } = req.params;
    const subpath = (req.params as Record<string, string>)[0] || '';

    // Only allow 'songs' or 'instruments'
    if (type !== 'songs' && type !== 'instruments') {
      return res.status(400).json({ error: 'Invalid type' });
    }

    const basePath = path.join(dataRoot, 'public', type);
    const targetPath = path.join(basePath, subpath);

    // Security: ensure path is within basePath
    if (!targetPath.startsWith(basePath)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    if (!fs.existsSync(targetPath)) {
      return res.status(404).json({ error: 'Not found' });
    }

    const stats = fs.statSync(targetPath);

    if (stats.isDirectory()) {
      // List directory contents
      const entries = fs.readdirSync(targetPath, { withFileTypes: true });
      const result = entries.map(entry => ({
        name: entry.name,
        isDirectory: entry.isDirectory(),
        path: subpath ? `${subpath}/${entry.name}` : entry.name,
        size: entry.isDirectory() ? undefined : fs.statSync(path.join(targetPath, entry.name)).size,
        modifiedAt: fs.statSync(path.join(targetPath, entry.name)).mtime.toISOString(),
      }));
      res.json(result);
    } else {
      // Return file
      res.sendFile(targetPath);
    }
  } catch (error) {
    console.error('[API] Demo file error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Static file serving for public demo content
app.use('/data/public', express.static(path.join(dataRoot, 'public')));

// Serve ONNX-WASM files with broad CORS so Workers on the Vite dev server
// (localhost:5173) can import them without Vite intercepting the URL.
// Vite's module server adds ?import to dynamic imports which breaks
// Emscripten's pthread sub-worker creation (import.meta.url gets mangled).
// Serving from Express (port 3011) keeps URLs clean and threading works.
app.use('/onnx-wasm', (req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  next();
}, express.static(path.join(__dirname, '../../public/onnx-wasm')));

// Error handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('[Server] Error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error'
  });
});

// Initialize file system (DB already initialized at top of file)
initDataDirectories();

// Initialize Modland index (non-blocking — runs in background)
initModlandIndex().catch((err) => {
  console.error('[Modland] Init failed:', err);
});
scheduleModlandUpdates();

// Initialize SongDB index (non-blocking — runs in background)
initSongDB().catch((err) => {
  console.error('[SongDB] Init failed:', err);
});
scheduleSongDBUpdates();

// Start MCP WebSocket relay (port 4003) so the AI panel can control any browser
startMcpRelay();

// Start server
const server = app.listen(PORT, () => {
  console.log(`[Server] DEViLBOX API running on port ${PORT}`);
  console.log(`[Server] Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`[Server] Data root: ${process.env.DATA_ROOT || '/var/www/devilbox/data'}`);
  if (checkFfmpeg()) {
    console.log(`[Server] ffmpeg available — live streaming enabled`);
  } else {
    console.log(`[Server] ffmpeg not found — live streaming disabled`);
  }
});

// WebSocket upgrade handler for live stream relay
server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url || '', `http://localhost:${PORT}`);
  if (url.pathname === '/api/stream/ingest') {
    const { WebSocketServer } = require('ws') as typeof import('ws');
    const wss = new WebSocketServer({ noServer: true });
    wss.handleUpgrade(req, socket, head, (ws) => {
      const streamKey = url.searchParams.get('key') || '';
      const platform = url.searchParams.get('platform') || 'youtube';
      handleStreamConnection(ws, streamKey, platform);
    });
  }
  // Other WebSocket upgrades (MCP relay) are handled by their own server on port 4003
});
