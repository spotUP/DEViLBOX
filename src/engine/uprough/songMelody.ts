/**
 * The melody lane of a whole song: render_section's melody_buf, once per section (plan 2026-10-19 O6h). Mirrors
 * songBass.ts: one Float64Array per section of bars * bar_len + rate samples. A song file replays the host's decided
 * notes per bar (section.melody[b], null where the bar plays no melody: layer off, melody_from_bar, stem, voice bars),
 * so every bar with notes renders render_melody_bar at b * bar_len and the lane adds MIX_GAINS.melody times it.
 * The host passes the section seed (the song seed advanced by every earlier section's bars), not seed + b. BarEvents
 * carries neither the tempo nor the melody timbre, so the caller passes song.bpm and songMelodyVoice(doc).
 * Re-deciding the notes (melodyNotes.ts) is the bar player's job; this lane plays what the file recorded.
 */
import type { BarEvents } from '@/lib/uprough/barEvents';
import { renderMelodyBar, type MelodyBarNote } from './voices/melodyBar';
import { MIX_GAINS } from './mix/songMix';

export interface SongMelodyOptions {
  /** song.melody_voice: the style's melody timbre or the render override. */
  melodyVoice: string;
}

export function songMelody(events: BarEvents, bpm: number, options: SongMelodyOptions): Float64Array[] {
  const seed = events.params.seed as number;
  const rate = events.params.rate as number;
  const barLen = Math.trunc(rate * 60 / (bpm * 4)) * 16;
  const lanes: Float64Array[] = [];
  let bseed = seed;
  for (const section of events.sections) {
    const bars = section.drums.length;
    const length = bars * barLen + Math.trunc(1.0 * rate);
    const lane = new Float64Array(length);
    section.melody.forEach((mel, b) => {
      if (mel === null) return;
      const notes = mel.map(([semi, step, durSteps]): MelodyBarNote => ({ semi, step, durSteps }));
      const m = renderMelodyBar(options.melodyVoice, notes, { bpm, seed: bseed }, rate);
      // melody_buf[o:o + len(m)] += MIX_GAINS["melody"] * m
      const o = b * barLen;
      const n = Math.min(m.length, length - o);
      for (let k = 0; k < n; k++) lane[o + k] += MIX_GAINS.melody * m[k]!;
    });
    lanes.push(lane);
    bseed += bars;
  }
  return lanes;
}
