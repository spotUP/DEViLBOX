/**
 * DEViLBOX Server - Auth and File Management API
 */

import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import authRoutes from './routes/auth';
import filesRoutes from './routes/files';
import modlandRoutes from './routes/modland';
import { initDatabase } from './db/database';
import { initDataDirectories } from './utils/fileSystem';
import { initModlandIndex, scheduleModlandUpdates } from './services/modlandIndexer';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP'
});
app.use('/api/', limiter);

// Stricter rate limit for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: 'Too many auth attempts, please try again later'
});
app.use('/api/auth/', authLimiter);

// Higher rate limit for modland browsing (public catalog search)
const modlandLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  message: 'Too many requests from this IP'
});
app.use('/api/modland/', modlandLimiter);

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/files', filesRoutes);
app.use('/api/modland', modlandRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

// Public demo file browsing (no auth required)
import fs from 'fs';
import path from 'path';

app.get('/api/demo/:type/*', (req, res) => {
  try {
    const { type } = req.params;
    const subpath = req.params[0] || '';

    // Only allow 'songs' or 'instruments'
    if (type !== 'songs' && type !== 'instruments') {
      return res.status(400).json({ error: 'Invalid type' });
    }

    const dataRoot = path.resolve(process.env.DATA_ROOT || '/var/www/devilbox/data');
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
app.use('/data/public', express.static(process.env.DATA_ROOT + '/public' || '/var/www/devilbox/data/public'));

// Error handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('[Server] Error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error'
  });
});

// Initialize database and file system
initDatabase();
initDataDirectories();

// Initialize Modland index (non-blocking — runs in background)
initModlandIndex().catch((err) => {
  console.error('[Modland] Init failed:', err);
});
scheduleModlandUpdates();

// Start server
app.listen(PORT, () => {
  console.log(`[Server] DEViLBOX API running on port ${PORT}`);
  console.log(`[Server] Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`[Server] Data root: ${process.env.DATA_ROOT || '/var/www/devilbox/data'}`);
});
