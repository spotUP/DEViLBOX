/**
 * Sonix synth instrument params <-> config.parameters bridge.
 *
 * The authoritative synth params live in the WASM (parsed from the .instr files by
 * sonix_song_load_instruments). SonixEngine mirrors them out after load; the param
 * bridge stashes each instrument's SonixSynthParams under config.parameters.sonix so
 * the editor and voice read them as the single TS-side source of truth. Edits are
 * pushed back into the live WASM via SonixEngine.setSynthParams (set_wave rebuilds the
 * 64-band filter bank), and mirrored into the base-waveform preview voice.
 */

import type { InstrumentConfig } from '@typedefs/instrument';
import { SONIX_BRIDGE_SPEC, type SonixSynthParams } from './sonixSynthSpec';
import { normalizeSynthParams } from '@engine/replayer/WasmSynthParamBridge';

/**
 * Byte offsets of each synth-param field inside a Sonix `.instr` binary (SNX1 synthesis
 * voice). The SINGLE source of truth for the format layout — both `parseSonixSynthInstr`
 * (read) and `serializeSonixSynthInstr` (write) walk SONIX_BRIDGE_SPEC.paramSchema and
 * look each field's position up here, so the two are provably exact inverses. Scalars are
 * 2 big-endian bytes; `wave`/`envTable`/`lfoWave` are 128 signed bytes each; `egLevels`/
 * `egRates` are 4 big-endian u16 each. Offsets validated against the C oracle
 * (tools/sonix-audit/gen-presets.c) in sonixInstrParser.test.ts. `index` is not stored in
 * the file (it is the instrument's slot), so it has no offset.
 */
export const SONIX_INSTR_OFFSETS: Record<string, number> = {
  wave: 0x44,
  envTable: 0xc4,
  lfoWave: 0x144,
  baseVol: 0x1cc,
  portFlag: 0x1ce,
  envVolScale: 0x1d0,
  slideRate: 0x1d2,
  envPitchScale: 0x1d4,
  filterBase: 0x1d6,
  filterRange: 0x1d8,
  filterEnvSens: 0x1da,
  envScanRate: 0x1dc,
  envLoopMode: 0x1de,
  envDelayInit: 0x1e0,
  c2: 0x1e2,
  c4: 0x1e4,
  egLevels: 0x1e6,
  egRates: 0x1ee,
};

/** Read the mirrored Sonix synth params from an instrument config (null if absent). */
export function readSonixSynthParams(config: InstrumentConfig): SonixSynthParams | null {
  const params = config.parameters as Record<string, unknown> | undefined;
  const sonix = params?.sonix as SonixSynthParams | undefined;
  if (!sonix || typeof sonix.index !== 'number' || !Array.isArray(sonix.wave)) return null;
  return {
    ...sonix,
    lfoWave: Array.isArray(sonix.lfoWave) ? sonix.lfoWave : new Array(128).fill(0),
    egLevels: Array.isArray(sonix.egLevels) ? sonix.egLevels : [0, 0, 0, 0],
    egRates: Array.isArray(sonix.egRates) ? sonix.egRates : [0, 0, 0, 0],
  };
}

/**
 * Bake an additive harmonic partial into a 128-sample signed waveform (Aegis "2nd"/"3rd"
 * Harm + Amt). `amt` is 0..1 of full i8 scale. Returns a new clamped copy.
 */
export function addHarmonic(wave: number[], harmonic: 2 | 3, amt: number): number[] {
  if (amt === 0) return wave.slice();
  const n = wave.length;
  return wave.map((v, i) => {
    const partial = Math.round(Math.sin((2 * Math.PI * harmonic * i) / n) * 127 * amt);
    return Math.max(-128, Math.min(127, v + partial));
  });
}

/** Metadata for one editable Sonix synth parameter (scalar knobs). */
export interface SonixParamMeta {
  key: keyof SonixSynthParams;
  label: string;
  min: number;
  max: number;
  /** Format the raw value for display. */
  fmt?: (v: number) => string;
}

/**
 * Editable scalar synth params, in editor display order. Ranges follow the WASM
 * field widths (u16 → 0..65535; i16 loop_mode → signed). Waveform + envelope table
 * are edited separately (128-sample canvases), not as knobs.
 */
export const SONIX_PARAM_META: SonixParamMeta[] = [
  { key: 'baseVol',       label: 'Base Volume',    min: 0, max: 255 },
  { key: 'portFlag',      label: 'Porta → Volume', min: 0, max: 1 },
  { key: 'c2',            label: 'Blend Rate',     min: 0, max: 4095 },
  { key: 'c4',            label: 'Ring Depth',     min: 0, max: 4095 },
  { key: 'filterBase',    label: 'Filter Base',    min: 0, max: 63 },
  { key: 'filterRange',   label: 'Filter Range',   min: 0, max: 4095 },
  { key: 'filterEnvSens', label: 'Filter Env',     min: 0, max: 4095 },
  { key: 'envScanRate',   label: 'Env Scan Rate',  min: 0, max: 4095 },
  { key: 'envLoopMode',   label: 'Env Loop Mode',  min: -1, max: 127 },
  { key: 'envDelayInit',  label: 'Env Delay',      min: 0, max: 255 },
  { key: 'envVolScale',   label: 'Env → Volume',   min: 0, max: 4095 },
  { key: 'envPitchScale', label: 'Env → Pitch',    min: 0, max: 4095 },
  { key: 'slideRate',     label: 'Slide Rate',     min: 0, max: 4095 },
];

/**
 * Default Sonix synth params for a from-scratch instrument (created via the synth
 * browser, no loaded song to mirror from). A sawtooth base waveform (the Aegis default),
 * a flat envelope table, and sensible scalar defaults so the editor opens fully populated.
 */
export function getDefaultSonixParams(): SonixSynthParams {
  return {
    index: 0,
    baseVol: 128,
    portFlag: 0,
    c2: 0,
    c4: 0,
    filterBase: 32,
    filterRange: 0,
    filterEnvSens: 0,
    envScanRate: 0,
    envLoopMode: -1,
    envDelayInit: 0,
    envVolScale: 0,
    envPitchScale: 0,
    slideRate: 0,
    // Sawtooth ramp −128..127 across 128 samples (matches the Aegis default oscillator).
    wave: Array.from({ length: 128 }, (_, i) => Math.round((i / 127) * 255 - 128)),
    envTable: new Array(128).fill(0),
    lfoWave: new Array(128).fill(0),
    egLevels: [0, 0, 0, 0],
    egRates: [0, 0, 0, 0],
  };
}

/**
 * Parse a standalone Sonix `.instr` synth voice file into SonixSynthParams.
 *
 * Mirrors the synthesis-instrument decode in sonix_io.c (`decode_synthesis_wave`) plus the
 * `sonix_song_set_synth_*` setters — which store the raw big-endian u16 fields verbatim
 * (no clamp/scale). Reading the fixed struct offsets directly here therefore yields params
 * identical to the WASM decode, validated against the C oracle
 * (`tools/sonix-audit/gen-presets.c`) in sonixInstrParser.test.ts.
 *
 * Returns null if the bytes are not a synth voice (SampledSound / 8SVX → use the sample
 * path instead). MIDI-header voices resolve to the default sawtooth (as the WASM does).
 */
export function parseSonixSynthInstr(data: Uint8Array): SonixSynthParams | null {
  const be16 = (o: number): number => ((data[o] << 8) | data[o + 1]) & 0xffff;
  const be16s = (o: number): number => { const v = be16(o); return v >= 0x8000 ? v - 0x10000 : v; };
  const i8 = (o: number): number => { const v = data[o]; return v >= 0x80 ? v - 256 : v; };
  const read128 = (o: number): number[] => Array.from({ length: 128 }, (_, k) => i8(o + k));

  const tagAt = (len: number) => String.fromCharCode(...data.slice(0, len));
  const hasSynthHeader = data.length >= 9 && tagAt(9) === 'Synthesis';
  const hasMidiHeader = data.length >= 4 && tagAt(4) === 'MIDI';
  let hasZeroHeader = data.length >= 32;
  for (let k = 0; k < 32 && hasZeroHeader; k++) if (data[k] !== 0) hasZeroHeader = false;

  // MIDI voice: sawtooth default (matches the MIDI branch in gen-presets.c / sonix_io.c).
  if (hasMidiHeader) {
    const p = getDefaultSonixParams();
    p.wave = Array.from({ length: 128 }, (_, k) => k * 2 - 128);
    p.baseVol = 128;
    p.portFlag = 0;
    return p;
  }

  if (!hasSynthHeader && !hasZeroHeader) return null;
  if (data.length < 0xc4 + 64) return null; // decode_synthesis_wave size floor

  const O = SONIX_INSTR_OFFSETS;
  const p = getDefaultSonixParams();
  if (data.length >= O.wave + 128) p.wave = read128(O.wave);
  if (data.length >= O.envTable + 128) p.envTable = read128(O.envTable);
  if (data.length >= O.lfoWave + 128) p.lfoWave = read128(O.lfoWave); // 0x144 + 128 = 0x1C4
  if (data.length >= O.envVolScale) { p.baseVol = be16(O.baseVol); p.portFlag = be16(O.portFlag); }
  if (data.length >= O.egLevels) {
    p.envVolScale = be16(O.envVolScale);
    p.slideRate = be16(O.slideRate);
    p.envPitchScale = be16(O.envPitchScale);
    p.filterBase = be16(O.filterBase);
    p.filterRange = be16(O.filterRange);
    p.filterEnvSens = be16(O.filterEnvSens);
    p.envScanRate = be16(O.envScanRate);
    p.envLoopMode = be16s(O.envLoopMode);
    p.envDelayInit = be16(O.envDelayInit);
    p.c2 = be16(O.c2);
    p.c4 = be16(O.c4);
  }
  if (data.length >= O.egRates + 8) {
    p.egLevels = [0, 1, 2, 3].map((j) => be16(O.egLevels + j * 2));
    p.egRates = [0, 1, 2, 3].map((j) => be16(O.egRates + j * 2));
  }
  return p;
}

/**
 * Serialize edited SonixSynthParams back into a `.instr` synth-voice binary — the exact
 * inverse of {@link parseSonixSynthInstr}. Clones the ORIGINAL bytes and overwrites only the
 * synth-param fields at their SONIX_INSTR_OFFSETS positions, so every byte the parser never
 * read (the "Synthesis" header, reserved fields, trailing data) is preserved verbatim.
 *
 * The field set + numeric kinds come from SONIX_BRIDGE_SPEC (single source of truth); params
 * are first normalized through the same bridge core the live WASM setter uses, so out-of-range
 * scalars and mis-sized tables can never corrupt the file. Returns a fresh Uint8Array; the
 * `original` is not mutated. `index` carries no file offset (it is the instrument slot), so
 * it is skipped.
 */
export function serializeSonixSynthInstr(
  original: Uint8Array,
  params: SonixSynthParams,
): Uint8Array {
  const out = original.slice();
  const norm = normalizeSynthParams(SONIX_BRIDGE_SPEC, params);
  const put16 = (o: number, v: number): void => {
    if (o + 1 >= out.length) return;
    out[o] = (v >>> 8) & 0xff;
    out[o + 1] = v & 0xff;
  };

  for (const field of SONIX_BRIDGE_SPEC.paramSchema) {
    const off = SONIX_INSTR_OFFSETS[field.name];
    if (off === undefined) continue; // 'index' — not stored in the file
    const value = norm[field.name];

    if (field.kind === 'i8[]') {
      const arr = value as number[];
      const len = field.length ?? arr.length;
      for (let k = 0; k < len; k++) {
        if (off + k < out.length) out[off + k] = (arr[k] ?? 0) & 0xff;
      }
    } else if (field.kind === 'u16[]') {
      const arr = value as number[];
      const len = field.length ?? arr.length;
      for (let k = 0; k < len; k++) put16(off + k * 2, (arr[k] ?? 0) & 0xffff);
    } else {
      // Every scalar Sonix synth field is stored as 2 big-endian bytes (u16, or signed i16
      // for envLoopMode — two's-complement round-trips through the & 0xffff mask).
      put16(off, (value as number) & 0xffff);
    }
  }
  return out;
}

/** Apply a scalar param edit to a params object, returning a new copy. */
export function withSonixParam(
  params: SonixSynthParams,
  key: keyof SonixSynthParams,
  value: number,
): SonixSynthParams {
  return { ...params, [key]: value };
}
