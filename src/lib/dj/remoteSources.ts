/**
 * Playlist entries whose source is a plain http(s) URL (HippoPlayer playlists
 * point at hippoplayer.se, AmigaRemix, Remix.Kwed.Org, modules.pl). The
 * browser never fetches those hosts itself: the server's download proxy
 * (`/api/remote/<host>/<path>`, server/src/routes/remote.ts) does, with the
 * same cache and rate limit as the Modland proxy. The proxy URL keeps the
 * remote path's shape, so partner files resolve beside a module exactly as
 * they do on the remote host.
 *
 * Shared by the DJ loader (client) and the proxy route (server): one
 * allowlist, one path mapping.
 */

/** Hosts the proxy fetches from, and the origin it fetches each over. Live streams are never listed: they do not end. */
export const REMOTE_SOURCE_ORIGINS: Readonly<Record<string, string>> = {
  'hippoplayer.se': 'https://hippoplayer.se',
  'uhc.amigaremix.com': 'http://uhc.amigaremix.com',
  'uhc.remix.kwed.org': 'https://uhc.remix.kwed.org',
  'www.modules.pl': 'https://www.modules.pl',
};

export const REMOTE_PROXY_BASE = '/api/remote';

/** True for a playlist source that is an http(s) URL. */
export function isRemoteUrlSource(fileName: string): boolean {
  return /^https?:\/\//i.test(fileName);
}

/**
 * The path a remote host serves a file at today. hippoplayer.se (TAWS) moved
 * its module tree from `/data/Modules/` to `/webdata/Modules/`; the old path
 * redirects to https and 404s. HippoPlayer playlists saved before the move
 * still carry `/data/Modules/...`.
 */
function currentPath(host: string, pathname: string): string {
  if (host === 'hippoplayer.se' && pathname.startsWith('/data/Modules/')) {
    return `/webdata${pathname.slice('/data'.length)}`;
  }
  return pathname;
}

/**
 * The same-origin proxy URL for an http(s) playlist source, or null when the
 * source is not a URL or its host is not one the proxy serves.
 */
export function remoteSourceProxyUrl(source: string): string | null {
  if (!isRemoteUrlSource(source)) return null;
  let url: URL;
  try {
    url = new URL(source);
  } catch {
    return null;
  }
  const host = url.host.toLowerCase();
  if (!(host in REMOTE_SOURCE_ORIGINS)) return null;
  return `${REMOTE_PROXY_BASE}/${host}${currentPath(host, url.pathname)}`;
}

/**
 * Server side of the proxy: the upstream URL for `/<host><encodedPath>` as
 * the route receives it (still %-encoded), or null when the host is not
 * allowed or the path tries to leave the host's tree.
 */
export function remoteUpstreamUrl(host: string, encodedPath: string): string | null {
  const origin = REMOTE_SOURCE_ORIGINS[host.toLowerCase()];
  if (!origin || !encodedPath.startsWith('/') || encodedPath.length < 2) return null;
  for (const segment of encodedPath.split('/')) {
    let decoded: string;
    try {
      decoded = decodeURIComponent(segment);
    } catch {
      return null;
    }
    if (decoded === '..' || decoded === '.' || decoded.includes('/') || decoded.includes('\\')) return null;
  }
  return `${origin}${encodedPath}`;
}
