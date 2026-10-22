/**
 * Module genre API, shared by DEViLBOX and HippoPlayer.
 *
 * GET /api/genre/:key?name=<filename>&size=<bytes>[&md5=<hex>]
 *   key  = uade songdb key (12 hex chars), size = decompressed bytes.
 *   200 { key, genre, source, modarchiveId }  genre is null unless source is "modarchive".
 *   503 lookup not configured, queue full or monthly budget used up; 502 ModArchive failed.
 *   Neither error stores anything, so the client can ask again on a later play.
 */

import { Router, Request, Response, NextFunction } from 'express';
import { createGenreService, GenreLookupError, type GenreService } from '../services/modarchiveGenre';

const MAX_SIZE = 64 * 1024 * 1024;

export function createGenreRouter(service: GenreService = createGenreService()): Router {
  const router = Router();

  router.get('/:key', async (req: Request, res: Response, next: NextFunction) => {
    const key = (req.params.key || '').toLowerCase();
    const name = typeof req.query.name === 'string' ? req.query.name : '';
    const sizeText = typeof req.query.size === 'string' ? req.query.size : '';
    const md5 = typeof req.query.md5 === 'string' ? req.query.md5.toLowerCase() : undefined;
    const size = Number(sizeText);

    if (!/^[0-9a-f]{12}$/.test(key)) {
      return res.status(400).json({ error: 'key must be the 12 hex character uade key' });
    }
    if (name === '' || name.length > 255) {
      return res.status(400).json({ error: 'name is required (at most 255 characters)' });
    }
    if (!/^\d+$/.test(sizeText) || size < 1 || size > MAX_SIZE) {
      return res.status(400).json({ error: 'size must be the decompressed size in bytes' });
    }
    if (md5 !== undefined && !/^[0-9a-f]{32}$/.test(md5)) {
      return res.status(400).json({ error: 'md5 must be 32 hex characters' });
    }

    try {
      res.json(await service.lookup({ key, name, size, md5 }));
    } catch (err) {
      if (err instanceof GenreLookupError) return res.status(err.status).json({ error: err.message });
      next(err);
    }
  });

  return router;
}

export default createGenreRouter();
