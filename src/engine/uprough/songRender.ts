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
import { bassBusGain, sectionBassOn, songBass } from './songBass';
import type { BassVoice } from './voices/bassSynth';
import { applyMacros, cleanDirt, dirtConfig, songBuses } from './songBuses';
import { songDrums, sectionDrumsOn } from './songDrums';
import { songMelody } from './songMelody';
import { songDrumBank, type DrumBank, type HipHopStyle } from './drumBank';
import { createEmitter, type Emitter, type OnEvent } from './r2Events';
import { envOf, peaks, type Env, type Peaks } from './r2Peaks';

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
  /** The R2 render-event listener (spec 2026-10-20_r2a-event-protocol.md 3.3). No listener: nothing is summarised or copied. */
  onEvent?: OnEvent;
  /** The caller already ran act 1 (the bank build) for this song: suppress the stage, bank and attach events. */
  bankSeen?: boolean;
}

/** What one render carries between its steps: the emitter (only with a listener) and the bank built once for the whole song. */
export interface RenderCtx { em?: Emitter; bank?: DrumBank }

/** The layers of an arrangement row that are on, in the row's key order. */
const layerNames = (row: unknown): string[] =>
  Object.entries((row ?? {}) as Record<string, unknown>).filter(([, v]) => Boolean(v)).map(([k]) => k);

/**
 * Builds the song's drum bank with every voice stage observed and, with `announce`, emits `stage*` and `bank` per
 * voice in bank order and an `attach` for each snare variant (act 1). The factory panel calls this for a Generate,
 * where no render has started yet (R2f): the same events, from the same code, as a render's own bank build.
 */
export function buildBank(em: Emitter, style: HipHopStyle, rate: number, seed: number, announce = true): DrumBank {
  const stages = new Map<string, { stage: string; peaks: Peaks; env?: Env }[]>();
  const bank = songDrumBank(style, rate, seed, (voice, stage, buf, isEnv) => {
    let list = stages.get(voice);
    if (!list) stages.set(voice, list = []);
    list.push(isEnv ? { stage, peaks: peaks(buf), env: envOf(buf) } : { stage, peaks: peaks(buf) });
  });
  if (announce) {
    for (const [voice, buf] of Object.entries(bank)) {
      if (voice === 'snare_accent' || voice === 'snare_ghost') {
        em.emit({ type: 'attach', voice, parent: 'snare', peaks: peaks(buf) });
        continue;
      }
      stages.get(voice)?.forEach((st, index) => em.emit({ type: 'stage', voice, index, ...st }));
      em.emit({ type: 'bank', voice, peaks: peaks(buf), len: buf.length });
    }
  }
  return bank;
}

/**
 * Starts a render's event stream: `start`, then (M1) the drum bank built ONCE for the song with every voice stage
 * observed, as `stage*` and `bank` per voice in bank order and an `attach` for each snare variant. Without a listener
 * it returns an empty ctx and builds nothing (the bank is built per call as before; same bytes, the bank is deterministic).
 */
export function beginRender(events: BarEvents, options: RenderSongOptions): RenderCtx {
  const em = createEmitter(options.onEvent);
  if (!em) return {};
  const rate = events.params.rate as number;
  const seed = events.params.seed as number;
  em.emit({
    type: 'start', mode: 'render', rate, style: events.params.style as string, seed,
    sections: events.arrangement.map((row, i) => ({
      name: String(row[0]), bars: events.sections[i]!.drums.length, layers: layerNames(row[2]),
    })),
  });
  const bank = buildBank(em, events.params.style as HipHopStyle, rate, seed, !options.bankSeen);
  return { em, bank };
}

/** The first bar-length span of a lane from its first rendered bar: the `born` peaks of a lane event. */
function bornPeaks(lane: Float64Array, firstBar: number, barLen: number): Peaks {
  return peaks(lane.subarray(firstBar * barLen, Math.min(lane.length, (firstBar + 1) * barLen)));
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
export function renderSectionMix(
  events: BarEvents, index: number, bseed: number, options: RenderSongOptions, ctx: RenderCtx = {},
): Float64Array | null {
  const section = events.sections[index]!;
  const bars = section.drums.length;
  const em = ctx.em;
  if (em) em.emit({ type: 'section', section: index, name: String(events.arrangement[index]![0]), bars, cached: false });
  if (bars <= 0) return null;
  const rate = events.params.rate as number;
  const stepSamp = Math.trunc(rate * 60 / (options.bpm * 4));
  const barLen = stepSamp * 16;
  const d8d = 3 * stepSamp / rate;
  const bassGain = bassBusGain();
  const one = sectionSlice(events, index, bseed);
  const drums = songDrums(one, options.bpm, {
    bankSeed: events.params.seed as number, ...(ctx.bank ? { bank: ctx.bank } : {}),
    ...(em ? { onHatPool: (_: number, pool: Float64Array[]) =>
      em.emit({ type: 'hatpool', section: index, variants: pool.map((v, k) => ({ name: `hat_${k}`, peaks: peaks(v) })) }) } : {}),
  });
  const bass = songBass(one, options.bpm, { groove: options.groove, bassCut: options.bassCut, bassVoice: options.bassVoice });
  const melody = songMelody(one, options.bpm, { melodyVoice: options.melodyVoice });
  if (em) {
    const hasMel = section.melody.some((m) => m !== null);
    const laneEvent = (lane: 'drums' | 'bass' | 'melody', buf: Float64Array, first: number): void =>
      em.emit({ type: 'lane', section: index, lane, peaks: peaks(buf), born: bornPeaks(buf, first, barLen) });
    if (sectionDrumsOn(one, 0)) {
      laneEvent('drums', drums[0]!, Math.max(0, section.drums.findIndex((d) => d.drop !== 'drums')));
    }
    if (sectionBassOn(one, 0)) {
      laneEvent('bass', bass[0]!, Math.max(0, section.drums.findIndex((d, b) => d.drop !== 'bass' && Boolean(section.bass[b]))));
    }
    if (hasMel) laneEvent('melody', melody[0]!, section.melody.findIndex((m) => m !== null));
  }
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
  const sum = songMix.sumBalanced(balanced, { length, bassGain, hasDrums, rate, scratch });
  if (em) {
    // The buses are the pre-balance chain outputs; the scratch lane event is deferred to here (M6), between the last bus and mix.
    em.emit({ type: 'bus', section: index, bus: 'drums', peaks: peaks(buses.drums[0]!) });
    em.emit({ type: 'bus', section: index, bus: 'bass', peaks: peaks(buses.bass[0]!) });
    if (section.melody.some((m) => m !== null)) em.emit({ type: 'bus', section: index, bus: 'melody', peaks: peaks(buses.melody[0]!) });
    em.emit({ type: 'lane', section: index, lane: 'scratch', peaks: peaks(scratch.buf), born: bornPeaks(scratch.buf, 0, barLen) });
    em.emit({ type: 'mix', section: index, peaks: peaks(sum) });
  }
  return sum;
}

/** The starting bseed of every section: the song seed plus the bars before it. */
export function sectionSeeds(events: BarEvents): number[] {
  let bseed = events.params.seed as number;
  return events.sections.map((section) => { const at = bseed; bseed += section.drums.length; return at; });
}

/** joinSections -> applyTexture -> masterBus over the sections' mixes (null entries, bar-less sections, are skipped). */
export function finishSong(
  sectionMixes: readonly (Float64Array | null)[], events: BarEvents, options: RenderSongOptions, ctx: RenderCtx = {},
): Float64Array {
  const em = ctx.em;
  const rate = events.params.rate as number;
  const seed = events.params.seed as number;
  const joined = songMix.joinSections(sectionMixes.filter((m): m is Float64Array => m !== null));
  if (em) em.emit({ type: 'join', peaks: peaks(joined) });
  const textured = songMix.applyTexture(joined, rate, {
    style: options.style, seed, masterRev: options.masterRev ?? null, masterRevMix: options.masterRevMix ?? null,
  });
  if (em) em.emit({ type: 'texture', peaks: peaks(textured) });
  const out = Float64Array.from(busEffects.masterBus(textured, {}, rate), (v) => v / 127.0);
  if (em) {
    em.emit({ type: 'master', peaks: peaks(out) });
    em.emit({ type: 'done', mode: 'render', samples: out.length });
  }
  return out;
}

/** hiphop.render_track for a song with no locked layers: the final float64 mix (int8 / 127.0). */
export function renderSong(events: BarEvents, options: RenderSongOptions): Float64Array {
  const seeds = sectionSeeds(events);
  const ctx = beginRender(events, options);
  return finishSong(events.sections.map((_, i) => renderSectionMix(events, i, seeds[i]!, options, ctx)), events, options, ctx);
}

/** renderSong over a song file. */
export function renderSongFile(doc: SongFileDoc): Float64Array {
  return renderSong(songFileToBarEvents(doc), songRenderOptions(doc));
}
