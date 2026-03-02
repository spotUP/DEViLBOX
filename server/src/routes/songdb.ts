/**
 * SongDB routes - Lookup song metadata by MD5 hash
 *
 * Uses the audacious-uade-tools database (~400K entries) to provide
 * author, album, year, format, channels, and duration information.
 *
 * No auth required (public data).
 */

import { Router, Request, Response } from 'express';
import { lookupHash, getSongDBStatus } from '../services/songdbIndexer';

const router = Router();

// ── GET /api/songdb/lookup?hash=<12-char-hex> ──────────────────────────────

router.get('/lookup', (req: Request, res: Response) => {
  try {
    const hash = (req.query.hash as string || '').trim().toLowerCase();

    if (!hash || hash.length !== 12 || !/^[0-9a-f]{12}$/.test(hash)) {
      return res.status(400).json({ error: 'Invalid hash — must be 12 hex characters' });
    }

    const result = lookupHash(hash);
    res.json(result);
  } catch (err) {
    console.error('[SongDB] Lookup error:', err);
    res.status(500).json({ error: 'Lookup failed' });
  }
});

// ── GET /api/songdb/status ─────────────────────────────────────────────────

router.get('/status', (_req: Request, res: Response) => {
  try {
    const status = getSongDBStatus();
    res.json(status);
  } catch (err) {
    console.error('[SongDB] Status error:', err);
    res.status(500).json({ error: 'Failed to get status' });
  }
});

export default router;
