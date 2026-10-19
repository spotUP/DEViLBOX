/**
 * The per-instrument insert chain of the Up Rough softsynth: a post-voice chain of bus effects
 * (effects/busEffects.ts, ported 1e-9 from the Python) applied inside the render so the cached buffer
 * includes it. Order, as the hiphop engine layers them: tape saturation, chorus, tape echo, sampler reverb
 * (hiphop.py: `_dsp.tape_sat` on the take, `_dsp.chorus` on the melody, `_echo` = `_dsp.delay(kind="tape")`,
 * `_sm.reverb(kind=...)`).
 *
 * Params are generated from BUS_EFFECTS (one toggle per effect, default off, plus the effect's own
 * parameters at their Python defaults), key `fx_<effect>` and `fx_<effect>_<param>`, group 'Effects'.
 * Echo and reverb tails need room: the signal is zero-padded by `insertTailSec` before the echo and the
 * reverb run, so a note's buffer grows when those are on and nothing is cut off.
 */
import type { ParameterDef } from '@/engine/registry/SynthDescriptor';
import {
  BUS_EFFECTS, CHORUS_KIND_IDS, DELAY_KIND_IDS, SAMPLER_REVERB_KIND_IDS, chorus, delay, reverb, tapeSat,
  type BusEffectId,
} from './busEffects';

export const INSERT_EFFECTS = ['tapeSaturation', 'chorus', 'delay', 'samplerReverb'] as const satisfies readonly BusEffectId[];
type InsertId = typeof INSERT_EFFECTS[number];

const KIND_TABLES = {
  chorus: CHORUS_KIND_IDS, delay: DELAY_KIND_IDS, samplerReverb: SAMPLER_REVERB_KIND_IDS,
} as const;
/** The echo insert is the hiphop tape echo, not the generic digital default. */
const DEFAULT_KIND: Partial<Record<InsertId, string>> = { delay: 'tape' };
const LABEL: Record<InsertId, string> = {
  tapeSaturation: 'Saturation', chorus: 'Chorus', delay: 'Tape Echo', samplerReverb: 'Reverb',
};
export const insertKey = (id: InsertId, param?: string): string => (param ? `fx_${id}_${param}` : `fx_${id}`);

/** Reverb ring-out appended when the reverb insert is on (the longest sampler room, warehouse, is under this). */
const REVERB_TAIL_SEC = 1.5;
const ECHO_TAIL_MAX_SEC = 3;

export const INSERT_PARAMS: readonly ParameterDef[] = INSERT_EFFECTS.flatMap((id): ParameterDef[] => [
  { key: insertKey(id), label: LABEL[id], group: 'Effects', type: 'toggle', min: 0, max: 1, default: 0 },
  ...BUS_EFFECTS[id].parameters.map((p): ParameterDef => {
    const table = (KIND_TABLES as Record<string, ReadonlyArray<readonly [string, string]>>)[id];
    const def = p.key === 'kind' && DEFAULT_KIND[id] && table ? table.findIndex(([k]) => k === DEFAULT_KIND[id]) : p.default;
    return { ...p, key: insertKey(id, p.key), label: `${LABEL[id]} ${p.label}`, group: 'Effects', default: def };
  }),
]);

const defaults = new Map(INSERT_PARAMS.map((p) => [p.key, p.default]));
type Params = Readonly<Record<string, number>>;
const get = (params: Params, key: string): number => params[key] ?? defaults.get(key)!;
const on = (params: Params, id: InsertId): boolean => get(params, insertKey(id)) >= 0.5;
const kindOf = (params: Params, id: InsertId): string => {
  const table = KIND_TABLES[id as keyof typeof KIND_TABLES];
  const i = Math.round(get(params, insertKey(id, 'kind')));
  return table[Math.min(Math.max(i, 0), table.length - 1)]![0];
};

/** Seconds of silence the enabled echo and reverb need after the voice (0 when neither is on). */
export function insertTailSec(params: Params): number {
  let t = 0;
  if (on(params, 'delay')) {
    const fb = Math.min(Math.max(get(params, insertKey('delay', 'fb')), 0), 0.95);
    const repeats = fb < 0.01 ? 1 : Math.ceil(Math.log(0.01) / Math.log(fb));
    t += Math.min(ECHO_TAIL_MAX_SEC, get(params, insertKey('delay', 'delaySec')) * (1 + repeats));
  }
  if (on(params, 'samplerReverb')) t += REVERB_TAIL_SEC;
  return t;
}

export function hasInserts(params: Params): boolean {
  return INSERT_EFFECTS.some((id) => on(params, id));
}

/** Apply the enabled inserts to a voice render; returns `x` itself when none is on. */
export function applyInserts(x: Float64Array, params: Params, rate: number): Float64Array {
  if (!hasInserts(params)) return x;
  const tail = Math.ceil(insertTailSec(params) * rate);
  let y: Float64Array = x;
  if (on(params, 'tapeSaturation')) y = tapeSat(y, get(params, insertKey('tapeSaturation', 'drive')));
  if (on(params, 'chorus')) {
    y = chorus(y, rate, {
      kind: kindOf(params, 'chorus') as 'stereo', depthMs: get(params, insertKey('chorus', 'depthMs')),
      rateHz: get(params, insertKey('chorus', 'rateHz')), mix: get(params, insertKey('chorus', 'mix')),
      voices: Math.round(get(params, insertKey('chorus', 'voices'))),
    });
  }
  if (tail > 0) { const padded = new Float64Array(y.length + tail); padded.set(y); y = padded; }
  if (on(params, 'delay')) {
    y = delay(y, rate, {
      kind: kindOf(params, 'delay') as 'tape', delaySec: get(params, insertKey('delay', 'delaySec')),
      fb: get(params, insertKey('delay', 'fb')), mix: get(params, insertKey('delay', 'mix')),
      damp: get(params, insertKey('delay', 'damp')), sat: get(params, insertKey('delay', 'sat')),
      wow: get(params, insertKey('delay', 'wow')),
    });
  }
  if (on(params, 'samplerReverb')) {
    y = reverb(y, rate, { kind: kindOf(params, 'samplerReverb') as 'small_room', mix: get(params, insertKey('samplerReverb', 'mix')) });
  }
  return y;
}
