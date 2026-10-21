/**
 * Module genre lookup: fills module_genres organically from ModArchive genre tags.
 *
 * A client (DEViLBOX or HippoPlayer) asks for one module by uade key, filename and decompressed
 * size, plus the md5 when it has one. A known key answers from the table. An unknown key costs one
 * ModArchive filename search, made here only, so the API key never leaves the server. Every
 * verdict is stored, misses too, so a module is asked about once (non-hits again after RECHECK_MS).
 */

import type Database from 'better-sqlite3';
import db from '../db/database';

const SEARCH_URL = 'https://api.modarchive.org/xml-tools.php';
const RECHECK_MS = 180 * 24 * 60 * 60 * 1000;

/** File extensions ModArchive hosts. A name without one is never searched. */
const MODARCHIVE_EXTS = new Set([
  'mod', 'xm', 's3m', 'it', 'mptm', 'mtm', '669', 'med', 'mo3', 'okt', 'stm', 'far', 'ult',
  'amf', 'ahx', 'hvl', 'dmf', 'dsm', 'psm', 'umx', 'mdl', 'ptm', 'gdm', 'imf', 'j2b', 'mt2',
]);
const ARCHIVE_EXTS = new Set(['lha', 'lzh', 'lzx', 'zip', 'gz', 'xz', 'bz2']);

export type GenreSource = 'modarchive' | 'untagged' | 'miss' | 'ambiguous' | 'unsupported';

export interface GenreAnswer {
  key: string;
  genre: string | null;
  source: GenreSource;
  modarchiveId: number | null;
}

export interface GenreQuery {
  key: string;
  name: string;
  size: number;
  md5?: string;
}

export interface ModArchiveModule {
  id: number;
  filename: string;
  bytes: number;
  hash: string;
  genreId: number;
  genreText: string;
}

interface GenreRow {
  key: string;
  modarchive_id: number | null;
  md5: string | null;
  genre: string | null;
  source: GenreSource;
  checked_at: number;
}

interface Verdict {
  source: GenreSource;
  genre: string | null;
  modarchiveId: number | null;
  md5: string | null;
}

/** A lookup that could not reach a verdict; nothing is stored, the client may ask again later. */
export class GenreLookupError extends Error {
  constructor(message: string, readonly status: 502 | 503) {
    super(message);
  }
}

/**
 * Filename as ModArchive stores it: no path, lower case, spaces as underscores, no archive wrapper, Amiga prefix
 * `mod.name` turned into `name.mod`. Null when the name carries no ModArchive format.
 */
export function normaliseModuleName(name: string): string | null {
  const base = (name.split(/[/:\\]/).pop() ?? '').trim().toLowerCase().replace(/\s+/g, '_');
  const parts = base.split('.');
  while (parts.length > 1 && ARCHIVE_EXTS.has(parts[parts.length - 1])) parts.pop();
  if (parts.length < 2 || parts.some((p) => p === '')) return null;
  if (MODARCHIVE_EXTS.has(parts[parts.length - 1])) return parts.join('.');
  if (MODARCHIVE_EXTS.has(parts[0])) return [...parts.slice(1), parts[0]].join('.');
  return null;
}

function decodeEntities(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

/** First <tag> in the block. The module's own fields come before nested artist entries. */
function leaf(block: string, tag: string): string {
  const m = block.match(new RegExp(`<${tag}>(?:<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>|([^<]*))</${tag}>`));
  return m ? decodeEntities(m[1] ?? m[2] ?? '').trim() : '';
}

/** The <module> entries of an xml-tools search answer (flat leaf fields only). */
export function parseSearchXml(xml: string): ModArchiveModule[] {
  return (xml.match(/<module>[\s\S]*?<\/module>/g) ?? []).map((block) => ({
    id: Number(leaf(block, 'id')),
    filename: leaf(block, 'filename'),
    bytes: Number(leaf(block, 'bytes')),
    hash: leaf(block, 'hash').toLowerCase(),
    genreId: Number(leaf(block, 'genreid')) || 0,
    genreText: leaf(block, 'genretext'),
  }));
}

const isTagged = (m: ModArchiveModule) =>
  m.genreId > 0 && m.genreText !== '' && m.genreText.toLowerCase() !== 'n/a';

/** Same bytes (and same md5 when the client sent one). One distinct tag wins; two or more is ambiguous. */
export function pickGenre(mods: ModArchiveModule[], size: number, md5?: string): Verdict {
  const same = mods.filter((m) => m.bytes === size && (!md5 || m.hash === md5));
  if (same.length === 0) return { source: 'miss', genre: null, modarchiveId: null, md5: null };
  const tagged = same.filter(isTagged);
  const genres = new Set(tagged.map((m) => m.genreText));
  if (genres.size === 0) {
    return { source: 'untagged', genre: null, modarchiveId: same[0].id, md5: same[0].hash };
  }
  if (genres.size > 1) return { source: 'ambiguous', genre: null, modarchiveId: null, md5: null };
  return { source: 'modarchive', genre: tagged[0].genreText, modarchiveId: tagged[0].id, md5: tagged[0].hash };
}

export interface GenreServiceOptions {
  db?: Database.Database;
  fetch?: typeof fetch;
  /** Read per lookup, so a key added to the server env needs no code change. Never logged. */
  apiKey?: () => string | undefined;
  monthlyBudget?: number;
  minIntervalMs?: number;
  maxQueue?: number;
  now?: () => number;
}

export interface GenreService {
  lookup(q: GenreQuery): Promise<GenreAnswer>;
}

export function createGenreService(opts: GenreServiceOptions = {}): GenreService {
  const database = opts.db ?? db;
  const doFetch = opts.fetch ?? ((input, init) => fetch(input, init));
  const apiKey = opts.apiKey ?? (() => process.env.MODARCHIVE_API_KEY);
  const monthlyBudget = opts.monthlyBudget ?? (Number(process.env.MODARCHIVE_MONTHLY_BUDGET) || 8000);
  const minIntervalMs = opts.minIntervalMs ?? 1000;
  const maxQueue = opts.maxQueue ?? 50;
  const now = opts.now ?? Date.now;

  // Prepared on first use: the route module is imported before initDatabase() runs in tests.
  let stmts: {
    get: Database.Statement;
    put: Database.Statement;
    usage: Database.Statement;
    bump: Database.Statement;
  } | null = null;
  const sql = () => (stmts ??= {
    get: database.prepare('SELECT * FROM module_genres WHERE key = ?'),
    put: database.prepare(`
      INSERT INTO module_genres (key, modarchive_id, md5, genre, source, checked_at)
      VALUES (@key, @modarchiveId, @md5, @genre, @source, @checkedAt)
      ON CONFLICT(key) DO UPDATE SET modarchive_id = excluded.modarchive_id, md5 = excluded.md5,
        genre = excluded.genre, source = excluded.source, checked_at = excluded.checked_at
    `),
    usage: database.prepare('SELECT requests FROM modarchive_usage WHERE month = ?'),
    bump: database.prepare(`
      INSERT INTO modarchive_usage (month, requests) VALUES (?, 1)
      ON CONFLICT(month) DO UPDATE SET requests = requests + 1
    `),
  });

  const takeBudget = database.transaction((): boolean => {
    const month = new Date(now()).toISOString().slice(0, 7);
    const row = sql().usage.get(month) as { requests: number } | undefined;
    if ((row?.requests ?? 0) >= monthlyBudget) return false;
    sql().bump.run(month);
    return true;
  });

  // Serial queue: at most one ModArchive request per minIntervalMs, whatever the client load.
  let tail: Promise<unknown> = Promise.resolve();
  let queued = 0;
  let lastRequestAt = Number.NEGATIVE_INFINITY;
  function throttled<T>(job: () => Promise<T>): Promise<T> {
    if (queued >= maxQueue) return Promise.reject(new GenreLookupError('Genre lookup queue is full', 503));
    queued++;
    const run = tail.then(async () => {
      const wait = lastRequestAt + minIntervalMs - Date.now();
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      lastRequestAt = Date.now();
      return job();
    });
    tail = run.catch(() => undefined);
    return run.finally(() => { queued--; });
  }

  async function search(query: string, key: string): Promise<string> {
    if (!takeBudget()) throw new GenreLookupError('Monthly ModArchive budget is used up', 503);
    const url = `${SEARCH_URL}?key=${encodeURIComponent(key)}&request=search`
      + `&type=filename_or_songtitle&query=${encodeURIComponent(query)}`;
    let res: Response;
    try {
      res = await doFetch(url);
    } catch {
      // The error text can carry the URL, which carries the key: never pass it on.
      throw new GenreLookupError('ModArchive is unreachable', 502);
    }
    if (!res.ok) throw new GenreLookupError(`ModArchive answered ${res.status}`, 502);
    const xml = await res.text();
    // ModArchive reports an empty result set as an error element; that is a miss, not a refusal.
    const error = /<error>([\s\S]*?)<\/error>/i.exec(xml);
    if (error && /no results/i.test(error[1])) return '';
    if (error) throw new GenreLookupError('ModArchive refused the search', 502);
    return xml;
  }

  function store(key: string, v: Verdict): GenreAnswer {
    sql().put.run({ key, ...v, checkedAt: now() });
    return { key, genre: v.genre, source: v.source, modarchiveId: v.modarchiveId };
  }

  async function resolve(q: GenreQuery): Promise<GenreAnswer> {
    const query = normaliseModuleName(q.name);
    // Not stored: unsupported describes this request's name, not the module, and a later client
    // may send a usable name for the same key.
    if (!query) return { key: q.key, genre: null, source: 'unsupported', modarchiveId: null };
    const key = apiKey();
    if (!key) throw new GenreLookupError('ModArchive lookup is not configured', 503);
    const xml = await throttled(() => search(query, key));
    return store(q.key, pickGenre(parseSearchXml(xml), q.size, q.md5));
  }

  const inflight = new Map<string, Promise<GenreAnswer>>();

  return {
    lookup(q) {
      const row = sql().get.get(q.key) as GenreRow | undefined;
      const fresh = row && row.source !== 'unsupported'
        && (row.source === 'modarchive' || now() - row.checked_at < RECHECK_MS);
      // An ambiguous name match can be settled by an md5 that the earlier client did not send.
      if (row && fresh && !(row.source === 'ambiguous' && q.md5)) {
        return Promise.resolve({ key: row.key, genre: row.genre, source: row.source, modarchiveId: row.modarchive_id });
      }
      const pending = inflight.get(q.key);
      if (pending) return pending;
      const p = resolve(q).finally(() => inflight.delete(q.key));
      inflight.set(q.key, p);
      return p;
    },
  };
}
