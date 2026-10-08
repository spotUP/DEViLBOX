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
import type { UADEEngine, UADEMetadata } from '@/engine/uade/UADEEngine';
import type { FormatEnginePreferences } from '@/stores/useSettingsStore';
// "Has a dedicated engine" is asked of the engine registry itself. Two
// hand-written lists stood here, copied from it and disagreeing (11 and 24 of
// 60-odd engines), so songs with an engine of their own were handed to UADE
// too. The registry module is data only; importing it loads no engine.
import { playsOnDedicatedEngine } from '@/engine/replayer/wasmEngineRegistry';
import { gridOpensInScopeView } from '@/lib/tracker/gridOpensInScopeView';
import { levelSamplerForUade } from '@/lib/import/uadeKeyLevel';

/** Common context passed through all fallback helpers */
export interface FallbackContext {
  buffer: ArrayBuffer;
  originalFileName: string;
  prefs: FormatEnginePreferences;
  subsong: number;
  preScannedMeta?: UADEMetadata;
  /** Companion files (e.g. SMPL.* for MIDI-Loriciel, .ssd for Paul Robotham) */
  companionFiles?: Map<string, ArrayBuffer>;
  /** The UADE engine a scan runs on; absent = the editor's. A deck parse passes its own. */
  uadeEngine?: UADEEngine;
}

/**
 * Native per-note synth voices that coexist with UADE whole-song playback:
 * the module still plays via UADE (uadeEditableFileData / suppressNotes), but
 * auditioning one of these instruments plays that native voice instead of
 * restarting the module. Kept out of the UADEEditableSynth clobber below.
 */
// SoundMonSynth and FuturePlayerSynth run the replayer's own note start (the
// preview voice of the loaded module): an instrument the format defines as a
// synth keeps that voice whether or not the parser also rendered PCM for it.
// Choosing Sampler by has-PCM played the rendered waveform instead of the synth
// (owner, 2026-10-06, SoundMon antidust.bp3).
const NATIVE_AUDITION_SYNTHS = new Set([
  'SunTronicSynth', 'FredSynth', 'SoundMonSynth', 'FuturePlayerSynth', 'SidMonSynth',
  // Keyboard voices of the replayers themselves (ledger K2): the rendered PCM these parsers also keep is
  // one fixed-pitch loop of the waveform (an octave off, a bleep), not the instrument.
  'DavidWhittakerSynth', 'StartrekkerAMSynth', 'DigMugSynth', 'SonicArrangerSynth',
  'DeltaMusic1Synth', 'DeltaMusic2Synth', 'InStereo1Synth', 'InStereo2Synth',
  // K7: Rob Hubbard plays through UADE (injectUADE), so the clobber below made every instrument a
  // UADEEditableSynth whose key plays nothing; the keyboard voice is the replayer own voice (robhubbard_synth.c).
  'RobHubbardSynth',
  // K9: Hippel ST plays on its own engine (HippelStEngine); a key starts the instrument on its keyboard player.
  'HippelStSynth',
]);

/**
 * Per-note WASM voices that play ONE instrument of a song on the keyboard
 * (ToneEngine "UADE format-specific synths (per-note WASM synthesis)" block,
 * built by InstrumentFactory from the instrument's own config). A dedicated
 * engine plays the song itself; these voices exist only so an instrument with
 * no PCM can still be auditioned. Whole-song replayer types (SoundMonWasmSynth,
 * DssWasmSynth, ActionamicsWasmSynth, MusicAssemblerSynth, SynthesisWasmSynth,
 * ...) are NOT here: they have no note-on voice, so such instruments stay
 * silent on the keyboard (nothing to play, and nothing is faked).
 */
export const KEYBOARD_VOICE_SYNTHS: ReadonlySet<string> = new Set([
  'SoundMonSynth', 'SidMonSynth', 'SidMon1Synth', 'DigMugSynth', 'FCSynth', 'FredSynth',
  'TFMXSynth', 'OctaMEDSynth', 'HippelCoSoSynth', 'RobHubbardSynth', 'SteveTurnerSynth', 'HippelStSynth',
  'DavidWhittakerSynth', 'SonicArrangerSynth', 'InStereo1Synth', 'InStereo2Synth',
  'StartrekkerAMSynth', 'DeltaMusic1Synth', 'DeltaMusic2Synth', 'FuturePlayerSynth',
  'SunTronicSynth',
]);

/**
 * Synth type a dedicated-engine song's instrument gets. The engine plays the
 * song, so unknown synth types are flattened to 'Sampler' (no error dialogs) -
 * but only when the instrument has sample data. A synth instrument without PCM
 * would become an EmptySampler (silent keyboard), so it keeps its voice when
 * one exists.
 */
export function dedicatedEngineSynthType(inst: {
  synthType?: string;
  sample?: { audioBuffer?: ArrayBuffer | null; url?: string } | null;
}): string {
  const t = inst.synthType ?? 'Sampler';
  if (NATIVE_AUDITION_SYNTHS.has(t)) return t;
  const hasPcm = (inst.sample?.audioBuffer?.byteLength ?? 0) > 0 || !!inst.sample?.url;
  if (hasPcm) return 'Sampler';
  return KEYBOARD_VOICE_SYNTHS.has(t) ? t : 'Sampler';
}

type NativeParser = (buffer: ArrayBuffer, filename: string) => Promise<TrackerSong> | TrackerSong;

/** Note cells across the whole grid. Zero means a stub parser's placeholder. */
export function countNotes(song: Pick<TrackerSong, 'patterns'>): number {
  return song.patterns.reduce((sum, p) =>
    sum + p.channels.reduce((cSum, ch) =>
      cSum + ch.rows.filter((r) => r.note > 0).length, 0), 0);
}
type NativeParserWithBytes = (bytes: Uint8Array, filename: string) => Promise<TrackerSong | null> | TrackerSong | null;

/** Call UADE as fallback */
export async function callUADE(ctx: FallbackContext): Promise<TrackerSong> {
  const { parseUADEFile } = await import('@lib/import/formats/UADEParser');
  return parseUADEFile(
    ctx.buffer, ctx.originalFileName,
    ctx.prefs.uade ?? 'enhanced', ctx.subsong, ctx.preScannedMeta,
    ctx.companionFiles, ctx.uadeEngine,
  );
}

/**
 * If a native parser result has uadePatternLayout, inject the raw file binary
 * so UADE can handle playback while the native parser provides pattern display.
 */
export function injectUADEPlayback(result: TrackerSong, ctx: FallbackContext): TrackerSong {
  const ra = result as any;
  if (ra.uadePatternLayout && !ra.uadeEditableFileData && !playsOnDedicatedEngine(result)) {
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
        // A placeholder grid (stub parser: one empty 64-row pattern) must not
        // pre-empt the UADE scan. Formats with NO parser got the heuristic
        // scan grid; formats with a stub got an empty one - worse than having
        // no parser at all (eco.gray, spacestation.jmf, count duckula.scr,
        // ..., ledger F6). The `native` branch below already falls through on
        // zero notes; this branch did not.
        // A song flagged unmatched (gridUnmatchedReason) is the scope-view answer: keep it and its reason.
        if (result && countNotes(result) === 0 && !gridOpensInScopeView(result)) {
          console.warn(`[${parserName}] Native parser returned 0 notes for ${ctx.originalFileName}; UADE builds the grid`);
          return callUADE(ctx);
        }
        if (result) {
          // Skip UADE injection if a dedicated WASM engine handles audio
          const r = result as any;
          const dedicated = playsOnDedicatedEngine(result);
          if (!r.uadeEditableFileData && !dedicated) {
            (result as any).uadeEditableFileData = ctx.buffer.slice(0);
            (result as any).uadeEditableFileName = ctx.originalFileName;
          }
          if (dedicated) {
            // Dedicated WASM engine handles all audio — set instruments to
            // 'Sampler' so ToneEngine doesn't try to instantiate unknown
            // synth types (e.g. 'SynthesisWasmSynth') and show error dialogs.
            // An instrument with no PCM keeps its native keyboard voice
            // (dedicatedEngineSynthType); flattening it left an empty Sampler
            // and a silent keyboard.
            for (const inst of result.instruments) {
              inst.synthType = dedicatedEngineSynthType(inst) as typeof inst.synthType;
            }
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
              // Preserve native audition voices (e.g. SunTronicSynth): the song
              // still plays through UADE via uadeEditableFileData (suppressNotes),
              // but auditioning the instrument plays THAT voice, not the module.
              if (NATIVE_AUDITION_SYNTHS.has(inst.synthType)) continue;
              // A Sampler the native parser filled with the file's own PCM keeps its voice: the song still plays
              // through UADE, but a key on the instrument plays that sample (period playback), where a
              // UADEEditableSynth key plays nothing (K8: Richard Joseph .sng/.ins held 24 such instruments).
              if (inst.synthType === 'Sampler' && ((inst.sample?.audioBuffer?.byteLength ?? 0) > 0 || !!inst.sample?.url)) {
                levelSamplerForUade(inst);
                continue;
              }
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
        if (countNotes(result) === 0 && !gridOpensInScopeView(result)) {
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
