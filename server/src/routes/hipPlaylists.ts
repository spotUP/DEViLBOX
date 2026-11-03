/**
 * HippoPlayer playlists, read only.
 *
 * Mounted at /api/hip/playlists, before the hippoplayer.se forward that owns the rest of /api/hip.
 * GET /api/hip/playlists              [{ id, name, trackCount, revision }]
 * GET /api/hip/playlists?tracks=1     full playlists (id, name, tracks, ...) for the DJ seed import/repair
 * GET /api/hip/playlists/:id          one full playlist, 404 when unknown
 * ETag + Cache-Control; If-None-Match answers 304.
 */
import { Router, Request, Response } from 'express';
import { createHippoPlaylistService, type HippoPlaylistService } from '../services/hippoPlaylists';

export function createHipPlaylistsRouter(service: HippoPlaylistService = createHippoPlaylistService()): Router {
  const router = Router();
  const send = (req: Request, res: Response, etag: string, body: unknown) => {
    const tag = `"${etag}"`;
    res.set('ETag', tag).set('Cache-Control', 'public, max-age=300, must-revalidate');
    if (req.headers['if-none-match'] === tag) return res.status(304).end();
    return res.json(body);
  };

  router.get('/', (req: Request, res: Response) => {
    const full = req.query.tracks === '1';
    send(req, res, `${full ? 'full-' : 'list-'}${service.setRevision()}`, full ? service.all() : service.list());
  });

  router.get('/:id', (req: Request, res: Response) => {
    const id = String(req.params.id);
    const playlist = service.get(id);
    if (!playlist) return res.status(404).json({ error: 'unknown playlist' });
    const revision = service.list().find((s) => s.id === id)!.revision;
    return send(req, res, revision, playlist);
  });

  return router;
}

export default createHipPlaylistsRouter();
