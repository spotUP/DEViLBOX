/**
 * Song loudness for the Selecta player. hash = 32 lowercase hex MD5 of the song file bytes.
 *
 * GET /api/loudness/:hash  public. 200 {hash, lufs, peakDb, method, count}, 404 {error}, 400 {error}.
 * PUT /api/loudness/:hash  Bearer JWT. Body {lufs, peakDb, method, durationMs?, analyser?}.
 *   One row per (user, hash), upserted. Replies with the same shape as GET.
 *
 * The reply is the median of the r128 rows; rms rows are used only when no r128 row exists.
 * count = number of rows behind the reported method.
 */

import { Router, Response } from 'express';
import type Database from 'better-sqlite3';
import db from '../db/database';
import { authenticateToken, type AuthRequest } from '../middleware/auth';

export type LoudnessMethod = 'r128' | 'rms';
export interface LoudnessReply { hash: string; lufs: number; peakDb: number; method: LoudnessMethod; count: number }

const HASH_RE = /^[0-9a-f]{32}$/;

function median(values: number[]): number {
  const v = [...values].sort((a, b) => a - b);
  const mid = v.length >> 1;
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}

export function createLoudnessRouter(database: Database.Database = db): Router {
  const router = Router();
  const rows = database.prepare('SELECT lufs, peak_db AS peakDb, method FROM song_loudness WHERE hash = ?');
  const upsert = database.prepare(`
    INSERT INTO song_loudness (user_id, hash, lufs, peak_db, method, duration_ms, analyser, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id, hash) DO UPDATE SET
      lufs = excluded.lufs, peak_db = excluded.peak_db, method = excluded.method,
      duration_ms = excluded.duration_ms, analyser = excluded.analyser, updated_at = excluded.updated_at
  `);

  const read = (hash: string): LoudnessReply | null => {
    const all = rows.all(hash) as { lufs: number; peakDb: number; method: LoudnessMethod }[];
    const r128 = all.filter((r) => r.method === 'r128');
    const use = r128.length ? r128 : all;
    if (!use.length) return null;
    return {
      hash,
      lufs: median(use.map((r) => r.lufs)),
      peakDb: median(use.map((r) => r.peakDb)),
      method: use[0].method,
      count: use.length,
    };
  };

  const inRange = (v: unknown, lo: number, hi: number): v is number =>
    typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;

  router.get('/:hash', (req, res: Response) => {
    const hash = req.params.hash;
    if (!HASH_RE.test(hash)) return res.status(400).json({ error: 'hash must be 32 lowercase hex characters' });
    const out = read(hash);
    if (!out) return res.status(404).json({ error: 'unknown hash' });
    res.json(out);
  });

  router.put('/:hash', authenticateToken as any, (req: AuthRequest, res: Response) => {
    const hash = req.params.hash;
    if (!HASH_RE.test(hash)) return res.status(400).json({ error: 'hash must be 32 lowercase hex characters' });
    const { lufs, peakDb, method, durationMs, analyser } = req.body ?? {};
    if (!inRange(lufs, -70, 0)) return res.status(400).json({ error: 'lufs must be a number in [-70, 0]' });
    if (!inRange(peakDb, -120, 6)) return res.status(400).json({ error: 'peakDb must be a number in [-120, 6]' });
    if (method !== 'r128' && method !== 'rms') return res.status(400).json({ error: 'method must be "r128" or "rms"' });
    if (analyser !== undefined && (typeof analyser !== 'string' || analyser.length > 64)) {
      return res.status(400).json({ error: 'analyser must be a string of at most 64 characters' });
    }
    if (durationMs !== undefined && !(Number.isInteger(durationMs) && durationMs >= 0)) {
      return res.status(400).json({ error: 'durationMs must be a non-negative integer' });
    }
    const now = Date.now();
    upsert.run(req.userId, hash, lufs, peakDb, method, durationMs ?? null, analyser ?? null, now, now);
    res.json(read(hash));
  });

  return router;
}

export default createLoudnessRouter();
