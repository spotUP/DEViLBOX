/**
 * HVSC routes - Browse, search, and download C64 SID tunes from HVSC mirrors
 *
 * No auth required (public data). Rate-limited download proxy with server-side caching.
 */

import { Router, Request, Response } from 'express';
import axios from 'axios';
import NodeCache from 'node-cache';

const router = Router();

// HVSC HTTP mirrors
const HVSC_MIRRORS = [
  'https://www.hvsc.c64.org/download/C64Music',
  'https://kohina.duckdns.org/HVSC/C64Music',
];

// Cache for directory listings (TTL: 1 hour)
const directoryCache = new NodeCache({ stdTTL: 3600 });

// Cache for downloaded .sid files (TTL: 24 hours)
const fileCache = new NodeCache({ stdTTL: 86400, maxKeys: 1000 });

// Download rate limiting (10/min sliding window)
const downloadTimestamps: number[] = [];
const MAX_DOWNLOADS_PER_MINUTE = 10;

function isRateLimited(): boolean {
  const now = Date.now();
  const oneMinuteAgo = now - 60_000;
  
  // Remove old timestamps
  while (downloadTimestamps.length > 0 && downloadTimestamps[0] < oneMinuteAgo) {
    downloadTimestamps.shift();
  }
  
  return downloadTimestamps.length >= MAX_DOWNLOADS_PER_MINUTE;
}

function recordDownload() {
  downloadTimestamps.push(Date.now());
}

// ── GET /api/hvsc/stats ─────────────────────────────────────────────────────

router.get('/stats', (_req: Request, res: Response) => {
  // Return hardcoded stats (real stats would require indexing)
  res.json({
    totalFiles: 80000,
    totalSize: 50 * 1024 * 1024 * 1024, // ~50 GB
  });
});

// ── GET /api/hvsc/featured ──────────────────────────────────────────────────

router.get('/featured', (_req: Request, res: Response) => {
  // Return curated list of classics (paths use full HVSC directory structure)
  const featured = [
    { name: 'Commando.sid', path: 'MUSICIANS/H/Hubbard_Rob/Commando.sid', isDirectory: false, size: 4096 },
    { name: 'Ninja.sid', path: 'MUSICIANS/H/Hubbard_Rob/Ninja.sid', isDirectory: false, size: 4096 },
    { name: 'Monty_on_the_Run.sid', path: 'MUSICIANS/H/Hubbard_Rob/Monty_on_the_Run.sid', isDirectory: false, size: 4096 },
    { name: 'Delta.sid', path: 'MUSICIANS/H/Hubbard_Rob/Delta.sid', isDirectory: false, size: 4096 },
    { name: 'Sanxion.sid', path: 'MUSICIANS/H/Hubbard_Rob/Sanxion.sid', isDirectory: false, size: 4096 },
    { name: 'International_Karate.sid', path: 'MUSICIANS/H/Hubbard_Rob/International_Karate.sid', isDirectory: false, size: 4096 },
    { name: 'Crazy_Comets.sid', path: 'MUSICIANS/H/Hubbard_Rob/Crazy_Comets.sid', isDirectory: false, size: 4096 },
    { name: 'Parallax.sid', path: 'MUSICIANS/G/Galway_Martin/Parallax.sid', isDirectory: false, size: 4096 },
    { name: 'Wizball.sid', path: 'MUSICIANS/G/Galway_Martin/Wizball.sid', isDirectory: false, size: 4096 },
    { name: 'Green_Beret.sid', path: 'MUSICIANS/G/Galway_Martin/Green_Beret.sid', isDirectory: false, size: 4096 },
    { name: 'Arkanoid.sid', path: 'MUSICIANS/G/Galway_Martin/Arkanoid.sid', isDirectory: false, size: 4096 },
    { name: 'Cybernoid_II.sid', path: 'MUSICIANS/T/Tel_Jeroen/Cybernoid_II.sid', isDirectory: false, size: 4096 },
  ];
  
  res.json({ entries: featured });
});

// ── GET /api/hvsc/browse?path=... ───────────────────────────────────────────

router.get('/browse', async (req: Request, res: Response) => {
  try {
    const path = (req.query.path as string) || '';
    
    // Check cache first
    const cacheKey = `browse:${path}`;
    const cached = directoryCache.get<any>(cacheKey);
    if (cached) {
      return res.json(cached);
    }
    
    // HVSC mirrors don't provide directory listings via HTTP
    // In a full implementation, this would:
    // 1. Maintain a local directory tree (scraped/indexed once)
    // 2. Or use HVSC FTP for directory listings
    // 3. Or use a pre-built directory index file
    
    // For now, return a minimal root directory structure
    if (!path) {
      const rootDirs = [
        { name: 'DEMOS', path: 'DEMOS', isDirectory: true },
        { name: 'GAMES', path: 'GAMES', isDirectory: true },
        { name: 'MUSICIANS', path: 'MUSICIANS', isDirectory: true },
      ];
      
      const result = { entries: rootDirs, path: '', parent: undefined };
      directoryCache.set(cacheKey, result);
      return res.json(result);
    }
    
    // For subdirectories, fetch listing from mirror
    let entries: any[] = [];
    for (const mirror of HVSC_MIRRORS) {
      try {
        const url = `${mirror}/${path}/`;
        const response = await axios.get(url, { timeout: 8000, responseType: 'text' });
        const lines = (response.data as string).split('\n').filter((l: string) => l.trim());
        entries = lines.map((name: string) => {
          const trimmed = name.trim();
          const isFile = trimmed.endsWith('.sid') || trimmed.endsWith('.mus') || trimmed.endsWith('.str');
          return {
            name: trimmed,
            path: path ? `${path}/${trimmed}` : trimmed,
            isDirectory: !isFile,
            ...(isFile ? { size: 0 } : {}),
          };
        });
        break;
      } catch {
        // Try next mirror
      }
    }

    const result = { entries, path, parent: path.split('/').slice(0, -1).join('/') || undefined };
    if (entries.length > 0) directoryCache.set(cacheKey, result);
    res.json(result);
    
  } catch (err) {
    console.error('[HVSC] Browse error:', err);
    res.status(500).json({ error: 'Failed to browse directory' });
  }
});

// ── GET /api/hvsc/search?q=...&limit=...&offset=... ─────────────────────────

router.get('/search', async (req: Request, res: Response) => {
  try {
    const query = (req.query.q as string) || '';
    const limit = parseInt(req.query.limit as string) || 100;
    const offset = parseInt(req.query.offset as string) || 0;
    
    if (!query) {
      return res.json({ results: [] });
    }
    
    // In a full implementation, this would search a local index
    // For now, return empty (would need HVSC directory indexing)
    res.json({ results: [] });
    
  } catch (err) {
    console.error('[HVSC] Search error:', err);
    res.status(500).json({ error: 'Search failed' });
  }
});

// ── GET /api/hvsc/download?path=... ─────────────────────────────────────────

router.get('/download', async (req: Request, res: Response) => {
  try {
    const path = req.query.path as string;
    
    if (!path) {
      return res.status(400).json({ error: 'Missing path parameter' });
    }
    
    // Check cache first
    const cached = fileCache.get<Buffer>(path);
    if (cached) {
      console.log('[HVSC] Cache hit:', path);
      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Cache-Control', 'public, max-age=86400');
      return res.send(cached);
    }
    
    // Rate limit
    if (isRateLimited()) {
      return res.status(429).json({ error: 'Rate limit exceeded. Try again in a minute.' });
    }
    
    // Try mirrors in order
    let buffer: Buffer | null = null;
    let successMirror: string | null = null;
    
    for (const mirror of HVSC_MIRRORS) {
      try {
        const url = `${mirror}/${path}`;
        console.log('[HVSC] Trying mirror:', url);
        
        const response = await axios.get(url, {
          responseType: 'arraybuffer',
          timeout: 10000,
        });
        
        buffer = Buffer.from(response.data);
        successMirror = mirror;
        break;
      } catch (err) {
        console.warn(`[HVSC] Mirror ${mirror} failed:`, err instanceof Error ? err.message : err);
      }
    }
    
    if (!buffer || !successMirror) {
      return res.status(404).json({ error: 'File not found on any mirror' });
    }
    
    // Cache and record download
    fileCache.set(path, buffer);
    recordDownload();
    
    console.log('[HVSC] Downloaded from', successMirror, '- Size:', buffer.length, 'bytes');
    
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(buffer);
    
  } catch (err) {
    console.error('[HVSC] Download error:', err);
    res.status(500).json({ error: 'Download failed' });
  }
});

export default router;
