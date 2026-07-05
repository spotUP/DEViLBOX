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
import type { SonixSynthParams } from './SonixEngine';

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

/** Apply a scalar param edit to a params object, returning a new copy. */
export function withSonixParam(
  params: SonixSynthParams,
  key: keyof SonixSynthParams,
  value: number,
): SonixSynthParams {
  return { ...params, [key]: value };
}
