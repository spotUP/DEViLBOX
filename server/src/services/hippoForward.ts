/**
 * Forward the HippoPlayer-facing and account APIs to hippoplayer.se (cygnus).
 *
 * One generic mechanism: method, query, body bytes and the few request headers
 * the upstream needs go out unchanged; status, body bytes, Content-Type,
 * Cache-Control and the rate-limit headers come back unchanged. The real client
 * address travels in X-Hippo-Client-IP, authenticated by the shared secret in
 * X-Hippo-Forward (cygnus ignores the IP header without it).
 */

import type { Request, RequestHandler } from 'express';

export interface ForwardOptions {
  /** Upstream origin without trailing slash, e.g. https://hippoplayer.se */
  base: string;
  secret: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
  /** Called after a successful JSON reply with the request path (no query). */
  onJson?: (path: string, status: number, body: unknown) => void;
}

/** Paths served by cygnus once HIPPO_FORWARD_BASE is set. */
export const HIPPO_FORWARD_PATHS = [
  '/api/hip',
  '/api/genre',
  '/api/songdb',
  '/api/auth',
  '/api/ratings',
  '/api/loudness',
];

const REQUEST_HEADERS = ['authorization', 'content-type', 'accept', 'user-agent'];
const RESPONSE_HEADERS = [
  'content-type',
  'cache-control',
  'etag',
  'retry-after',
  'ratelimit-limit',
  'ratelimit-remaining',
  'ratelimit-reset',
  'ratelimit-policy',
];

function pathOnly(req: Request): string {
  const url = req.originalUrl;
  const q = url.indexOf('?');
  return q < 0 ? url : url.slice(0, q);
}

export function createHippoForward(o: ForwardOptions): RequestHandler {
  return async (req, res) => {
    const headers: Record<string, string> = {
      'x-hippo-forward': o.secret,
      'x-hippo-client-ip': req.ip ?? '',
    };
    for (const n of REQUEST_HEADERS) {
      const v = req.get(n);
      if (v) headers[n] = v;
    }
    // express.raw ran first: a body is a Buffer, an absent one is {}.
    const hasBody = req.method !== 'GET' && req.method !== 'HEAD' && Buffer.isBuffer(req.body) && req.body.length > 0;
    try {
      const r = await (o.fetch ?? fetch)(o.base + req.originalUrl, {
        method: req.method,
        headers,
        body: hasBody ? new Uint8Array(req.body as Buffer) : undefined,
        signal: AbortSignal.timeout(o.timeoutMs ?? 15000),
        redirect: 'manual',
      });
      const buf = Buffer.from(await r.arrayBuffer());
      for (const n of RESPONSE_HEADERS) {
        const v = r.headers.get(n);
        if (v) res.setHeader(n, v);
      }
      res.status(r.status).send(buf);
      if (o.onJson && r.ok && r.headers.get('content-type')?.includes('json')) {
        try {
          o.onJson(pathOnly(req), r.status, JSON.parse(buf.toString('utf8')));
        } catch (err) {
          console.error('[HippoForward] onJson failed:', err);
        }
      }
    } catch {
      if (req.originalUrl.startsWith('/api/hip/')) {
        res.status(500).type('text/plain').set('Cache-Control', 'no-store').send('ERR server\n');
      } else {
        res.status(502).json({ error: 'Upstream unavailable' });
      }
    }
  };
}

/**
 * Migration freeze (HIPPO_FREEZE=1): while the data moves to cygnus, the local
 * handlers for writes on the moved paths refuse with their existing error
 * shape. Reads are still served. Only mounted while the forward is off.
 */
export const hippoFreeze: RequestHandler = (req, res, next) => {
  const p = pathOnly(req);
  if (req.method === 'GET' && p === '/api/hip/vote') {
    res.status(500).type('text/plain').set('Cache-Control', 'no-store').send('ERR server\n');
    return;
  }
  const isWrite =
    (req.method === 'POST' && (p === '/api/auth/login' || p === '/api/auth/signup')) ||
    ((req.method === 'PUT' || req.method === 'DELETE') && p === '/api/ratings') ||
    (req.method === 'PUT' && p.startsWith('/api/loudness/'));
  if (isWrite) {
    res.status(503).json({ error: 'Service temporarily unavailable' });
    return;
  }
  next();
};
