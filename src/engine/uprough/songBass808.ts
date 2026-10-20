/**
 * The bass lane of a whole song for a whole-808 style: the render_section 808 block, once per section
 * (plan 2026-10-19 O6f; map 2026-10-20_o6f). Mirrors songDrums.ts: one Float64Array per section of
 * bars * bar_len + rate samples, silent where the host renders no 808 (bass layer off, bar dropped, style not 808).
 * The section seed is the song seed advanced by every earlier section's bars (the 808 line is rendered once per
 * section, not per bar). BarEvents carries neither the tempo, the groove nor bass_cut, so the caller passes the
 * song file's song.bpm, song.groove and song.bass_cut.
 */
import type { BarEvents } from '@/lib/uprough/barEvents';
import type { SongFileGroove } from '@/lib/uprough/songFile';
import { STYLE_808_PROFILE, render808Section, type Bar808Event } from './voices/bass808Section';
import { MIX_GAINS } from './mix/songMix';

export interface SongBass808Options {
  groove: SongFileGroove | null;
  bassCut: number;
  /** view.bass_bus_level (hiphop.bass_gain); the song file does not carry it. */
  bassBusLevel?: number;
}

/** The layers a section plays: the stem isolates one, the params.section fast path, else the arrangement row. */
function sectionBassOn(events: BarEvents, index: number): boolean {
  const { section, stem } = events.params;
  if (stem) return stem === 'bass';
  if (section) return section !== 'breakdown';
  return Boolean((events.arrangement[index]![2] as { bass: number }).bass);
}

export function songBass808(events: BarEvents, bpm: number, options: SongBass808Options): Float64Array[] {
  const style = events.params.style as string;
  const seed = events.params.seed as number;
  const rate = events.params.rate as number;
  const whole808 = style in STYLE_808_PROFILE;
  const barLen = Math.trunc(rate * 60 / (bpm * 4)) * 16;
  const bassGain = MIX_GAINS.bass * (options.bassBusLevel ?? 1.0);
  const lanes: Float64Array[] = [];
  let bseed = seed;
  events.sections.forEach((section, i) => {
    const bars = section.drums.length;
    const length = bars * barLen + Math.trunc(1.0 * rate);
    if (whole808 && sectionBassOn(events, i)) {
      const barEvents = section.drums.map((d, b) => {
        const bass = section.bass[b];
        if (d.drop === 'bass' || !bass) return null;
        return (bass.bev as { trap808?: Bar808Event[] }).trap808 ?? null;
      });
      const kickSteps = section.drums.map((d) => d.dev_merged
        .filter((e): e is [string, number, number, string] => Array.isArray(e) && e[0] === 'kick').map((e) => e[1]));
      lanes.push(render808Section({ bars: barEvents, kickSteps, style, bpm, rate, seed: bseed, groove: options.groove,
        bassCut: options.bassCut, bassGain, length }));
    } else {
      lanes.push(new Float64Array(length));
    }
    bseed += bars;
  });
  return lanes;
}
