/**
 * Song lyrics for the Selecta player. md5 = 32 lowercase hex MD5 of the song file bytes.
 *
 * GET  /api/lyrics/:md5  public. 200 raw LRC text (text/plain; charset=utf-8), 404 unknown, 400 bad md5.
 * POST /api/lyrics/:md5  Bearer JWT (same auth as PUT /api/loudness/:hash). Body is the raw LRC text,
 *   1 byte to 64 KiB. Upsert: an existing row is overwritten (last writer wins). 204 on success,
 *   401 without auth, 400 for a bad md5 or an empty/oversized body.
 */

import { Router, Response, Request, NextFunction } from 'express';
import express from 'express';
import type Database from 'better-sqlite3';
import db from '../db/database';
import { authenticateToken, type AuthRequest } from '../middleware/auth';

export const MAX_LYRICS_BYTES = 64 * 1024;
const MD5_RE = /^[0-9a-f]{32}$/;
const BAD_MD5 = 'md5 must be 32 lowercase hex characters';

export function createLyricsRouter(database: Database.Database = db): Router {
  const router = Router();
  const read = database.prepare('SELECT lrc FROM song_lyrics WHERE md5 = ?');
  const upsert = database.prepare(`
    INSERT INTO song_lyrics (md5, lrc, user_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(md5) DO UPDATE SET lrc = excluded.lrc, user_id = excluded.user_id, updated_at = excluded.updated_at
  `);

  router.get('/:md5', (req, res: Response) => {
    const md5 = req.params.md5;
    if (!MD5_RE.test(md5)) return res.status(400).json({ error: BAD_MD5 });
    const row = read.get(md5) as { lrc: string } | undefined;
    if (!row) return res.status(404).json({ error: 'unknown md5' });
    res.type('text/plain; charset=utf-8').send(row.lrc);
  });

  // Auth and md5 checks run before the body is read; any content type is taken as text.
  router.post(
    '/:md5',
    authenticateToken as any,
    (req: Request, res: Response, next: NextFunction) => {
      if (!MD5_RE.test(req.params.md5)) return res.status(400).json({ error: BAD_MD5 });
      next();
    },
    express.text({ type: () => true, limit: MAX_LYRICS_BYTES }),
    (req: AuthRequest, res: Response) => {
      const lrc = typeof req.body === 'string' ? req.body : '';
      if (!lrc.trim()) return res.status(400).json({ error: 'body must be non-empty LRC text' });
      const now = Date.now();
      upsert.run(req.params.md5, lrc, req.userId, now, now);
      res.status(204).end();
    },
    (err: { type?: string }, _req: Request, res: Response, next: NextFunction) => {
      if (err?.type === 'entity.too.large') return res.status(400).json({ error: `body exceeds ${MAX_LYRICS_BYTES} bytes` });
      next(err);
    },
  );

  return router;
}

export default createLyricsRouter();
