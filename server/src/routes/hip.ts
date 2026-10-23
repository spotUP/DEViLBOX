/**
 * HippoPlayer vote transport. Replies are one text/plain line so the Amiga parses without JSON.
 *
 * GET /api/hip/vote?k=<32 hex token>&m=<12 hex uade key>&r=<0|5>[&n=<filename>][&p=<player>]
 *   r=5 sets the like, r=0 removes it (idempotent). 200 "<count> <yours>\n".
 * GET /api/hip/votes?m=<key>[&k=<token>]   read only, same reply.
 *   count = votes with rating >= 4 for m, yours = 0 or 5.
 *   400 "ERR bad\n", 429 "ERR rate\n". The token is never logged (this router logs nothing).
 */

import { Router, Request, Response } from 'express';
import { createHipVoteService, HipVoteError, isKey, isToken, type HipVoteService } from '../services/hipVotes';

function str(v: unknown): string | undefined { return typeof v === 'string' ? v : undefined; }

export function createHipRouter(service: HipVoteService = createHipVoteService()): Router {
  const router = Router();
  const send = (res: Response, status: number, body: string) => {
    res.status(status).type('text/plain').set('Cache-Control', 'no-store').send(body);
  };
  const reply = (res: Response, a: { count: number; yours: number }) => send(res, 200, `${a.count} ${a.yours}\n`);
  const bad = (res: Response) => send(res, 400, 'ERR bad\n');

  router.get('/vote', (req: Request, res: Response) => {
    const k = str(req.query.k)?.toLowerCase();
    const m = str(req.query.m)?.toLowerCase();
    const r = str(req.query.r);
    const n = str(req.query.n);
    const p = str(req.query.p);
    if (!k || !isToken(k) || !m || !isKey(m) || (r !== '0' && r !== '5')) return bad(res);
    if ((n !== undefined && n.length > 255) || (p !== undefined && p.length > 64)) return bad(res);
    try {
      reply(res, service.vote({ token: k, key: m, rating: r === '5' ? 5 : 0, name: n, player: p, ip: req.ip ?? 'unknown' }));
    } catch (err) {
      if (err instanceof HipVoteError) return send(res, err.status, err.status === 429 ? 'ERR rate\n' : 'ERR bad\n');
      send(res, 500, 'ERR server\n');
    }
  });

  router.get('/votes', (req: Request, res: Response) => {
    const k = str(req.query.k)?.toLowerCase();
    const m = str(req.query.m)?.toLowerCase();
    if (!m || !isKey(m) || (k !== undefined && !isToken(k))) return bad(res);
    try {
      reply(res, service.read(m, k));
    } catch {
      send(res, 500, 'ERR server\n');
    }
  });

  return router;
}

export default createHipRouter();
