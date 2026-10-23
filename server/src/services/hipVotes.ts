/**
 * HippoPlayer votes. Identity is a device token (128 bit hex), stored only as a SHA-256 hash.
 * A vote is rating 5 (like); readers count ratings >= 4 so 1-5 star clients can share the table later.
 */

import { createHash } from 'crypto';
import type Database from 'better-sqlite3';
import db from '../db/database';

export class HipVoteError extends Error {
  constructor(public status: 400 | 429, message: string) {
    super(message);
  }
}

export interface VoteRequest {
  token: string;
  key: string;
  rating: 0 | 5;
  name?: string;
  player?: string;
  ip: string;
}

export interface VoteAnswer { count: number; yours: 0 | 5 }

export interface HipVoteOptions {
  db?: Database.Database;
  now?: () => number;
  perTokenPerHour?: number;
  perIpPerHour?: number;
  newTokensPerIpPerDay?: number;
}

const HOUR = 3600_000;
const DAY = 24 * HOUR;

export function isToken(s: string): boolean { return /^[0-9a-f]{32}$/.test(s); }
export function isKey(s: string): boolean { return /^[0-9a-f]{12}$/.test(s); }

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Sliding-window hit counter; returns false (and does not count) when the limit is reached. */
class Window {
  private hits = new Map<string, number[]>();
  constructor(private limit: number, private span: number) {}
  take(id: string, now: number): boolean {
    const list = (this.hits.get(id) ?? []).filter((t) => now - t < this.span);
    if (list.length >= this.limit) { this.hits.set(id, list); return false; }
    list.push(now);
    this.hits.set(id, list);
    if (this.hits.size > 50_000) this.prune(now);
    return true;
  }
  private prune(now: number): void {
    for (const [id, list] of this.hits) if (!list.some((t) => now - t < this.span)) this.hits.delete(id);
  }
}

export interface HipVoteService {
  vote(req: VoteRequest): VoteAnswer;
  read(key: string, token?: string): VoteAnswer;
}

export function createHipVoteService(opts: HipVoteOptions = {}): HipVoteService {
  const database = opts.db ?? db;
  const now = opts.now ?? Date.now;
  const tokenWin = new Window(opts.perTokenPerHour ?? 60, HOUR);
  const ipWin = new Window(opts.perIpPerHour ?? 300, HOUR);
  const newTokenWin = new Window(opts.newTokensPerIpPerDay ?? 20, DAY);

  const count = (key: string): number =>
    (database.prepare('SELECT COUNT(*) AS c FROM hip_votes WHERE module_key = ? AND rating >= 4').get(key) as { c: number }).c;
  const yours = (hash: string, key: string): 0 | 5 => {
    const row = database.prepare('SELECT rating FROM hip_votes WHERE token_hash = ? AND module_key = ?').get(hash, key) as
      { rating: number } | undefined;
    return row && row.rating >= 4 ? 5 : 0;
  };

  return {
    vote(req) {
      const t = now();
      const hash = hashToken(req.token);
      if (!tokenWin.take(hash, t) || !ipWin.take(req.ip, t)) throw new HipVoteError(429, 'rate');
      const known = database.prepare('SELECT 1 FROM hip_tokens WHERE token_hash = ?').get(hash);
      if (!known) {
        if (!newTokenWin.take(req.ip, t)) throw new HipVoteError(429, 'rate');
        database.prepare('INSERT INTO hip_tokens (token_hash, created_at) VALUES (?, ?)').run(hash, t);
      }
      if (req.rating === 0) {
        database.prepare('DELETE FROM hip_votes WHERE token_hash = ? AND module_key = ?').run(hash, req.key);
      } else {
        database.prepare(
          `INSERT INTO hip_votes (token_hash, module_key, rating, created_at, updated_at) VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(token_hash, module_key) DO UPDATE SET rating = excluded.rating, updated_at = excluded.updated_at`,
        ).run(hash, req.key, req.rating, t, t);
        if (req.name) {
          database.prepare('INSERT OR IGNORE INTO hip_module_names (module_key, name, player, first_seen) VALUES (?, ?, ?, ?)')
            .run(req.key, req.name, req.player ?? null, t);
        }
      }
      return { count: count(req.key), yours: yours(hash, req.key) };
    },
    read(key, token) {
      return { count: count(key), yours: token ? yours(hashToken(token), key) : 0 };
    },
  };
}
