/**
 * Song wavetable list edits for a Furnace song: the new list plus the index map that keeps every
 * reference (wave macros, wavetable synth waves, N163 wave, 10xx set-wave effect) on the same wave.
 * Furnace's own move leaves references alone (exchangeWave is a TODO); the editor remaps them.
 */
import type { FurnaceModuleWavetable, FurnaceNativeData } from '@/types/tracker';
import type { FurnaceConfig } from '@/types/instrument/furnace';

export type WaveListOp =
  | { kind: 'swap'; a: number; b: number }
  | { kind: 'delete'; index: number }
  | { kind: 'append' };

/** map[old] = new index of the wave that sat at `old`; a deleted wave maps to 0. */
export function waveIndexMap(op: WaveListOp, count: number): number[] {
  const map = Array.from({ length: count }, (_, i) => i);
  if (op.kind === 'swap') { map[op.a] = op.b; map[op.b] = op.a; }
  if (op.kind === 'delete') for (let i = 0; i < count; i++) map[i] = i === op.index ? 0 : i > op.index ? i - 1 : i;
  return map;
}

export function applyWaveListOp(list: FurnaceModuleWavetable[], op: WaveListOp, added?: FurnaceModuleWavetable): FurnaceModuleWavetable[] {
  const out = list.slice();
  if (op.kind === 'swap') [out[op.a], out[op.b]] = [out[op.b], out[op.a]];
  else if (op.kind === 'delete') out.splice(op.index, 1);
  else if (added) out.push(added);
  return out;
}

const re = (map: readonly number[], v: number): number => (v >= 0 && v < map.length ? map[v] : v);

/** Remap the wave references of one instrument's Furnace config in place. */
export function remapConfigWaves(cfg: FurnaceConfig, map: readonly number[]): void {
  for (const m of cfg.macros ?? []) if (m.code === 3) m.data = m.data.map((v) => re(map, v));
  if (cfg.n163) cfg.n163.wave = re(map, cfg.n163.wave);
  if (cfg.ws) { cfg.ws.wave1 = re(map, cfg.ws.wave1); cfg.ws.wave2 = re(map, cfg.ws.wave2); }
}

/** Remap every 10xx set-wave effect value in the native song in place. */
export function remapNativeWaveEffects(native: FurnaceNativeData, map: readonly number[]): void {
  for (const sub of native.subsongs) for (const ch of sub.channels) for (const pat of ch.patterns.values()) {
    for (const row of pat.rows) for (const e of row.effects) if (e.cmd === 0x10 && e.val >= 0) e.val = re(map, e.val);
  }
}
