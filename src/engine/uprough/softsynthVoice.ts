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

/**
 * The song file's note numbering (Up_Rough_Demo_System/tools/song_file.py note_name / note_midi): the cell
 * text "C-4" is MIDI 48. DEViLBOX names the same text MIDI 60 (noteToMidi), so the softsynth boundary
 * (UpRoughSoftsynth) subtracts this once and every voice hears the host's number.
 */
export const DEVILBOX_TO_HOST_MIDI = 12;

/** The host's drum cell note (song_file.DRUM_NOTE "C-4" = 48): the untransposed hit. */
export const HOST_DRUM_MIDI = 48;

/**
 * The note a voice hears, in the host's numbering (C-4 = 48): the piano plays hz(midi), the 808 plays trap808
 * semi (midi - 36), drums treat (midi - 48) as semitones on their `tune`.
 */
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
