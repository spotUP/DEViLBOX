/**
 * The per-lane bus chains of a whole song: render_section's vintage processing, once per section (plan 2026-10-19
 * O6i), ending before balance_buses. Drums, bass and melody lanes come from songDrums/songBass/songMelody and run the
 * host's chain: drums trim, drum_bus, restore, parallel_dirt, a dark 0.20 room; bass sampler process then an lp that
 * follows the style's bass voice; melody sampler macros, chorus, dotted-eighth echo, room, make-up. Each chain is gated
 * on the host's layer flags (stem, params.section fast path or the arrangement row, melody_from_bar), so a layer-on
 * section with all-null bars still runs the sampler and gets its noise and dither. The seed is the section seed (the
 * song seed advanced by every earlier section's bars), as in the sibling files. Sample, vocal, chops, scratch and
 * balance_buses are not here. The DIRT table is the runtime one (hiphop_subgenre.apply patches it in place); BarEvents
 * carries neither it, the bpm nor the vintage flag, so the caller passes the style, song.bpm and song vintage.
 */
import { hp, lp } from '@/engine/dj/scratch/refDsp';
import type { BarEvents } from '@/lib/uprough/barEvents';
import {
  SAMPLER_PROFILES, chorus, drumBus, parallelDirt, reverb, samplerProcess, type SamplerProfile, type SamplerReverbKind,
} from './effects/busEffects';
import { busMakeup, busRms, echo, restoreDrumTrim, trimDrumsToPeak } from './mix/songMix';
import { sectionBassOn } from './songBass';
import { sectionDrumsOn } from './songDrums';

/** hiphop.MELODY_MAKEUP_MAX. */
export const MELODY_MAKEUP_MAX = 4.0;

/** One style's DIRT entry, the keys the three chains read. */
export interface DirtConfig {
  samplerProfile: string; bassProfile: string; drumDrive: number; drumResample: string | null; parallel: number;
  melodyRoom: SamplerReverbKind; melodyRoomMix: number; melodyEchoMix: number;
  /** STYLES[style].bass_voice: picks the bass lp (3200 for the string voices, else 1600). */
  bassVoice: string;
}

type DirtRow = readonly [string, string, number, number, string];
const D = (sample: string, bass: string, drive: number, parallel: number, voice: string): DirtRow =>
  [sample, bass, drive, parallel, voice];
// [sample_prof, bass_prof, drum_drive, parallel, bass_voice]; every style has drum_resample None and melody_rev warehouse.
const DIRT_ROWS: Readonly<Record<string, DirtRow>> = {
  golden_era: D('mpc60', 's950', 0.12, 0.0, 'sampled'),
  boom_bap: D('sp1200', 's950', 0.14, 0.0, 'sampled'),
  old_school: D('sp1200', 's950', 0.10, 0.10, 'sampled'),
  east_coast: D('sp1200', 's950', 0.10, 0.12, 'sampled'),
  jazz_rap: D('mpc60', 's950', 0.08, 0.0, 'electric'),
  abstract: D('sp1200', 's950', 0.10, 0.12, 'sampled'),
  instrumental: D('mpc60', 's950', 0.10, 0.10, 'sampled'),
  alternative: D('mpc60', 's950', 0.10, 0.10, 'electric'),
  lofi: D('lofi_cassette', 's950', 0.09, 0.10, 'warmsub'),
  g_funk: D('mpc60', 'mpc60', 0.08, 0.0, 'gfunk'),
  southern: D('mpc60', 'amiga', 0.08, 0.0, '808'),
  dirty_south: D('cassette', 'amiga', 0.10, 0.12, '808'),
  crunk: D('mpc60', 'amiga', 0.10, 0.10, '808'),
  trap: D('mpc60', 'amiga', 0.08, 0.0, '808'),
  drill: D('mpc60', 'amiga', 0.08, 0.0, '808'),
  memphis: D('amiga', 'amiga', 0.10, 0.12, '808'),
  miami_bass: D('mpc60', 'amiga', 0.06, 0.0, 'electro'),
  electro_hiphop: D('mpc60', 'amiga', 0.06, 0.0, 'electro'),
  industrial: D('sp1200', 's950', 0.14, 0.15, 'reese'),
};

/** hiphop.DIRT.get(style, DIRT["golden_era"]) as patched by hiphop_subgenre.apply. */
export function dirtConfig(style: string): DirtConfig {
  const [samplerProfile, bassProfile, drumDrive, parallel, bassVoice] = DIRT_ROWS[style] ?? DIRT_ROWS.golden_era!;
  const lofi = style === 'lofi';
  return {
    samplerProfile, bassProfile, drumDrive, drumResample: null, parallel, bassVoice: DIRT_ROWS[style] ? bassVoice : 'sampled',
    melodyRoom: 'warehouse', melodyRoomMix: lofi ? 0.48 : 0.45, melodyEchoMix: lofi ? 0.34 : 0.32,
  };
}

/** hiphop._clean_dc: vintage off drops the drum drive, the drum resample and the parallel crunch. */
export function cleanDirt(dc: DirtConfig): DirtConfig {
  return { ...dc, drumResample: null, drumDrive: 0.0, parallel: 0.0 };
}

/**
 * sampler.apply_macros with no input_drive, alias, darkness or tape override. Dust 0 is exactly `process` at the
 * profile; dust raises the alias mix by 0.4 (capped at 1), the noise floor by 0.01 and lowers the output lowpass by 30%
 * per unit (a profile without one counts as 9000).
 */
export function applyMacros(x: ArrayLike<number>, rate: number, profile: string, seed: number, dust = 0): Float64Array {
  const base = SAMPLER_PROFILES[profile] ?? SAMPLER_PROFILES.mpc60!;
  const over: Partial<SamplerProfile> = dust
    ? { alias: Math.min(1.0, base.alias + 0.4 * dust), noise: base.noise + 0.01 * dust, outLp: (base.outLp || 9000) * (1.0 - 0.3 * dust) }
    : {};
  return samplerProcess(x, profile, rate, true, seed, over);
}

const STRING_BASS_VOICES = ['sampled', 'electric', 'warmsub'];
const FAST_PATH_MELODY_SECTIONS = ['hook', 'A', 'B', 'A2'];

/** The melody layer flag: stem, then the fast path or the arrangement row, then melody_from_bar >= bars switches it off. */
export function sectionMelodyOn(events: BarEvents, index: number, bars: number, melodyYields = false): boolean {
  const { section, stem } = events.params;
  let on: boolean;
  if (stem) on = stem === 'melody';
  else if (section) on = FAST_PATH_MELODY_SECTIONS.includes(section as string);
  else on = Boolean((events.arrangement[index]![2] as { melody: number }).melody);
  // The fast path's events carry no melody_windows; the host's melody_from_bar default is then `bars` when the song's
  // view has melody_yields (an approach knob no song file records) and 0 otherwise.
  const windows = events.melody_windows as unknown[] | undefined;
  const from = windows ? (windows[index] as number) : melodyYields ? bars : 0;
  return on && !(from >= bars);
}

export interface SongBusesOptions {
  style: string;
  /** song.bpm. */
  bpm: number;
  /** The render's vintage flag (song.params.vintage); false runs the clean DIRT copy. */
  vintage: boolean;
  drums: readonly Float64Array[];
  bass: readonly Float64Array[];
  melody: readonly Float64Array[];
  /** The view's melody_yields for a params.section fast-path render, which has no melody_windows (default false). */
  melodyYields?: boolean;
}

export interface SongBuses { drums: Float64Array[]; bass: Float64Array[]; melody: Float64Array[] }

export function songBuses(events: BarEvents, options: SongBusesOptions): SongBuses {
  const rate = events.params.rate as number;
  let bseed = events.params.seed as number;
  const base = dirtConfig(options.style);
  const dc = options.vintage ? base : cleanDirt(base);
  const stepSamp = Math.trunc(rate * 60 / (options.bpm * 4));
  const d8d = 3 * stepSamp / rate;
  const bassLp = STRING_BASS_VOICES.includes(base.bassVoice) ? 3200 : 1600;
  const out: SongBuses = { drums: [], bass: [], melody: [] };
  events.sections.forEach((section, i) => {
    const bars = section.drums.length;
    const seed = bseed;
    let drums: Float64Array = Float64Array.from(options.drums[i]!);
    if (sectionDrumsOn(events, i)) {
      const t = trimDrumsToPeak(drums);
      drums = drumBus(t.buf, rate, { drive: dc.drumDrive, resample: dc.drumResample, seed });
      drums = restoreDrumTrim(drums, t.trim);
      if (dc.parallel) drums = parallelDirt(drums, rate, { wet: dc.parallel });
      const room = reverb(hp(drums, 90, rate), rate, { kind: 'small_room', mix: 1.0, seed });
      drums = drums.map((v, k) => v + 0.20 * room[k]!);
    }
    let bass: Float64Array = Float64Array.from(options.bass[i]!);
    if (sectionBassOn(events, i)) bass = Float64Array.from(lp(samplerProcess(bass, dc.bassProfile, rate, true, seed), bassLp, rate));
    let melody: Float64Array = Float64Array.from(options.melody[i]!);
    if (sectionMelodyOn(events, i, bars, options.melodyYields)) {
      const melIn = busRms(melody);
      melody = applyMacros(melody, rate, dc.samplerProfile, seed);
      melody = chorus(melody, rate, { mix: 0.38 });
      melody = echo(melody, rate, d8d, 0.34, dc.melodyEchoMix, 0.35);
      melody = reverb(melody, rate, { kind: dc.melodyRoom, mix: dc.melodyRoomMix, seed });
      melody = busMakeup(melody, melIn, MELODY_MAKEUP_MAX);
    }
    out.drums.push(drums); out.bass.push(bass); out.melody.push(melody);
    bseed += bars;
  });
  return out;
}
