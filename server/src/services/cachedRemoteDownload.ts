/**
 * Server-side download proxy core: fetch a remote file once, keep it in the
 * Modland file cache, and serve it to the browser same-origin (no CORS).
 * Used by /api/modland/download and /api/remote (playlist entries on other
 * hosts), each with its own outbound rate limit.
 */
import type { Response } from 'express';
import { getCachedFile, cacheFile } from './modlandIndexer';

export interface DownloadLimiter {
  /** True when another outbound request now would exceed the limit. */
  isLimited(): boolean;
  record(): void;
}

/** Sliding one-minute window. */
export function createDownloadLimiter(maxPerMinute: number): DownloadLimiter {
  const timestamps: number[] = [];
  return {
    isLimited() {
      const oneMinuteAgo = Date.now() - 60_000;
      while (timestamps.length > 0 && timestamps[0] < oneMinuteAgo) timestamps.shift();
      return timestamps.length >= maxPerMinute;
    },
    record() {
      timestamps.push(Date.now());
    },
  };
}

function sendBytes(res: Response, filename: string, data: Buffer): void {
  res.set({
    'Content-Type': 'application/octet-stream',
    'Content-Disposition': `attachment; filename="${encodeURIComponent(filename)}"`,
    'Content-Length': data.length.toString(),
  });
  res.send(data);
}

/**
 * Serve `upstreamUrl`'s bytes, from the cache under `cacheKey` when present.
 * Upstream errors are passed on with their status.
 */
export async function sendCachedRemoteFile(
  res: Response,
  opts: { cacheKey: string; upstreamUrl: string; filename: string; limiter: DownloadLimiter; label: string },
): Promise<void> {
  const { cacheKey, upstreamUrl, filename, limiter, label } = opts;
  try {
    const cached = getCachedFile(cacheKey);
    if (cached) {
      sendBytes(res, filename, cached);
      return;
    }

    if (limiter.isLimited()) {
      res.status(429).json({ error: 'Rate limited — try again in a moment' });
      return;
    }
    limiter.record();

    console.log(`[${label}] Downloading: ${upstreamUrl}`);
    const response = await fetch(upstreamUrl);
    if (!response.ok) {
      res.status(response.status).json({ error: `${label} returned ${response.status}` });
      return;
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    try {
      cacheFile(cacheKey, buffer);
    } catch (err) {
      // A cache write failure (name too long, disk full) must not fail the download.
      console.warn(`[${label}] Not cached: ${cacheKey}`, err);
    }
    sendBytes(res, filename, buffer);
  } catch (err) {
    console.error(`[${label}] Download error:`, err);
    res.status(500).json({ error: 'Download failed' });
  }
}
