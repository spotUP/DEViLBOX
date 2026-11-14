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
  // A reply goes with its share, or when its own lifetime ends.
  const replies = deps.database.prepare('SELECT id FROM share_replies WHERE expires_at <= ? OR share_id NOT IN (SELECT id FROM share_links)').all(deps.now()) as Array<{ id: string }>;
  for (const { id } of replies) {
    fs.rmSync(path.join(deps.dir(), `r-${id}.bin`), { force: true });
    deps.database.prepare('DELETE FROM share_replies WHERE id = ?').run(id);
  }
  return rows.length;
}

/** Header carrying the owner key on the inbox routes. */
export const OWNER_KEY_HEADER = 'x-share-owner-key';

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

  const isOwner = (req: Request, id: string): boolean => {
    const key = req.header(OWNER_KEY_HEADER);
    const row = deps.database.prepare('SELECT owner_key_sha256 FROM share_links WHERE id = ? AND expires_at > ?').get(id, deps.now()) as { owner_key_sha256: string } | undefined;
    if (!key || !row) return false;
    const a = Buffer.from(crypto.createHash('sha256').update(key).digest('hex'));
    const b = Buffer.from(row.owner_key_sha256);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  };
  const replyFile = (rid: string) => path.join(deps.dir(), `r-${rid}.bin`);

  // Anyone with the link can send changes back, under the same size cap and rate limit as an upload.
  router.post('/:id/replies', limiter, express.raw({ type: 'application/octet-stream', limit: SHARE_MAX_BYTES }), (req: Request, res: Response) => {
    const id = String(req.params.id);
    const body = req.body;
    if (!Buffer.isBuffer(body) || body.length === 0) return res.status(400).json({ error: 'Send the song as application/octet-stream.' });
    sweepExpiredShares(deps);
    const now = deps.now();
    if (!ID_RE.test(id) || !deps.database.prepare('SELECT 1 FROM share_links WHERE id = ? AND expires_at > ?').get(id, now)) {
      return res.status(404).json({ error: 'Link not found or expired.' });
    }
    const used = (deps.database.prepare('SELECT COALESCE(SUM(size), 0) AS n FROM share_links').get() as { n: number }).n
      + (deps.database.prepare('SELECT COALESCE(SUM(size), 0) AS n FROM share_replies').get() as { n: number }).n;
    if (used + body.length > SHARE_DIR_CAP_BYTES) return res.status(507).json({ error: 'Share storage is full. Try again later.' });
    const rid = newId();
    fs.mkdirSync(deps.dir(), { recursive: true });
    fs.writeFileSync(replyFile(rid), body);
    deps.database.prepare('INSERT INTO share_replies (id, share_id, size, created_at, expires_at) VALUES (?, ?, ?, ?, ?)').run(rid, id, body.length, now, now + SHARE_TTL_MS);
    // A waiting reply keeps the share and all its replies alive.
    deps.database.prepare('UPDATE share_links SET expires_at = ? WHERE id = ?').run(now + SHARE_TTL_MS, id);
    deps.database.prepare('UPDATE share_replies SET expires_at = ? WHERE share_id = ?').run(now + SHARE_TTL_MS, id);
    res.json({ id: rid });
  });

  router.get('/:id/replies', (req: Request, res: Response) => {
    const id = String(req.params.id);
    if (!ID_RE.test(id) || !isOwner(req, id)) return res.status(403).json({ error: 'Not the owner of this link.' });
    const replies = deps.database.prepare('SELECT id, size, created_at AS createdAt FROM share_replies WHERE share_id = ? AND expires_at > ? ORDER BY created_at').all(id, deps.now());
    res.json({ replies });
  });

  const ownedReply = (req: Request, res: Response): string | null => {
    const id = String(req.params.id);
    const rid = String(req.params.rid);
    if (!ID_RE.test(id) || !ID_RE.test(rid) || !isOwner(req, id)) { res.status(403).json({ error: 'Not the owner of this link.' }); return null; }
    const row = deps.database.prepare('SELECT 1 FROM share_replies WHERE id = ? AND share_id = ? AND expires_at > ?').get(rid, id, deps.now());
    if (!row || !fs.existsSync(replyFile(rid))) { res.status(404).json({ error: 'Reply not found or expired.' }); return null; }
    return rid;
  };

  router.get('/:id/replies/:rid', (req: Request, res: Response) => {
    const rid = ownedReply(req, res);
    if (!rid) return;
    res.set({ 'Content-Type': 'application/octet-stream', 'X-Content-Type-Options': 'nosniff', 'Content-Disposition': 'attachment; filename="reply.bin"', 'Cache-Control': 'no-store' });
    res.send(fs.readFileSync(replyFile(rid)));
  });

  router.delete('/:id/replies/:rid', (req: Request, res: Response) => {
    const rid = ownedReply(req, res);
    if (!rid) return;
    fs.rmSync(replyFile(rid), { force: true });
    deps.database.prepare('DELETE FROM share_replies WHERE id = ?').run(rid);
    res.json({ ok: true });
  });

  return router;
}

export default createShareRouter({ database: db, dir: defaultDir, now: Date.now, perHour: 10 });
