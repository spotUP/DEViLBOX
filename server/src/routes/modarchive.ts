/**
 * The Mod Archive browse API, shaped like /api/modland.
 *
 *   GET /api/modarchive/search?q=<name or title>|author=<artist>[&page=N]
 *     200 { results: [{ id, format, author, filename, title, extension, bytes, genre }], page, totalPages, query }
 *   GET /api/modarchive/download?id=<module id>[&filename=<name>]
 *     the module bytes (cached like Modland downloads).
 *
 * The API key is read here, per request, from ~/.config/modarchive/key (or the MODARCHIVE_API_KEY env
 * the genre lookup already uses). It goes only into the upstream search URL, never into a response,
 * a log line or an error text.
 */

import { Router, Request, Response } from 'express';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { parseSearchXml } from '../services/modarchiveGenre';
import { createDownloadLimiter, sendCachedRemoteFile, type DownloadLimiter } from '../services/cachedRemoteDownload';

const SEARCH_URL = 'https://api.modarchive.org/xml-tools.php';
const DOWNLOAD_URL = 'https://api.modarchive.org/downloads.php';
const KEY_FILE = path.join(os.homedir(), '.config', 'modarchive', 'key');

export interface ModArchiveResult {
  id: number;
  format: string;
  author: string;
  filename: string;
  title: string;
  extension: string;
  bytes: number;
  genre: string;
}

export interface ModArchiveRouterOptions {
  fetch?: typeof fetch;
  apiKey?: () => string | undefined;
  limiter?: DownloadLimiter;
}

function readKey(): string | undefined {
  try {
    const fromFile = fs.readFileSync(KEY_FILE, 'utf8').trim();
    if (fromFile) return fromFile;
  } catch { /* no key file: fall back to the env */ }
  return process.env.MODARCHIVE_API_KEY?.trim() || undefined;
}

function tag(block: string, name: string): string {
  const m = block.match(new RegExp(`<${name}>(?:<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>|([^<]*))</${name}>`));
  return (m?.[1] ?? m?.[2] ?? '')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
    .trim();
}

/** Search answer to Modland-shaped rows. The genre service's parser supplies the shared module fields. */
export function parseResults(xml: string): { results: ModArchiveResult[]; totalPages: number } {
  const blocks = xml.match(/<module>[\s\S]*?<\/module>/g) ?? [];
  const mods = parseSearchXml(xml);
  const results = mods.map((m, i) => ({
    id: m.id,
    format: tag(blocks[i], 'format'),
    author: tag(blocks[i], 'alias'),
    filename: m.filename,
    title: tag(blocks[i], 'songtitle'),
    extension: (m.filename.split('.').pop() ?? '').toLowerCase(),
    bytes: m.bytes,
    genre: m.genreText,
  }));
  return { results, totalPages: Number(tag(xml, 'totalpages')) || 1 };
}

export function createModArchiveRouter(opts: ModArchiveRouterOptions = {}): Router {
  const router = Router();
  const doFetch = opts.fetch ?? ((input: Parameters<typeof fetch>[0], init?: RequestInit) => fetch(input, init));
  const apiKey = opts.apiKey ?? readKey;
  const limiter = opts.limiter ?? createDownloadLimiter(20);

  router.get('/search', async (req: Request, res: Response) => {
    const q = String(req.query.q ?? '').trim();
    const author = String(req.query.author ?? '').trim();
    const page = Math.max(1, parseInt(String(req.query.page ?? '1'), 10) || 1);
    const query = author || q;
    if (!query || query.length > 100) return res.status(400).json({ error: 'q or author is required (at most 100 characters)' });
    const key = apiKey();
    if (!key) return res.status(503).json({ error: 'ModArchive search is not configured' });

    const call = async (params: string): Promise<{ xml: string } | { status: number; error: string }> => {
      let upstream: globalThis.Response;
      try {
        upstream = await doFetch(`${SEARCH_URL}?key=${encodeURIComponent(key)}&${params}`);
      } catch {
        // The error text can carry the URL, which carries the key.
        return { status: 502, error: 'ModArchive is unreachable' };
      }
      if (!upstream.ok) return { status: 502, error: `ModArchive answered ${upstream.status}` };
      const xml = await upstream.text();
      const error = /<error>([\s\S]*?)<\/error>/i.exec(xml);
      if (error && /no results/i.test(error[1])) return { xml: '' };
      if (error) return { status: 502, error: 'ModArchive refused the search' };
      return { xml };
    };
    const empty = () => res.json({ results: [], page, totalPages: 0, query });

    let params = `request=search&type=filename_or_songtitle&query=${encodeURIComponent(query)}&page=${page}`;
    if (author) {
      // The API has no module search by artist name: resolve the artist, then list that artist's modules.
      const artists = await call(`request=search_artist&query=${encodeURIComponent(author)}`);
      if ('error' in artists) return res.status(artists.status).json({ error: artists.error });
      const items = artists.xml.match(/<item>[\s\S]*?<\/item>/g) ?? [];
      const wanted = author.toLowerCase();
      const artist = items.find((it) => tag(it, 'alias').toLowerCase() === wanted) ?? items[0];
      const artistId = artist ? tag(artist, 'id') : '';
      if (!/^\d+$/.test(artistId)) return empty();
      params = `request=view_modules_by_artistid&query=${artistId}&page=${page}`;
    }
    const found = await call(params);
    if ('error' in found) return res.status(found.status).json({ error: found.error });
    if (!found.xml) return empty();
    const xml = found.xml;
    const { results, totalPages } = parseResults(xml);
    res.json({ results, page, totalPages, query });
  });

  router.get('/download', async (req: Request, res: Response) => {
    const id = String(req.query.id ?? '');
    if (!/^\d{1,9}$/.test(id)) return res.status(400).json({ error: 'id must be the numeric module id' });
    const name = String(req.query.filename ?? '').split(/[/\\]/).pop()?.trim();
    await sendCachedRemoteFile(res, {
      cacheKey: `modarchive/${id}`,
      upstreamUrl: `${DOWNLOAD_URL}?moduleid=${id}`,
      filename: name || `${id}.mod`,
      limiter,
      label: 'ModArchive',
    });
  });

  return router;
}

export default createModArchiveRouter();
