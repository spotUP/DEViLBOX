/**
 * The song-level render (plan 2026-10-19 O6j): hiphop.render_track over a song file whose locked layers (sample,
 * chops, vocals, scratch) are absent. Per section the drums, bass and melody lanes (songDrums, songBass, songMelody)
 * run their bus chains (songBuses), join zero sample and vocal lanes and the scratch lane, and are balanced and summed by
 * mixSection; mixTrack then concatenates the sections and runs _apply_texture and master_bus. No DSP lives here: every
 * stage is an existing function.
 *
 * The host does NOT skip the scratch bus when a song has no scratch. render_section always renders the scratch section
 * (a blank plan gives zeros of bars * bar_len) and ages it with sampler.apply_macros at the style's dust, so the noise
 * floor and the dust of that call, then the dub echo and the scratch room, are normalised up to the scratch reference
 * level and summed into every section. That lane is ported here (scratchLane), from the DIRT scratch_* keys, for every
 * section including the drums-off ones. With vintage off the host's clean DIRT copy zeroes the dust; the macro call
 * still runs at the profile's own noise floor.
 *
 * Not reachable from a song file and so not inputs here: the `bus` block (validate requires it empty), the
 * HIPHOP_BUS_BALANCE and HIPHOP_DRUM_BUS_HEADROOM flags, and the view knobs beyond style and seed (bassBusLevel,
 * melodyYields default to the plain host values). DIRT master_rev / master_rev_mix are None for every style; they are
 * options for the maker's override only.
 */
import { songFileToBarEvents, type BarEvents } from '@/lib/uprough/barEvents';
import { songBassCut, songBassVoice, songGroove, songMelodyVoice } from '@/lib/uprough/songFile';
import type { SongFileDoc } from '@/lib/uprough/songFile';
import type { SamplerReverbKind } from './effects/busEffects';
import * as busEffects from './effects/busEffects';
import { reverb } from './effects/busEffects';
import * as songMix from './mix/songMix';
import { echo, type ScratchLane } from './mix/songMix';
import { bassBusGain, songBass } from './songBass';
import type { BassVoice } from './voices/bassSynth';
import { applyMacros, cleanDirt, dirtConfig, songBuses } from './songBuses';
import { songDrums, sectionDrumsOn } from './songDrums';
import { songMelody } from './songMelody';

/** The DIRT keys the scratch bus reads, plus STYLES[style].use_scratch. */
export interface ScratchDirt {
  /** DIRT dust (the runtime table, hiphop_subgenre.apply applied) times scratch_dust_k. */
  dust: number; room: SamplerReverbKind; roomMix: number; echoMix: number; useScratch: boolean;
}

const DUST: Readonly<Record<string, number>> = {
  old_school: 0.28, golden_era: 0.28, boom_bap: 0.12, east_coast: 0.28, jazz_rap: 0.12, abstract: 0.34, instrumental: 0.18,
  alternative: 0.2, lofi: 0.4, g_funk: 0.1, southern: 0.1, dirty_south: 0.4, crunk: 0.15, trap: 0.1, drill: 0.1,
  memphis: 0.4, miami_bass: 0.05, electro_hiphop: 0.08, industrial: 0.35,
};
const USE_SCRATCH: ReadonlyArray<string> = ['old_school', 'east_coast'];

/** hiphop.DIRT.get(style, DIRT["golden_era"]) scratch_* keys; every scratch_dust_k is 1.0. */
export function scratchDirt(style: string): ScratchDirt {
  const key = style in DUST ? style : 'golden_era';
  const golden = key === 'golden_era';
  return {
    dust: DUST[key]!, room: golden ? 'small_room' : 'warehouse', roomMix: golden ? 0.35 : 0.45,
    echoMix: golden ? 0.12 : 0.34, useScratch: USE_SCRATCH.includes(style),
  };
}

/** scratch.PROFILES[STYLE_TO_PROFILE[style]]["fx"]["delay_s"]: the channel delay time of the style's scratch profile. */
const SCRATCH_DELAY_SEC: Readonly<Record<string, number>> = {
  alternative: 0.14, crunk: 0.14, miami_bass: 0.14, electro_hiphop: 0.14, industrial: 0.14, southern: 0.14, trap: 0.14,
  drill: 0.14, g_funk: 0.2,
};

/**
 * scratch.render_scratch_section with a blank plan: zeros of bars * bar_len run through apply_fx, which returns a
 * LONGER buffer (the tape delay adds 4 d, the room reverb 0.12 s) while every sample stays zero. The host keeps that
 * length through the macros, the echo and the room, and only sums the first section-length samples.
 */
export function scratchBlankLength(style: string, length: number, rate: number): number {
  const d = Math.max(1, Math.trunc((SCRATCH_DELAY_SEC[style] ?? 0.18) * rate));
  return length + 4 * d + Math.trunc(0.12 * rate);
}

/** The scratch bus of one section with a blank plan: zeros, aged by the macros, then the dub throw and the room. */
export function scratchLane(
  length: number, rate: number, o: { dc: ScratchDirt; profile: string; vintage: boolean; d8d: number; seed: number },
): Float64Array {
  const dust = o.vintage ? o.dc.dust : 0.0;
  let scr = applyMacros(new Float64Array(length), rate, o.profile, o.seed, dust);
  scr = echo(scr, rate, o.d8d, 0.32, o.dc.echoMix, 0.35);
  return reverb(scr, rate, { kind: o.dc.room, mix: o.dc.roomMix, seed: o.seed });
}

export interface RenderSongOptions {
  style: string;
  /** song.bpm. */
  bpm: number;
  vintage: boolean;
  groove: ReturnType<typeof songGroove>;
  bassCut: number;
  bassVoice: BassVoice | null;
  melodyVoice: string;
  /** DIRT[style].master_rev / master_rev_mix, the maker's overrides (null for every style's own table row). */
  masterRev?: SamplerReverbKind | null;
  masterRevMix?: number | null;
}

/** Everything renderSong needs, read from a song file the way the sibling song tests read it. */
export function songRenderOptions(doc: SongFileDoc): RenderSongOptions {
  const song = doc.song;
  const render = song.render as { vintage?: boolean };
  return {
    style: song.style as string, bpm: song.bpm as number, vintage: render.vintage !== false,
    groove: songGroove(song), bassCut: songBassCut(song), bassVoice: songBassVoice(doc) as BassVoice | null,
    melodyVoice: songMelodyVoice(song),
  };
}

/** A one-section BarEvents whose seed is the section's starting bseed, so the per-section song functions run unchanged. */
function sectionSlice(events: BarEvents, index: number, bseed: number): BarEvents {
  return {
    ...events, params: { ...events.params, seed: bseed }, sections: [events.sections[index]!],
    arrangement: [events.arrangement[index]!], melody_windows: events.melody_windows ? [events.melody_windows[index]!] : events.melody_windows,
  };
}

/**
 * One section's pre-texture mix (songBuses + scratchLane + balanceBuses + sumBalanced) from its content and its starting
 * bseed (the song seed plus the bars before it): null for a section without bars. The sections of a song are independent
 * given that bseed, so this is the cacheable unit of renderSong. The drum bank keeps the song seed (events.params.seed).
 */
export function renderSectionMix(events: BarEvents, index: number, bseed: number, options: RenderSongOptions): Float64Array | null {
  const section = events.sections[index]!;
  const bars = section.drums.length;
  if (bars <= 0) return null;
  const rate = events.params.rate as number;
  const stepSamp = Math.trunc(rate * 60 / (options.bpm * 4));
  const barLen = stepSamp * 16;
  const d8d = 3 * stepSamp / rate;
  const bassGain = bassBusGain();
  const one = sectionSlice(events, index, bseed);
  const drums = songDrums(one, options.bpm, { bankSeed: events.params.seed as number });
  const bass = songBass(one, options.bpm, { groove: options.groove, bassCut: options.bassCut, bassVoice: options.bassVoice });
  const melody = songMelody(one, options.bpm, { melodyVoice: options.melodyVoice });
  const buses = songBuses(one, { style: options.style, bpm: options.bpm, vintage: options.vintage, drums, bass, melody });
  const base = dirtConfig(options.style);
  const profile = (options.vintage ? base : cleanDirt(base)).samplerProfile;
  const dc = scratchDirt(options.style);
  const tail = Math.trunc(1.0 * rate);
  const length = bars * barLen;
  const lanes = {
    drums: buses.drums[0]!, bass: buses.bass[0]!, melody: buses.melody[0]!,
    sample: new Float64Array(length + tail), vocal: new Float64Array(length + tail), reinforce: null,
  };
  const scratch: ScratchLane = {
    buf: scratchLane(scratchBlankLength(options.style, length, rate), rate, { dc, profile, vintage: options.vintage, d8d, seed: bseed }),
    useScratch: dc.useScratch, voiceBars: [], barLen,
  };
  const hasDrums = sectionDrumsOn(one, 0);
  const balanced = songMix.balanceBuses(lanes, { bassGain, hasDrums });
  return songMix.sumBalanced(balanced, { length, bassGain, hasDrums, rate, scratch });
}

/** The starting bseed of every section: the song seed plus the bars before it. */
export function sectionSeeds(events: BarEvents): number[] {
  let bseed = events.params.seed as number;
  return events.sections.map((section) => { const at = bseed; bseed += section.drums.length; return at; });
}

/** joinSections -> applyTexture -> masterBus over the sections' mixes (null entries, bar-less sections, are skipped). */
export function finishSong(sectionMixes: readonly (Float64Array | null)[], events: BarEvents, options: RenderSongOptions): Float64Array {
  const rate = events.params.rate as number;
  const seed = events.params.seed as number;
  const textured = songMix.applyTexture(songMix.joinSections(sectionMixes.filter((m): m is Float64Array => m !== null)), rate, {
    style: options.style, seed, masterRev: options.masterRev ?? null, masterRevMix: options.masterRevMix ?? null,
  });
  return Float64Array.from(busEffects.masterBus(textured, {}, rate), (v) => v / 127.0);
}

/** hiphop.render_track for a song with no locked layers: the final float64 mix (int8 / 127.0). */
export function renderSong(events: BarEvents, options: RenderSongOptions): Float64Array {
  const seeds = sectionSeeds(events);
  return finishSong(events.sections.map((_, i) => renderSectionMix(events, i, seeds[i]!, options)), events, options);
}

/** renderSong over a song file. */
export function renderSongFile(doc: SongFileDoc): Float64Array {
  return renderSong(songFileToBarEvents(doc), songRenderOptions(doc));
}
