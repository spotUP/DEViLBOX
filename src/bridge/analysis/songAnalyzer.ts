/**
 * songAnalyzer - what each INSTRUMENT of a song is, and from that what each
 * channel is doing at every point of the song.
 *
 * A tracker's roles belong to its instruments: a kick sample is drums
 * wherever it plays, a bass sample is bass. The old classifier judged
 * channels one pattern at a time from a first-hit chain of instrument
 * heuristics and scored 9 of 28 channels right on the labelled corpus
 * (thoughts/shared/research/2026-09-29_channel-classifier.md). It never used
 * the strongest evidence a tracker has: HOW an instrument is played across
 * the whole song.
 *
 *   1. Usage walk over the PLAY ORDER: every onset -> (position, channel,
 *      instrument, sounding pitch, row).
 *   2. Playing evidence per instrument: distinct sounding pitches (a drum is
 *      triggered at one or two, a pitched part at many), register relative
 *      to the song's lowest instrument, stepwise motion, density, beat-grid
 *      position, polyphony (the same instrument on several channels in one
 *      row is a chord), sparseness (one-shots are effects).
 *   3. Timbre evidence: spectrum of the sounding pcm (with harmonicity, so a
 *      distorted guitar is not a snare), synth parameters, explicit drum
 *      types. Name evidence, gated per song: names count only when the
 *      song's names look like instrument names, never greetings.
 *   4. Fusion: a weighted sum over {drums, bass, lead, harmony, fx}.
 *   5. Channel timeline: per position the dominant instrument's role, merged
 *      into sections; the song-level channel role is the time-weighted
 *      majority.
 *
 * Plan: thoughts/shared/plans/2026-09-29-channel-classifier.md ("Redesign").
 */
import type { Pattern, ChannelData } from '@typedefs/tracker';
import type { InstrumentConfig } from '@typedefs/instrument';
import type { ChannelRole } from './MusicAnalysis';
import type { ChannelSubrole } from './ChannelNaming';
import { hardwareChannelClass } from './ChannelNaming';
import { soundingSemitones, extractSynthTimbre, classifyBySynthParams, classifyByNativeSynth } from './synthEvidence';
import { analyzeSampleForClassification, classifyBySpectralFeatures, sampleLoopOf, type SampleSpectrumFeatures } from './SampleSpectrum';
import { samplePlaybackRate } from '@/engine/samplePlaybackRate';
import { DRUM_SYNTHS } from '@/midi/performance/lightGuide';

// ─── Vocabulary ─────────────────────────────────────────────────────────────

/** What an instrument (and, derived, a channel) IS. */
export type InstrumentRole = 'drums' | 'bass' | 'lead' | 'harmony' | 'fx';
export type DrumPart = 'kick' | 'snare' | 'hat' | 'perc' | 'mixed';
export type HarmonyKind = 'chord' | 'pad' | 'skank' | 'arpeggio';

const ROLES: readonly InstrumentRole[] = ['drums', 'bass', 'lead', 'harmony', 'fx'];
export type RoleScores = Record<InstrumentRole, number>;

/** One piece of evidence: where it came from, and how it votes. */
export interface Evidence {
  source: 'explicit' | 'hardware' | 'synth' | 'spectrum' | 'name' | 'pitches' | 'register' | 'polyphony' | 'motion' | 'rhythm' | 'sparse';
  scores: Partial<RoleScores>;
  note?: string;
}

export interface InstrumentVerdict {
  id: number;
  name: string;
  role: InstrumentRole;
  /** 0..1: the winning score's share of all score mass. */
  confidence: number;
  drumPart?: DrumPart;
  /** The drum's spectral centroid as the song plays it, when its part was judged by ear. */
  heardCentroidHz?: number;
  harmonyKind?: HarmonyKind;
  scores: RoleScores;
  evidence: Evidence[];
  usage: InstrumentUsage;
}

/** How an instrument is played across the song. */
export interface InstrumentUsage {
  onsets: number;
  /** Distinct sounding pitches. */
  pitches: number;
  medianPitch: number;
  /** Median WRITTEN note (tracker numbering), to play the instrument as the song does. */
  writtenMedian: number;
  /** Semitones above the song's lowest instrument median. */
  register: number;
  /** Share of consecutive onsets (same channel, same position) moving <= 2 semitones. */
  stepwise: number;
  /** Share of consecutive onsets leaping > 7 semitones. */
  leaps: number;
  /** Onsets per active row (rows on which this instrument was the channel's current one). */
  density: number;
  /** Share of onset rows on which the instrument sounds on 2+ channels. */
  polyphony: number;
  /** Share of onsets on rows % 4 == 0 (the beat) and == 2 (the off-beat eighth). */
  onBeat: number;
  offBeat: number;
  /** Share of onsets on rows % 8 == 0 and == 4 (bar halves: kick / snare positions). */
  barStart: number;
  barMid: number;
  /** Share of onsets carrying the arpeggio effect (a chord on one channel). */
  arpeggio: number;
  /** Positions (order indices) the instrument plays in. */
  positions: number;
  /** Channels the instrument plays on. */
  channels: number[];
}

export interface ChannelSection {
  channel: number;
  fromOrder: number;
  toOrder: number;
  role: InstrumentRole | 'silent';
  /** Instruments by onset count in the section, most played first. */
  instruments: number[];
  /** A second role played on the channel in the section (bass + snare). */
  also?: InstrumentRole;
}

export interface SongAnalysis {
  /** Per instrument, its verdict over every channel it plays on. */
  instruments: Map<number, InstrumentVerdict>;
  /**
   * Per part - an instrument as played on one channel, keyed "id:channel".
   * One chip waveform can be the bass on one channel and the lead on another;
   * the sections are built from these.
   */
  parts: Map<string, InstrumentVerdict>;
  /** Per channel, its sections in order. */
  timeline: ChannelSection[][];
  /** Per channel, the role it plays most of the song ('silent' when never). */
  channelRoles: (InstrumentRole | 'silent')[];
  /** The old vocabulary, for consumers that still speak it. */
  legacyRoles: ChannelRole[];
  /** Whether instrument names were trusted for this song. */
  namesInformative: boolean;
}

// ─── 1. Usage walk ──────────────────────────────────────────────────────────

interface Onset { position: number; channel: number; row: number; instrument: number; pitch: number; written: number; arp: boolean }

interface Walk {
  onsets: Onset[];
  /** Per instrument, rows on which it was a channel's current instrument. */
  activeRows: Map<number, number>;
  /** The order actually walked. */
  order: number[];
}

function walkSong(patterns: Pattern[], order: number[], offsets: ReadonlyMap<number, number>): Walk {
  const played = order.filter((p) => p >= 0 && p < patterns.length);
  const walked = played.length > 0 ? played : patterns.map((_, i) => i);
  const onsets: Onset[] = [];
  const activeRows = new Map<number, number>();
  const channelCount = patterns[0]?.channels?.length ?? 0;
  const current: number[] = new Array(channelCount).fill(0);
  for (let position = 0; position < walked.length; position++) {
    const pattern = patterns[walked[position]];
    for (let ch = 0; ch < channelCount; ch++) {
      const rows = pattern.channels?.[ch]?.rows ?? [];
      for (let row = 0; row < rows.length; row++) {
        const cell = rows[row];
        if (!cell) continue;
        if (cell.instrument >= 1 && cell.instrument <= 128) current[ch] = cell.instrument;
        const inst = current[ch];
        if (inst > 0) activeRows.set(inst, (activeRows.get(inst) ?? 0) + 1);
        if (cell.note >= 1 && cell.note <= 96 && inst > 0) {
          const pitch = cell.note + (offsets.get(inst) ?? 0);
          // 0xy on a note: the classic tracker chord (arpeggio effect).
          const arp = (cell.effTyp === 0 && cell.eff > 0) || (cell.effTyp2 === 0 && cell.eff2 > 0);
          onsets.push({ position, channel: ch, row, instrument: inst, pitch, written: cell.note, arp });
        }
      }
    }
  }
  return { onsets, activeRows, order: walked };
}

function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

// ─── 2. Playing evidence ────────────────────────────────────────────────────

/** How instrument `id` is played - on one channel (a part) or on all of them. */
function usageOf(id: number, walk: Walk, lowestMedian: number, channel?: number): InstrumentUsage {
  const mine = walk.onsets.filter((o) => o.instrument === id && (channel === undefined || o.channel === channel));
  const pitches = new Set(mine.map((o) => o.pitch));
  const medianPitch = median(mine.map((o) => o.pitch));
  // Motion: consecutive onsets on the same channel within the same position.
  let pairs = 0, steps = 0, leaps = 0;
  const byLane = new Map<string, Onset[]>();
  for (const o of mine) {
    const k = `${o.position}:${o.channel}`;
    (byLane.get(k) ?? byLane.set(k, []).get(k)!).push(o);
  }
  for (const lane of byLane.values()) {
    for (let i = 1; i < lane.length; i++) {
      const d = Math.abs(lane[i].pitch - lane[i - 1].pitch);
      pairs++;
      if (d <= 2) steps++;
      if (d > 7) leaps++;
    }
  }
  // Polyphony: the same instrument on 3+ channels in one row at DIFFERENT
  // pitch classes - a chord voiced across channels. Counted over every
  // channel the instrument plays on, whichever part this is. A bass doubled
  // an octave up on a second channel is not a chord, nor is a bass and a
  // lead on the same waveform.
  const rowKey = new Map<string, Set<number>>();
  for (const o of walk.onsets) {
    if (o.instrument !== id) continue;
    const k = `${o.position}:${o.row}`;
    (rowKey.get(k) ?? rowKey.set(k, new Set()).get(k)!).add(((o.pitch % 12) + 12) % 12);
  }
  let polyRows = 0;
  for (const classes of rowKey.values()) if (classes.size >= 3) polyRows++;
  const share = (pred: (o: Onset) => boolean) => mine.length ? mine.filter(pred).length / mine.length : 0;
  return {
    onsets: mine.length,
    pitches: pitches.size,
    medianPitch,
    writtenMedian: median(mine.map((o) => o.written)),
    register: mine.length ? medianPitch - lowestMedian : 0,
    stepwise: pairs ? steps / pairs : 0,
    leaps: pairs ? leaps / pairs : 0,
    density: mine.length / Math.max(1, walk.activeRows.get(id) ?? 0),
    polyphony: rowKey.size ? polyRows / rowKey.size : 0,
    onBeat: share((o) => o.row % 4 === 0),
    offBeat: share((o) => o.row % 4 === 2),
    barStart: share((o) => o.row % 8 === 0),
    barMid: share((o) => o.row % 8 === 4),
    arpeggio: share((o) => o.arp),
    positions: new Set(mine.map((o) => o.position)).size,
    channels: [...new Set(mine.map((o) => o.channel))].sort((a, b) => a - b),
  };
}

/** What the sound itself is, as far as its pcm says. */
export interface Timbre {
  /** Has a period: a tone, however distorted. */
  pitched: boolean;
  /** No period and a noisy spectrum. */
  noisy: boolean;
  /** Loops, so it sustains as long as the note holds. */
  looped: boolean;
  /** A one-shot that dies within 300 ms. */
  short: boolean;
  /** A one-shot longer than a second. */
  long: boolean;
  /** The fundamental at the base note, Hz (0 when unknown). */
  f0: number;
  /** Pitched with its energy at the fundamental: one line's timbre. */
  toneLike: boolean;
  /** Pitched with its energy spread far above a low common period: a chord or a rich pad sample. */
  chordLike: boolean;
  known: boolean;
}

const UNKNOWN_TIMBRE: Timbre = { pitched: false, noisy: false, looped: false, short: false, long: false, f0: 0, toneLike: false, chordLike: false, known: false };

function playingEvidence(u: InstrumentUsage, t: Timbre): Evidence[] {
  const ev: Evidence[] = [];
  if (u.onsets === 0) return ev;

  // Pitch variety, read through the timbre. A drum is triggered at one
  // pitch; but so is a dub bass root, and a chip hat is a noise sample played
  // at several. Only a pitched sound's pitch count says anything about a
  // line, and only a non-pitched sound's fixed pitch says "hit".
  if (u.onsets >= 4 && u.pitches <= 2) {
    if (t.noisy) ev.push({ source: 'pitches', scores: { drums: 0.8, fx: 0.15 }, note: `${u.pitches} pitch(es), noise` });
    else if (t.pitched && t.short) ev.push({ source: 'pitches', scores: { drums: 0.5, bass: 0.1, lead: -0.4 }, note: `${u.pitches} pitch(es), short tone: a kick or tom` });
    else if (t.pitched) ev.push({ source: 'pitches', scores: { lead: -0.4, harmony: 0.1 }, note: `${u.pitches} pitch(es), tone: a root or a stab - the register decides` });
    else if (t.looped) ev.push({ source: 'pitches', scores: { bass: 0.2, harmony: 0.1, lead: -0.3 }, note: `${u.pitches} pitch(es), sustaining loop` });
    else ev.push({ source: 'pitches', scores: { drums: 0.3, bass: 0.1, fx: 0.1 }, note: `${u.pitches} pitch(es), sound unknown` });
  } else if (u.pitches >= 5) {
    ev.push({ source: 'pitches', scores: { bass: 0.25, lead: 0.3, harmony: 0.3, drums: t.noisy ? -0.1 : -0.6 }, note: `${u.pitches} pitches` });
  } else if (u.pitches >= 3) {
    ev.push({ source: 'pitches', scores: { bass: 0.15, lead: 0.1, harmony: 0.15, drums: t.noisy ? 0 : -0.3 } });
  }

  // Register, relative to the song's lowest pitched instrument. Only a
  // pitched part has a register worth reading.
  if ((t.toneLike && u.pitches >= 1) || (!t.known && u.pitches >= 2) || ((t.chordLike || (t.pitched && !t.toneLike)) && u.pitches >= 3)) {
    if (u.register <= 5) ev.push({ source: 'register', scores: { bass: 0.6, lead: -0.2, harmony: -0.1 }, note: `+${u.register.toFixed(0)} st over the lowest` });
    else if (u.register <= 11) ev.push({ source: 'register', scores: { bass: 0.2, harmony: 0.1 }, note: `+${u.register.toFixed(0)} st` });
    else if (u.register >= 19) ev.push({ source: 'register', scores: { lead: 0.35, harmony: 0.2, bass: -0.5 }, note: `+${u.register.toFixed(0)} st` });
    else ev.push({ source: 'register', scores: { lead: 0.15, harmony: 0.15, bass: -0.3 }, note: `+${u.register.toFixed(0)} st` });
  }

  // Chords: the same instrument sounding on several channels at once, or the
  // arpeggio effect (0xy) - the tracker chord on one channel.
  if (u.polyphony >= 0.3) ev.push({ source: 'polyphony', scores: { harmony: 0.4, lead: -0.2 }, note: `${(u.polyphony * 100).toFixed(0)} % chord rows` });
  if (u.arpeggio >= 0.5) ev.push({ source: 'polyphony', scores: { harmony: 0.6, lead: -0.2, bass: -0.3, drums: -0.3 }, note: `${(u.arpeggio * 100).toFixed(0)} % arpeggio effect` });

  // Motion: a melody moves in steps with the odd leap; a bass line walks; a
  // part that only leaps between many pitches is broken chords.
  if (!t.noisy && u.pitches >= 5 && u.stepwise >= 0.5) ev.push({ source: 'motion', scores: { lead: 0.3, bass: 0.15 } });
  if (!t.noisy && u.pitches >= 5 && u.stepwise <= 0.1 && u.leaps >= 0.3) ev.push({ source: 'motion', scores: { harmony: 0.45, lead: -0.25 }, note: 'leaps only: broken chords' });

  // Rhythm: off-beat stabs of a sustaining sound are a skank.
  if (!t.noisy && !t.short && (t.pitched || t.looped || u.pitches >= 2) && u.offBeat >= 0.6 && u.onsets >= 8) ev.push({ source: 'rhythm', scores: { harmony: 0.35, bass: -0.1 }, note: 'off-beat' });

  // Sparse one-shots are effects: a few hits in the whole song, no line.
  if (u.onsets <= 3 && u.positions <= 2) ev.push({ source: 'sparse', scores: { fx: 0.5, drums: -0.2 }, note: `${u.onsets} onsets` });
  return ev;
}

// ─── 3. Timbre and name evidence ────────────────────────────────────────────

function roleFromLegacy(role: ChannelRole): InstrumentRole | null {
  switch (role) {
    case 'percussion': return 'drums';
    case 'bass': return 'bass';
    case 'lead': case 'arpeggio': return 'lead';
    case 'chord': case 'pad': case 'skank': return 'harmony';
    default: return null;
  }
}

function drumPartOf(sub: ChannelSubrole | undefined): DrumPart | undefined {
  switch (sub) {
    case 'kick': return 'kick';
    case 'snare': return 'snare';
    case 'hat': return 'hat';
    case 'clap': case 'perc': return 'perc';
    case 'mixed': return 'mixed';
    default: return undefined;
  }
}

/** The spectrum's reading of a sample, as it SOUNDS (the loop repeating). */
function timbreOf(inst: InstrumentConfig | undefined): { timbre: Timbre; features?: SampleSpectrumFeatures; legacy?: ReturnType<typeof analyzeSampleForClassification> } {
  const url = inst?.sample?.url;
  if (!inst || typeof url !== 'string' || url.length === 0) return { timbre: UNKNOWN_TIMBRE };
  const loop = sampleLoopOf(inst.sample);
  const spec = analyzeSampleForClassification(url, loop);
  if (!spec) return { timbre: UNKNOWN_TIMBRE };
  const f = spec.features;
  const looped = loop !== undefined;
  // A period, or a spectrum concentrated enough to be a tone even when the
  // autocorrelation cannot see the period (a plucked bass whose loop restarts
  // its decay).
  const periodic = f.harmonicity >= 0.55 && f.periodFrames > 0;
  const tonal = f.flatness < 0.2 && f.peakHz > 0;
  const pitched = periodic || tonal;
  const noisy = !pitched && f.flatness >= 0.3;
  const f0 = periodic ? f.sampleRate / f.periodFrames : tonal ? f.peakHz : 0;
  // A single cycle's period IS its pitch, however bright the waveform (a
  // square's centroid sits several times above its f0). A sampled chord's
  // common period sits far below everything heard.
  const singleCycle = loop !== undefined && loop.end - loop.start <= 256;
  const toneLike = pitched && f0 > 0 && (singleCycle || f.centroidHz <= 8 * f0);
  const chordLike = pitched && f0 > 0 && !singleCycle && f0 < 80 && f.centroidHz > 8 * f0;
  const short = !looped && f.decayMs > 0 && f.decayMs < 300 && f.tailRatio < 0.5;
  const long = !looped && f.durationSec >= 1;
  return { timbre: { pitched, noisy, looped, short, long, f0, toneLike, chordLike, known: true }, features: f, legacy: spec };
}

/** Spectrum, synth parameters, explicit drum types - what the sound itself says. */
function timbreEvidence(inst: InstrumentConfig, sound: ReturnType<typeof timbreOf>, hints: { drumPart?: DrumPart; harmonyKind?: HarmonyKind }): Evidence[] {
  const ev: Evidence[] = [];

  // Explicit: the instrument says what it is.
  if (inst.drumMachine?.drumType) {
    hints.drumPart = drumPartOf(({ kick: 'kick', snare: 'snare', hihat: 'hat', clap: 'clap' } as Record<string, ChannelSubrole>)[inst.drumMachine.drumType] ?? 'perc');
    ev.push({ source: 'explicit', scores: { drums: 2 }, note: `drumType ${inst.drumMachine.drumType}` });
    return ev;
  }
  if (DRUM_SYNTHS.has(inst.synthType)) {
    hints.drumPart = 'mixed';   // a drum machine is a kit
    ev.push({ source: 'explicit', scores: { drums: 1.5 }, note: `drum synth ${inst.synthType}` });
    return ev;
  }
  const native = classifyByNativeSynth(inst);
  if (native) {
    const r = roleFromLegacy(native.role);
    if (r) { ev.push({ source: 'synth', scores: { [r]: native.confidence }, note: inst.synthType }); if (r === 'drums') hints.drumPart ??= drumPartOf(native.subrole); }
  }

  const { timbre: t, features: f, legacy } = sound;
  if (f && legacy) {
    const scores: Partial<RoleScores> = {};
    const notes: string[] = [];
    if (t.noisy) {
      // Noise: a drum when it is a short hit or a bright dense loop (hats),
      // an effect when it is a long one-shot, a distorted chord or organ
      // chop when it is a low-centred sustaining loop.
      if (t.long) { scores.fx = 0.5; scores.drums = 0.1; notes.push('long noise'); }
      else if (t.looped && f.centroidHz < 1500) { scores.harmony = 0.45; scores.drums = 0.15; notes.push('low noisy loop: a distorted chord'); }
      else { scores.drums = 0.7; scores.fx = 0.1; notes.push('noise'); }
    } else if (t.pitched) {
      scores.drums = -0.5;
      // A low fundamental carrying the energy, in a sustaining sound, is a
      // bass timbre; a kick is low too but dies fast and never loops. A low
      // common period under a spread spectrum is a chord sample, not a bass.
      if (t.toneLike && t.f0 < 110 && (t.looped || !t.short)) { scores.bass = 0.4; notes.push(`f0 ${t.f0.toFixed(0)} Hz`); }
      else if (t.toneLike && t.f0 < 110 && t.short) { scores.drums = 0.3; scores.bass = 0.2; notes.push(`low short f0 ${t.f0.toFixed(0)} Hz`); }
      if (t.chordLike) { scores.harmony = 0.3; scores.bass = (scores.bass ?? 0) - 0.2; notes.push(`chord-like: centroid ${f.centroidHz.toFixed(0)} Hz over f0 ${t.f0.toFixed(0)} Hz`); }
      if (t.looped || f.decayMs >= 500) { scores.harmony = (scores.harmony ?? 0) + 0.2; scores.lead = 0.15; notes.push('sustains'); }
      if (t.long && f.decayMs >= 1000 && f.harmonicity < 0.7) { scores.fx = 0.3; notes.push('long, semi-periodic'); }
    } else {
      // Neither clearly a tone nor clearly noise: a thump, a chop, a hit.
      if (t.looped) { scores.harmony = 0.3; scores.lead = 0.1; scores.drums = -0.3; notes.push('sustaining loop, in between: a chop or an organ'); }
      else if (t.short) { scores.drums = 0.5; notes.push('short hit'); }
      else if (t.long) { scores.fx = 0.4; notes.push('long one-shot'); }
    }
    // The old spectrum rules, as a weak vote on drum parts and pads.
    const r = roleFromLegacy(legacy.role);
    // Its drum part is judged as the sample sounds in the song (soundingDrumPart), not here.
    if (r === 'drums' && legacy.confidence >= 0.6) scores.drums = (scores.drums ?? 0) + 0.2;
    if (legacy.role === 'pad') hints.harmonyKind ??= 'pad';
    if (Object.keys(scores).length) ev.push({ source: 'spectrum', scores, note: `${notes.join(', ')}; centroid ${f.centroidHz.toFixed(0)} Hz, flat ${f.flatness.toFixed(2)}, harm ${f.harmonicity.toFixed(2)}, decay ${f.decayMs.toFixed(0)} ms${t.looped ? ', loop' : ''}` });
  }

  // Synth parameters (AHX, SoundMon, envelopes): what the synth is set to do.
  const timbre = extractSynthTimbre(inst);
  if (timbre) {
    const v = classifyBySynthParams(timbre);
    const r = roleFromLegacy(v.role);
    if (r && v.confidence >= 0.5) {
      ev.push({ source: 'synth', scores: { [r]: v.confidence * 0.7 }, note: 'synth parameters' });
      if (r === 'drums') hints.drumPart ??= drumPartOf(v.subrole);
    }
  }
  return ev;
}

/**
 * Semitones a sample's notes sound above what is written: its own
 * fundamental at its base note (a bass sample recorded at 47 Hz sounds two
 * octaves under a bell sample at the same note; a 32-frame chip cycle sounds
 * two octaves above a 128-frame one), plus a replayer's transpose. 0 when the
 * sound has no period.
 */
export function soundingOffset(inst: InstrumentConfig | undefined, timbre: Timbre): number {
  let offset = soundingSemitones(inst);
  // Only a tone's fundamental places its notes: a chord sample's common
  // period sits far below what is heard.
  if (timbre.toneLike && timbre.f0 > 0) {
    offset += 12 * Math.log2(timbre.f0 / 261.63);
    const base = parseBaseNote(inst?.sample?.baseNote);
    if (base !== null) offset -= base - 48;
  }
  return Math.round(offset);
}

/** "C3" / "C-3" / "F#4" -> MIDI-style number (C3 = 48, the converter's Amiga reference). */
function parseBaseNote(name: string | undefined): number | null {
  if (!name) return null;
  const m = /^([A-G])(#|b)?-?(-?\d+)$/i.exec(name.trim());
  if (!m) return null;
  const idx = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[m[1].toUpperCase()]!;
  const acc = m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0;
  return (Number(m[3]) + 1) * 12 + idx + acc;
}

/**
 * The role a name states, or null. Tracker names are smushed - "jstbass5",
 * "WAHBASS1.WAV", "SuperHyperBass" - so these match substrings, not words.
 */
export function roleFromName(name: string): { role: InstrumentRole; drumPart?: DrumPart; harmonyKind?: HarmonyKind } | null {
  const n = name.trim().toLowerCase();
  if (!n) return null;
  if (/kick|bassdrum|\bbd\b|bdrum/.test(n)) return { role: 'drums', drumPart: 'kick' };
  if (/snare|\bsd\b|sdrum/.test(n)) return { role: 'drums', drumPart: 'snare' };
  if (/hihat|hi-hat|\bhat|hat\b|\bhh\b|openhat|closedhat/.test(n)) return { role: 'drums', drumPart: 'hat' };
  if (/clap|cymb|crash|ride|\btom|drum|perc|shaker|tamb|conga|bongo|cowbell|rimshot|\bkit\b/.test(n)) return { role: 'drums', drumPart: 'perc' };
  if (/bass|\bsub\b|303/.test(n)) return { role: 'bass' };
  if (/arp/.test(n)) return { role: 'harmony', harmonyKind: 'arpeggio' };
  if (/chord|chrd|stab|minor|major|maj7|min7|\bmin\b|\bmaj\b/.test(n)) return { role: 'harmony', harmonyKind: 'chord' };
  if (/\bpad|pad\d|string|strng|choir|organ|piano|harpsi|rhodes|wurli|clav|keys|synth\b|atmo|ambien/.test(n)) return { role: 'harmony', harmonyKind: 'pad' };
  if (/lead|\bld\b|solo|melod|guitar|gtr|flute|sax|violin|horn|trumpet|brass|whistle|pluck|harp\b/.test(n)) return { role: 'lead' };
  if (/\bfx\b|effect|sweep|siren|laser|explo|speech|vocal|voice|vox|scratch|noise/.test(n)) return { role: 'fx' };
  return null;
}

/**
 * Whether this song's instrument names are instrument names. Tracker name
 * slots carry greetings and credits as often as names: a song where few
 * names say what the sound is (or all are "Sample N") is not trusted.
 */
export function namesInformative(instruments: Iterable<InstrumentConfig>, used: ReadonlySet<number>): boolean {
  let named = 0, informative = 0;
  for (const inst of instruments) {
    if (!used.has(inst.id)) continue;
    const n = (inst.name ?? '').trim();
    if (!n || /^(sample|instrument|inst)\s*\d+$/i.test(n)) continue;
    named++;
    if (roleFromName(n)) informative++;
  }
  return named >= 1 && informative / named >= 0.4;
}

// ─── 4. Fusion ──────────────────────────────────────────────────────────────

function fuse(ev: Evidence[]): RoleScores {
  const s: RoleScores = { drums: 0, bass: 0, lead: 0, harmony: 0, fx: 0 };
  for (const e of ev) for (const r of ROLES) s[r] += e.scores[r] ?? 0;
  return s;
}

function verdictOf(id: number, inst: InstrumentConfig | undefined, usage: InstrumentUsage, sound: ReturnType<typeof timbreOf>, trustNames: boolean, label?: OwnerLabel): InstrumentVerdict {
  const hints: { drumPart?: DrumPart; harmonyKind?: HarmonyKind } = {};
  const evidence: Evidence[] = [];
  // The owner's word settles it; the other evidence is still listed.
  if (label) {
    evidence.push({ source: 'explicit', scores: { [label.role]: 3 }, note: 'labelled by the owner' });
    if (label.drumPart) hints.drumPart = label.drumPart;
  }
  if (inst) {
    evidence.push(...timbreEvidence(inst, sound, hints));
    if (trustNames) {
      const byName = roleFromName(inst.name ?? '');
      if (byName) {
        evidence.push({ source: 'name', scores: { [byName.role]: 1.0 }, note: inst.name });
        if (byName.drumPart) hints.drumPart ??= byName.drumPart;
        if (byName.harmonyKind) hints.harmonyKind ??= byName.harmonyKind;
      }
    }
  }
  evidence.push(...playingEvidence(usage, sound.timbre));

  const explicit = evidence.find((e) => e.source === 'explicit');
  const scores = fuse(evidence);
  let role: InstrumentRole = 'lead';
  if (explicit) {
    role = (Object.keys(explicit.scores) as InstrumentRole[])[0];
  } else {
    let best = -Infinity;
    for (const r of ROLES) if (scores[r] > best) { best = scores[r]; role = r; }
    if (best <= 0) role = usage.onsets ? 'lead' : 'fx';
  }
  const positive = ROLES.reduce((sum, r) => sum + Math.max(0, scores[r]), 0);
  const confidence = positive > 0 ? Math.max(0, scores[role]) / positive : 0;

  const v: InstrumentVerdict = { id, name: inst?.name ?? '', role, confidence: label ? 1 : confidence, scores, evidence, usage };
  if (role === 'drums') {
    const byEar = hints.drumPart ? undefined : soundingDrumPart(inst, sound, usage);
    if (byEar) { evidence.push(byEar.evidence); v.heardCentroidHz = byEar.heardCentroidHz; }
    // Beat position names a part only when it is decisive.
    v.drumPart = hints.drumPart ?? byEar?.part ?? (usage.barStart >= 0.7 ? 'kick' : usage.barMid >= 0.7 ? 'snare' : usage.density >= 0.5 ? 'hat' : 'perc');
  } else if (role === 'harmony') {
    v.harmonyKind = hints.harmonyKind ?? (usage.offBeat >= 0.6 ? 'skank' : usage.density >= 0.5 && usage.leaps >= 0.3 ? 'arpeggio' : 'chord');
  }
  return v;
}

/**
 * A drum's part from its spectrum AS PLAYED. A tracker plays a drum sample at
 * its written note: micro15.mod's snare is a 197 Hz, 260 ms thump at its
 * recorded speed - a kick by the numbers - and sounds at 1.6 kHz and 32 ms,
 * three octaves up, where the song writes it. Frequencies scale with the
 * playback rate, times against it; the spectral rules then read the sound
 * the listener hears. A hat keeps time: a bright click heard only a few
 * times a pattern is a rimshot or a percussion accent.
 */
function soundingDrumPart(inst: InstrumentConfig | undefined, sound: ReturnType<typeof timbreOf>, usage: InstrumentUsage): { part: DrumPart; heardCentroidHz: number; evidence: Evidence } | undefined {
  const f = sound.features;
  if (!f || usage.onsets === 0) return undefined;
  const rate = samplePlaybackRate(inst, usage.writtenMedian);
  const heard: SampleSpectrumFeatures = {
    ...f,
    centroidHz: f.centroidHz * rate, peakHz: f.peakHz * rate,
    decayMs: f.decayMs / rate, durationSec: f.durationSec / rate, sampleRate: f.sampleRate * rate,
  };
  const c = classifyBySpectralFeatures(heard);
  if (c.role !== 'percussion') return undefined;
  let part = drumPartOf(c.subrole);
  if (!part) return undefined;
  if (part === 'hat' && usage.onsets / Math.max(1, usage.positions) < 16) part = 'perc';
  return {
    part,
    heardCentroidHz: heard.centroidHz,
    evidence: { source: 'spectrum', scores: {}, note: `as played (x${rate.toFixed(1)}): centroid ${heard.centroidHz.toFixed(0)} Hz, decay ${heard.decayMs.toFixed(0)} ms - ${part}` },
  };
}

/**
 * Drum parts are relative within a kit. Spectral rules judge each drum
 * alone, so a chip kit's snare - a low, dull noise burst - can read as a
 * second kick, and a rimshot as a second snare. Among the drums judged by
 * ear: the lowest-sounding "kick" is the kick, and one sounding an octave or
 * more above it is the snare; the most-played "snare" is the snare, and one
 * heard under a quarter as often is a percussion accent (a rim, a clap).
 * Parts from a label, a name or the instrument itself are left alone.
 */
function resolveKit(verdicts: Iterable<InstrumentVerdict>): Map<number, DrumPart> {
  const byEar = [...verdicts].filter((v) => v.role === 'drums' && v.heardCentroidHz !== undefined);
  const moved = new Map<number, DrumPart>();
  const part = (v: InstrumentVerdict) => moved.get(v.id) ?? v.drumPart;
  const kicks = byEar.filter((v) => part(v) === 'kick').sort((a, b) => a.heardCentroidHz! - b.heardCentroidHz!);
  for (const v of kicks.slice(1)) if (v.heardCentroidHz! >= 2 * kicks[0].heardCentroidHz!) moved.set(v.id, 'snare');
  const snares = byEar.filter((v) => part(v) === 'snare').sort((a, b) => b.usage.onsets - a.usage.onsets);
  for (const v of snares.slice(1)) if (v.usage.onsets * 4 < snares[0].usage.onsets) moved.set(v.id, 'perc');
  return moved;
}

// ─── 5. Channel timeline ────────────────────────────────────────────────────

function timelineOf(walk: Walk, channelCount: number, parts: Map<string, InstrumentVerdict>, hardware: (InstrumentRole | null)[]): ChannelSection[][] {
  const positions = walk.order.length;
  const timeline: ChannelSection[][] = [];
  for (let ch = 0; ch < channelCount; ch++) {
    // Per position: onsets per instrument.
    const perPos: Map<number, number>[] = Array.from({ length: positions }, () => new Map());
    for (const o of walk.onsets) if (o.channel === ch) perPos[o.position].set(o.instrument, (perPos[o.position].get(o.instrument) ?? 0) + 1);
    const roleAt = (pos: number): { role: InstrumentSection; instruments: number[]; also?: InstrumentRole } => {
      const counts = perPos[pos];
      if (counts.size === 0) return { role: 'silent', instruments: [] };
      const instruments = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);
      if (hardware[ch]) return { role: hardware[ch]!, instruments };
      const byRole = new Map<InstrumentRole, number>();
      for (const [id, n] of counts) {
        const r = parts.get(`${id}:${ch}`)?.role ?? 'lead';
        byRole.set(r, (byRole.get(r) ?? 0) + n);
      }
      const ranked = [...byRole.entries()].sort((a, b) => b[1] - a[1]);
      return { role: ranked[0][0], instruments, also: ranked[1]?.[0] };
    };
    type InstrumentSection = InstrumentRole | 'silent';
    const raw = Array.from({ length: positions }, (_, p) => roleAt(p));
    // A one-position blip between equal neighbours is a fill, not a part.
    for (let p = 1; p + 1 < positions; p++) {
      if (raw[p].role !== raw[p - 1].role && raw[p - 1].role === raw[p + 1].role && raw[p - 1].role !== 'silent') raw[p] = { ...raw[p], role: raw[p - 1].role };
    }
    const sections: ChannelSection[] = [];
    for (let p = 0; p < positions; p++) {
      const last = sections[sections.length - 1];
      if (last && last.role === raw[p].role) {
        last.toOrder = p;
        for (const id of raw[p].instruments) if (!last.instruments.includes(id)) last.instruments.push(id);
        if (!last.also && raw[p].also) last.also = raw[p].also;
      } else {
        sections.push({ channel: ch, fromOrder: p, toOrder: p, role: raw[p].role, instruments: [...raw[p].instruments], ...(raw[p].also ? { also: raw[p].also } : {}) });
      }
    }
    timeline.push(sections);
  }
  return timeline;
}

function toLegacy(role: InstrumentRole | 'silent', v: InstrumentVerdict | undefined): ChannelRole {
  switch (role) {
    case 'drums': return 'percussion';
    case 'bass': return 'bass';
    case 'lead': return 'lead';
    case 'harmony':
      return v?.harmonyKind === 'skank' ? 'skank' : v?.harmonyKind === 'pad' ? 'pad' : v?.harmonyKind === 'arpeggio' ? 'arpeggio' : 'chord';
    case 'fx': return 'fx';
    case 'silent': return 'empty';
  }
}

/** The legacy subrole a verdict maps to (for channel naming and dub targeting). */
export function legacySubrole(v: InstrumentVerdict | undefined): ChannelSubrole | undefined {
  if (!v) return undefined;
  if (v.role === 'drums') return v.drumPart === 'perc' ? 'perc' : v.drumPart;
  if (v.role === 'bass') return v.usage.medianPitch <= 12 ? 'sub' : 'synth';
  if (v.role === 'lead') return 'synth';
  return undefined;
}

// ─── Entry point ────────────────────────────────────────────────────────────

const _cache = new WeakMap<Pattern[], { key: string; value: SongAnalysis }>();

/** The owner's word on an instrument, as explicit evidence. */
export interface OwnerLabel { role: InstrumentRole; drumPart?: DrumPart }

export function analyzeSong(
  patterns: Pattern[],
  order: number[],
  instruments: ReadonlyMap<number, InstrumentConfig>,
  labels?: ReadonlyMap<number, OwnerLabel>,
): SongAnalysis {
  const cacheKey = `${order.join(',')}|${labels ? [...labels.entries()].map(([id, l]) => `${id}:${l.role}:${l.drumPart ?? ''}`).join(',') : ''}`;
  const cached = _cache.get(patterns);
  if (cached && cached.key === cacheKey) return cached.value;
  const channelCount = patterns[0]?.channels?.length ?? 0;

  // Every instrument's sound and, from it, what its notes sound like.
  const sounds = new Map<number, ReturnType<typeof timbreOf>>();
  const offsets = new Map<number, number>();
  for (const [id, inst] of instruments) {
    const sound = timbreOf(inst);
    sounds.set(id, sound);
    offsets.set(id, soundingOffset(inst, sound.timbre));
  }
  const walk = walkSong(patterns, order, offsets);
  const used = new Set(walk.onsets.map((o) => o.instrument));

  // The song's register floor: the lowest median among pitched PARTS played
  // at two or more pitches (a hit at one pitch is not a floor).
  const medians: number[] = [];
  const byPart = new Map<string, number[]>();
  for (const o of walk.onsets) {
    if (sounds.get(o.instrument)?.timbre.noisy) continue;
    const k = `${o.instrument}:${o.channel}`;
    (byPart.get(k) ?? byPart.set(k, []).get(k)!).push(o.pitch);
  }
  for (const pitches of byPart.values()) if (new Set(pitches).size >= 2) medians.push(median(pitches));
  const lowest = medians.length ? Math.min(...medians) : 0;

  const trustNames = namesInformative(instruments.values(), used);
  const verdicts = new Map<number, InstrumentVerdict>();
  const parts = new Map<string, InstrumentVerdict>();
  for (const id of [...used].sort((a, b) => a - b)) {
    const sound = sounds.get(id) ?? { timbre: UNKNOWN_TIMBRE };
    const label = labels?.get(id);
    verdicts.set(id, verdictOf(id, instruments.get(id), usageOf(id, walk, lowest), sound, trustNames, label));
    for (const ch of new Set(walk.onsets.filter((o) => o.instrument === id).map((o) => o.channel))) {
      parts.set(`${id}:${ch}`, verdictOf(id, instruments.get(id), usageOf(id, walk, lowest, ch), sound, trustNames, label));
    }
  }

  const kit = resolveKit(verdicts.values());
  for (const [id, drumPart] of kit) {
    const note = (from: DrumPart | undefined) => ({ source: 'spectrum' as const, scores: {}, note: `in this kit: ${from} -> ${drumPart}` });
    const v = verdicts.get(id)!;
    v.evidence.push(note(v.drumPart));
    v.drumPart = drumPart;
    for (const [k, p] of parts) if (k.startsWith(`${id}:`) && p.role === 'drums') { p.evidence.push(note(p.drumPart)); p.drumPart = drumPart; }
  }

  // A chip's noise channel is its drum channel whatever plays on it.
  const hardware = (patterns[0]?.channels ?? []).map((ch: ChannelData) => {
    const h = hardwareChannelClass(ch);
    return h ? roleFromLegacy(h.role) : null;
  });
  const timeline = timelineOf(walk, channelCount, parts, hardware);

  const channelRoles = timeline.map((sections) => {
    const weight = new Map<InstrumentRole | 'silent', number>();
    for (const s of sections) if (s.role !== 'silent') weight.set(s.role, (weight.get(s.role) ?? 0) + (s.toOrder - s.fromOrder + 1));
    let best: InstrumentRole | 'silent' = 'silent', n = 0;
    for (const [r, w] of weight) if (w > n) { n = w; best = r; }
    return best;
  });
  const legacyRoles = timeline.map((sections, ch) => {
    const role = channelRoles[ch];
    const lead = sections.filter((s) => s.role === role).flatMap((s) => s.instruments)[0];
    return toLegacy(role, lead !== undefined ? parts.get(`${lead}:${ch}`) : undefined);
  });

  const analysis: SongAnalysis = { instruments: verdicts, parts, timeline, channelRoles, legacyRoles, namesInformative: trustNames };
  _cache.set(patterns, { key: cacheKey, value: analysis });
  return analysis;
}

/** The dominant instrument verdict of a channel over the whole song. */
export function channelInstrument(a: SongAnalysis, ch: number): InstrumentVerdict | undefined {
  const counts = new Map<number, number>();
  for (const s of a.timeline[ch] ?? []) {
    const span = s.toOrder - s.fromOrder + 1;
    s.instruments.forEach((id, i) => counts.set(id, (counts.get(id) ?? 0) + span / (i + 1)));
  }
  let best: number | undefined, n = 0;
  for (const [id, w] of counts) if (w > n) { n = w; best = id; }
  return best !== undefined ? (a.parts.get(`${best}:${ch}`) ?? a.instruments.get(best)) : undefined;
}
