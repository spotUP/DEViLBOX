/**
 * PCTrackerParsers — Standard PC tracker format dispatchers (S3M, IT, XM, MOD)
 *
 * Primary path: OpenMPT CSoundFile WASM (reference C++ implementation, 56+ formats)
 * Fallback: TypeScript native parsers → libopenmpt worklet
 */

import type { TrackerSong } from '@/engine/TrackerReplayer';
import type { FormatEnginePreferences } from '@/stores/useSettingsStore';
import type { UADEMetadata } from '@/engine/uade/UADEEngine';

/** Formats handled by OpenMPT soundlib WASM (56 loaders compiled into the bridge) */
const OPENMPT_EXTENSIONS = /\.(s3m|it|mptm|xm|mod|m15|667|669|amf|ams|c67|cba|dbm|digi|dmf|dsm|dsym|dtm|etx|far|fmt|ftm|gdm|gmc|gt2|ice|imf|ims|itp|j2b|kris|mdl|med|mo3|mt2|mtm|mus|nru|nst|okt|plm|psm|pt36|ptm|puma|rtm|sfx|sfx2|ss|stk|stm|stp|stx|symmod|tcb|uax|ult|unic|wow|xmf)$/i;

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

  // ── MOD and XM: the native parsers, the one converter each ───────────────
  // They keep what OpenMPT's conversion loses - MOD sample slots, finetune,
  // default volume, each cell's period; XM envelopes, auto-vibrato, fadeout,
  // multi-sample maps - and every path that opens a MOD or XM (the tracker's
  // import, the DJ decks) gets the same song. libopenmpt still plays them:
  // the file's bytes ride along as libopenmptFileData, as on the OpenMPT path.
  if (/\.(mod|m15)$/i.test(filename) || /\.xm$/i.test(filename)) {
    try {
      const song = /\.xm$/i.test(filename)
        ? await (async () => {
            const { isXMFormat, parseXMFile } = await import('@lib/import/formats/XMParser');
            return isXMFormat(buffer) ? parseXMFile(buffer, originalFileName) : null;
          })()
        : await (async () => {
            const { isMODFormat, parseMODFile } = await import('@lib/import/formats/MODParser');
            return isMODFormat(buffer) ? parseMODFile(buffer, originalFileName) : null;
          })();
      if (song) return { ...song, libopenmptFileData: buffer.slice(0) };
    } catch (err) {
      console.warn(`[PCTrackerParsers] Native parse failed for ${filename}, trying OpenMPT:`, err);
    }
  }

  // ── Primary path for the rest: OpenMPT WASM soundlib ─────────────────────
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

  return null;
}
