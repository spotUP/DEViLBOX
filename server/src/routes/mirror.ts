/**
 * GET /api/mirror/<source>/<path> - plain-HTTP-reachable mirror for clients
 * without TLS (the Selecta Amiga build, design D9). The Amiga asks this route
 * for every source file; the server fetches the real https upstream through
 * the shared cached download proxy (same cache as /api/modland/download, its
 * own outbound limiter so Amiga browsing does not starve the modland route). Source roots mirror BUILTIN in Selecta's
 * src/library/net/mirrors.c.
 */
import { Router, Request, Response } from 'express';
import { createDownloadLimiter, sendCachedRemoteFile } from '../services/cachedRemoteDownload';

const router = Router();

/** Uncached upstream fetches per minute across all mirror sources. */
const mirrorLimiter = createDownloadLimiter(30);

interface MirrorSource {
  root: string;
  /** Required leading path segment(s), when the source only exposes a subtree. */
  prefix?: string;
}

export const MIRROR_SOURCES: Record<string, MirrorSource> = {
  modland: { root: 'https://ftp.modland.com/', prefix: 'pub/modules/' },
  hvsc: { root: 'https://hvsc.de/download/' },
  asma: { root: 'https://asma.atari.org/asma/' },
  sndh: { root: 'https://sndh.atari.org/sndh/sndh_lf/' },
  keygenmusic: { root: 'https://keygenmusic.tk/kgm/' },
  modulespl: { root: 'https://www.modules.pl/modules/' },
  aminet: { root: 'https://aminet.net/' },
};

/** True when the (decoded) path is safe to append to an upstream root. */
function safePath(decoded: string): boolean {
  if (decoded === '' || decoded.startsWith('/') || decoded.includes('\\') || decoded.includes('\0')) return false;
  // A second decode catches double-encoded dot segments.
  let twice = decoded;
  try { twice = decodeURIComponent(decoded); } catch { /* not double encoded */ }
  return [decoded, twice].every((p) => !p.split('/').some((seg) => seg === '..' || seg === '.'));
}

router.get(/^\/([^/]+)\/(.+)$/, async (req: Request, res: Response) => {
  // req.path stays %-encoded: validate the decoded form, forward the encoded one.
  const match = /^\/([^/]+)\/(.+)$/.exec(req.path);
  if (!match) return res.status(400).json({ error: 'Invalid path' });
  const source = Object.prototype.hasOwnProperty.call(MIRROR_SOURCES, match[1]) ? MIRROR_SOURCES[match[1]] : null;
  if (!source) return res.status(404).json({ error: 'Unknown source' });

  const encodedPath = match[2];
  let decoded: string;
  try { decoded = decodeURIComponent(encodedPath); } catch { return res.status(400).json({ error: 'Invalid path' }); }
  if (!safePath(decoded) || (source.prefix && !decoded.startsWith(source.prefix))) {
    return res.status(400).json({ error: 'Invalid path' });
  }

  await sendCachedRemoteFile(res, {
    // Modland shares /api/modland/download's cache entries.
    cacheKey: match[1] === 'modland' ? decoded : `mirror/${match[1]}/${decoded}`,
    upstreamUrl: `${source.root}${encodedPath}`,
    filename: decoded.split('/').pop() || 'download',
    limiter: mirrorLimiter,
    label: `Mirror ${match[1]}`,
  });
});

export default router;
