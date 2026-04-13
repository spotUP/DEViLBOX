/**
 * withFallback — DRY helper for the native→UADE fallback pattern
 *
 * Eliminates 130+ copy-paste blocks in AmigaFormatParsers.ts where each
 * format checks user prefs, tries a native parser, and falls back to UADE.
 *
 * Three dispatch modes:
 *   - nativeDefault: native parser is default; UADE only if user selects it
 *   - uadeDefault:   UADE is default; native only if user selects 'native'
 *   - nativeOnly:    always use native parser (no UADE fallback)
 */

import type { TrackerSong } from '@/engine/TrackerReplayer';
import type { UADEMetadata } from '@/engine/uade/UADEEngine';
import type { FormatEnginePreferences } from '@/stores/useSettingsStore';

/** Common context passed through all fallback helpers */
export interface FallbackContext {
  buffer: ArrayBuffer;
  originalFileName: string;
  prefs: FormatEnginePreferences;
  subsong: number;
  preScannedMeta?: UADEMetadata;
  /** Companion files (e.g. SMPL.* for MIDI-Loriciel, .ssd for Paul Robotham) */
  companionFiles?: Map<string, ArrayBuffer>;
}

type NativeParser = (buffer: ArrayBuffer, filename: string) => Promise<TrackerSong> | TrackerSong;
type NativeParserWithBytes = (bytes: Uint8Array, filename: string) => Promise<TrackerSong | null> | TrackerSong | null;

/** Call UADE as fallback */
export async function callUADE(ctx: FallbackContext): Promise<TrackerSong> {
  const { parseUADEFile } = await import('@lib/import/formats/UADEParser');
  return parseUADEFile(
    ctx.buffer, ctx.originalFileName,
    ctx.prefs.uade ?? 'enhanced', ctx.subsong, ctx.preScannedMeta,
    ctx.companionFiles,
  );
}

/**
 * If a native parser result has uadePatternLayout, inject the raw file binary
 * so UADE can handle playback while the native parser provides pattern display.
 */
export function injectUADEPlayback(result: TrackerSong, ctx: FallbackContext): TrackerSong {
  const ra = result as any;
  const hasDedicatedWasm = ra.sonicArrangerFileData || ra.soundMonFileData || ra.digMugFileData || ra.davidWhittakerFileData || ra.soundControlFileData || ra.deltaMusic1FileData || ra.deltaMusic2FileData || ra.soundFxFileData || ra.gmcFileData || ra.voodooFileData;
  if (ra.uadePatternLayout && !ra.uadeEditableFileData && !hasDedicatedWasm) {
    (result as any).uadeEditableFileData = ctx.buffer.slice(0);
    (result as any).uadeEditableFileName = ctx.originalFileName;
  }
  // Preserve companion files so UADEEngine.loadTune() can register them before playback
  if (ctx.companionFiles && ctx.companionFiles.size > 0) {
    (result as any).uadeCompanionFiles = ctx.companionFiles;
  }
  return result;
}

/**
 * Format where native parser is the DEFAULT (most common: HVL, OKT, MED, DIGI).
 * If user sets pref to 'uade', uses UADE instead.
 */
export async function withNativeDefault(
  prefKey: keyof FormatEnginePreferences,
  ctx: FallbackContext,
  nativeParse: NativeParser,
): Promise<TrackerSong> {
  if (ctx.prefs[prefKey] === 'uade') return callUADE(ctx);
  return injectUADEPlayback(await nativeParse(ctx.buffer, ctx.originalFileName), ctx);
}

/**
 * Format where UADE is the default; native parser used only when user
 * explicitly selects 'native'. On native failure, falls back to UADE.
 * Includes optional magic-byte detection via `isFormat` predicate.
 */
export async function withNativeThenUADE(
  prefKey: keyof FormatEnginePreferences,
  ctx: FallbackContext,
  nativeParse: NativeParser | NativeParserWithBytes,
  parserName: string,
  opts?: {
    isFormat?: (bytes: Uint8Array) => boolean;
    usesBytes?: boolean;
    /** Always inject uadeEditableFileData into native result so UADE handles audio 1:1.
     *  Use when the native parser provides pattern display but can't fully emulate synthesis.
     *  When set, pref is irrelevant — native parser always runs for metadata and UADE
     *  always handles audio via uadeEditableFileData / UADEEditableSynth. */
    injectUADE?: boolean;
  },
): Promise<TrackerSong> {
  // injectUADE: native parser provides metadata/display, UADE always handles audio.
  // Run native parser unconditionally and inject uadeEditableFileData regardless of pref.
  if (opts?.injectUADE) {
    try {
      const bytes = (opts?.usesBytes || opts?.isFormat) ? new Uint8Array(ctx.buffer) : undefined;
      if (!opts?.isFormat || !bytes || opts.isFormat(bytes)) {
        const input = (opts?.usesBytes || opts?.isFormat) ? bytes! : ctx.buffer;
        const result = await (nativeParse as NativeParserWithBytes)(input as any, ctx.originalFileName);
        if (result) {
          // Skip UADE injection if a dedicated WASM engine handles audio
          const r = result as any;
          const hasDedicatedEngine = r.sonicArrangerFileData || r.soundMonFileData || r.digMugFileData || r.davidWhittakerFileData || r.soundControlFileData || r.deltaMusic1FileData || r.deltaMusic2FileData || r.soundFxFileData || r.gmcFileData || r.voodooFileData;
          if (!r.uadeEditableFileData && !hasDedicatedEngine) {
            (result as any).uadeEditableFileData = ctx.buffer.slice(0);
            (result as any).uadeEditableFileName = ctx.originalFileName;
          }
          if (hasDedicatedEngine) {
            return result;
          }
          // UADE handles ALL audio — tag every instrument as UADEEditableSynth
          // so the replayer's suppressNotes path works and no basic-synth audio
          // leaks through.  If native parser returned 0 instruments, create one.
          if (result.instruments.length === 0) {
            result.instruments = [{
              id: 0,
              name: 'UADE Audio',
              type: 'synth' as const,
              synthType: 'UADEEditableSynth' as const,
              effects: [],
              volume: -6,
              pan: 0,
              uade: {
                type: 'uade' as const,
                fileData: ctx.buffer.slice(0),
                filename: ctx.originalFileName,
                subsongCount: 1,
                currentSubsong: 0,
                metadata: { player: 'Unknown', formatName: 'Unknown', minSubsong: 0, maxSubsong: 0 },
              },
            }];
          } else {
            for (const inst of result.instruments) {
              inst.synthType = 'UADEEditableSynth';
            }
          }
          return injectUADEPlayback(result, ctx);
        }
      }
    } catch (err) {
      console.warn(`[${parserName}] Native parse failed for ${ctx.originalFileName}:`, err);
    }
    // Native parse failed — fall back to UADE for display too
    return callUADE(ctx);
  }

  if (ctx.prefs[prefKey] === 'native') {
    try {
      const bytes = (opts?.usesBytes || opts?.isFormat) ? new Uint8Array(ctx.buffer) : undefined;
      if (opts?.isFormat && bytes && !opts.isFormat(bytes)) {
        // Magic bytes don't match — skip native, go to UADE
        return callUADE(ctx);
      }
      const input = (opts?.usesBytes || opts?.isFormat) ? bytes! : ctx.buffer;
      const result = await (nativeParse as NativeParserWithBytes)(input as any, ctx.originalFileName);
      if (result) {
        // Defense-in-depth: if native parser returned 0 notes across all patterns,
        // it's likely a stub parser that couldn't actually parse the file.
        // Fall through to UADE instead of returning empty data.
        const totalNotes = result.patterns.reduce((sum, p) =>
          sum + p.channels.reduce((cSum, ch) =>
            cSum + ch.rows.filter(r => r.note > 0).length, 0), 0);
        if (totalNotes === 0) {
          console.warn(`[${parserName}] Native parser returned 0 notes for ${ctx.originalFileName}, falling back to UADE`);
          return callUADE(ctx);
        }
        return injectUADEPlayback(result, ctx);
      }
    } catch (err) {
      console.warn(`[${parserName}] Native parse failed for ${ctx.originalFileName}, falling back to UADE:`, err);
    }
  }
  return callUADE(ctx);
}

/**
 * Format that is native-only (no UADE fallback). Throws on failure.
 */
export async function withNativeOnly(
  ctx: FallbackContext,
  nativeParse: NativeParser,
): Promise<TrackerSong> {
  return nativeParse(ctx.buffer, ctx.originalFileName);
}

/**
 * Convenience: extract basename from a potentially path-containing filename.
 */
export function getBasename(filename: string): string {
  return (filename.split('/').pop() ?? filename).split('\\').pop()!.toLowerCase();
}
