/**
 * The bass lane of a whole song: render_section's bass_buf, once per section (plan 2026-10-19 O6f, O6g; map
 * 2026-10-20_o6f). Mirrors songDrums.ts: one Float64Array per section of bars * bar_len + rate samples, silent where the
 * host renders no bass (bass layer off, bar dropped). A whole-808 section (render.use_trap808, default on for every
 * STYLE_808_PROFILE style) renders its merged 808 line once; any other section renders render_bass_bar per bar at
 * b * bar_len in the style's bass_voice.
 * The section seed is the song seed advanced by every earlier section's bars; both paths take it whole (the host passes
 * the section seed to render_bass_bar, not seed + b). BarEvents carries neither the tempo, the groove, bass_cut nor the
 * bass voice, so the caller passes the song file's song.bpm, song.groove, song.bass_cut and songBassVoice(doc).
 */
import type { BarEvents } from '@/lib/uprough/barEvents';
import type { SongFileGroove } from '@/lib/uprough/songFile';
import { STYLE_808_PROFILE, render808Section, type Bar808Event } from './voices/bass808Section';
import { renderBassBar, type BassBarEvent } from './voices/bassBar';
import type { BassVoice } from './voices/bassSynth';
import { MIX_GAINS } from './mix/songMix';

export interface SongBassOptions {
  groove: SongFileGroove | null;
  bassCut: number;
  /** The style's bass_voice (the song file's bar.bass.voice); only the per-bar path reads it. */
  bassVoice: BassVoice | null;
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

/** hiphop._resolve_use_trap808 and is_808_style: unset means on for every 808 style (TRAP808_DEFAULT_STYLES). */
function isWhole808(events: BarEvents): boolean {
  const style = events.params.style as string;
  const use = events.params.use_trap808;
  return style in STYLE_808_PROFILE && (use === undefined || use === null ? true : Boolean(use));
}

/** A gen_bass event (semi, step, dur_steps, glide[, vel]); a four-tuple plays at full velocity. */
const bassEvent = ([semi, step, durSteps, glide, vel]: (number | null)[]): BassBarEvent =>
  ({ semi: semi!, step: step!, durSteps: durSteps!, glide, ...(vel === undefined ? {} : { vel: vel! }) });

export function songBass(events: BarEvents, bpm: number, options: SongBassOptions): Float64Array[] {
  const style = events.params.style as string;
  const seed = events.params.seed as number;
  const rate = events.params.rate as number;
  const whole808 = isWhole808(events);
  const barLen = Math.trunc(rate * 60 / (bpm * 4)) * 16;
  const bassGain = MIX_GAINS.bass * (options.bassBusLevel ?? 1.0);
  const lanes: Float64Array[] = [];
  let bseed = seed;
  events.sections.forEach((section, i) => {
    const bars = section.drums.length;
    const length = bars * barLen + Math.trunc(1.0 * rate);
    const on = sectionBassOn(events, i);
    if (whole808 && on) {
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
      const lane = new Float64Array(length);
      if (on) {
        section.drums.forEach((d, b) => {
          const bass = section.bass[b];
          if (d.drop === 'bass' || !bass) return;
          if (options.bassVoice === null) throw new Error(`Section ${i} plays the per-bar bass but no bass voice was given.`);
          const bs = renderBassBar(options.bassVoice, (bass.bev as (number | null)[][]).map(bassEvent),
            { bpm, seed: bseed, bcut: options.bassCut, groove: options.groove }, rate);
          // bass_buf[o:o + len(bs)] += g * bs
          const o = b * barLen;
          const n = Math.min(bs.length, length - o);
          for (let k = 0; k < n; k++) lane[o + k] += bassGain * bs[k]!;
        });
      }
      lanes.push(lane);
    }
    bseed += bars;
  });
  return lanes;
}
