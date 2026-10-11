/**
 * GET /api/remote/<host>/<path> - download proxy for DJ playlist entries
 * whose source is an http(s) URL on an allowed host (HippoPlayer playlists:
 * hippoplayer.se, AmigaRemix, Remix.Kwed.Org, modules.pl). The allowlist and
 * the path mapping live in src/lib/dj/remoteSources.ts, shared with the
 * client loader. Same cache as the Modland proxy, own rate limit.
 */
import { Router, Request, Response } from 'express';
import { remoteUpstreamUrl } from '../../../src/lib/dj/remoteSources.ts';
import { createDownloadLimiter, sendCachedRemoteFile } from '../services/cachedRemoteDownload';

const router = Router();
const downloadLimiter = createDownloadLimiter(10);

router.get(/^\/([^/]+)(\/.+)$/, async (req: Request, res: Response) => {
  // req.path is still %-encoded: forward it as the remote host serves it.
  const match = /^\/([^/]+)(\/.+)$/.exec(req.path);
  const upstreamUrl = match ? remoteUpstreamUrl(match[1], match[2]) : null;
  if (!match || !upstreamUrl) {
    return res.status(400).json({ error: 'Host not allowed or invalid path' });
  }
  const host = match[1].toLowerCase();
  const encodedPath = match[2];
  let filename = encodedPath.slice(encodedPath.lastIndexOf('/') + 1);
  try { filename = decodeURIComponent(filename); } catch { /* keep encoded */ }

  await sendCachedRemoteFile(res, {
    cacheKey: `remote/${host}${encodedPath}`,
    upstreamUrl,
    filename,
    limiter: downloadLimiter,
    label: `Remote ${host}`,
  });
});

export default router;
