/**
 * MusicalChannelProfile — plan item C2.
 *
 * Replaces the single `ChannelRole` enum ('bass' | 'lead' | 'chord' |
 * 'percussion' | 'arpeggio' | 'pad' | 'empty' | 'skank') for decision-making.
 * That enum forces unrelated questions through one answer: a dub piano skank
 * is a piano (family), playing harmony (function), on the offbeat (rhythm), in
 * the mid register — four independent facts collapsed into the single token
 * `skank`, which is why `versionDrop`'s role whitelist muted a bassline that
 * happened to be classified `lead`.
 *
 * Three rules from the reviewer, and each one shapes the code:
 *
 * 1. **Orthogonal axes, not a bigger enum.** Four independent categorical axes
 *    plus four scalars.
 * 2. **Evidence and confidence, never an absolute role.** Every axis carries
 *    the confidence and the source it came from, so a caller can decline to
 *    act on a guess. Nothing here returns a bare value.
 * 3. **User overrides are authoritative.** An override wins outright, at
 *    confidence 1, and is never blended with inference.
 *
 * This module does NOT classify audio or parse patterns. It consumes evidence
 * the existing classifiers already produce — `ChannelAnalysis` (note
 * statistics), `InstrumentClassification` (name / sample / spectrum) and
 * `RuntimeRoleHint` (live audio) — and translates it onto the axes. Building a
 * fourth classifier here would duplicate work that is already tested.
 *
 * On onsets: classifying WHERE notes fall against a metre the user supplied is
 * not metre inference. The banned thing is deriving `beatsPerBar` from accents;
 * that never happens here — `rowsPerBeat` / `rowsPerBar` arrive from
 * MusicalClock.
 */

import type { ChannelRole, ChannelAnalysis } from '@/bridge/analysis/MusicAnalysis';
import type { InstrumentClassification } from '@/bridge/analysis/ChannelNaming';
import type { RuntimeRoleHint } from '@/bridge/analysis/ChannelAudioClassifier';

export type InstrumentFamily =
  | 'drums' | 'bass' | 'piano' | 'organ' | 'guitar' | 'keys' | 'synth'
  | 'horn' | 'vocal' | 'strings' | 'percussion' | 'fx' | 'unknown';

export type MusicalFunction =
  | 'foundation' | 'groove' | 'harmony' | 'melody' | 'hook'
  | 'texture' | 'transition' | 'voice' | 'unknown';

export type RhythmicRole =
  | 'downbeat' | 'backbeat' | 'offbeat' | 'syncopated' | 'sustained' | 'free';

export type Register = 'sub' | 'low' | 'lowMid' | 'mid' | 'highMid' | 'high';

/** Where an axis value came from. `user` always wins; `default` means no
 *  evidence supported a choice and the caller should treat it as unknown. */
export type EvidenceSource = 'user' | 'instrument' | 'audio' | 'notes' | 'rhythm' | 'default';

export interface AxisEstimate<T> {
  value: T;
  /** 0..1. A caller may refuse to act below its own threshold. */
  confidence: number;
  source: EvidenceSource;
}

export interface MusicalChannelProfile {
  channel: number;
  instrumentFamily: AxisEstimate<InstrumentFamily>;
  musicalFunction: AxisEstimate<MusicalFunction>;
  rhythmicRole: AxisEstimate<RhythmicRole>;
  register: AxisEstimate<Register>;
  /** How much the arrangement leans on this channel, 0..1. */
  importance: number;
  /** Note events per row, 0..1. */
  density: number;
  /** How present it is in the mix right now, 0..1. */
  audibility: number;
  /** How self-similar bar to bar, 0..1. */
  repetition: number;
}

/** User overrides. Any axis set here is authoritative and never blended. */
export interface ChannelProfileOverrides {
  instrumentFamily?: InstrumentFamily;
  musicalFunction?: MusicalFunction;
  rhythmicRole?: RhythmicRole;
  register?: Register;
}

export interface ChannelEvidence {
  channel: number;
  /** Note statistics + the legacy role, from `classifyChannel`. */
  analysis?: ChannelAnalysis | null;
  /** Name / sample / spectrum evidence, from `classifyInstrument`. */
  instrument?: InstrumentClassification | null;
  /** Live audio evidence, from `getRuntimeChannelRole`. */
  runtime?: RuntimeRoleHint | null;
  /** Instrument name, the only signal that separates piano from organ etc. */
  instrumentName?: string | null;
  /** Rows carrying a note onset, song- or pattern-relative. */
  onsetRows?: readonly number[];
  /** Grid from MusicalClock. Supplied, never inferred from the onsets. */
  rowsPerBeat?: number;
  rowsPerBar?: number;
  /** Rows considered, for density when `analysis` is absent. */
  totalRows?: number;
}

// ─── Family ─────────────────────────────────────────────────────────────────

/** Name keywords are the only evidence that distinguishes piano from organ
 *  from guitar — the legacy role enum has no such concept. Ordered: earlier
 *  entries win, so 'bass guitar' reads as bass rather than guitar. */
const FAMILY_NAME_PATTERNS: ReadonlyArray<[RegExp, InstrumentFamily]> = [
  [/\b(kick|snare|hat|hh|clap|tom|cymbal|ride|crash|drum|bd|sd)\b/i, 'drums'],
  [/\b(conga|bongo|shaker|tamb|maraca|clave|cowbell|perc|rim)\b/i, 'percussion'],
  [/\b(sub|808|bass|bassline|dub ?bass)\b/i, 'bass'],
  [/\b(piano|rhodes|wurli|clav|epiano)\b/i, 'piano'],
  [/\b(organ|hammond|b3|farfisa)\b/i, 'organ'],
  [/\b(guitar|gtr|strat|skank|chop)\b/i, 'guitar'],
  [/\b(sax|trumpet|trombone|horn|brass|flute|melodica)\b/i, 'horn'],
  [/\b(vocal|voice|vox|sing|chant|toast|acap)\b/i, 'vocal'],
  [/\b(string|violin|cello|viola)\b/i, 'strings'],
  [/\b(fx|sfx|noise|sweep|riser|impact|siren)\b/i, 'fx'],
  [/\b(pad|lead|synth|saw|square|pluck|arp)\b/i, 'synth'],
  [/\b(key|keys|organette)\b/i, 'keys'],
];

/** Legacy role → family, when no name evidence exists. Lossy on purpose:
 *  'lead' and 'chord' say nothing about timbre, so they map to the generic
 *  families at reduced confidence rather than inventing an instrument. */
const ROLE_TO_FAMILY: Record<ChannelRole, InstrumentFamily> = {
  percussion: 'drums',
  bass: 'bass',
  chord: 'keys',
  skank: 'keys',
  arpeggio: 'synth',
  pad: 'synth',
  lead: 'synth',
  empty: 'unknown',
};

function familyFromName(name: string | null | undefined): InstrumentFamily | null {
  if (!name) return null;
  for (const [re, family] of FAMILY_NAME_PATTERNS) {
    if (re.test(name)) return family;
  }
  return null;
}

function estimateFamily(ev: ChannelEvidence): AxisEstimate<InstrumentFamily> {
  const named = familyFromName(ev.instrumentName);
  if (named) return { value: named, confidence: 0.75, source: 'instrument' };

  // A drum subrole is a strong, specific signal — keep its own confidence.
  const inst = ev.instrument;
  if (inst && inst.role !== 'empty' && inst.confidence > 0) {
    const sub = inst.subrole;
    const family: InstrumentFamily = inst.role === 'percussion'
      ? (sub === 'perc' ? 'percussion' : 'drums')
      : ROLE_TO_FAMILY[inst.role];
    // Timbre-blind roles cannot justify the classifier's own confidence.
    const blind = inst.role === 'lead' || inst.role === 'chord' || inst.role === 'skank';
    return {
      value: family,
      confidence: blind ? Math.min(inst.confidence, 0.4) : inst.confidence,
      source: 'instrument',
    };
  }

  const role = ev.analysis?.role;
  if (role && role !== 'empty') {
    return { value: ROLE_TO_FAMILY[role], confidence: 0.3, source: 'notes' };
  }
  return { value: 'unknown', confidence: 0, source: 'default' };
}

// ─── Function ───────────────────────────────────────────────────────────────

const ROLE_TO_FUNCTION: Record<ChannelRole, MusicalFunction> = {
  bass: 'foundation',
  percussion: 'groove',
  chord: 'harmony',
  skank: 'harmony',
  lead: 'melody',
  arpeggio: 'texture',
  pad: 'texture',
  empty: 'unknown',
};

function estimateFunction(
  ev: ChannelEvidence,
  family: InstrumentFamily,
): AxisEstimate<MusicalFunction> {
  // Family settles a few cases outright regardless of note statistics.
  if (family === 'vocal') return { value: 'voice', confidence: 0.8, source: 'instrument' };
  if (family === 'fx') return { value: 'transition', confidence: 0.6, source: 'instrument' };

  // Prefer live audio when it is confident — it reflects what is actually
  // sounding, not what the pattern data suggests.
  const runtime = ev.runtime;
  if (runtime && runtime.confidence >= 0.6 && runtime.role !== 'empty') {
    return {
      value: ROLE_TO_FUNCTION[runtime.role],
      confidence: runtime.confidence * (runtime.support || 1),
      source: 'audio',
    };
  }

  const inst = ev.instrument;
  if (inst && inst.role !== 'empty' && inst.confidence >= 0.6) {
    return { value: ROLE_TO_FUNCTION[inst.role], confidence: inst.confidence, source: 'instrument' };
  }

  const role = ev.analysis?.role;
  if (role && role !== 'empty') {
    return { value: ROLE_TO_FUNCTION[role], confidence: 0.45, source: 'notes' };
  }
  return { value: 'unknown', confidence: 0, source: 'default' };
}

// ─── Register ───────────────────────────────────────────────────────────────

/** Octave bands. Tracker octaves, matching `ChannelAnalysis.avgOctave`. */
function registerForOctave(octave: number): Register {
  if (octave <= 1) return 'sub';
  if (octave <= 2) return 'low';
  if (octave <= 3) return 'lowMid';
  if (octave <= 4) return 'mid';
  if (octave <= 5) return 'highMid';
  return 'high';
}

function estimateRegister(ev: ChannelEvidence): AxisEstimate<Register> {
  const a = ev.analysis;
  if (a && a.noteCount > 0 && Number.isFinite(a.avgOctave)) {
    // A wide pitch range makes a single band less meaningful.
    const spread = Number.isFinite(a.pitchRange) ? a.pitchRange : 0;
    const confidence = spread > 24 ? 0.5 : 0.85;
    return { value: registerForOctave(a.avgOctave), confidence, source: 'notes' };
  }
  return { value: 'mid', confidence: 0, source: 'default' };
}

// ─── Rhythm ─────────────────────────────────────────────────────────────────

/**
 * Where the onsets sit against the supplied grid.
 *
 * Not metre inference: `rowsPerBeat` and `rowsPerBar` come from MusicalClock,
 * which gets them from the transport and user settings. This only asks where
 * the notes land inside a grid it was handed.
 */
function estimateRhythm(ev: ChannelEvidence): AxisEstimate<RhythmicRole> {
  const onsets = ev.onsetRows;
  const rpBeat = ev.rowsPerBeat;
  const rpBar = ev.rowsPerBar;
  if (!onsets || onsets.length === 0 || !rpBeat || !rpBar || rpBeat <= 0 || rpBar <= 0) {
    return { value: 'free', confidence: 0, source: 'default' };
  }

  // Very few onsets over a long span reads as held material, not a pattern.
  const span = ev.totalRows ?? (Math.max(...onsets) + 1);
  if (onsets.length <= Math.max(1, Math.floor(span / rpBar / 2))) {
    return { value: 'sustained', confidence: 0.6, source: 'rhythm' };
  }

  const beatsPerBar = Math.max(1, Math.round(rpBar / rpBeat));
  let onBeat = 0, offBeat = 0, downbeat = 0, backbeat = 0;
  const tolerance = rpBeat * 0.12; // grid wobble / fractional rows

  for (const row of onsets) {
    const posInBeat = ((row % rpBeat) + rpBeat) % rpBeat;
    const nearBeat = posInBeat <= tolerance || posInBeat >= rpBeat - tolerance;
    const nearHalf = Math.abs(posInBeat - rpBeat / 2) <= tolerance;
    const beatIndex = Math.round((((row % rpBar) + rpBar) % rpBar) / rpBeat) % beatsPerBar;
    if (nearBeat) {
      onBeat++;
      if (beatIndex === 0) downbeat++;
      // Backbeat is beats 2 and 4 of a four-beat bar (0-indexed 1 and 3).
      if (beatsPerBar % 2 === 0 && beatIndex % 2 === 1) backbeat++;
    } else if (nearHalf) {
      offBeat++;
    }
  }

  const total = onsets.length;
  const offRatio = offBeat / total;
  const downRatio = downbeat / total;
  const backRatio = backbeat / total;
  const gridRatio = (onBeat + offBeat) / total;

  // Mostly off the grid entirely — syncopated rather than any named position.
  if (gridRatio < 0.6) return { value: 'syncopated', confidence: 0.5, source: 'rhythm' };
  if (offRatio >= 0.6) return { value: 'offbeat', confidence: Math.min(0.9, offRatio), source: 'rhythm' };
  if (backRatio >= 0.6) return { value: 'backbeat', confidence: Math.min(0.9, backRatio), source: 'rhythm' };
  if (downRatio >= 0.6) return { value: 'downbeat', confidence: Math.min(0.9, downRatio), source: 'rhythm' };
  return { value: 'syncopated', confidence: 0.4, source: 'rhythm' };
}

// ─── Scalars ────────────────────────────────────────────────────────────────

const clamp01 = (n: number) => (Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0);

/**
 * How self-similar the channel is bar to bar: the fraction of bars whose
 * onset positions repeat the modal bar. A steady skank scores high; a
 * through-composed line scores low.
 */
function estimateRepetition(ev: ChannelEvidence): number {
  const onsets = ev.onsetRows;
  const rpBar = ev.rowsPerBar;
  if (!onsets || onsets.length === 0 || !rpBar || rpBar <= 0) return 0;

  const bars = new Map<number, string>();
  const byBar = new Map<number, number[]>();
  for (const row of onsets) {
    const bar = Math.floor(row / rpBar);
    const within = Math.round(((row % rpBar) + rpBar) % rpBar);
    const list = byBar.get(bar) ?? [];
    list.push(within);
    byBar.set(bar, list);
  }
  if (byBar.size <= 1) return 0; // one bar proves nothing about repetition
  for (const [bar, list] of byBar) bars.set(bar, list.sort((a, b) => a - b).join(','));

  const counts = new Map<string, number>();
  for (const sig of bars.values()) counts.set(sig, (counts.get(sig) ?? 0) + 1);
  const modal = Math.max(...counts.values());
  return clamp01(modal / bars.size);
}

function estimateDensity(ev: ChannelEvidence): number {
  if (ev.analysis && Number.isFinite(ev.analysis.density)) return clamp01(ev.analysis.density);
  const onsets = ev.onsetRows?.length ?? 0;
  const rows = ev.totalRows ?? 0;
  return rows > 0 ? clamp01(onsets / rows) : 0;
}

function estimateAudibility(ev: ChannelEvidence, density: number): number {
  // Live audio is the only real measure of "is this audible right now";
  // without it, density is a weak stand-in and is damped to say so.
  const runtime = ev.runtime;
  if (runtime && runtime.confidence > 0) return clamp01(runtime.confidence);
  return clamp01(density * 0.5);
}

/**
 * How much the arrangement leans on this channel.
 *
 * Product tuning, not a musical law: foundation and groove carry more of a
 * dub arrangement than texture, and density and audibility raise it. Callers
 * that need "may I mute this" should use this with `musicalFunction`, not
 * instead of it.
 */
function estimateImportance(
  fn: MusicalFunction,
  density: number,
  audibility: number,
): number {
  const FUNCTION_WEIGHT: Record<MusicalFunction, number> = {
    foundation: 0.9, groove: 0.8, voice: 0.8, hook: 0.7,
    harmony: 0.55, melody: 0.6, texture: 0.35, transition: 0.3, unknown: 0.4,
  };
  const base = FUNCTION_WEIGHT[fn];
  return clamp01(base * 0.7 + density * 0.15 + audibility * 0.15);
}

// ─── Entry point ────────────────────────────────────────────────────────────

function applyOverride<T>(
  override: T | undefined,
  inferred: AxisEstimate<T>,
): AxisEstimate<T> {
  return override !== undefined
    ? { value: override, confidence: 1, source: 'user' }
    : inferred;
}

/**
 * Build a profile from whatever evidence exists. Every field degrades to a
 * confidence-0 default rather than throwing, so a caller can always read a
 * profile and decide for itself whether the confidence justifies acting.
 */
export function buildMusicalChannelProfile(
  evidence: ChannelEvidence,
  overrides?: ChannelProfileOverrides,
): MusicalChannelProfile {
  const family = applyOverride(overrides?.instrumentFamily, estimateFamily(evidence));
  const fn = applyOverride(overrides?.musicalFunction, estimateFunction(evidence, family.value));
  const rhythm = applyOverride(overrides?.rhythmicRole, estimateRhythm(evidence));
  const register = applyOverride(overrides?.register, estimateRegister(evidence));

  const density = estimateDensity(evidence);
  const audibility = estimateAudibility(evidence, density);

  return {
    channel: evidence.channel,
    instrumentFamily: family,
    musicalFunction: fn,
    rhythmicRole: rhythm,
    register,
    importance: estimateImportance(fn.value, density, audibility),
    density,
    audibility,
    repetition: estimateRepetition(evidence),
  };
}

/** Convenience for callers that only act on confident classifications. */
export function axisOr<T>(estimate: AxisEstimate<T>, minConfidence: number, fallback: T): T {
  return estimate.confidence >= minConfidence ? estimate.value : fallback;
}
