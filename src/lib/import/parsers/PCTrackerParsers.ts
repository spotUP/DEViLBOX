/**
 * PCTrackerParsers — Standard PC tracker format dispatchers (S3M, IT, XM, MOD)
 *
 * These formats have native parsers with libopenmpt as a fallback.
 * Each parser tries magic-byte detection first; if it fails, the caller
 * falls through to the libopenmpt catch-all in parseModuleToSong.
 */

import type { TrackerSong } from '@/engine/TrackerReplayer';
import type { FormatEnginePreferences } from '@/stores/useSettingsStore';
import type { UADEMetadata } from '@/engine/uade/UADEEngine';

/**
 * Try to parse a standard PC tracker format natively.
 * Returns TrackerSong or null if not matched / native parse failed.
 * Caller should fall back to libopenmpt on null for known extensions.
 */
export async function tryPCTrackerParse(
  buffer: ArrayBuffer,
  filename: string,
  originalFileName: string,
  prefs: FormatEnginePreferences,
  subsong: number,
  preScannedMeta?: UADEMetadata,
): Promise<TrackerSong | null> {

  // ── S3M (ScreamTracker 3) ─────────────────────────────────────────────────
  if (/\.s3m$/i.test(filename)) {
    try {
      const { isS3MFormat, parseS3MFile } = await import('@lib/import/formats/S3MParser');
      if (isS3MFormat(buffer)) return parseS3MFile(buffer, originalFileName);
    } catch (err) {
      console.warn(`[S3MParser] Native parse failed for ${filename}, falling back to libopenmpt:`, err);
    }
  }

  // ── IT / MPTM (Impulse Tracker / OpenMPT) ─────────────────────────────────
  if (/\.(it|mptm)$/i.test(filename)) {
    try {
      const { isITFormat, parseITFile } = await import('@lib/import/formats/ITParser');
      if (isITFormat(buffer)) return parseITFile(buffer, originalFileName);
    } catch (err) {
      console.warn(`[ITParser] Native parse failed for ${filename}, falling back to libopenmpt:`, err);
    }
  }

  // ── XM (FastTracker II) ───────────────────────────────────────────────────
  if (/\.xm$/i.test(filename)) {
    try {
      const { isXMFormat, parseXMFile } = await import('@lib/import/formats/XMParser');
      if (isXMFormat(buffer)) return await parseXMFile(buffer, originalFileName);
    } catch (err) {
      console.warn(`[XMParser] Native parse failed for ${filename}, falling back to libopenmpt:`, err);
    }
  }

  // ── MOD (ProTracker / compatible) ────────────────────────────────────────
  if (/\.(mod|m15)$/i.test(filename)) {
    try {
      const { isMODFormat, parseMODFile } = await import('@lib/import/formats/MODParser');
      if (isMODFormat(buffer)) return await parseMODFile(buffer, originalFileName);
    } catch (err) {
      console.warn(`[MODParser] Native parse failed for ${filename}, falling back to libopenmpt:`, err);
    }
  }

  return null;
}
