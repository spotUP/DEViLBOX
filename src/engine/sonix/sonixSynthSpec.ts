/**
 * sonixSynthSpec.ts — dependency-free Sonix reflected-synth param schema.
 *
 * Extracted from SonixEngine so the pure import/export layers (the `.instr` parser and
 * serializer in sonixInstrument.ts, the IFF SMUS exporter) can reuse the SINGLE param
 * schema without dragging in the WASM engine / AudioContext / oscilloscope store.
 * SonixEngine re-exports both symbols, so existing consumers are unaffected.
 */

import type { WasmSynthParamBridgeSpec } from '@engine/replayer/WasmSynthParamBridge';

/** Per-instrument SNX1 synth parameters, mirrored from the WASM for the editor. */
export interface SonixSynthParams {
  index: number;
  baseVol: number;
  portFlag: number;
  c2: number;
  c4: number;
  filterBase: number;
  filterRange: number;
  filterEnvSens: number;
  envScanRate: number;
  envLoopMode: number;
  envDelayInit: number;
  envVolScale: number;
  envPitchScale: number;
  slideRate: number;
  wave: number[];     // 128 signed bytes
  envTable: number[]; // 128 signed bytes
  lfoWave: number[];  // third 128-sample table @0x144 (Aegis "LFO" waveform tab)
  egLevels: number[]; // 4-stage envelope generator targets
  egRates: number[];  // 4-stage envelope generator speeds (raw u16, bit-packed base/shift)
  [key: string]: unknown; // index-signature so the generic bridge can (de)serialize by field name
}

/**
 * Bridge descriptor for the Sonix reflected synth — drives the shared WASM↔store param
 * plumbing (see WasmSynthParamBridge). The worklet emits `synthParams` / consumes
 * `setSynthParams` matching these message names and the schema below. Scalar widths follow the
 * WASM field types (raw big-endian u16 fields; envLoopMode signed); the three 128-sample
 * tables are signed i8; the 4-stage EG level/rate arrays are raw u16.
 *
 * This is the SINGLE source of truth for the field set + numeric kinds. The `.instr` binary
 * (de)serializer in sonixInstrument.ts walks it verbatim, pairing each field with its byte
 * offset from SONIX_INSTR_OFFSETS — so adding a field here (and its offset there) is all it
 * takes to round-trip it, with no per-field code re-listing.
 */
export const SONIX_BRIDGE_SPEC: WasmSynthParamBridgeSpec<SonixSynthParams> = {
  engineKey: 'Sonix',
  synthType: 'SonixSynth',
  matchKey: 'sonixIndex',
  blobKey: 'sonix',
  indexField: 'index',
  reportMessage: 'synthParams',
  setMessage: 'setSynthParams',
  paramSchema: [
    { name: 'index', kind: 'u8' },
    { name: 'baseVol', kind: 'u16' },
    { name: 'portFlag', kind: 'u16' },
    { name: 'c2', kind: 'u16' },
    { name: 'c4', kind: 'u16' },
    { name: 'filterBase', kind: 'u16' },
    { name: 'filterRange', kind: 'u16' },
    { name: 'filterEnvSens', kind: 'u16' },
    { name: 'envScanRate', kind: 'u16' },
    { name: 'envLoopMode', kind: 'i16' },
    { name: 'envDelayInit', kind: 'u16' },
    { name: 'envVolScale', kind: 'u16' },
    { name: 'envPitchScale', kind: 'u16' },
    { name: 'slideRate', kind: 'u16' },
    { name: 'wave', kind: 'i8[]', length: 128 },
    { name: 'envTable', kind: 'i8[]', length: 128 },
    { name: 'lfoWave', kind: 'i8[]', length: 128 },
    { name: 'egLevels', kind: 'u16[]', length: 4 },
    { name: 'egRates', kind: 'u16[]', length: 4 },
  ],
};
