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
      return res.json({ results: [], total: 0 });
    }
    
    // Search the DeepSID database's hvsc_files table for HVSC content
    try {
      const { getDeepSIDDb } = await import('../db/deepsidDb');
      const db = getDeepSIDDb();
      if (db) {
        const countRow = db.prepare(`
          SELECT COUNT(*) as cnt FROM hvsc_files
          WHERE fullname LIKE ? OR name LIKE ? OR author LIKE ? OR copyright LIKE ?
        `).get(`%${query}%`, `%${query}%`, `%${query}%`, `%${query}%`) as { cnt: number };

        const rows = db.prepare(`
          SELECT id, fullname, name, author, player, sidmodel, clockspeed, subtunes
          FROM hvsc_files
          WHERE fullname LIKE ? OR name LIKE ? OR author LIKE ? OR copyright LIKE ?
          ORDER BY fullname
          LIMIT ? OFFSET ?
        `).all(`%${query}%`, `%${query}%`, `%${query}%`, `%${query}%`, limit, offset) as any[];

        // Enrich with ratings from main database
        const mainDb = (await import('../db/database')).default;
        const paths = rows.map((r: any) => normalizeHVSCPath(r.fullname));
        const ratingsMap: Record<string, { avg_rating: number; vote_count: number }> = {};
        if (paths.length > 0) {
          const ratingRows = mainDb.prepare(`
            SELECT item_key, AVG(rating) as avg_rating, COUNT(*) as vote_count
            FROM module_ratings WHERE source = 'hvsc' AND item_key IN (SELECT value FROM json_each(?))
            GROUP BY item_key
          `).all(JSON.stringify(paths)) as { item_key: string; avg_rating: number; vote_count: number }[];
          for (const rr of ratingRows) {
            ratingsMap[rr.item_key] = { avg_rating: rr.avg_rating, vote_count: rr.vote_count };
          }
        }

        return res.json({
          total: countRow.cnt,
          results: rows.map((r: any) => {
            const p = normalizeHVSCPath(r.fullname);
            const rating = ratingsMap[p];
            return {
              name: r.name || r.fullname.split('/').pop(),
              path: p,
              isDirectory: false,
              author: r.author,
              player: r.player,
              sidModel: r.sidmodel,
              subtunes: r.subtunes,
              avg_rating: rating ? Math.round(rating.avg_rating * 100) / 100 : undefined,
              vote_count: rating?.vote_count,
            };
          }),
        });
      }
    } catch { /* DeepSID DB not available */ }
    
    res.json({ results: [], total: 0 });
    
  } catch (err) {
    console.error('[HVSC] Search error:', err);
    res.status(500).json({ error: 'Search failed' });
  }
});

// Normalize HVSC paths from various sources into mirror-relative paths.
// DeepSID DB stores: "_High Voltage SID Collection/MUSICIANS/H/Hubbard_Rob/Commando.sid"
// Mirrors expect:    "MUSICIANS/H/Hubbard_Rob/Commando.sid"  (after C64Music/ base)
function normalizeHVSCPath(raw: string): string {
  let p = raw;
  // Strip DeepSID database prefix
  const hvscPrefix = '_High Voltage SID Collection/';
  if (p.startsWith(hvscPrefix)) p = p.slice(hvscPrefix.length);
  // Strip alternate CGSC prefix
  const cgscPrefix = "_Compute's Gazette SID Collection/";
  if (p.startsWith(cgscPrefix)) p = p.slice(cgscPrefix.length);
  return p;
}

// ── GET /api/hvsc/download?path=... ─────────────────────────────────────────

router.get('/download', async (req: Request, res: Response) => {
  try {
    const rawPath = req.query.path as string;
    
    if (!rawPath) {
      return res.status(400).json({ error: 'Missing path parameter' });
    }
    
    const normalizedPath = normalizeHVSCPath(rawPath);
    
    // Check cache first
    const cached = fileCache.get<Buffer>(normalizedPath);
    if (cached) {
      console.log('[HVSC] Cache hit:', normalizedPath);
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
        const url = `${mirror}/${normalizedPath}`;
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
    fileCache.set(normalizedPath, buffer);
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
