/**
 * The Up Rough softsynth as a tracker instrument: one voice = one pure render function ported from the
 * demo system's Python reference (tools/drummachine.py, trap808.py, synth_factory.py), float64 whole array
 * at SOFTSYNTH_RATE, the shape of the scratch port (src/engine/dj/scratch/). The song logic (patterns,
 * arrangement, style tables) stays in the demo system: in the tracker the user writes the notes.
 *
 * A voice's params are the Python function's keyword arguments with the Python defaults, declared as the
 * registry's ParameterDef so the instrument editor shows them. `render` is pure: same params, note and seed
 * give the same samples.
 */

import type { ParameterDef } from '@/engine/registry/SynthDescriptor';

/** The engine rate of the reference (hiphop / drummachine RATE). */
export const SOFTSYNTH_RATE = 22050;

/** The tracker note a voice hears; drums treat (midi - 60) as semitones on their `tune`. */
export interface SoftsynthNote {
  midi: number;
  durSec: number;
  velocity: number;
}

export interface SoftsynthVoice {
  id: string;
  label: string;
  params: readonly ParameterDef[];
  render(params: Readonly<Record<string, number>>, note: SoftsynthNote, rate: number, seed: number): Float64Array;
}

/** Every param at its declared default. */
export function voiceDefaults(voice: SoftsynthVoice): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of voice.params) out[p.key] = p.default;
  return out;
}
