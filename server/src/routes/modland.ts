/**
 * Modland routes - Search, browse, and download tracker modules from ftp.modland.com
 *
 * No auth required (public data). Rate-limited download proxy with server-side caching.
 */

import { Router, Request, Response } from 'express';
import db from '../db/database';
import {
  getIndexStatus,
  getFormats,
  getCachedFile,
  cacheFile,
  forceReindex,
} from '../services/modlandIndexer';
import {
  findByHash,
  getSamplesBySongId,
  findByPatternHash,
  getHashDbStats,
} from '../services/modlandHash';

const router = Router();

// ── Download rate limiting (10/min sliding window to modland) ───────────────

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

// ── GET /api/modland/status ─────────────────────────────────────────────────

router.get('/status', (_req: Request, res: Response) => {
  try {
    const status = getIndexStatus();
    res.json(status);
  } catch (err) {
    console.error('[Modland] Status error:', err);
    res.status(500).json({ error: 'Failed to get status' });
  }
});

// ── POST /api/modland/reindex ────────────────────────────────────────────────

router.post('/reindex', async (_req: Request, res: Response) => {
  try {
    const status = getIndexStatus();
    if (status.status === 'indexing') {
      return res.status(409).json({ error: 'Already indexing' });
    }
    const count = await forceReindex();
    res.json({ success: true, totalFiles: count });
  } catch (err) {
    console.error('[Modland] Reindex error:', err);
    res.status(500).json({ error: 'Reindex failed' });
  }
});

// ── GET /api/modland/formats ────────────────────────────────────────────────

router.get('/formats', (_req: Request, res: Response) => {
  try {
    const formats = getFormats();
    res.json({ formats });
  } catch (err) {
    console.error('[Modland] Formats error:', err);
    res.status(500).json({ error: 'Failed to get formats' });
  }
});

// ── GET /api/modland/search ─────────────────────────────────────────────────

router.get('/search', (req: Request, res: Response) => {
  try {
    const q = (req.query.q as string || '').trim();
    const format = (req.query.format as string || '').trim();
    const author = (req.query.author as string || '').trim();
    const limit = Math.min(parseInt(req.query.limit as string, 10) || 50, 100);
    const offset = parseInt(req.query.offset as string, 10) || 0;

    let results: any[];

    if (q) {
      // FTS5 search with prefix matching
      // Escape double quotes in user input and apply prefix matching
      const sanitized = q.replace(/"/g, '').replace(/[*]/g, '');
      const terms = sanitized.split(/\s+/).filter(Boolean);
      const ftsQuery = terms.map((t) => `"${t}"*`).join(' ');

      let sql = `
        SELECT f.id, f.format, f.author, f.filename, f.full_path, f.extension
        FROM modland_fts fts
        JOIN modland_files f ON f.id = fts.rowid
        WHERE modland_fts MATCH ?
      `;
      const params: any[] = [ftsQuery];

      if (format) {
        sql += ' AND f.format = ?';
        params.push(format);
      }
      if (author) {
        sql += ' AND f.author = ?';
        params.push(author);
      }

      sql += ' ORDER BY rank LIMIT ? OFFSET ?';
      params.push(limit, offset);

      results = db.prepare(sql).all(...params);
    } else {
      // No text search — filter by format/author
      let sql = 'SELECT id, format, author, filename, full_path, extension FROM modland_files WHERE 1=1';
      const params: any[] = [];

      if (format) {
        sql += ' AND format = ?';
        params.push(format);
      }
      if (author) {
        sql += ' AND author = ?';
        params.push(author);
      }

      sql += ' ORDER BY author, filename LIMIT ? OFFSET ?';
      params.push(limit, offset);

      results = db.prepare(sql).all(...params);
    }

    res.json({ results, limit, offset, query: q });
  } catch (err) {
    console.error('[Modland] Search error:', err);
    res.status(500).json({ error: 'Search failed' });
  }
});

// ── GET /api/modland/download ───────────────────────────────────────────────

router.get('/download', async (req: Request, res: Response) => {
  try {
    const remotePath = (req.query.path as string || '').trim();

    // Security: must start with pub/modules/
    if (!remotePath.startsWith('pub/modules/')) {
      return res.status(400).json({ error: 'Invalid path' });
    }

    // Check server cache first
    const cached = getCachedFile(remotePath);
    if (cached) {
      const filename = remotePath.split('/').pop() || 'download';
      res.set({
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': cached.length.toString(),
      });
      return res.send(cached);
    }

    // Rate limit outbound requests to modland
    if (isRateLimited()) {
      return res.status(429).json({ error: 'Rate limited — try again in a moment' });
    }

    recordDownload();

    // Fetch from modland
    const url = `https://ftp.modland.com/${remotePath}`;
    console.log(`[Modland] Downloading: ${url}`);

    const response = await fetch(url);
    if (!response.ok) {
      return res.status(response.status).json({
        error: `Modland returned ${response.status}`,
      });
    }

    const buffer = Buffer.from(await response.arrayBuffer());

    // Cache for future requests
    cacheFile(remotePath, buffer);

    const filename = remotePath.split('/').pop() || 'download';
    res.set({
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': buffer.length.toString(),
    });
    res.send(buffer);
  } catch (err) {
    console.error('[Modland] Download error:', err);
    res.status(500).json({ error: 'Download failed' });
  }
});

// ── POST /api/modland/lookup-hash ───────────────────────────────────────────

router.post('/lookup-hash', (req: Request, res: Response) => {
  try {
    const { hash } = req.body;

    if (!hash || typeof hash !== 'string') {
      return res.status(400).json({ error: 'Hash required (SHA-256 hex string)' });
    }

    // Validate hash format (64 hex chars)
    if (!/^[a-f0-9]{64}$/i.test(hash)) {
      return res.status(400).json({ error: 'Invalid hash format (expected 64 hex chars)' });
    }

    const result = findByHash(hash.toLowerCase());
    res.json(result);
  } catch (err) {
    console.error('[Modland] Hash lookup error:', err);
    res.status(500).json({ error: 'Hash lookup failed' });
  }
});

// ── GET /api/modland/samples/:song_id ───────────────────────────────────────

router.get('/samples/:song_id', (req: Request, res: Response) => {
  try {
    const songId = parseInt(req.params.song_id, 10);

    if (isNaN(songId)) {
      return res.status(400).json({ error: 'Invalid song_id' });
    }

    const samples = getSamplesBySongId(songId);
    res.json({ samples });
  } catch (err) {
    console.error('[Modland] Samples query error:', err);
    res.status(500).json({ error: 'Samples query failed' });
  }
});

// ── GET /api/modland/pattern-matches/:pattern_hash ──────────────────────────

router.get('/pattern-matches/:pattern_hash', (req: Request, res: Response) => {
  try {
    const patternHash = parseInt(req.params.pattern_hash, 10);

    if (isNaN(patternHash)) {
      return res.status(400).json({ error: 'Invalid pattern_hash' });
    }

    const matches = findByPatternHash(patternHash);
    res.json({ matches });
  } catch (err) {
    console.error('[Modland] Pattern match error:', err);
    res.status(500).json({ error: 'Pattern match failed' });
  }
});

// ── GET /api/modland/hash-stats ─────────────────────────────────────────────

router.get('/hash-stats', (_req: Request, res: Response) => {
  try {
    const stats = getHashDbStats();
    res.json(stats);
  } catch (err) {
    console.error('[Modland] Hash stats error:', err);
    res.status(500).json({ error: 'Failed to get hash stats' });
  }
});

export default router;
