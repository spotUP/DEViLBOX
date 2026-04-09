/**
 * parseModuleToSong - Shared module file → TrackerSong converter
 *
 * Used by both the main tracker view (App.tsx) and the DJ file browser.
 * Handles all supported formats: MOD, XM, IT, S3M, Furnace, DefleMask, MIDI,
 * HivelyTracker/AHX, Oktalyzer, OctaMED, DigiBooster, Future Composer, and
 * 130+ exotic Amiga formats via UADE catch-all.
 * Returns a self-contained TrackerSong ready for a TrackerReplayer.
 *
 * Format routing is delegated to focused parser modules in ./parsers/:
 *   - MidiToSong.ts       — MIDI → TrackerSong conversion
 *   - FurnaceToSong.ts    — Furnace / DefleMask → TrackerSong
 *   - PatternExtractor.ts — MOD/XM/IT/S3M via libopenmpt + fallback instruments
 *   - AmigaFormatParsers.ts — HVL, OKT, MED, FC, 100+ exotic Amiga/PC formats
 */

import type { TrackerSong } from '@/engine/TrackerReplayer';
import type { UADEMetadata } from '@/engine/uade/UADEEngine';
import { useSettingsStore, type FormatEnginePreferences } from '@/stores/useSettingsStore';
import { isAudioFile } from '@/lib/audioFileUtils';

// Re-export state accessors from PatternExtractor for backwards compatibility
export { getLastPatternHash, getLastLibOpenMPTMetadata } from './parsers/PatternExtractor';

/** Get current format engine preferences (non-reactive, snapshot read) */
function getFormatEngine(): FormatEnginePreferences {
  return useSettingsStore.getState().formatEngine;
}

interface ParseOptions {
  subsong?: number;
  preScannedMeta?: UADEMetadata;
  midiOptions?: {
    quantize?: number;
    velocityToVolume?: boolean;
    defaultPatternLength?: number;
  };
}

/**
 * Parse a tracker module file and return a TrackerSong.
 * Handles .fur, .dmf, .mod, .xm, .it, .s3m, .mid, .hvl, .ahx, .okt, .med,
 * .digi, .fc/.fc14 and many more exotic Amiga formats via UADE.
 *
 * Format engine preferences (Settings → Format Engine) control which parser
 * is used for formats supported by multiple engines (MOD, HVL, MED, FC, etc.).
 */
export async function parseModuleToSong(file: File, subsong = 0, preScannedMeta?: UADEMetadata, midiOptions?: ParseOptions['midiOptions'], companionFiles?: Map<string, ArrayBuffer>): Promise<TrackerSong> {
  const filename = file.name.toLowerCase();
  let buffer = await file.arrayBuffer();
  const prefs = getFormatEngine();

  // ── Gzip auto-detection ────────────────────────────────────────────────────
  // Many Amiga archives are gzip-compressed (magic bytes 0x1f 0x8b).
  // Transparently inflate before format routing.
  // Skip VGZ files — VGMParser handles its own gzip decompression via DecompressionStream.
  const header = new Uint8Array(buffer, 0, Math.min(2, buffer.byteLength));
  if (header[0] === 0x1f && header[1] === 0x8b && !/\.vgz$/i.test(filename)) {
    const pako = await import('pako');
    const inflated = pako.ungzip(new Uint8Array(buffer));
    buffer = inflated.buffer as ArrayBuffer;
    console.log(`[parseModuleToSong] Gzip detected, inflated ${file.size} → ${buffer.byteLength} bytes`);
  }

  // ── Regular Audio ─────────────────────────────────────────────────────────
  // If it's a regular audio file (MP3, WAV, etc.), it shouldn't be here.
  // The DJ UI should handle it via DeckAudioPlayer directly.
  if (isAudioFile(file.name)) {
    throw new Error(`Cannot parse ${file.name} as a tracker module: it is a regular audio file.`);
  }

  // ── MIDI ──────────────────────────────────────────────────────────────────
  if (filename.endsWith('.mid') || filename.endsWith('.midi')) {
    const { parseMIDIFile } = await import('./parsers/MidiToSong');
    return parseMIDIFile(file, midiOptions);
  }

  // ── Format-specific routing ────────────────────────────────────────────────
  // Covers HVL/AHX, DMF/X-Tracker, Furnace, OKT, MED, FC, UADE formats,
  // S3M, IT, XM, MOD native parsers, and UADE catch-all.

  // AdPlug OPL formats — try TS parser for editable pattern import
  const { detectFormat } = await import('./FormatRegistry');
  const fmt = detectFormat(filename);
  if (fmt?.nativeParser?.parseFn === 'parseAdPlugFile') {
    try {
      const { parseAdPlugFile } = await import('./formats/AdPlugParser');
      const result = parseAdPlugFile(buffer, file.name);
      if (result) return result;
    } catch { /* fall through to WASM extraction */ }
  }

  // AdPlug WASM extraction — for CmodPlayer-based formats (A2M, AMD, CFF, etc.)
  // Try extracting editable patterns from the WASM module before falling back to streaming
  const { isAdPlugWasmFormat } = await import('@lib/file/UnifiedFileLoader');
  if (isAdPlugWasmFormat(filename)) {
    try {
      const { extractAdPlugPatterns } = await import('./formats/AdPlugWasmExtractor');
      const extracted = await extractAdPlugPatterns(buffer, file.name);
      if (extracted) return extracted;
    } catch (err) {
      console.warn('[parseModuleToSong] AdPlug WASM extraction failed:', err);
    }
  }

  const { tryRouteFormat } = await import('./parsers/AmigaFormatParsers');
  const routed = await tryRouteFormat(buffer, filename, file.name, prefs, subsong, preScannedMeta, companionFiles);
  if (routed) return routed;

  // ── Final fallback: libopenmpt + UADE ──────────────────────────────────────
  // MOD files can be routed to UADE for authentic Amiga playback
  if ((filename.endsWith('.mod') || filename.endsWith('.m15')) && prefs.mod === 'uade') {
    const { parseUADEFile } = await import('@lib/import/formats/UADEParser');
    return await parseUADEFile(buffer, file.name, prefs.uade ?? 'enhanced', subsong, preScannedMeta);
  }

  const { parseTrackerModule } = await import('./parsers/PatternExtractor');
  try {
    return await parseTrackerModule(buffer, file.name);
  } catch {
    // If libopenmpt fails, try UADE as last resort
    const { parseUADEFile } = await import('@lib/import/formats/UADEParser');
    // For .mod files without a standard MOD signature at offset 1080 (M.K., FLT4,
    // etc.), use the mod_comp prefix so UADE's PTK-Prowiz replayer can content-detect
    // the packed format (Startrekker Packer, SKYT, etc.)
    let uadeFileName = file.name;
    if (filename.endsWith('.mod') && buffer.byteLength > 1084) {
      const sig = new Uint8Array(buffer, 1080, 4);
      const sigStr = String.fromCharCode(sig[0], sig[1], sig[2], sig[3]);
      const validMODSigs = ['M.K.', 'M!K!', 'FLT4', 'FLT8', '4CHN', '6CHN', '8CHN', 'OCTA',
        '2CHN', 'CD81', 'TDZ1', 'TDZ2', 'TDZ3', '5CHN', '7CHN', '9CHN', '10CH', '11CH',
        '12CH', '13CH', '14CH', '15CH', '16CH', '18CH', '20CH', '22CH', '24CH', '26CH',
        '28CH', '30CH', '32CH'];
      if (!validMODSigs.some(s => sigStr.startsWith(s.slice(0, 4)))) {
        const baseName = file.name.replace(/\.mod$/i, '');
        uadeFileName = `mod_comp.${baseName}`;
        console.log(`[parseModuleToSong] No MOD signature at 1080, trying UADE as packed MOD: ${uadeFileName}`);
      }
    }
    return await parseUADEFile(buffer, uadeFileName, prefs.uade ?? 'enhanced', subsong, preScannedMeta);
  }
}
