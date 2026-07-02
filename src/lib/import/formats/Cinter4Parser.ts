/**
 * Cinter4Parser.ts — Cinter4 Amiga synth format parser
 *
 * Cinter4 is a synthesizer-based Amiga music format by Askeksa. All instruments
 * are synthesized at init time from compact parameter sets — there are no samples.
 * The format uses a custom sequencer with 4 Paula channels.
 *
 * File layout (little-endian int16 words throughout):
 *   First word: n_raw_instruments (if negative, |n| raw instrument blocks follow)
 *   Raw instrument blocks: [length(u16), replength(u16)] × |n_raw|
 *   Next word: n_gen_instruments (count of generated/synthesized instruments)
 *   For each generated instrument:
 *     [length(u16), replength(u16), mpitch(i16), mod(i16), bpitch(i16), attack(i16)] — 6 words header
 *     [distortions(i16), ampdelta(i16), mpitchdecay(i16), moddecay(i16), bpitchdecay(i16)] × length — per-sample data
 *   After instruments: sequence/track data (format-specific, handled by WASM replayer)
 *
 * Reference: github.com/askeksa/Cinter — CinterConvert.py, player/Cinter4.S
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { InstrumentConfig } from '@/types';
import { cinter4WordsToParams, cinter4DetectVersion } from './cinter4Params';
import { buildCinter4Instrument } from '@/engine/cinter4/cinter4Instrument';

// ── Format Identification ─────────────────────────────────────────────────

/**
 * Returns true if `bytes` looks like a Cinter4 file.
 * There is no magic bytes header — detection is by structure:
 * - At least 4 bytes
 * - First int16 is 0 (no raw instruments) or negative (has raw instruments)
 *   followed by a non-negative generated-instrument count
 * - The `.cinter4` extension is the primary discriminator
 */
export function isCinter4Format(bytes: Uint8Array): boolean {
  if (bytes.length < 4) return false;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // All integers are big-endian (CinterConvert.py uses struct.pack(">h", ...))
  const v0 = view.getInt16(0, false); // signed BE int16
  // Layout: an OPTIONAL leading negative raw-instrument count followed by its raw
  // blocks (4 bytes each), then the generated-instrument count-1. When a song has
  // NO raw instruments, CinterConvert writes no leading word — the file starts
  // directly with the (non-negative) gen count-1. So a positive first word is a
  // valid all-synth Cinter song, not a rejection.
  const genCountOff = v0 < 0 ? 2 + (-v0) * 4 : 0;
  if (genCountOff + 2 > bytes.length) return false;
  const nGenMinus1 = view.getInt16(genCountOff, false);
  // n_gen_minus1 is the count-1 (68k dbra convention), actual count = n_gen_minus1+1
  if (!(nGenMinus1 >= -1 && nGenMinus1 <= 511)) return false;
  // Reject zero-filled buffers: first instrument must have a non-zero sample length
  const firstInstOff = genCountOff + 2;
  if (firstInstOff + 2 > bytes.length) return false;
  const firstInstLen = view.getUint16(firstInstOff, false);
  return firstInstLen > 0;
}

// ── Internal types ────────────────────────────────────────────────────────

export interface Cinter4InstrumentParams {
  length: number;       // sample length in words
  replength: number;    // loop length in words
  mpitch: number;       // master pitch (signed)
  mod: number;          // modulation depth (signed)
  bpitch: number;       // base pitch (signed)
  attack: number;       // attack time (signed)
  dist: number;         // distortion amount (signed)
  decay: number;        // decay time (signed)
  mpitchdecay: number;  // master pitch decay (signed)
  moddecay: number;     // modulation decay (signed)
  bpitchdecay: number;  // base pitch decay (signed)
}

interface Cinter4Instrument extends Cinter4InstrumentParams {
  index: number;
}

// ── Parser ────────────────────────────────────────────────────────────────

/**
 * Parse a Cinter4 file header to extract instrument metadata.
 * Full playback is handled by the WASM engine; the parser provides
 * metadata for the instrument list and TrackerSong structure.
 */
export function parseCinter4File(bytes: Uint8Array, filename: string): TrackerSong | null {
  if (!isCinter4Format(bytes)) return null;

  // All integers are big-endian (">h"/">H" in Python struct, as per CinterConvert.py)
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let off = 0;

  const readI16BE = (): number => {
    if (off + 2 > bytes.length) return 0;
    const v = view.getInt16(off, false);
    off += 2;
    return v;
  };
  const readU16BE = (): number => {
    if (off + 2 > bytes.length) return 0;
    const v = view.getUint16(off, false);
    off += 2;
    return v;
  };

  // Raw instruments: an OPTIONAL leading NEGATIVE count followed by |n| raw blocks
  // (4 bytes each). A non-negative first word means there is no raw section — that
  // word IS the generated count-1. Raw samples live in c_Instruments BEFORE the
  // generated ones, so note-table instrument indices are global (raw first).
  const firstWord = view.getInt16(0, false);
  const nRaw = firstWord < 0 ? -firstWord : 0;
  off = firstWord < 0 ? 2 : 0; // consume the raw-count word only when present

  const rawConfigs: InstrumentConfig[] = [];
  for (let r = 0; r < nRaw; r++) {
    const length    = readU16BE();
    const replength = readU16BE();
    rawConfigs.push({
      id: r + 1,
      name: `Raw Sample ${r + 1}`,
      type: 'synth' as const,
      synthType: 'Cinter4Synth' as const,
      effects: [],
      volume: 64,
      pan: 0,
      parameters: { raw: 1, length, replength } as unknown as Record<string, unknown>,
    } as InstrumentConfig);
  }

  // Generated instruments: stored as count-1 (68k dbra convention), so actual = value+1.
  // Each generated instrument is exactly 11 words (22 bytes) of parameters; the
  // per-sample synthesis data is generated at runtime, not stored in the file.
  const nGen = readI16BE() + 1;
  const instruments: Cinter4Instrument[] = [];

  for (let i = 0; i < nGen; i++) {
    if (off + 22 > bytes.length) break; // need 11 uint16s = 22 bytes
    const length    = readU16BE();
    const replength = readU16BE();
    const mpitch      = readI16BE();
    const mod         = readI16BE();
    const bpitch      = readI16BE();
    const attack      = readI16BE();
    const dist        = readI16BE();
    const decay       = readI16BE();
    const mpitchdecay = readI16BE();
    const moddecay    = readI16BE();
    const bpitchdecay = readI16BE();
    instruments.push({ index: i, length, replength, mpitch, mod, bpitch, attack, dist, decay, mpitchdecay, moddecay, bpitchdecay });
  }

  // Generated configs get GLOBAL ids (after the raw instruments) so they line up
  // with the note-table's instrument indices. The stored synth words are decoded
  // back to the 12 editable params (best-effort — version is inferred from the
  // pitch words since the songdata doesn't carry it) and the voice is synthesized
  // so each instrument is auditionable and editable, not just a parameter dump.
  const genConfigs: InstrumentConfig[] = instruments.map((inst) => {
    const words = {
      mpitch: inst.mpitch, mod: inst.mod, bpitch: inst.bpitch, attack: inst.attack,
      dist: inst.dist, decay: inst.decay, mpitchdecay: inst.mpitchdecay,
      moddecay: inst.moddecay, bpitchdecay: inst.bpitchdecay,
    };
    const version = cinter4DetectVersion(words);
    const params = cinter4WordsToParams(words, version);
    const id = nRaw + inst.index + 1;
    return buildCinter4Instrument(id, `Instrument ${id}`, {
      params,
      lengthWords: inst.length,
      replenWords: inst.replength,
      version,
    });
  });

  const instrumentConfigs: InstrumentConfig[] = [...rawConfigs, ...genConfigs];

  // ── Playback-only import ─────────────────────────────────────────────────────
  // A .cinter4 file is COMPILED songdata (CinterConvert.py output): the original
  // ProTracker rows, speed/BPM commands and effects were expanded into a flat 50 Hz
  // per-tick event stream during compilation, so there is no editable tracker
  // structure to recover from it. We import it as a playback-only module — the WASM
  // replayer plays the entire song (NativeEngineRouting routes Cinter4 with
  // suppressNotes) — and present a single placeholder pattern. Authoring and editing
  // Cinter songs happens on the ProTracker MOD path (DEViLBOX is MOD-native), not here.
  const pattern = {
    id: 'pattern-0',
    name: 'Pattern 0',
    length: 64,
    channels: Array.from({ length: 4 }, (_, ch) => ({
      id:           `channel-${ch}`,
      name:         `Channel ${ch + 1}`,
      muted:        false,
      solo:         false,
      collapsed:    false,
      volume:       100,
      pan:          ([-50, 50, 50, -50] as const)[ch] ?? 0,
      instrumentId: null,
      color:        null,
      rows: Array.from({ length: 64 }, () => ({
        note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0,
      })),
    })),
    importMetadata: {
      sourceFormat:            'Cinter4',
      sourceFile:              filename,
      importedAt:              new Date().toISOString(),
      originalChannelCount:    4,
      originalPatternCount:    0,
      originalInstrumentCount: instrumentConfigs.length,
    },
  };

  const moduleName = filename.replace(/\.[^/.]+$/, '');

  return {
    name:            moduleName,
    format:          'Cinter4' as TrackerFormat,
    patterns:        [pattern],
    instruments:     instrumentConfigs,
    songPositions:   [0],
    songLength:      1,
    restartPosition: 0,
    numChannels:     4,
    initialSpeed:    6,
    initialBPM:      125,
    linearPeriods:   false,
    cinter4FileData: new Uint8Array(bytes).buffer as ArrayBuffer,
  };
}
