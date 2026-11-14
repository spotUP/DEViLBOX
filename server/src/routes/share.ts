/**
 * Share links: POST /api/share stores one song container (anonymous, per-IP rate limit),
 * GET /api/share/:id returns it. The stored bytes are immutable: there is no overwrite route,
 * and every upload makes a new id with its own owner key (only the key's sha256 is stored). A link lives 5 days from its last open.
 */
import { Router, Request, Response, RequestHandler } from 'express';
import express from 'express';
import rateLimit from 'express-rate-limit';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import type Database from 'better-sqlite3';
import db from '../db/database';

export const SHARE_MAX_BYTES = 8 * 1024 * 1024;
export const SHARE_TTL_MS = 5 * 24 * 60 * 60 * 1000;
export const SHARE_SWEEP_MS = 60 * 60 * 1000;
const SHARE_DIR_CAP_BYTES = 2 * 1024 * 1024 * 1024;
const ID_RE = /^[0-9A-Za-z]{8}$/;
const BASE62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

const defaultDir = () => path.join(process.env.DATA_ROOT || '/var/www/devilbox/data', 'share');

export interface ShareDeps {
  database: Database.Database;
  dir: () => string;
  now: () => number;
  /** Uploads per IP per hour. */
  perHour: number;
}

const newId = (): string => Array.from(crypto.randomBytes(8), (b) => BASE62[b % 62]).join('');

/** Delete rows and files past expires_at. Returns how many were removed. */
export function sweepExpiredShares(deps: Pick<ShareDeps, 'database' | 'dir' | 'now'> = { database: db, dir: defaultDir, now: Date.now }): number {
  const rows = deps.database.prepare('SELECT id FROM share_links WHERE expires_at <= ?').all(deps.now()) as Array<{ id: string }>;
  for (const { id } of rows) {
    fs.rmSync(path.join(deps.dir(), `${id}.bin`), { force: true });
    deps.database.prepare('DELETE FROM share_links WHERE id = ?').run(id);
  }
  return rows.length;
}

export function createShareRouter(deps: ShareDeps): Router {
  const router = Router();
  const limiter = rateLimit({
    windowMs: 60 * 60 * 1000, limit: deps.perHour, standardHeaders: true, legacyHeaders: false,
    handler: (_req, res) => { res.status(429).json({ error: 'Too many shares from this address. Try again later.' }); },
  }) as unknown as RequestHandler;

  router.post('/', limiter, express.raw({ type: 'application/octet-stream', limit: SHARE_MAX_BYTES }), (req: Request, res: Response) => {
    const body = req.body;
    if (!Buffer.isBuffer(body) || body.length === 0) return res.status(400).json({ error: 'Send the song as application/octet-stream.' });
    sweepExpiredShares(deps);
    const now = deps.now();
    const sha256 = crypto.createHash('sha256').update(body).digest('hex');
    const used = (deps.database.prepare('SELECT COALESCE(SUM(size), 0) AS n FROM share_links').get() as { n: number }).n;
    if (used + body.length > SHARE_DIR_CAP_BYTES) return res.status(507).json({ error: 'Share storage is full. Try again later.' });
    const id = newId();
    fs.mkdirSync(deps.dir(), { recursive: true });
    fs.writeFileSync(path.join(deps.dir(), `${id}.bin`), body);
    // The owner key is returned once and never stored; phase 2 (merge back) will check it against the hash.
    const ownerKey = crypto.randomBytes(24).toString('base64url');
    const ownerHash = crypto.createHash('sha256').update(ownerKey).digest('hex');
    const parent = typeof req.query.parent === 'string' && ID_RE.test(req.query.parent) ? req.query.parent : null;
    deps.database.prepare('INSERT INTO share_links (id, sha256, size, created_at, expires_at, parent_id, owner_key_sha256) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(id, sha256, body.length, now, now + SHARE_TTL_MS, parent, ownerHash);
    res.json({ id, ownerKey });
  });

  router.get('/:id', (req: Request, res: Response) => {
    const id = String(req.params.id);
    if (!ID_RE.test(id)) return res.status(404).json({ error: 'Link not found.' });
    const now = deps.now();
    const row = deps.database.prepare('SELECT expires_at FROM share_links WHERE id = ?').get(id) as { expires_at: number } | undefined;
    const file = path.join(deps.dir(), `${id}.bin`);
    if (!row || row.expires_at <= now || !fs.existsSync(file)) return res.status(404).json({ error: 'Link not found or expired.' });
    deps.database.prepare('UPDATE share_links SET expires_at = ? WHERE id = ?').run(now + SHARE_TTL_MS, id);
    res.set({
      'Content-Type': 'application/octet-stream',
      'X-Content-Type-Options': 'nosniff',
      'Content-Disposition': 'attachment; filename="share.bin"',
      'Cache-Control': 'no-store',
    });
    res.send(fs.readFileSync(file));
  });

  return router;
}

export default createShareRouter({ database: db, dir: defaultDir, now: Date.now, perHour: 10 });
