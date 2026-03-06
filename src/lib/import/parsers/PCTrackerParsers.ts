/**
 * PCTrackerParsers — Standard PC tracker format dispatchers (S3M, IT, XM, MOD)
 *
 * Primary path: OpenMPT CSoundFile WASM (reference C++ implementation, 56+ formats)
 * Fallback: TypeScript native parsers → libopenmpt worklet
 */

import type { TrackerSong } from '@/engine/TrackerReplayer';
import type { FormatEnginePreferences } from '@/stores/useSettingsStore';
import type { UADEMetadata } from '@/engine/uade/UADEEngine';

/** Formats handled by OpenMPT soundlib WASM */
const OPENMPT_EXTENSIONS = /\.(s3m|it|mptm|xm|mod|m15|669|amf|ams|c67|cba|dbm|digi|dmf|dsm|dsym|dtm|far|fmt|ftm|gdm|gmc|gt2|ice|imf|ims|itp|kris|mdl|med|mo3|mt2|mtm|mus|nst|okt|plm|psm|ptm|rtm|sfx|sfx2|stk|stm|stp|stx|ult|wow)$/i;

/**
 * Try to parse a tracker module using OpenMPT WASM soundlib (reference implementation).
 * Falls back to TypeScript parsers on failure.
 */
export async function tryPCTrackerParse(
  buffer: ArrayBuffer,
  filename: string,
  originalFileName: string,
  _prefs: FormatEnginePreferences,
  _subsong: number,
  _preScannedMeta?: UADEMetadata,
): Promise<TrackerSong | null> {

  // ── Primary path: OpenMPT WASM soundlib ──────────────────────────────────
  if (OPENMPT_EXTENSIONS.test(filename)) {
    try {
      const { parseWithOpenMPT } = await import('@lib/import/wasm/OpenMPTConverter');
      return await parseWithOpenMPT(buffer, originalFileName);
    } catch (err) {
      console.warn(`[OpenMPT WASM] Parse failed for ${filename}, falling back to TS parser:`, err);
    }
  }

  // ── Fallback: TypeScript native parsers ──────────────────────────────────

  // S3M (ScreamTracker 3)
  if (/\.s3m$/i.test(filename)) {
    try {
      const { isS3MFormat, parseS3MFile } = await import('@lib/import/formats/S3MParser');
      if (isS3MFormat(buffer)) return parseS3MFile(buffer, originalFileName);
    } catch (err) {
      console.warn(`[S3MParser] Native parse failed for ${filename}, falling back to libopenmpt:`, err);
    }
  }

  // IT / MPTM (Impulse Tracker / OpenMPT)
  if (/\.(it|mptm)$/i.test(filename)) {
    try {
      const { isITFormat, parseITFile } = await import('@lib/import/formats/ITParser');
      if (isITFormat(buffer)) return parseITFile(buffer, originalFileName);
    } catch (err) {
      console.warn(`[ITParser] Native parse failed for ${filename}, falling back to libopenmpt:`, err);
    }
  }

  // XM (FastTracker II)
  if (/\.xm$/i.test(filename)) {
    try {
      const { isXMFormat, parseXMFile } = await import('@lib/import/formats/XMParser');
      if (isXMFormat(buffer)) return await parseXMFile(buffer, originalFileName);
    } catch (err) {
      console.warn(`[XMParser] Native parse failed for ${filename}, falling back to libopenmpt:`, err);
    }
  }

  // MOD (ProTracker / compatible)
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
