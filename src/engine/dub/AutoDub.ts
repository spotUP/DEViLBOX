/**
 * Auto Dub — autonomous dub-move performer.
 *
 * Phase 1 MVP: blind (no pattern-data classification). A 250 ms tick polls
 * transport, computes bar-clock from enable-time + BPM, evaluates a rule
 * table, picks one move via seeded-able roulette, and fires it through
 * DubRouter. Recorder captures to dubLane for free if armed.
 *
 * Opt-in / off by default: start() is only called from the UI toggle.
 * stop() is a panic-off — disposes every currently-held hold disposer so
 * no channelMute / dubSiren / filterDrop gets stuck.
 *
 * Pure decision logic lives in `chooseMove(ctx, rng)` so tests can drive
 * the rule engine deterministically without faking the tick loop.
 */

import { getPersona, type AutoDubPersona } from './AutoDubPersonas';
import { getToneEngine } from '../ToneEngine';
import {
  startAutoEqDriver,
  stopAutoEqDriver,
  setAutoEqSnapshot,
  resetAutoEqDriver,
  makeFlatEqBaseline,
} from './AutoEQDriver';
import { useDubStore } from '@/stores/useDubStore';
import { useTransportStore } from '@/stores/useTransportStore';
import { useMixerStore } from '@/stores/useMixerStore';
import { useTrackerStore } from '@/stores/useTrackerStore';
import { useInstrumentStore } from '@/stores/useInstrumentStore';
import { useOscilloscopeStore } from '@/stores/useOscilloscopeStore';
import { type ChannelRole } from '@/bridge/analysis/MusicAnalysis';
import { classifySongRoles, isGenericChannelName } from '@/bridge/analysis/ChannelNaming';
import {
  updateChannelClassifierFromTap,
  getAllRuntimeChannelRoles,
  mergeOfflineAndRuntimeRoles,
  resetRuntimeChannelClassifier,
} from '@/bridge/analysis/ChannelAudioClassifier';
import { useInstrumentTypeStore } from '@/stores/useInstrumentTypeStore';
import { useChannelTypeStore } from '@/stores/useChannelTypeStore';
import { useFormatStore } from '@/stores/useFormatStore';
import { buildSongRoleTimeline, getRolesAtPosition, type SongRoleTimeline } from '@/bridge/analysis/SongRoleTimeline';
import { cedChannelAccumulator } from '@/bridge/analysis/CedChannelAccumulator';
import { sidVoiceClassifier } from '@/bridge/analysis/SidVoiceClassifier';
import { getActiveC64SidEngine } from '@engine/replayer/NativeEngineRouting';
import { AudioDataBus } from '@/engine/vj/AudioDataBus';
import type { Pattern } from '@/types/tracker';
import type { InstrumentConfig } from '@/types/instrument/defaults';
import { useTrackerAnalysisStore } from '@/stores/useTrackerAnalysisStore';
import { getActiveDubBus } from '@/engine/dub/DubBus';
import {
  computeMusicalPosition,
  computeMusicalPositionFromBeats,
  DEFAULT_MUSICAL_CLOCK_SETTINGS,
  type MusicalClockSettings,
} from '@/lib/dub/musicalClock';
import type { MusicalPosition } from '@/lib/dub/musicalClock';
import { resolveTransportRow } from '@/lib/dub/transportRow';
import { getPerformanceMemory } from './performanceMemoryBridge';
import {
  setPerformanceAnnotator,
  getPerformanceJournalRecorder,
  clearPerformanceJournal,
} from './performanceJournalBridge';
import {
  releaseAllDubTransients,
  reapOrphanedDubTransients,
} from '@/lib/dub/dubChannelTransient';
import { automationFor } from '@/lib/dub/moveAutomation';
import {
  beginGesture,
  cancelAllGestures,
  gestureCount,
  activeGestures,
} from './GestureEngine';
import { EnergyLedger, type EnergyBudget } from '@/lib/dub/moveEnergy';
import {
  readWetEnergy,
  type ArrangementSnapshot,
  type Intention,
} from '@/lib/dub/performanceContext';
import { IntentionPlanner, type IntentionDecision } from '@/lib/dub/intention';
import { moveServes } from '@/lib/dub/moveIntentions';
import type { PerformanceState } from '@/lib/dub/performanceState';
import {
  runPerformanceCycle,
  type PerformanceCycleInput,
} from '@/lib/dub/performanceCycle';
import { trackerEventSources } from '@/lib/dub/musicalEvents';
import { getChannelProfiles } from './channelProfiles';
import {
  behaviourFor,
  intentionPolicyFor,
  energyBudgetFor,
  type PersonaBehaviour,
} from '@/lib/dub/personaBehaviour';
import { allowSurprise, varianceInputsFrom } from '@/lib/dub/contextualVariance';
import {
  classifyRepetition,
  repetitionWeight,
  atMotifPosition,
} from '@/lib/dub/repetition';
import {
  measureConsequence,
  consequenceWeight,
  type Consequence,
  type MixReading,
} from '@/lib/dub/consequence';

/** Live analysis context injected into every tick. Null until analysis has run. */
export interface EQSnapshot {
  genre: string;
  energy: number;           // 0–1
  danceability: number;     // 0–1
  bpm: number;
  beatPhase: number;        // 0–1, position within current beat
  frequencyPeaks: [number, number][];  // [[hz, db], ...] sorted by magnitude desc
  baseline: import('@/engine/effects/Fil4EqEffect').Fil4Params;
}

/**
 * Adapt a move's raw persona params using live analysis data.
 * Returns raw params unchanged when snapshot is null (analysis not yet run).
 * Pure function — no side effects.
 */
export function adaptEQParams(
  moveId: string,
  rawParams: Record<string, number>,
  snapshot: EQSnapshot | null,
  persona: AutoDubPersona,
  /** Transport BPM — use for timing so sweepSec matches the holdMs
   *  calculated from the same bpm in tickImpl (avoids mismatch when
   *  the audio analyzer detects a different BPM than the transport). */
  transportBpm?: number,
): Record<string, number> {
  if (!snapshot) return rawParams;

  const { energy, danceability, frequencyPeaks } = snapshot;
  // Timing uses transport bpm when provided; falls back to snapshot bpm
  // (analysis-detected) only when transport isn't available.
  const bpm = transportBpm ?? snapshot.bpm;

  if (moveId === 'eqSweep') {
    // Dominant peak = highest-magnitude entry (first in sorted-by-db array)
    const dominant = frequencyPeaks.length > 0 ? frequencyPeaks[0][0] : null;
    const startHz = dominant !== null
      ? Math.max(20, Math.min(20000, dominant * 0.5))
      : rawParams.startHz;
    const endHz = dominant !== null
      ? Math.max(20, Math.min(20000, dominant * 2.5))
      : rawParams.endHz;
    const depth = persona.improvConfig?.depth ?? 8;
    const gain = depth * (0.5 + energy * 0.5);
    const q = 2 + danceability * 3;
    const sweepSec = 4 * 60 / bpm; // 4 beats at detected tempo
    return { ...rawParams, startHz, endHz, gain, q, sweepSec };
  }

  if (moveId === 'hpfRise') {
    // Highest-magnitude peak above 800 Hz
    const above = frequencyPeaks.filter(([hz]) => hz > 800);
    const peakHz = above.length > 0
      ? Math.max(1200, Math.min(6000, above[0][0]))
      : rawParams.peakHz;
    const beatMs = 60000 / bpm;
    const holdMs = 2 * beatMs * energy;
    return { ...rawParams, peakHz, holdMs };
  }

  return rawParams;
}

/**
 * Compute the gain delta (dB) for the improv loop for a single tick.
 * Pure function — no side effects.
 *
 * @param driver     Which modulation engine to use
 * @param beatPhase  0–1 position within current beat
 * @param energy     Current song energy 0–1
 * @param prevEnergy Energy from previous tick (for energy-reactive delta)
 * @param depth      Max modulation in dB
 */
export function computeImprovDelta(
  driver: 'beat-sync' | 'energy-reactive' | 'spectral',
  beatPhase: number,
  energy: number,
  prevEnergy: number,
  depth: number,
): number {
  switch (driver) {
    case 'beat-sync':
      return Math.sin(beatPhase * 2 * Math.PI) * depth * energy;

    case 'energy-reactive': {
      const rawDelta = (energy - prevEnergy) * depth * 8;
      return Math.max(-depth, Math.min(depth, rawDelta));
    }

    case 'spectral':
      // Spectral is computed per-band inline in improvTick (needs frequency peak data).
      return 0;
  }
}

const TICK_MS = 250;
const HARD_FIRES_PER_BAR_CAP = 3;
/** Per-move cooldown table (bars). Moves not listed use DEFAULT_COOLDOWN_BARS. */
const MOVE_COOLDOWNS: Record<string, number> = {
  // Phrase-structure moves — rare, don't repeat within a phrase
  versionDrop:        16,
  riddimSection:      16,
  tapeStop:            8,
  masterDrop:          8,
  dubSiren:            8,
  transportTapeStop:  12,
  // Signature moves — medium cooldown
  hpfRise:             4,
  echoBuildUp:         4,
  ghostReverb:         4,
  madProfPingPong:     6,
  filterDrop:          4,
  eqSweep:             4,
  // Accent moves — can repeat within a phrase
  echoThrow:           2,
  springKick:          2,
  springSlam:          2,
  snareCrack:          2,
  sonarPing:           3,
  channelMute:         2,
  combSweep:           3,
  channelThrow:        2,
  skankEchoThrow:      2,
  skankFloatThrow:     4,
};
const DEFAULT_COOLDOWN_BARS = 6;
/** Cap on wet moves (echo/reverb-contributing) per bar, regardless of total
 *  budget. Without this cap, bar-phase echoThrow + transient-echoThrow +
 *  springSlam + echoBuildUp + reverseEcho all stack into a reverb mush
 *  (2026-04-21 feedback). Dry moves (tapeStop, filterDrop, channelMute,
 *  etc.) are unaffected. */
const WET_FIRES_PER_BAR_CAP = 1;
/** Extra decay time (ms) added after a wet hold releases before allowing the
 *  next wet fire. The hold itself is already tracked — this is for echo/spring
 *  ring-out after the hold ends. 2 seconds covers most reverb tails. */
const WET_DECAY_EXTRA_MS = 2000;
/** Minimum wet block duration for oneshot (non-hold) wet fires (ms). */
const WET_ONESHOT_BLOCK_MS = 3500;
/** How long after a fire the consequence is measured. Long enough for an echo
 *  throw's first repeat to be in the mix, short enough to still be about THIS
 *  move rather than about whatever came next. */
const CONSEQUENCE_DELAY_MS = 700;
/** Sparse tracker songs (classic 4-channel modules especially) do not tolerate
 *  autonomous full-mix drops well — a "version drop" or "master drop" wipes
 *  most of the arrangement and feels random rather than musical. Keep these
 *  dramatic gestures manual-only on small arrangements. */
export const AUTO_DUB_SPARSE_DROP_CHANNEL_LIMIT = 4;
/** Rolling peak window for transient detection — last N ticks (~N * 250ms). */
const TRANSIENT_WINDOW = 8;
/** A channel's peak must exceed `RATIO * rollingAvg` to count as a transient. */
const TRANSIENT_RATIO = 1.6;
/** Minimum absolute peak for a transient to register — avoids noise floor spikes. */
const TRANSIENT_MIN_PEAK = 800;

const SPARSE_FULL_MIX_DROP_MOVES = new Set(['masterDrop', 'versionDrop', 'tapeStop']);
const STARTUP_DISRUPTIVE_MOVES = new Set(['masterDrop', 'ghostReverb', 'versionDrop', 'tapeStop']);

export function shouldSuppressAutoDubSparseDrop(
  moveId: string,
  channelCount: number,
): boolean {
  return channelCount > 0
    && channelCount <= AUTO_DUB_SPARSE_DROP_CHANNEL_LIMIT
    && SPARSE_FULL_MIX_DROP_MOVES.has(moveId);
}

export function shouldSuppressAutoDubStartupMove(
  moveId: string,
  bar: number,
): boolean {
  return bar === 0 && STARTUP_DISRUPTIVE_MOVES.has(moveId);
}

/**
 * Detect transient spikes per channel by comparing the current peak sample
 * (abs max) against a rolling average of prior peaks. Pure — tests pass a
 * fake `channelData` array directly.
 *
 * Returns the subset of channel indices whose peak this tick is at least
 * `TRANSIENT_RATIO`× the rolling average AND above `TRANSIENT_MIN_PEAK`.
 * The rolling-peaks buffer is mutated in-place: caller owns it across ticks.
 */
export function detectTransients(
  channelData: readonly (Int16Array | null)[],
  rollingPeaks: Array<number[]>,   // parallel to channelData; each inner array is the last N peaks
): number[] {
  const transients: number[] = [];
  for (let i = 0; i < channelData.length; i++) {
    const buf = channelData[i];
    if (!buf || buf.length === 0) continue;
    let peak = 0;
    for (let j = 0; j < buf.length; j++) {
      const v = buf[j];
      const a = v < 0 ? -v : v;
      if (a > peak) peak = a;
    }
    const history = rollingPeaks[i] ?? (rollingPeaks[i] = []);
    let avg = 0;
    if (history.length > 0) {
      let sum = 0;
      for (const p of history) sum += p;
      avg = sum / history.length;
    }
    // Push then trim BEFORE testing so a long silence doesn't spike on the
    // first loud hit (the prior tick's peak of 0 would divide anything).
    // But we still need to keep sensitivity to sharp onsets, so the test
    // uses avg prior to the current peak — history is updated after.
    if (peak >= TRANSIENT_MIN_PEAK && avg > 0 && peak >= avg * TRANSIENT_RATIO) {
      transients.push(i);
    }
    history.push(peak);
    if (history.length > TRANSIENT_WINDOW) history.shift();
  }
  return transients;
}

/** Helper: does any channel with the given role have a transient this tick? */
export function hasTransientForRole(ctx: AutoDubTickCtx, role: ChannelRole): boolean {
  if (ctx.transientChannels.length === 0 || ctx.roles.length === 0) return false;
  for (const idx of ctx.transientChannels) {
    if (ctx.roles[idx] === role) return true;
  }
  return false;
}

/**
 * Is there any note event on channel `ch` within the next `windowRows`
 * rows of `pattern`, starting from `fromRow` (inclusive)? Used by the
 * Auto-Dub look-ahead so echoThrow.chN / channelMute.chN don't fire on
 * a channel that has nothing to say over the move's effective window.
 *
 * Returns false for out-of-range channel / missing pattern. Wraps past
 * the pattern end is intentionally NOT supported — a move that lands
 * in the final few rows simply gets a tighter window, not visibility
 * into the next pattern (which might be a drum break with totally
 * different content).
 */
export function channelHasNoteInWindow(
  pattern: Pattern | null,
  fromRow: number,
  ch: number,
  windowRows: number,
): boolean {
  if (!pattern || !Array.isArray(pattern.channels)) return false;
  const channel = pattern.channels[ch];
  if (!channel || !Array.isArray(channel.rows)) return false;
  const start = Math.max(0, fromRow);
  const end = Math.min(channel.rows.length, start + windowRows);
  for (let r = start; r < end; r++) {
    const cell = channel.rows[r];
    if (cell && cell.note >= 1 && cell.note <= 96) return true;
  }
  return false;
}

/**
 * Count active notes per role over the next `windowRows` rows, normalised
 * to 0..1 where 0 = no notes on that role, 1 = every row of every
 * channel-of-that-role fires. Personas with `densityBias > 0` favour
 * dense passages; `< 0` favour sparse ones.
 *
 * Normalization caps density at 0.75 before dividing so a single very
 * busy channel can saturate without needing every channel to hit every
 * row — otherwise reasonable tracker songs max out around 0.1-0.2.
 */
export function computeDensityByRole(
  pattern: Pattern | null,
  fromRow: number,
  roles: readonly ChannelRole[],
  windowRows: number,
): Map<ChannelRole, number> {
  const out = new Map<ChannelRole, number>();
  if (!pattern || !Array.isArray(pattern.channels) || roles.length === 0) return out;
  const start = Math.max(0, fromRow);
  const end = Math.min(pattern.channels[0]?.rows.length ?? 0, start + windowRows);
  const span = end - start;
  if (span <= 0) return out;

  const counts = new Map<ChannelRole, { notes: number; channels: number }>();
  for (let ch = 0; ch < Math.min(roles.length, pattern.channels.length); ch++) {
    const role = roles[ch];
    if (role === 'empty') continue;
    const channel = pattern.channels[ch];
    if (!channel) continue;
    let notes = 0;
    for (let r = start; r < end; r++) {
      const cell = channel.rows[r];
      if (cell && cell.note >= 1 && cell.note <= 96) notes += 1;
    }
    const bucket = counts.get(role) ?? { notes: 0, channels: 0 };
    bucket.notes += notes;
    bucket.channels += 1;
    counts.set(role, bucket);
  }

  const CAP = 0.75;
  for (const [role, { notes, channels }] of counts) {
    if (channels === 0) continue;
    const maxPossible = span * channels * CAP;
    const density = Math.max(0, Math.min(1, notes / maxPossible));
    out.set(role, density);
  }
  return out;
}

// ── Phrase-level intensity arc ────────────────────────────────────────────────

/** Shape of the 16-bar intensity envelope. Controls how firing probability
 *  ramps over the phrase cycle. Each persona has a characteristic shape that
 *  defines their musical phrasing style. */
export type PhraseArcShape = 'standard' | 'sharp' | 'flat' | 'inverted' | 'slow';

function lerp(a: number, b: number, t: number): number { return a + (b - a) * t; }

/**
 * Returns a 0..1.5 multiplier on rollProb from where we are in the PHRASE.
 *
 * Gate L2: the position is a normalized 0..1 from `MusicalClock`, not
 * `bar % 16`. The modulo was two assumptions in one: that a phrase is sixteen
 * bars, and that a bar is what the transport's bar counter says — neither of
 * which holds at a phrase length the user has set, or in a metre that is not
 * 4/4. The arcs keep their shapes exactly; only what feeds them changed.
 *
 * @param phrasePosition 0..1 through the current phrase.
 * @param arc            persona arc shape
 */
export function getPhraseIntensityMult(phrasePosition: number, arc: PhraseArcShape): number {
  const raw = Number.isFinite(phrasePosition) ? phrasePosition : 0;
  // Accept a legacy bar index (>= 1) as well as a 0..1 position, so a caller
  // that has not been migrated degrades to the old behaviour rather than
  // silently pinning the arc at its start.
  const t = raw > 1 ? Math.max(0, Math.min(1, (raw % 16) / 16)) : Math.max(0, Math.min(1, raw));
  switch (arc) {
    case 'standard': // Tubby — gradual build, sustained peak, gentle decay
      if (t < 0.25)  return lerp(0.30, 0.90, t / 0.25);
      if (t < 0.75)  return 1.00;
      return lerp(1.00, 0.30, (t - 0.75) / 0.25);
    case 'sharp':    // Scientist — fast attack, long peak
      if (t < 0.10)  return lerp(0.20, 1.00, t / 0.10);
      if (t < 0.85)  return 1.00;
      return lerp(1.00, 0.20, (t - 0.85) / 0.15);
    case 'flat':     // Perry — constant chaos, no arc
      return 1.00;
    case 'inverted': // Jammy — fires hard at start, falls silent
      if (t < 0.10)  return 1.20;
      return lerp(1.00, 0.10, t / 0.90);
    case 'slow':     // Mad Professor — patient, very gradual build, no decay
      if (t < 0.50)  return lerp(0.20, 1.00, t / 0.50);
      return 1.00;
  }
}

// ──────────────────────────────────────────────────────────────────────────────

/** Rule = "when this condition holds, consider firing `moveId` with weight
 *  `baseWeight`." channelRole narrows channel selection to channels matching
 *  that role (when roles are available — Phase 2). 'any' accepts any
 *  non-empty channel. Falls back to random channel pick if no role data. */
interface Rule {
  moveId: string;
  channelRole?: 'any' | 'percussion' | 'bass' | 'chord' | 'pad' | 'lead' | 'arpeggio' | 'skank';
  condition: (ctx: AutoDubTickCtx) => boolean;
  baseWeight: number;
  /** For hold-kind moves: how many bars to hold before auto-release. Default 1. */
  holdBars?: number;
  /** True when the move contributes wet tail (echo/reverb/delay feedback).
   *  Counts against `WET_FIRES_PER_BAR_CAP` so multiple wet moves don't
   *  stack into a reverb mush. Dry moves (mute, tapeStop, filter)
   *  keep firing normally. */
  wet?: boolean;
}

const RULES: Rule[] = [
  // Bar 1 of 4 — Tubby's Altec Big Knob HPF rise. Research: Tubby swept the
  // HPF up at the top of a 4-bar phrase to build tension, then released on
  // the downbeat. Bar 1 (the second bar of a 4-bar phrase) is the sweet spot.
  { moveId: 'hpfRise',
    condition: (c) => c.isNewBar && c.bar % 4 === 1,
    baseWeight: 0.30, holdBars: 1 },
  // Bar 3 of 4 — echo throw on percussion (the signature Tubby move).
  { moveId: 'echoThrow', channelRole: 'percussion',
    condition: (c) => c.isNewBar && c.bar % 4 === 3,
    baseWeight: 0.35, wet: true },
  // Phrase end (bar 7 of 8) — tape stop and filter drop stack here.
  { moveId: 'tapeStop',
    condition: (c) => c.isNewBar && c.bar % 8 === 7,
    baseWeight: 0.15 },
  { moveId: 'filterDrop',
    condition: (c) => c.isNewBar && c.bar % 8 === 7,
    baseWeight: 0.30, holdBars: 1 },
  // Bar 4 lead-in rise.
  { moveId: 'radioRiser',
    condition: (c) => c.barPos > 0.85 && c.bar % 4 === 3,
    baseWeight: 0.25 },
  // Offbeat snare crack (mid-bar "&" between beats).
  { moveId: 'snareCrack', channelRole: 'percussion',
    condition: (c) => c.barPos >= 0.375 && c.barPos < 0.5,
    baseWeight: 0.20, wet: true },
  // Every other bar — mute the bass (hold 1 bar).
  { moveId: 'channelMute', channelRole: 'bass',
    condition: (c) => c.isNewBar && c.bar % 2 === 1,
    baseWeight: 0.20, holdBars: 1 },
  // Mid-bar spring slam.
  { moveId: 'springSlam',
    condition: (c) => c.barPos >= 0.45 && c.barPos < 0.55,
    baseWeight: 0.15, wet: true },
  // Bar 2 of 4 — echo build-up leading into next bar.
  { moveId: 'echoBuildUp',
    condition: (c) => c.isNewBar && c.bar % 4 === 2,
    baseWeight: 0.25, holdBars: 2, wet: true },
  // Dub siren — the signature move. Bar 1 of 4, or any bar at high intensity.
  // wet:true so it respects WET_FIRES_PER_BAR_CAP and the cross-bar cooldown —
  // prevents simultaneous firing with echoThrow which creates a saturating echo tail.
  { moveId: 'dubSiren',
    condition: (c) => c.isNewBar && (c.bar % 4 === 1 || c.intensity > 0.7),
    baseWeight: 0.22, holdBars: 1, wet: true },
  // Reverse echo — Perry territory.
  { moveId: 'reverseEcho',
    condition: (c) => c.barPos > 0.75 && c.bar % 4 === 3,
    baseWeight: 0.10, wet: true },
  // Backward reverb — every 8 bars late.
  { moveId: 'backwardReverb',
    condition: (c) => c.barPos > 0.8 && c.bar % 8 === 6,
    baseWeight: 0.10, wet: true },
  // tubbyScream removed from AutoDub — it builds uncontrollable spring
  // energy and saturates the mix when fired autonomously. Manual-only.
  // Sonar ping — narrow window mid-bar.
  { moveId: 'sonarPing',
    condition: (c) => c.barPos >= 0.6 && c.barPos < 0.65,
    baseWeight: 0.10, wet: true },
  // Sub swell — deep, slow, every 8 bars.
  { moveId: 'subSwell',
    condition: (c) => c.isNewBar && c.bar % 8 === 3,
    baseWeight: 0.15, holdBars: 2 },
  // Stereo doubler — Mad Prof ping-pong.
  { moveId: 'stereoDoubler',
    condition: (c) => c.isNewBar && c.bar % 4 === 2,
    baseWeight: 0.15, holdBars: 2 },
  // Channel throw — Perry offbeat.
  { moveId: 'channelThrow', channelRole: 'any',
    condition: (c) => c.barPos > 0.625 && c.barPos < 0.75 && c.bar % 2 === 0,
    baseWeight: 0.15, wet: true },
  // Sub harmonic — Jammy downbeat anchor.
  { moveId: 'subHarmonic',
    condition: (c) => c.isNewBar && c.bar % 4 === 0,
    baseWeight: 0.10, holdBars: 2 },

  // ─── Phase 3: transient-reactive rules ──────────────────────────────────
  // Fire on the ACTUAL hit rather than guessing from bar phase. Base weights
  // are kept deliberately low (2026-04-21) because transients fire on every
  // kick/snare — at higher weights the echoThrow dominated every bar and
  // the result felt spammy rather than musical. Also wet-tagged so they
  // respect the per-bar wet cap.
  { moveId: 'echoThrow', channelRole: 'percussion',
    condition: (c) => hasTransientForRole(c, 'percussion'),
    baseWeight: 0.25, wet: true },
  // Snare crack on a fresh transient — additive pop on top of the hit.
  { moveId: 'snareCrack', channelRole: 'percussion',
    condition: (c) => hasTransientForRole(c, 'percussion') && c.barPos > 0.25,
    baseWeight: 0.12, wet: true },
  // Perry-style sonar ping on a lead transient.
  { moveId: 'sonarPing',
    condition: (c) => hasTransientForRole(c, 'lead'),
    baseWeight: 0.12, wet: true },
  // Skank-specific rules — reggae off-beat chord stabs benefit from:
  //   1. Echo throw on the stab hit itself (off-beat echo tail)
  //   2. Channel mute for 1 bar ("drop the skank") — classic roots move
  //   3. Transient-reactive echo on every stab hit (lower weight to avoid spam)
  { moveId: 'echoThrow', channelRole: 'skank',
    condition: (c) => c.isNewBar && c.bar % 4 === 1,
    baseWeight: 0.30, wet: true },
  { moveId: 'channelMute', channelRole: 'skank',
    condition: (c) => c.isNewBar && c.bar % 8 === 4,
    baseWeight: 0.22, holdBars: 1 },
  { moveId: 'echoThrow', channelRole: 'skank',
    condition: (c) => hasTransientForRole(c, 'percussion') && c.barPos > 0.25,
    baseWeight: 0.18, wet: true },

  // ─── Phase 4: expanded move palette ─────────────────────────────────────
  // Spring kick — punchier spring hit, fits drum-heavy sections.
  // Also fires mid-bar on any beat (Perry's random tank-kick gesture).
  { moveId: 'springKick',
    condition: (c) => hasTransientForRole(c, 'percussion') && c.barPos > 0.4,
    baseWeight: 0.10, wet: true },
  { moveId: 'springKick',
    condition: (c) => c.barPos >= 0.45 && c.barPos < 0.52 && c.bar % 3 === 1,
    baseWeight: 0.08, wet: true },
  // Ghost reverb — subtle reverb swell on non-percussion channels.
  // Also fires on bar 2 of 4 for Mad Professor's lush swell pattern.
  { moveId: 'ghostReverb',
    condition: (c) => c.isNewBar && c.bar % 4 === 0,
    baseWeight: 0.12, holdBars: 2, wet: true },
  { moveId: 'ghostReverb',
    condition: (c) => c.isNewBar && c.bar % 4 === 2,
    baseWeight: 0.10, holdBars: 2, wet: true },
  // Mad Professor ping-pong — Ariwa SDE-3000 asymmetric stereo delay.
  // Fires on the downbeat of a 4-bar phrase, held for 2 bars of wide motion.
  { moveId: 'madProfPingPong',
    condition: (c) => c.isNewBar && c.bar % 8 === 4,
    baseWeight: 0.10, holdBars: 2, wet: true },
  // Ring mod — metallic Perry-style texture burst.
  { moveId: 'ringMod',
    condition: (c) => c.intensity > 0.5 && c.barPos > 0.6 && c.bar % 4 === 3,
    baseWeight: 0.08, holdBars: 1, wet: true },
  // Voltage starve — bit-crush degradation, sparing use.
  { moveId: 'voltageStarve',
    condition: (c) => c.intensity > 0.6 && c.isNewBar && c.bar % 8 === 5,
    baseWeight: 0.08, holdBars: 1, wet: true },
  // EQ sweep — resonant filter sweep, mid-bar transitions.
  { moveId: 'eqSweep',
    condition: (c) => c.barPos > 0.5 && c.bar % 4 === 2,
    baseWeight: 0.10, holdBars: 1, wet: true },
  // Delay preset snaps — occasional rate changes for variety.
  { moveId: 'delayPresetDotted',
    condition: (c) => c.isNewBar && c.bar % 8 === 3,
    baseWeight: 0.08, wet: true },
  { moveId: 'delayPresetTriplet',
    condition: (c) => c.isNewBar && c.bar % 8 === 7,
    baseWeight: 0.08, wet: true },
  // 380ms — King Tubby's classic chord delay. Fires on phrase starts.
  { moveId: 'delayPreset380',
    condition: (c) => c.isNewBar && c.bar % 8 === 0 && c.intensity > 0.3,
    baseWeight: 0.12, wet: true },
  // Quarter-note grid lock — rhythmically tight echo.
  { moveId: 'delayPresetQuarter',
    condition: (c) => c.isNewBar && c.bar % 8 === 4 && c.intensity > 0.4,
    baseWeight: 0.10, wet: true },
  // 8th note — double-time density, high-intensity moments.
  { moveId: 'delayPreset8th',
    condition: (c) => c.isNewBar && c.bar % 16 === 12 && c.intensity > 0.6,
    baseWeight: 0.08, wet: true },
  // 16th — machine-gun echo, sparing use at peak intensity.
  { moveId: 'delayPreset16th',
    condition: (c) => c.isNewBar && c.bar % 16 === 8 && c.intensity > 0.75,
    baseWeight: 0.06, wet: true },
  // Doubler — 25ms slapback, odd-bar fills.
  { moveId: 'delayPresetDoubler',
    condition: (c) => c.isNewBar && c.bar % 12 === 11 && c.intensity > 0.5,
    baseWeight: 0.07, wet: true },
  // Echo time throw — pitch whoosh on bar 2 of 4, builds tension.
  { moveId: 'delayTimeThrow',
    condition: (c) => c.isNewBar && c.bar % 4 === 2 && c.intensity > 0.4,
    baseWeight: 0.14, wet: true },
  // Master Drop — mutes dry, lets echo tail ring. Dramatic phrase transition.
  { moveId: 'masterDrop',
    condition: (c) => c.isNewBar && c.bar % 8 === 0 && c.intensity > 0.5,
    baseWeight: 0.10, holdBars: 1 },
  // Tape Wobble — LFO on echo rate, 2-bar hands-free texture.
  { moveId: 'tapeWobble',
    condition: (c) => c.isNewBar && c.bar % 4 === 1 && c.intensity > 0.35,
    baseWeight: 0.10, holdBars: 2, wet: true },
  // Comb sweep — liquid LFO flanger swirl. Two rules:
  //   1. Bar-edge hold on every even bar for percussion channels — the
  //      classic "underwater drums" texture from dub's golden era.
  //   2. Transient-reactive: fires on skank off-beats for that swirling
  //      chord stab feel. Short hold (1 bar) so it doesn't overstay.
  { moveId: 'combSweep', channelRole: 'percussion',
    condition: (c) => c.isNewBar && c.bar % 2 === 0,
    baseWeight: 0.22, holdBars: 2, wet: true },
  { moveId: 'combSweep', channelRole: 'skank',
    condition: (c) => hasTransientForRole(c, 'percussion') && c.barPos < 0.15,
    baseWeight: 0.18, holdBars: 1, wet: true },
  // ── Skank echo throw ─────────────────────────────────────────────────────
  // The defining offbeat dub move: catch ONE upbeat chord stab and throw it
  // into a dotted-eighth echo so the repeats land in the spaces between the
  // following stabs. Fires on bar 1 and 3 of each 4-bar phrase (strong phrase
  // positions for the chord change feel), plus transient-reactive on the stab
  // itself — which is the musically correct trigger, since the gesture is
  // "that chord just hit, that's the one I want".
  //
  // These are trigger-kind rules: the move owns its own capture window and
  // closes itself. `holdBars` is deliberately absent — an AutoDub hold would
  // pin the channel tap open across many stabs, which is the exact 2026-09-17
  // regression the reshape fixed.
  { moveId: 'skankEchoThrow', channelRole: 'skank',
    condition: (c) => c.isNewBar && c.bar % 4 === 1,
    baseWeight: 0.28, wet: true },
  { moveId: 'skankEchoThrow', channelRole: 'chord',
    condition: (c) => c.isNewBar && c.bar % 4 === 3,
    baseWeight: 0.20, wet: true },
  { moveId: 'skankEchoThrow', channelRole: 'skank',
    condition: (c) => hasTransientForRole(c, 'skank') && c.barPos > 0.25 && c.barPos < 0.5,
    baseWeight: 0.22, wet: true },
  // The 3:2 floating variant. Low base weight — personas that like it
  // (Perry, Mad Professor) multiply it up; the rest reach it only rarely.
  { moveId: 'skankFloatThrow', channelRole: 'skank',
    condition: (c) => c.isNewBar && c.bar % 8 === 5,
    baseWeight: 0.14, wet: true },

  // oscBass and crushBass are intentionally excluded from AutoDub:
  // both are self-oscillating generators that stomp on the mix when
  // auto-fired. They are manual-only performance pads.

  // ── Lead channel targeting ────────────────────────────────────────────────
  // Lead channels are melodic and benefit from resonant EQ sweeps and
  // occasional ghost reverb. Echo throws on lead transients create the
  // "catch the melody note in echo" technique.
  { moveId: 'echoThrow', channelRole: 'lead',
    condition: (c) => hasTransientForRole(c, 'lead') && c.barPos > 0.30,
    baseWeight: 0.14, holdBars: 1, wet: true },
  { moveId: 'eqSweep', channelRole: 'lead',
    condition: (c) => c.isNewBar && c.bar % 4 === 2,
    baseWeight: 0.12, holdBars: 1 },
  { moveId: 'ghostReverb', channelRole: 'lead',
    condition: (c) => c.isNewBar && c.bar % 8 === 0,
    baseWeight: 0.10, holdBars: 2, wet: true },

  // ── Chord / skank targeting ───────────────────────────────────────────────
  // Chord channels suit dotted-eighth echo (classic reggae timing) and
  // occasional ghost reverb.
  { moveId: 'delayPresetDotted', channelRole: 'chord',
    condition: (c) => c.isNewBar && c.bar % 4 === 1,
    baseWeight: 0.12, holdBars: 2, wet: true },

  // ── Pad targeting ─────────────────────────────────────────────────────────
  // Pad channels are slow-attack sustained tones — ghost reverb makes them
  // bloom into the bus return beautifully.
  { moveId: 'ghostReverb', channelRole: 'pad',
    condition: (c) => c.isNewBar && c.bar % 4 === 2,
    baseWeight: 0.14, holdBars: 2, wet: true },

  // ── Version Drop ─────────────────────────────────────────────────────────
  // The defining dub technique: mute all melodic channels, keep the riddim.
  // Fires at bar 4 of a 16-bar phrase (classic "drop" position) and on a
  // 32-bar cycle for longer drops at higher intensity.
  { moveId: 'versionDrop',
    condition: (c) => c.isNewBar && c.bar % 16 === 4,
    baseWeight: 0.18, holdBars: 2 },
  { moveId: 'versionDrop',
    condition: (c) => c.isNewBar && c.bar % 32 === 20 && c.intensity > 0.5,
    baseWeight: 0.14, holdBars: 4 },

  // ── Riddim Section — bass+drums breakdown with skank echo return ──────────
  // Per-persona config. Only fires when persona enables it, every N bars.
  // Guarded by !inRiddimSection so the rule can't re-trigger itself mid-hold.
  { moveId: 'riddimSection',
    condition: (c) =>
      c.isNewBar
      && (c.persona.riddimConfig?.enabled ?? false)
      && c.bar > 0                                           // never fire on bar 0 (instant mute on start)
      && c.bar % (c.persona.riddimConfig?.freqBars ?? 16) === 0
      && c.intensity > 0.35
      && !c.inRiddimSection,
    baseWeight: 0.60, holdBars: 4 },
];

/** Unique move IDs Auto Dub can fire. Deduplicated from RULES — several
 *  moves appear in multiple rules (e.g. echoThrow on bar 3 + transient).
 *  Exported so the UI can render a blacklist checkbox per move. */
export const AUTO_DUB_RULE_MOVES: readonly string[] = Array.from(
  new Set(RULES.map(r => r.moveId))
).sort();

export interface AutoDubTickCtx {
  bar: number;
  barPos: number;
  /** First tick in a newly-entered bar. Used for "fire on bar edge" rules so
   *  they fire exactly once per bar regardless of tick jitter. */
  isNewBar: boolean;
  intensity: number;
  persona: AutoDubPersona;
  blacklist: Set<string>;
  movesFiredThisBar: number;
  /** Subset of movesFiredThisBar that fired wet-tagged rules. Capped by
   *  `WET_FIRES_PER_BAR_CAP`. */
  wetFiredThisBar: number;
  /** performance.now() ms after which the next wet fire is allowed. Compared
   *  directly against performance.now() — no arithmetic needed in the gate. */
  nextWetAllowedMs: number;
  moveLastFiredBar: ReadonlyMap<string, number>;
  channelCount: number;
  /** Per-channel role, parallel to channel indices (0..channelCount-1).
   *  Empty array = no classification available (Phase 1 fallback). */
  roles: readonly ChannelRole[];
  /** Indices of channels that had a transient spike detected this tick.
   *  Empty when no oscilloscope data is flowing (Phase 1/2 fallback). */
  transientChannels: readonly number[];
  /** Currently-playing pattern (null if no song loaded). Used by the
   *  look-ahead / density / upcoming-note helpers below. */
  currentPattern: Pattern | null;
  /** Row within the current pattern, 0-based. */
  currentRow: number;
  /** Per-channel names as they appear in the tracker store — usually
   *  auto-named ("Drums", "Bass") or user-renamed. Used to boost
   *  selection of channels the user explicitly cared about. Empty
   *  array = no name data (fall through to uniform selection). */
  channelNames: readonly (string | null | undefined)[];
  /** Per-role "note density" estimate for the current + next few bars,
   *  normalised 0..1. Higher = more notes per row. Personas use this to
   *  bias rule firing toward dense (Scientist) or sparse (Jammy) passages. */
  densityByRole: ReadonlyMap<ChannelRole, number>;
  /** Phrase-arc multiplier for this tick (0.1..1.2). Modulates rollProb so
   *  firing probability rises and falls with the 16-bar phrase envelope. */
  phraseIntensityMult: number;
  /** Bar of the last move fired by ANY rule this session. Used to enforce the
   *  persona's `minBarsBetweenFires` breathing room between gestures. */
  lastGlobalFireBar: number;
  /** Live EQ analysis snapshot. Null when no analysis has run yet. */
  eqSnapshot: EQSnapshot | null;
  /** True while a riddimSection hold is active — restricts channel picks to bass/percussion. */
  inRiddimSection: boolean;
  /** Gate E: what the performer decided it wants, chosen before the move.
   *  Undefined leaves the rule engine in its pre-Gate-E behaviour. */
  intention?: Intention;
  /** Channel the intention is aimed at, when it named one. Role-targeted
   *  rules prefer it over a random pick from their matching channels. */
  intentionChannel?: number;
  /** Gate G: may this move be added to what is already in the air? Undefined
   *  leaves the pre-Gate-G behaviour (the `wet` flag and its bar counter). */
  admitsMove?: (moveId: string) => boolean;
  /** Gate K2: the music is settled enough for a departure from the rules, and
   *  the persona took the chance. Undefined falls back to the flat
   *  `variance * 0.1` roll. */
  surpriseAllowed?: boolean;
  /** Gate K4: weight multiplier per move — above 1 where a motif belongs,
   *  below 1 for a move the performer is stuck in. Undefined = no adjustment. */
  repetitionWeightFor?: (moveId: string) => number;
  /** Gate K4: moves barred outright for having just fired too many times in a
   *  row. Weighting alone was too gentle — measured live, 18 of 22 fires were
   *  the same move. Undefined = nothing barred. */
  barredForRepetition?: (moveId: string) => boolean;
}

export interface AutoDubChoice {
  moveId: string;
  channelId: number | undefined;
  params: Record<string, number>;
  holdBars: number;
  /** True when the chosen rule was wet-tagged. Caller uses this to
   *  increment its per-bar wet-fires counter. */
  wet: boolean;
}

/**
 * Pure rule-engine step. Given context + an RNG, decides whether to fire a
 * move and which one. Tests drive this directly for determinism.
 */
export function chooseMove(ctx: AutoDubTickCtx, rng: () => number): AutoDubChoice | null {
  // Density tuning (2026-04-21 feedback — Auto Dub was chaotic + reverb-heavy):
  // - Budget: ceil(intensity * 2) → 0 at 0, 1 at 0<=intensity<=0.5, 2 at 1.0.
  //   Old formula (1 + floor(intensity * 3)) always fired ≥1 move/bar even at
  //   low intensity, compounding into density.
  // - Roll probability halved (0.6 → 0.3) so fewer ticks pass the gate.
  // - Wet cap: separate per-bar budget for reverb-contributing moves so
  //   echoThrow + springSlam + echoBuildUp don't stack into a reverb mush.
  const personaCap = ctx.persona.budgetCap;
  const intensityBudget = Math.ceil(ctx.intensity * 2);
  const budget = Math.min(personaCap ?? intensityBudget, HARD_FIRES_PER_BAR_CAP);
  if (budget === 0) return null;
  if (ctx.movesFiredThisBar >= budget) return null;

  // Density bias on the per-tick fire roll. Scientist fires MORE during
  // dense passages, Jammy fires LESS — so the rate gate itself has to
  // move, not just the weighted pick. Using max-density across roles
  // gives a single "how busy is the song right now" scalar.
  //   mult = 1 + bias * (maxDensity - 0.5) * 1.5, clamped to [0.25, 1.75]
  // so extremes can't zero out or double firing rate. Neutral personas
  // (bias=0) leave the rollProb untouched.
  let maxDensity = 0;
  for (const d of ctx.densityByRole.values()) {
    if (d > maxDensity) maxDensity = d;
  }
  const rollBias = ctx.persona.densityBias ?? 0;
  const rollDensityMult = rollBias !== 0
    ? Math.max(0.25, Math.min(1.75, 1 + rollBias * (maxDensity - 0.5) * 1.5))
    : 1;
  // Global inter-fire breathing room — persona sets minimum bars between any
  // two AutoDub moves so the mix has space to breathe between gestures.
  const minBetween = ctx.persona.minBarsBetweenFires ?? 1.0;
  if (ctx.bar - ctx.lastGlobalFireBar < minBetween) return null;

  // Phrase-arc multiplier modulates the roll gate so AutoDub naturally builds
  // and breathes over 16-bar phrases instead of firing at a constant rate.
  const rollProb = ctx.intensity * 0.3 * rollDensityMult * ctx.phraseIntensityMult;
  if (rng() > rollProb) return null;

  // Gate K2: a surprise is only a surprise when the situation is otherwise
  // settled. The flat `variance * 0.1` roll below is the pre-K2 fallback for
  // callers (and tests) that do not supply a contextual verdict.
  const variance = ctx.persona.variance ?? 0;
  const hasRoles = ctx.roles.length > 0;
  const eligible: Array<{ rule: Rule; weight: number; matchingChannels: readonly number[] }> = [];

  for (const rule of RULES) {
    if (ctx.blacklist.has(rule.moveId)) continue;
    // Gate E: the intention was chosen before the move, so only moves that can
    // express it are eligible. Without an intention (older callers, tests that
    // drive the rule engine directly) every move stays eligible and the
    // behaviour is the pre-Gate-E one.
    if (ctx.intention && !moveServes(rule.moveId, ctx.intention)) continue;
    // Gate G: energy accounting replaces the wet flag's blunt one-per-bar
    // rationing. A cheap move may still layer over a cheap one; a wash on top
    // of a wash is refused on the axis that refused it.
    if (ctx.admitsMove && !ctx.admitsMove(rule.moveId)) continue;
    // Nothing musical needs the same move four times running.
    if (ctx.barredForRepetition?.(rule.moveId)) continue;
    if (shouldSuppressAutoDubSparseDrop(rule.moveId, ctx.channelCount)) continue;
    if (shouldSuppressAutoDubStartupMove(rule.moveId, ctx.bar)) continue;
    // Per-bar wet cap: once a wet move has fired this bar, skip every
    // other wet rule until the next bar. Dry moves (tapeStop, filterDrop,
    // channelMute, subSwell, etc.) stay eligible.
    if (rule.wet && ctx.wetFiredThisBar >= WET_FIRES_PER_BAR_CAP) continue;
    // Cross-bar wet block: block new wet fires until the current wet hold has
    // released AND the echo/spring tail has had WET_DECAY_EXTRA_MS to decay.
    // This correctly tracks hold duration (not a fixed constant) so a 2-bar
    // hold at slow BPM can't have a new wet move fire while it's still active.
    if (rule.wet && performance.now() < ctx.nextWetAllowedMs) continue;

    const surprise = ctx.surpriseAllowed ?? (variance > 0 && rng() < variance * 0.1);
    const condOk = rule.condition(ctx) || surprise;
    if (!condOk) continue;

    // Resolve channel candidates for role-targeted rules:
    //   - with role data: filter to channels whose role matches the rule
    //   - 'any' matches any non-empty channel
    //   - without role data: all channels are candidates (Phase 1 fallback)
    //   - if role required but no match → rule skipped this tick
    let matchingChannels: readonly number[] = EMPTY_CHANNELS;
    if (rule.channelRole) {
      if (hasRoles) {
        const want = rule.channelRole;
        const matches: number[] = [];
        const nonEmpty: number[] = [];
        for (let i = 0; i < ctx.roles.length; i++) {
          const r = ctx.roles[i];
          if (r === 'empty') continue;
          nonEmpty.push(i);
          if (want === 'any' || r === want) matches.push(i);
        }
        if (matches.length > 0) {
          matchingChannels = matches;
        } else if (nonEmpty.length > 0) {
          // Classifier returned roles but none match this rule's want
          // (e.g. rule wants 'percussion' but nobody was classified as
          // percussion — common on MOD songs with sparse pattern 0 or
          // purely melodic material). Fall back to any non-empty channel
          // rather than silently dropping the rule — otherwise bass /
          // percussion-targeted rules would never fire on songs without
          // strong role signatures and the pattern editor would see zero
          // Zxx cells from Auto Dub.
          matchingChannels = nonEmpty;
        } else {
          // Every channel is empty — nothing to fire at.
          continue;
        }
      } else if (ctx.channelCount > 0) {
        // No classification — any channel is fair game.
        matchingChannels = ALL_CHANNELS.slice(0, ctx.channelCount);
      }
    }

    const lastBar = ctx.moveLastFiredBar.get(rule.moveId);
    const moveCooldown = MOVE_COOLDOWNS[rule.moveId] ?? DEFAULT_COOLDOWN_BARS;
    const cooldownDecay = lastBar !== undefined
      ? Math.min(1, (ctx.bar - lastBar) / moveCooldown)
      : 1;
    if (cooldownDecay <= 0) continue;

    const persWeight = ctx.persona.weights[rule.moveId] ?? 1.0;
    if (persWeight <= 0) continue;

    // Look-ahead: if this rule targets a specific role and the chosen
    // window (≈ 1 bar of notes at standard tracker speed, ~16 rows) has
    // NO notes on ANY candidate channel, skip the rule. Firing
    // echoThrow.chN when channel N is silent for the next 16 rows is
    // wasted — there's nothing to echo. Falls through silently when
    // `currentPattern` is null (no song loaded → Phase 1 behaviour).
    if (rule.channelRole && matchingChannels.length > 0 && ctx.currentPattern) {
      const LOOK_AHEAD_ROWS = 16;
      const liveCandidates = matchingChannels.filter(
        ch => channelHasNoteInWindow(ctx.currentPattern, ctx.currentRow, ch, LOOK_AHEAD_ROWS),
      );
      if (liveCandidates.length === 0) continue;
      matchingChannels = liveCandidates;
    }

    // Riddim section guard: while a riddimSection hold is active, only
    // bass- and percussion-targeted rules are eligible. Melodic-role rules
    // are skipped entirely; 'any'-role rules have their channel candidates
    // trimmed to bass/percussion channels so they stay in-genre.
    if (ctx.inRiddimSection && rule.moveId !== 'riddimSection') {
      const RIDDIM_ROLES = new Set<ChannelRole>(['percussion', 'bass']);
      if (rule.channelRole && rule.channelRole !== 'any') {
        // Rule explicitly targets a non-bass/percussion role — skip it
        if (!RIDDIM_ROLES.has(rule.channelRole as ChannelRole)) continue;
      } else if (rule.channelRole === 'any' && matchingChannels.length > 0 && ctx.roles.length > 0) {
        // 'any'-role rule: restrict candidates to bass+percussion channels
        const riddimCandidates = matchingChannels.filter(
          ch => RIDDIM_ROLES.has(ctx.roles[ch] ?? 'empty'),
        );
        if (riddimCandidates.length === 0) continue;
        matchingChannels = riddimCandidates;
      } else if (!rule.channelRole) {
        // Global (no channelRole) rules are still eligible — they don't
        // target any channel, so they can still fire (e.g. tapeWobble,
        // masterDrop). Keep them in the pool.
      }
    }

    // Density bias: personas with densityBias != 0 steer rule firing
    // toward dense (Scientist) or sparse (Jammy) passages. For role-
    // targeted rules, use the role's density; for global rules, use the
    // max role density (approximates "how busy is the song right now").
    let densityMult = 1;
    const densityBias = ctx.persona.densityBias ?? 0;
    if (densityBias !== 0 && ctx.densityByRole.size > 0) {
      let density = 0;
      if (rule.channelRole && rule.channelRole !== 'any') {
        density = ctx.densityByRole.get(rule.channelRole) ?? 0;
      } else {
        for (const d of ctx.densityByRole.values()) {
          if (d > density) density = d;
        }
      }
      // density in [0, 1]; bias in [-1, +1]. Offset from 0.5 so a neutral
      // passage (0.5) leaves weight unchanged. Clamp to [0.25, 1.75] so
      // extremes don't zero-out or bloom a rule to dominance.
      const mult = 1 + densityBias * (density - 0.5) * 1.5;
      densityMult = Math.max(0.25, Math.min(1.75, mult));
    }

    // Gate K4: protect a motif where it belongs, break a rut anywhere.
    const repetitionMult = ctx.repetitionWeightFor?.(rule.moveId) ?? 1;
    const weight = rule.baseWeight * ctx.intensity * persWeight * cooldownDecay
      * densityMult * repetitionMult;
    if (weight <= 0) continue;

    eligible.push({ rule, weight, matchingChannels });
  }

  if (eligible.length === 0) return null;

  const totalWeight = eligible.reduce((s, e) => s + e.weight, 0);
  let roll = rng() * totalWeight;
  let picked = eligible[0];
  for (const e of eligible) {
    if (roll < e.weight) { picked = e; break; }
    roll -= e.weight;
  }

  let channelId: number | undefined;
  if (picked.rule.channelRole) {
    // Gate E: the intention named a channel — an ACCENT on the snare about to
    // sound, an ANSWER on the channel the player just threw. Honour it when
    // the rule's own role filter agrees; a rule that wants percussion does not
    // get pointed at the pad just because the intention did.
    if (ctx.intentionChannel !== undefined
        && picked.matchingChannels.includes(ctx.intentionChannel)) {
      channelId = ctx.intentionChannel;
    } else if (picked.matchingChannels.length > 0) {
      // User-rename boost: if the user explicitly renamed a candidate
      // channel (name is non-generic — not "Channel N" / "CH N"), weight
      // it 1.5× higher when picking the target. That respects "I cared
      // enough about this channel to name it — dub moves should prefer
      // it over the auto-named defaults." Auto-names like "Kick" /
      // "Bass" / "Lead" are still generic enough that they don't
      // trigger this boost (they match the output of suggestChannelName
      // which comes from the classifier, not from user intent).
      const hasNames = ctx.channelNames.length > 0;
      const weights = picked.matchingChannels.map((ch) => {
        if (!hasNames) return 1;
        const name = ctx.channelNames[ch] ?? null;
        return isGenericChannelName(name) ? 1 : 1.5;
      });
      const total = weights.reduce((s, w) => s + w, 0);
      let roll = rng() * total;
      channelId = picked.matchingChannels[0]; // safe default: first match
      for (let i = 0; i < picked.matchingChannels.length; i++) {
        if (roll < weights[i]) { channelId = picked.matchingChannels[i]; break; }
        roll -= weights[i];
      }
    }
  }

  const paramOverrides = ctx.persona.paramOverrides?.[picked.rule.moveId] ?? {};
  const params: Record<string, number> = { ...paramOverrides };

  return {
    moveId: picked.rule.moveId,
    channelId,
    params,
    holdBars: picked.rule.holdBars ?? 1,
    wet: picked.rule.wet === true,
  };
}

const EMPTY_CHANNELS: readonly number[] = Object.freeze([]);
const ALL_CHANNELS: readonly number[] = Object.freeze(
  Array.from({ length: 64 }, (_, i) => i),
);

// ───────────────────────── Module-local runtime state ─────────────────────────

/**
 * Gate E: the performer's intention planner. One per process, like the
 * memory it reads — a second planner would keep its own rest commitments and
 * the two would take turns resting.
 */
/**
 * Gate G: what the performer has put in the air, with decay. Replaces the
 * `wet: true` boolean plus one-fire-per-bar counter as the thing that decides
 * whether another move may layer — a flag could not tell a sonarPing from a
 * springSlam, so it rationed the cheap move like the expensive one.
 */
const _energyLedger = new EnergyLedger();

/** Persona whose behaviour is currently applied to the planner (Gate K1). */
let _appliedBehaviourFor: string | null = null;

/**
 * Gate J: how each move went last time it fired. The performer used to make
 * every decision in the same state of ignorance as the last one — a throw at a
 * silent channel and a throw that lifted the snare looked identical from the
 * inside.
 */
const _consequences = new Map<string, Consequence>();

/** The last consequence measured, for MCP diagnostics and the fire log. */
let _lastConsequence: { moveId: string; consequence: Consequence } | null = null;

export function getAutoDubConsequences(): ReadonlyMap<string, Consequence> {
  return _consequences;
}

export function getAutoDubLastConsequence(): { moveId: string; consequence: Consequence } | null {
  return _lastConsequence;
}

/**
 * Read the mix as it is right now.
 *
 * Per-channel levels come from the engine's own meters, which is what makes
 * `targetAudibility` a measurement rather than an assumption: a throw aimed at
 * a channel that was not playing shows up as the no-op it was.
 */
function readMix(channelCount: number): MixReading | null {
  const audio = sampleAutoDubAudio();
  if (!audio) return null;
  const channelLevels = new Map<number, number>();
  let audibleChannels = 0;
  try {
    const levels = getToneEngine().getChannelLevels(Math.max(1, channelCount));
    levels.forEach((level, index) => {
      channelLevels.set(index, level);
      if (level > 0.01) audibleChannels++;
    });
  } catch { /* engine not ready — the whole-mix half of the reading still works */ }

  const energy = _energyLedger.read(performance.now() / 1000);
  return {
    rms: audio.rms,
    sub: audio.sub,
    bass: audio.bass,
    mid: audio.mid,
    high: audio.high,
    channelLevels,
    audibleChannels,
    wet: energy.wet,
    feedback: energy.feedback,
  };
}

/** Live energy reading, for MCP diagnostics and the fire log. */
export function getAutoDubEnergy(): ReturnType<EnergyLedger['read']> {
  return _energyLedger.read(performance.now() / 1000);
}

const _intentionPlanner = new IntentionPlanner();
/** Gate E3: where the performer is in a gesture. One machine, all personas. */
let _performanceState: PerformanceState = 'LISTEN';

/** The state machine's view of the last tick — MCP diagnostics read it. */
export function getAutoDubPerformanceState(): PerformanceState {
  return _performanceState;
}

let _lastIntention: IntentionDecision | null = null;
/** Bar position of the last cycle, so a journal entry reads musically. */
let _lastPosition: { bar: number; barInPhrase: number } | null = null;
/** 0..1 through the phrase at the last cycle — the monitor's phrase readout. */
let _lastPhrasePosition: number | null = null;

/** The intention behind the most recent tick — read by MCP diagnostics and
 *  by the fire log, so a fire can be explained rather than just listed. */
export function getAutoDubIntention(): IntentionDecision | null {
  return _lastIntention;
}

/**
 * Everything the Gate O1 monitor needs, in one read.
 *
 * Assembled here because the monitor must never reach into the performer's
 * internals — a UI that reads private state is a UI that breaks every time the
 * performer is refactored, and one that polls five getters can show five
 * different instants at once.
 */
export interface PerformanceSnapshot {
  running: boolean;
  persona: string;
  state: PerformanceState;
  intention: string | null;
  target: { kind: string; channelId?: number; reason?: string } | null;
  /** Why this intention — the planner's own words. */
  reason: string | null;
  bar: number | null;
  barInPhrase: number | null;
  /** 0..1 through the phrase. */
  phrasePosition: number | null;
  wet: number;
  feedback: number;
  gesturesInFlight: number;
  lastMove: { moveId: string; channelId?: number; bar?: number } | null;
  /** The next event the performer can see, if it is aiming at one. */
  nextTargetRow: number | null;
  /** Concise factors behind the current state — the monitor's WHY? line. */
  why: string[];
}

export function getPerformanceSnapshot(): PerformanceSnapshot {
  const energy = _energyLedger.read(performance.now() / 1000);
  const journal = (() => {
    try {
      const entries = getPerformanceJournalRecorder().snapshot().entries;
      const last = entries[entries.length - 1];
      return last ? { moveId: last.moveId, channelId: last.channelId, bar: last.bar } : null;
    } catch { return null; }
  })();

  const why: string[] = [];
  if (_lastIntention) {
    why.push(_lastIntention.reason);
    if (_lastIntention.holdBars > 1) why.push(`committed for ${_lastIntention.holdBars} bars`);
  }
  if (_heldGestureCount() > 0) why.push(`${_heldGestureCount()} in flight`);
  if (energy.wet > 0.6) why.push(`wet ${energy.wet.toFixed(2)} — little room left`);
  if (energy.feedback > 0.7) why.push(`feedback ${energy.feedback.toFixed(2)}`);

  // Why it CANNOT be heard, which is a different question from why it chose to
  // rest and the one that actually gets asked.
  //
  // A performer can be running, hearing the tune, and deciding perfectly well
  // while the bus receives nothing at all — no channel is sending to it, so
  // every move lands in silence. Measured 2026-09-18 chasing "King Tubby is
  // mostly idle": `registeredChannelTaps: 0`, `inputRms: 0`, `returnRms: 0`,
  // and every decision REST. Nothing in the product said so, which is exactly
  // the question this monitor exists to answer.
  for (const reason of inaudibilityReasons()) why.push(reason);

  return {
    running: _timer !== null,
    persona: _appliedBehaviourFor ?? useDubStore.getState().autoDubPersona,
    state: _performanceState,
    intention: _lastIntention?.intention ?? null,
    target: _lastIntention?.target ?? null,
    reason: _lastIntention?.reason ?? null,
    bar: _lastPosition?.bar ?? null,
    barInPhrase: _lastPosition?.barInPhrase ?? null,
    phrasePosition: _lastPhrasePosition,
    wet: energy.wet,
    feedback: energy.feedback,
    gesturesInFlight: _heldGestureCount(),
    lastMove: journal,
    nextTargetRow: _lastIntention?.targetRow ?? null,
    why,
  };
}

function _heldGestureCount(): number {
  try { return gestureCount(); } catch { return 0; }
}

let _timer: ReturnType<typeof setInterval> | null = null;
let _enableTimeMs = 0;
let _lastBar = -1;
let _lastGlobalFireBar = -99;
let _movesFiredThisBar = 0;
let _wetFiredThisBar = 0;
/** performance.now() timestamp (ms) after which the next wet fire is allowed.
 *  Set to: holdMs + WET_DECAY_EXTRA_MS after a hold-based wet fire so new
 *  wet moves can't stack on top of an active hold. -Infinity = no block. */
let _nextWetAllowedMs = -Infinity;
/**
 * Held moves live in the GestureEngine (Gate F4), not in a Set and a Map here.
 * AutoDub used to keep its own disposer set with paired timers, which meant the
 * AI's holds were cancellable and the user's were not, and "how many gestures
 * are in flight" had two answers. The engine owns the shape — start, hold,
 * release, cancel — and still fires everything through DubRouter.
 */
const _moveLastFiredBar = new Map<string, number>();
let _rng: () => number = Math.random;
/** Per-channel rolling peak history for transient detection. Grown lazily. */
const _rollingPeaks: number[][] = [];
let _eqSnapshot: EQSnapshot | null = null;
let _inRiddimSection = false;
function getChannelCount(): number {
  try {
    const osc = useOscilloscopeStore.getState();
    if (osc.numChannels > 0) return osc.numChannels;
    const tracker = useTrackerStore.getState();
    const pattern = tracker.patterns[tracker.currentPatternIndex];
    const trackerChannels = pattern?.channels?.length ?? 0;
    if (trackerChannels > 0) return trackerChannels;
    const mixer = useMixerStore.getState();
    const chans = mixer.channels;
    const activeSends = chans.filter((channel) => channel.dubSend > 0.001).length;
    if (activeSends > 0) return activeSends;
    return Array.isArray(chans) ? chans.length : 0;
  } catch {
    return 0;
  }
}

/** Read the oscilloscope store and run transient detection against our
 *  rolling peak buffer. Returns indices of channels with spikes this tick. */
function detectTransientsFromOscilloscope(): number[] {
  try {
    const osc = useOscilloscopeStore.getState();
    const data = osc.channelData;
    if (!Array.isArray(data) || data.length === 0) return [];
    return detectTransients(data, _rollingPeaks);
  } catch {
    return [];
  }
}

// ── SID per-voice offline render — trigger once per file load ────────────────
let _lastSidFileRef: Uint8Array | null = null;

function triggerSidVoiceClassificationIfNew(): void {
  try {
    const sidData = useFormatStore.getState().c64SidFileData;
    if (!sidData || sidData === _lastSidFileRef) return;
    _lastSidFileRef = sidData;
    useChannelTypeStore.getState().classifySidVoicesFromFile(sidData, 'song.sid');
  } catch { /* never throw into tick */ }
}

// ── CED song role timeline cache ─────────────────────────────────────────────
// Rebuilt whenever the instrument type map changes (new CED results arrive).
// Keyed by the patterns array reference + instrumentTypes map size to detect
// both song changes and progressive CED result updates.
let _cedTimeline: SongRoleTimeline | null = null;
let _cedTimelinePatternRef: Pattern[] | null = null;
let _cedTimelineResultCount = -1;

function getCedTimeline(patterns: Pattern[], patternOrder: number[]): SongRoleTimeline | null {
  const store = useInstrumentTypeStore.getState();
  const resultCount = store.results.size;
  if (resultCount === 0) return null;
  // Rebuild when patterns change or new CED results arrive
  if (
    _cedTimeline === null ||
    _cedTimelinePatternRef !== patterns ||
    _cedTimelineResultCount !== resultCount
  ) {
    const typeMap = new Map<number, import('@/bridge/analysis/AudioSetInstrumentMap').InstrumentType>();
    const confidenceMap = new Map<number, number>();
    const MIN_CED_CONFIDENCE = 0.15;
    for (const [id, r] of store.results) {
      if (r.instrumentType !== 'unknown' && r.confidence >= MIN_CED_CONFIDENCE) {
        typeMap.set(id, r.instrumentType);
        confidenceMap.set(id, r.confidence);
      }
    }
    _cedTimeline = buildSongRoleTimeline(patterns, patternOrder, typeMap, confidenceMap);
    _cedTimelinePatternRef = patterns;
    _cedTimelineResultCount = resultCount;
  }
  return _cedTimeline;
}

/** Feed the live tap into the runtime channel classifier (ChannelAudio-
 *  Classifier). Same data source as `detectTransientsFromOscilloscope` but
 *  accumulates samples into a ring buffer for spectral classification. */
function updateRuntimeClassifierFromOscilloscope(): void {
  try {
    const osc = useOscilloscopeStore.getState();
    const data = osc.channelData;
    if (!Array.isArray(data) || data.length === 0) return;
    updateChannelClassifierFromTap(data);
    // Feed into the CED channel accumulator (larger ring → CED inference when full)
    cedChannelAccumulator.feed(data);
  } catch { /* classifier must never throw into the tick loop */ }
}

/** Resolve the currently-playing pattern's channel roles + the pattern
 *  itself (used by the look-ahead / density helpers) + the channel-name
 *  array (for user-rename boost). Returns a neutral bundle when no song
 *  is loaded — callers fall through to the Phase-1 behaviour.
 *
 *  Roles come from a three-stage pipeline:
 *    1. `classifySongRoles` — offline: picks the richest pattern per channel
 *       and classifies via note-stats + instrument metadata + sample FFT.
 *       Handles the 2026-04-21 bug where libopenmpt-driven MODs left
 *       currentPatternIndex on a near-empty intro, collapsing every role
 *       to `empty`.
 *    2. `getAllRuntimeChannelRoles` — runtime: reads the live audio tap
 *       from useOscilloscopeStore (which the WASM per-channel isolation
 *       already feeds) and classifies by sustained spectral features.
 *    3. `mergeOfflineAndRuntimeRoles` — promotes offline=`empty|pad`
 *       channels to `bass|percussion|lead` when runtime strongly disagrees.
 *       Keeps strong offline roles intact so runtime doesn't override a
 *       correctly-detected bass/perc with a transient misread. */
function getCurrentPatternBundle(): {
  roles: ChannelRole[];
  pattern: Pattern | null;
  names: (string | null | undefined)[];
  currentRow: number;
} {
  const empty = { roles: [] as ChannelRole[], pattern: null, names: [], currentRow: 0 };
  try {
    const tracker = useTrackerStore.getState();
    const patterns = tracker.patterns;
    if (!Array.isArray(patterns) || patterns.length === 0) return empty;
    const transport = useTransportStore.getState();

    // Use the richest pattern (max total notes across all channels) for the
    // look-ahead. libopenmpt engines never update transport.currentPatternIndex
    // so it stays at 0 even mid-song, meaning pattern 0 (often a sparse intro)
    // would cause channelHasNoteInWindow to return false for every channel and
    // silently skip all role-targeted rules (channelMute, echoThrow, snareCrack).
    // The richest pattern is the best proxy for "does this channel play notes
    // in this song at all" — which is the only question the look-ahead answers.
    let richestPattern = patterns[0];
    let richestTotal = 0;
    for (const pat of patterns) {
      if (!pat?.channels) continue;
      let total = 0;
      for (const ch of pat.channels) {
        if (!ch?.rows) continue;
        for (const cell of ch.rows) if (cell && cell.note >= 1 && cell.note <= 96) total++;
      }
      if (total > richestTotal) { richestTotal = total; richestPattern = pat; }
    }
    const pattern = richestPattern;
    if (!pattern || !pattern.channels?.length) return empty;

    const insts = useInstrumentStore.getState().instruments;
    const lookup = new Map<number, InstrumentConfig>();
    for (const inst of insts) {
      if (inst && typeof inst.id === 'number') lookup.set(inst.id, inst);
    }

    // Trigger CED instrument classification in the background (no-op if already running).
    useInstrumentTypeStore.getState().classifyInstruments(insts);

    const offlineRoles = classifySongRoles(patterns, lookup);
    const runtimeHints = getAllRuntimeChannelRoles(offlineRoles.length);
    let mergedRoles = mergeOfflineAndRuntimeRoles(offlineRoles, runtimeHints);

    // Overlay CED timeline roles where available. CED knows the CURRENT
    // instrument at each song position, so it tracks mid-song instrument
    // switches that static classifySongRoles misses.
    const patternOrder: number[] = tracker.patternOrder ?? [];
    const positionIndex: number = tracker.currentPositionIndex ?? 0;
    const currentRow = transport.currentRow ?? 0;
    const cedTimeline = getCedTimeline(patterns, patternOrder);
    if (cedTimeline) {
      // Only override roles where CED had at least 0.3 confidence at that position.
      const cedRoles = getRolesAtPosition(cedTimeline, positionIndex, currentRow, 0.3);
      mergedRoles = mergedRoles.map((r, ch) => cedRoles[ch] ?? r);
    }

    // Overlay live channel CED results (from CedChannelAccumulator / SidVoiceClassifier).
    // These have higher priority because they reflect what's actually playing NOW,
    // not a static instrument-level snapshot. Only override when we have a result.
    const channelCedRoles = useChannelTypeStore.getState().getRolesSnapshot(mergedRoles.length);
    mergedRoles = mergedRoles.map((r, ch) => channelCedRoles[ch] ?? r);

    // Names come from the first pattern — channel names are global per the
    // tracker store's updateChannelName (same name across all patterns).
    const nameSource = patterns[0];
    return {
      roles: mergedRoles,
      pattern,
      names: nameSource.channels.map(c => c.name ?? null),
      currentRow,
    };
  } catch {
    return empty;
  }
}

function tickImpl(): void {
  const dub = useDubStore.getState();
  if (!dub.autoDubEnabled) {
    stopAutoDub();
    return;
  }

  const transport = useTransportStore.getState();
  if (!transport.isPlaying) {
    // Release all held auto-dub moves so effects don't linger after stop.
    cancelAllGestures('stopped');
    // And hand back anything still held at the mixer. A cancelled gesture
    // normally closes its own transient; this covers the case where the closer
    // was lost, which is how every channel ended up muted with the song
    // rendering silence on 2026-09-18.
    releaseAllDubTransients();
    _inRiddimSection = false;
    return;
  }

  const bpm = transport.bpm || 120;
  const { bar, barPos } = getAutoDubBarClock();

  const isNewBar = bar !== _lastBar;
  if (isNewBar) {
    // Once a bar, close any transient that has been open far too long to be
    // real. Cheap, and it only ever acts on state that is already wrong.
    reapOrphanedDubTransients();
    _lastBar = bar;
    _movesFiredThisBar = 0;
    _wetFiredThisBar = 0;
  }

  // Feed the live tap into the runtime spectral classifier BEFORE the
  // bundle is resolved — the bundle reads the classifier's current roles
  // and merges them with the offline analysis. Cheap: one FFT pass per
  // non-empty channel, capped at 4× per second by the tick cadence.
  updateRuntimeClassifierFromOscilloscope();

  // SID voice register classifier — accumulate voice state statistics and
  // classify each voice into a ChannelRole every CLASSIFY_EVERY_BARS bars.
  // Works with all SID backends (no audio capture needed).
  try {
    const sidEngine = getActiveC64SidEngine();
    if (sidEngine) sidVoiceClassifier.tick(sidEngine, bar);
  } catch { /* never throw into tick */ }

  // SID per-voice offline render — fires once when a new SID file is loaded,
  // produces CED-quality classifications that override the register heuristics.
  triggerSidVoiceClassificationIfNew();

  const persona = getPersona(dub.autoDubPersona);

  // Gate K1: the persona's behavioural profile drives the intention policy and
  // the energy budget. `intensity` used to do all of this at once — how often
  // anything fired, how many moves a bar could hold, and how bold they were —
  // so "restless but gentle" was unsayable. These are separate axes now.
  const behaviour = behaviourFor(persona.id);
  if (_appliedBehaviourFor !== persona.id) {
    _intentionPlanner.setPolicy(intentionPolicyFor(behaviour));
    _intentionPlanner.setRng(_rng);
    _appliedBehaviourFor = persona.id;
  }

  const bundle = getCurrentPatternBundle();

  // Apply user-set channel role overrides (highest priority — overrides
  // both offline analysis and runtime audio classifier).
  const mixerChannels = useMixerStore.getState().channels;
  const roles: ChannelRole[] = bundle.roles.map((r, i) => {
    const userRole = mixerChannels[i]?.dubRole;
    return (userRole as ChannelRole | null) ?? r;
  });
  _lastComputedRoles = roles;
  const channelCount = roles.length > 0 ? roles.length : getChannelCount();
  const transientChannels = detectTransientsFromOscilloscope();

  // Density window: roughly a bar of notes at standard tracker speed.
  // Matches the look-ahead window so the two signals agree on what "the
  // upcoming passage" means.
  const densityByRole = computeDensityByRole(bundle.pattern, bundle.currentRow, roles, 16);

  // Gate L2: normalized phrase position from the clock. `bar % 16` assumed a
  // 16-bar phrase in 4/4; the clock knows the song's actual phrase length and
  // metre, so a persona's arc now lines up with the music rather than with a
  // constant.
  const phrasePosition = getPhrasePosition(transport, bundle.currentRow);
  const phraseIntensityMult = getPhraseIntensityMult(phrasePosition, persona.phraseArcShape ?? 'standard');

  // Beat phase within current beat (0–1)
  const beatInBar = barPos * 4; // 4 beats per bar
  const beatPhase = beatInBar % 1;

  // Refresh EQ snapshot each tick
  const analysis = useTrackerAnalysisStore.getState().currentAnalysis;
  if (analysis) {
    let baseline = makeFlatEqBaseline();
    try {
      const dubBus = getActiveDubBus();
      if (dubBus) baseline = dubBus.getReturnEQ().getParams();
    } catch { /* ok */ }
    _eqSnapshot = {
      genre: analysis.genre.primary || 'Unknown',
      energy: analysis.genre.energy,
      danceability: analysis.genre.danceability,
      bpm: analysis.genre.bpm || bpm,
      beatPhase,
      frequencyPeaks: (analysis.frequencyPeaks ?? []) as [number, number][],
      baseline,
    };
  } else {
    _eqSnapshot = null;
  }
  // Gate AE1: the technical-assistive driver reads the same snapshot rather
  // than sampling the analysis a second time — two reads of one instant would
  // be two different answers.
  setAutoEqSnapshot(_eqSnapshot);

  // ── Gate E: decide what the performer WANTS, before choosing a move ──
  //
  // Built from the Gate D context so the decision sees the same music the
  // rules do: what is about to sound, what just sounded, what the player just
  // did by hand, and how much wet is already in the air.
  // ── One decision cycle — the same function the offline simulator runs ──
  const cycle = runPerformanceCycle(
    getPerformanceMemory(),
    _intentionPlanner,
    buildCycleInput(bundle, transport, bpm, behaviour, _performanceState),
  );
  const decision = cycle.decision;
  const performanceCtx = cycle.context;
  const step = cycle.step;
  _lastIntention = decision;
  _lastPosition = {
    bar: Math.floor(performanceCtx.position.bar),
    barInPhrase: Math.floor(performanceCtx.position.barInPhrase),
  };
  _lastPhrasePosition = performanceCtx.position.positionInPhrase;
  _performanceState = cycle.state;

  if (step.shouldRelease) {
    cancelAllGestures('cancelled');
  }

  if (!step.shouldFire) {
    // Silence with a reason. A committed REST is logged once per bar so the
    // fire log shows the decision rather than an unexplained gap; the other
    // non-firing states (ANTICIPATE, PREPARE, RIDE) are the performer waiting
    // on purpose and would only fill the log.
    if (decision.intention === 'REST' && isNewBar) {
      _recordAutoDubFire({
        kind: 'fire',
        timeMs: performance.now(),
        bar, barPos,
        moveId: 'REST',
        holdBars: decision.holdBars,
        activeHolds: gestureCount(),
        audio: null,
        bus: null,
      });
    }
    return;
  }

  // Gate G: the ledger decides what may layer, from what is actually in the
  // air. Personas scale the budget; none of them scale the hard ceiling.
  const nowSec = performance.now() / 1000;
  const budget: EnergyBudget = energyBudgetFor(behaviour);
  // Gate K2: contextual variance replaces the flat per-rule roll. Computed
  // once per tick, not once per rule — the question "may the performer depart
  // from the rules right now" is about the moment, not about which rule is
  // being considered.
  const surprise = allowSurprise(varianceInputsFrom(performanceCtx), behaviour, _rng);

  // Gate K4: is the performer building a motif or stuck in a rut? Both look
  // like "the same move again" in a log; musically they are opposites, and the
  // difference is WHERE in the phrase the repeats land.
  const repetition = classifyRepetition(performanceCtx.recentMoves, {
    rowsPerBar: performanceCtx.position.rowsPerBar,
    rowsPerPhrase: performanceCtx.position.rowsPerPhrase,
  });
  const motifRow = repetition.kind === 'motif'
    ? performanceCtx.recentMoves.filter(m => m.moveId === repetition.moveId).at(-1)?.row ?? null
    : null;
  const atMotif = motifRow !== null && atMotifPosition(
    performanceCtx.row,
    motifRow,
    performanceCtx.position.rowsPerPhrase,
    performanceCtx.position.rowsPerBar,
  );

  const choice = chooseMove({
    bar, barPos, isNewBar,
    admitsMove: (moveId: string) => _energyLedger.admits(moveId, nowSec, budget).ok,
    surpriseAllowed: surprise.allowed,
    barredForRepetition: cycle.barredFor,
    repetitionWeightFor: (moveId: string) =>
      repetitionWeight(moveId, repetition, behaviour.novelty, atMotif)
      // Gate J: what happened last time this move fired. A move that did
      // nothing measurable is pushed down hard; one that muddied the mix, less.
      * consequenceWeight(_consequences.get(moveId)),
    intention: decision.intention,
    intentionChannel: decision.target.kind === 'channel' ? decision.target.channelId : undefined,
    intensity: dub.autoDubIntensity,
    persona,
    blacklist: new Set(dub.autoDubMoveBlacklist),
    movesFiredThisBar: _movesFiredThisBar,
    wetFiredThisBar: _wetFiredThisBar,
    nextWetAllowedMs: _nextWetAllowedMs,
    moveLastFiredBar: _moveLastFiredBar,
    channelCount,
    roles,
    transientChannels,
    currentPattern: bundle.pattern,
    currentRow: bundle.currentRow,
    channelNames: bundle.names,
    densityByRole,
    phraseIntensityMult,
    lastGlobalFireBar: _lastGlobalFireBar,
    eqSnapshot: _eqSnapshot,
    inRiddimSection: _inRiddimSection,
  }, _rng);

  if (!choice) return;

  // Gate EQ-based rule moves on eqMode — 'off' suppresses all EQ moves,
  // 'improv' lets the improv loop handle EQ exclusively (avoid double-EQ).
  const eqMode = dub.autoDubEqMode ?? 'both';
  const isEqMove = choice.moveId === 'eqSweep' || choice.moveId === 'hpfRise';
  if (isEqMove && (eqMode === 'off' || eqMode === 'improv')) return;

  let adaptedParams = isEqMove
    ? adaptEQParams(choice.moveId, choice.params, _eqSnapshot, persona, bpm)
    : choice.params;
  // For riddimSection, inject holdBars from persona config
  if (choice.moveId === 'riddimSection') {
    const holdBars = persona.riddimConfig?.holdBars ?? 4;
    adaptedParams = { ...adaptedParams, holdBars };
  }
  // Gate F4: the gesture engine owns the shape — fire, hold, release — and
  // still executes through DubRouter, so nothing bypasses the single path.
  const holdMsForGesture = choice.holdBars > 0 ? (60000 / bpm) * 4 * choice.holdBars : 0;
  const chStrForLog = choice.channelId !== undefined ? ` ch${choice.channelId}` : '';
  // Moves whose parameter is worth MOVING under the hand get the gesture
  // traced across the hold instead of a single position held flat. Only where
  // the travel is the point of the move — see `moveAutomation.ts` — and only
  // when the hold has a length to travel over.
  //
  // The move's own internal ramp is harmless here: the first automated value
  // is pushed synchronously, in the same block as the fire, and cancels the
  // schedule before a frame of it is rendered.
  const automation = holdMsForGesture > 0 ? automationFor(choice.moveId) : null;
  const gestureId = beginGesture({
    moveId: choice.moveId,
    channelId: choice.channelId,
    params: adaptedParams,
    holdMs: holdMsForGesture,
    ...(automation
      ? {
          shape: automation.shape,
          automate: {
            param: automation.param,
            from: automation.from,
            to: automation.to,
            curve: automation.curve,
          },
        }
      : {}),
    bpm,
    source: 'live',
    // The performer declares itself. Without this the router labels the fire
    // as the user's, the memory believes it, and the performer answers its own
    // last move for ever.
    origin: 'ai',
    onStart: g => {
      // Gate G: what this move puts in the air starts counting when it starts,
      // and starts decaying when it is released — not when a bar turns over.
      _energyLedger.add(g.id, choice.moveId, performance.now() / 1000, holdMsForGesture > 0);

      // Gate J: measure what it actually did. The reading has to be taken
      // AFTER the move has arrived — an echo throw is not in the mix on the
      // frame it fired — so the comparison waits out the tail's onset rather
      // than being taken on the spot and reporting every move as inaudible.
      const before = readMix(channelCount);
      if (!before) return;
      setTimeout(() => {
        const after = readMix(channelCount);
        if (!after) return;
        const consequence = measureConsequence(before, after, {
          targetChannel: choice.channelId,
        });
        _consequences.set(choice.moveId, consequence);
        _lastConsequence = { moveId: choice.moveId, consequence };
      }, CONSEQUENCE_DELAY_MS);
    },
    onEnd: (g, reason) => {
      _energyLedger.release(g.id, performance.now() / 1000);
      if (choice.moveId === 'riddimSection') _inRiddimSection = false;
      if (holdMsForGesture <= 0) return;   // one-shots have nothing to report
      console.log(`[AutoDub] ◀ RELEASE ${choice.moveId}${chStrForLog} (${reason})`);
      _recordAutoDubFire({
        kind: 'release',
        timeMs: performance.now(),
        bar,
        barPos,
        moveId: choice.moveId,
        channelId: choice.channelId,
        holdBars: choice.holdBars,
        holdMs: Math.round(holdMsForGesture),
        wet: choice.wet,
        activeHolds: gestureCount(),
        audio: sampleAutoDubAudio(),
        bus: sampleDubBusDiagnostics(),
      });
    },
  });
  // Held means THIS gesture is still in flight — not that some gesture is.
  // `gestureCount() > 0` would call a one-shot a hold whenever anything else
  // happened to be running.
  const isHeld = activeGestures().some(g => g.id === gestureId);
  _movesFiredThisBar += 1;
  if (choice.wet) {
    _wetFiredThisBar += 1;
    // Block the next wet fire until this hold expires + decay time.
    // For oneshots (no holdBars), use WET_ONESHOT_BLOCK_MS.
    const holdMs = choice.holdBars > 0 ? (60000 / bpm) * 4 * choice.holdBars : 0;
    const blockMs = Math.max(WET_ONESHOT_BLOCK_MS, holdMs + WET_DECAY_EXTRA_MS);
    _nextWetAllowedMs = performance.now() + blockMs;
  }
  _moveLastFiredBar.set(choice.moveId, bar);
  _lastGlobalFireBar = bar;

  const chStr = chStrForLog;
  const holdMs = holdMsForGesture;
  _recordAutoDubFire({
    kind: 'fire',
    timeMs: performance.now(),
    bar,
    barPos,
    moveId: choice.moveId,
    channelId: choice.channelId,
    holdBars: choice.holdBars,
    holdMs: Math.round(holdMs),
    wet: choice.wet,
    activeHolds: gestureCount(),
    audio: sampleAutoDubAudio(),
    bus: sampleDubBusDiagnostics(),
  });
  if (isHeld) {
    if (choice.moveId === 'riddimSection') _inRiddimSection = true;
    console.log(`[AutoDub] ▶ HOLD ${choice.moveId}${chStr} holdBars=${choice.holdBars} (${holdMs.toFixed(0)}ms) heldTotal=${gestureCount()} id=${gestureId}`);
  } else {
    console.log(`[AutoDub] ▶ ONESHOT ${choice.moveId}${chStr}`);
  }
}

// ───────────────────────── Public API ─────────────────────────

export function startAutoDub(): void {
  if (_timer !== null) return;
  _enableTimeMs = performance.now();
  _lastBar = -1;
  _lastGlobalFireBar = -99;
  _movesFiredThisBar = 0;
  _wetFiredThisBar = 0;
  _nextWetAllowedMs = -Infinity;
  _moveLastFiredBar.clear();
  _rollingPeaks.length = 0;
  // Drop any runtime role votes from a previous session / previous song so
  // stale classifications don't bleed into a fresh bundle. The classifier
  // needs ~2 s of live audio to refill before it starts voting again.
  resetRuntimeChannelClassifier();
  resetAutoEqDriver();
  _timer = setInterval(tickImpl, TICK_MS);
  // Gate M1: the journal records every fire; this is how the AI's own get a
  // reason attached. Registered here rather than imported by the journal, so
  // the journal works when the performer is not running at all.
  getPerformanceJournalRecorder();
  setPerformanceAnnotator(() => _lastIntention === null ? null : {
    intention: _lastIntention.intention,
    target: _lastIntention.target,
    reason: _lastIntention.reason,
    state: _performanceState,
    bar: _lastPosition?.bar,
    barInPhrase: _lastPosition?.barInPhrase,
  });
  clearPerformanceJournal();
  startAutoEqDriver();
  const { bar, barPos } = getAutoDubBarClock();
  _recordAutoDubFire({
    kind: 'start',
    timeMs: performance.now(),
    bar,
    barPos,
    activeHolds: gestureCount(),
    audio: sampleAutoDubAudio(),
    bus: sampleDubBusDiagnostics(),
  });
}

/** Stop the loop AND dispose every currently-held move — the panic off. */
export function stopAutoDub(): void {
  const { bar, barPos } = getAutoDubBarClock();
  stopAutoEqDriver();
  if (_timer !== null) {
    clearInterval(_timer);
    _timer = null;
  }
  _inRiddimSection = false;
  cancelAllGestures('stopped');
  releaseAllDubTransients();
  _energyLedger.clear();
  _consequences.clear();
  _lastConsequence = null;
  // Gate D: nothing is in flight once the disposers have run, and the open
  // phrase is over. History of what was played survives — that is the part
  // the next session's decisions are allowed to learn from.
  try { getPerformanceMemory().reset(); } catch { /* memory optional */ }
  // Gate E/E3: commitments and gesture state do not survive a stop. A rest
  // committed until bar 40 means nothing once the transport has left.
  _intentionPlanner.reset();
  _appliedBehaviourFor = null;
  _performanceState = 'LISTEN';
  _lastPosition = null;
  _lastPhrasePosition = null;
  // The journal itself survives a stop — it is the record of what was just
  // played, and throwing it away on stop would delete the take.
  setPerformanceAnnotator(null);
  _recordAutoDubFire({
    kind: 'stop',
    timeMs: performance.now(),
    bar,
    barPos,
    activeHolds: 0,
    audio: sampleAutoDubAudio(),
    bus: sampleDubBusDiagnostics(),
  });
}

export function isAutoDubRunning(): boolean {
  return _timer !== null;
}

/** Last computed channel roles (merged offline + runtime + user overrides).
 *  Updated every tick while AutoDub is running. Empty array when stopped or
 *  no song is loaded. Used by the dub deck UI to show what the classifier
 *  currently thinks so the user can confirm or correct it. */
let _lastComputedRoles: ChannelRole[] = [];

interface AutoDubAudioSnapshot {
  rms: number;
  peak: number;
  sub: number;
  bass: number;
  mid: number;
  high: number;
  beat: boolean;
}

export interface AutoDubFireLogEntry {
  kind: 'start' | 'fire' | 'release' | 'stop';
  timeMs: number;
  bar: number;
  barPos: number;
  moveId?: string;
  channelId?: number;
  holdBars?: number;
  holdMs?: number;
  wet?: boolean;
  activeHolds: number;
  audio: AutoDubAudioSnapshot | null;
  bus: Record<string, number | boolean | string | null> | null;
}

function sampleAutoDubAudio(): AutoDubAudioSnapshot | null {
  try {
    const bus = AudioDataBus.getShared();
    bus.update();
    const frame = bus.getFrame();
    return {
      rms: +frame.rms.toFixed(4),
      peak: +frame.peak.toFixed(4),
      sub: +frame.subEnergy.toFixed(4),
      bass: +frame.bassEnergy.toFixed(4),
      mid: +frame.midEnergy.toFixed(4),
      high: +frame.highEnergy.toFixed(4),
      beat: !!frame.beat,
    };
  } catch {
    return null;
  }
}

/**
 * Reasons the performer would not be heard, whatever it decides.
 *
 * Deliberately separate from the musical `why`: "I am resting because the
 * phrase wants space" and "nothing I play can reach the speakers" are
 * different answers, and conflating them is how an hour goes into the wrong
 * one. Empty when the signal path is fine.
 */
function inaudibilityReasons(): string[] {
  const reasons: string[] = [];
  try {
    const bus = getActiveDubBus();
    if (!bus) {
      reasons.push('no dub bus — nothing to perform through');
      return reasons;
    }
    const diag = bus.getDiagnosticSnapshot() as Record<string, unknown> | null;
    if (!diag) return reasons;

    if (diag.enabled === false) {
      reasons.push('the dub bus is OFF — moves would be inaudible');
      return reasons;
    }
    // A registered tap is how a channel's audio reaches the bus at all. With
    // none, and no whole-mix fallback carrying anything, the return is silent
    // however good the decisions are.
    const taps = typeof diag.registeredChannelTaps === 'number' ? diag.registeredChannelTaps : 0;
    const wholeMixGain = typeof diag.wholeMixTapGainMax === 'number' ? diag.wholeMixTapGainMax : 0;
    if (taps === 0 && wholeMixGain <= 0) {
      reasons.push('no channel is sending to the dub bus — raise a channel send');
    }
  } catch { /* diagnostics must never break the snapshot */ }
  return reasons;
}

function sampleDubBusDiagnostics(): Record<string, number | boolean | string | null> | null {
  try {
    return getActiveDubBus()?.getDiagnosticSnapshot() ?? null;
  } catch {
    return null;
  }
}

/**
 * Gate E entry point: assemble the Gate D context and ask the planner what
 * the performer wants.
 *
 * Event rows are lifted to ABSOLUTE rows with the same offset the clock uses,
 * so "an onset an eighth away" is measured against the same timeline the bar
 * position came from. Getting that wrong would put the look-ahead in a
 * different song than the decision.
 */

/**
 * Assemble the cycle input from the live stores.
 *
 * Everything past this point — intention, targeting, state machine, variance,
 * repetition — happens in `runPerformanceCycle`, which the offline simulator
 * (Gate N1) also calls. A tick that decided things its own way would be a
 * second performer that merely resembles this one, and the simulator's results
 * would describe that second performer rather than this one.
 *
 * Event rows are lifted to ABSOLUTE rows with the same offset the clock uses,
 * so "an onset an eighth away" is measured against the timeline the bar
 * position came from.
 */
function buildCycleInput(
  bundle: { pattern: Pattern | null; currentRow: number; names: readonly (string | null | undefined)[] },
  transport: { currentGlobalRow?: number; speed?: number },
  bpm: number,
  behaviour: PersonaBehaviour,
  state: PerformanceState,
): PerformanceCycleInput {
  const globalRow = Number.isFinite(transport.currentGlobalRow) && (transport.currentGlobalRow ?? 0) > 0
    ? (transport.currentGlobalRow as number)
    : bundle.currentRow;
  const ticksPerRow = transport.speed || 6;

  const sources = bundle.pattern
    ? trackerEventSources(bundle.pattern.channels, {
        rowOffset: globalRow - bundle.currentRow,
      })
    : [];

  // Wet energy from the settings that actually produce it. No bus (tracker
  // view not mounted) means nothing is wet, which is true.
  let energyInputs = {
    returnGain: 0, echoWet: 0, springWet: 0, echoIntensity: 0, extFeedbackGain: 0,
  };
  try {
    const bus = getActiveDubBus();
    if (bus) {
      const st = bus.getSettings();
      energyInputs = {
        returnGain: st.returnGain,
        echoWet: st.echoWet,
        springWet: st.springWet,
        echoIntensity: st.echoIntensity,
        extFeedbackGain: st.extFeedbackGain ?? 0,
      };
    }
  } catch { /* no bus */ }

  const gridPos = computeMusicalPosition(globalRow, ticksPerRow, getMusicalClockSettings());
  const profiles = getChannelProfiles(
    bundle.pattern,
    bundle.names,
    gridPos.rowsPerBeat,
    gridPos.rowsPerBar,
  );

  return {
    row: globalRow,
    ticksPerRow,
    bpm,
    clockSettings: getMusicalClockSettings(),
    sources,
    channelProfiles: profiles,
    arrangement: readArrangementSnapshot(),
    energy: readWetEnergy(energyInputs, gestureCount()),
    state,
    gesturesInFlight: gestureCount(),
    canFire: true,
    // How far the transport moves between ticks. The commit window must be at
    // least this wide or a target lands between two ticks and is never acted
    // on — which is what the simulator caught.
    rowsPerCycle: (TICK_MS / 1000) / ((60 / Math.max(30, bpm)) * (ticksPerRow / 24)),
    behaviour,
    rng: _rng,
  };
}

/** Where the song is in its own order. Null when no song is loaded. */
function readArrangementSnapshot(): ArrangementSnapshot | null {
  try {
    const tracker = useTrackerStore.getState();
    const order: number[] = tracker.patternOrder ?? [];
    if (order.length === 0) return null;
    // Playback writes the tracker store's index, not the transport's — the
    // transport copy is known to stay at 0 on engine-driven formats. The
    // order index is the FIRST occurrence of that pattern: a pattern used
    // twice in the order is ambiguous from the index alone, and the only
    // consequence here is which of the two seams "isLastInOrder" reports.
    const patternIndex = tracker.currentPatternIndex ?? 0;
    const found = order.indexOf(patternIndex);
    const orderIndex = found >= 0 ? found : 0;
    const pattern = tracker.patterns?.[patternIndex] ?? null;
    const nextPattern = orderIndex + 1 < order.length ? order[orderIndex + 1] : null;
    return {
      orderIndex,
      orderLength: order.length,
      patternIndex,
      patternRows: pattern?.channels?.[0]?.rows?.length ?? 64,
      isLastInOrder: orderIndex === order.length - 1,
      patternChangesNext: nextPattern !== null && nextPattern !== patternIndex,
    };
  } catch {
    return null;
  }
}

/**
 * Where we are through the current phrase, 0..1, from the musical clock.
 *
 * Falls back to 0 when there is no row information yet (AutoDub enabled before
 * playback): the arc then starts at the beginning of a phrase, which is the
 * honest reading of "we have not started".
 */
function getPhrasePosition(
  transport: { currentGlobalRow?: number; speed?: number },
  currentRow: number,
): number {
  const globalRow = Number.isFinite(transport.currentGlobalRow) && (transport.currentGlobalRow ?? 0) > 0
    ? (transport.currentGlobalRow as number)
    : currentRow;
  if (!Number.isFinite(globalRow) || globalRow < 0) return 0;
  const pos = computeMusicalPosition(globalRow, transport.speed || 6, getMusicalClockSettings());
  return pos.positionInPhrase;
}

function getAutoDubBarClock(): { bar: number; barPos: number; isRowAligned: boolean } {
  // Gate D: the performer's memory follows the same clock the rules do, so
  // phrase history closes on real phrase turns rather than on tick count.
  // Fires and releases reach it from the DubRouter subscription — including
  // the user's own, which is the point of listening to the router.
  const notePosition = (pos: MusicalPosition) => {
    try { getPerformanceMemory().observePosition(pos); } catch { /* memory optional */ }
  };
  const transport = useTransportStore.getState();
  const globalRow = transport.currentGlobalRow;
  const row = transport.currentRow;

  // Coarse position from `currentGlobalRow`, fine position from `currentRow`.
  // See `transportRow.ts` for why neither is sufficient alone, and for the
  // one-decision-per-pattern bug that reading the global row alone caused.
  const rowLike = resolveTransportRow(globalRow, row);

  if (rowLike !== null) {
    // Plan B1: was `floor(row / 16)`, true only for 4/4 at speed 6. At speed 3
    // a bar is 32 rows, so every `bar % N` phrase rule below drifted against
    // the music. MusicalClock derives the grid from the real transport speed.
    const pos = computeMusicalPosition(rowLike, transport.speed, getMusicalClockSettings());
    notePosition(pos);
    return { bar: pos.bar, barPos: pos.positionInBar, isRowAligned: true };
  }
  // No row information yet (enabled before playback started) — count beats off
  // the wall clock. Same metre, so a bar means the same thing on both paths.
  const bpm = transport.bpm || 120;
  const beats = ((performance.now() - _enableTimeMs) / 1000) * (bpm / 60);
  const pos = computeMusicalPositionFromBeats(beats, getMusicalClockSettings());
  // Deliberately NOT fed to the performance memory: this path counts bars off
  // the wall clock and carries no phrase index, so it cannot say when a phrase
  // turned. Phrase history accumulates only while the transport is running,
  // which is the only time it means anything.
  return { bar: pos.bar, barPos: pos.positionInBar, isRowAligned: false };
}

/**
 * Clock settings in force. Metre and phrase length are user/song-level
 * metadata the reviewer ruled must never be inferred from pattern length or
 * note onsets, so this returns the documented defaults (4/4, 16-bar phrase)
 * until a settings surface exists. Centralised here so both clock paths and
 * the future settings UI read one source.
 */
function getMusicalClockSettings(): MusicalClockSettings {
  return DEFAULT_MUSICAL_CLOCK_SETTINGS;
}

export function getAutoDubCurrentRoles(): readonly ChannelRole[] {
  return _lastComputedRoles;
}

// ───────────────────────── Pre-play audio scrub ───────────────────────────────

let _scrubActive = false;

/**
 * Silently play the song's richest pattern for ~5 seconds before AutoDub
 * starts, so the ChannelAudioClassifier gets actual audio content to work
 * with instead of relying solely on the offline note-data heuristics.
 *
 * Flow:
 *  1. Find richest pattern (most total notes) — avoids sparse intros
 *  2. Seek transport to that pattern with correct tempo context
 *  3. Mute master output (inaudible to the user)
 *  4. Start playback and poll oscilloscope every 250 ms for 5 s
 *  5. Stop, seek back to 0, restore master volume
 *
 * Resolves immediately if the song is already playing or if no patterns
 * are loaded. Cancelled cleanly if the user starts playback themselves.
 */
export async function runChannelAudioScrub(
  onProgress?: (done: boolean) => void,
): Promise<void> {
  const transport = useTransportStore.getState();
  if (transport.isPlaying) return; // Classifier is already running via playback

  const tracker = useTrackerStore.getState();
  const patterns = tracker.patterns;
  if (!Array.isArray(patterns) || patterns.length === 0) return;

  // Find richest pattern (most note activity — typically the chorus/main drop)
  let richestIdx = 0;
  let richestTotal = 0;
  for (let i = 0; i < patterns.length; i++) {
    const pat = patterns[i];
    if (!pat?.channels) continue;
    let total = 0;
    for (const ch of pat.channels) {
      if (!ch?.rows) continue;
      for (const cell of ch.rows) if (cell && cell.note >= 1 && cell.note <= 96) total++;
    }
    if (total > richestTotal) { richestTotal = total; richestIdx = i; }
  }

  // Mute master output — user won't hear the scrub
  const mixer = useMixerStore.getState();
  // Read from the actual nested field. The previous cast looked for
  // `masterVolume` (doesn't exist) which always defaulted to 1, so the
  // restore at the end of scrub silently snapped the user's master volume
  // to 1.0 even if they had it lower.
  const priorVol = mixer.master?.volume ?? 1;
  try { mixer.setMasterVolume(0); } catch { /* ok */ }

  // Seek to richest pattern (tempo-aware — engine processes Fxx up to this point)
  try { useTransportStore.getState().setCurrentPattern(richestIdx); } catch { /* ok */ }

  // Start silent playback
  try { await useTransportStore.getState().play(); } catch {
    try { mixer.setMasterVolume(priorVol); } catch { /* ok */ }
    return;
  }

  _scrubActive = true;
  onProgress?.(false);

  const SCRUB_MS = 5000;
  const POLL_MS = 250;
  const deadline = performance.now() + SCRUB_MS;

  await new Promise<void>(resolve => {
    const poll = setInterval(() => {
      // Feed oscilloscope data into the classifier each tick
      updateRuntimeClassifierFromOscilloscope();

      const stopped = !useTransportStore.getState().isPlaying;
      const done = performance.now() >= deadline;

      if (!_scrubActive || stopped || done) {
        clearInterval(poll);
        _scrubActive = false;
        resolve();
      }
    }, POLL_MS);
  });

  // Stop, restore, return to start
  try { useTransportStore.getState().stop(); } catch { /* ok */ }
  try { useTransportStore.getState().setCurrentPattern(0); } catch { /* ok */ }
  try { mixer.setMasterVolume(priorVol); } catch { /* ok */ }

  onProgress?.(true);
}

/** Cancel an in-progress scrub (e.g. user pressed play during the scrub window). */
export function cancelChannelScrub(): void {
  _scrubActive = false;
}

// ───────────────────────── Fire log (bridge + CI assertions) ─────────────────
// Ring buffer of the last FIRE_LOG_CAP moves chosen by the tick loop.
// Exposed via getAutoDubFireLog / clearAutoDubFireLog MCP tools so
// ui-smoke tests can assert that role-targeted moves actually fired.

const FIRE_LOG_CAP = 200;
const _fireLog: string[] = [];
const _fireEntries: AutoDubFireLogEntry[] = [];

export function _recordAutoDubFire(entry: string | AutoDubFireLogEntry): void {
  if (typeof entry === 'string') {
    _fireLog.push(entry);
  } else {
    if (entry.moveId) _fireLog.push(entry.moveId);
    _fireEntries.push(entry);
    if (_fireEntries.length > FIRE_LOG_CAP) _fireEntries.shift();
  }
  if (_fireLog.length > FIRE_LOG_CAP) _fireLog.shift();
}

export function getAutoDubFireLog(): readonly string[] {
  return _fireLog;
}

export function getAutoDubFireLogEntries(): readonly AutoDubFireLogEntry[] {
  return _fireEntries;
}

export function clearAutoDubFireLog(): void {
  _fireLog.length = 0;
  _fireEntries.length = 0;
}

// ───────────────────────── Test-only hooks ─────────────────────────

export function _setAutoDubRngForTest(rng: () => number): void {
  _rng = rng;
}

export function _resetAutoDubStateForTest(): void {
  stopAutoDub();
  _moveLastFiredBar.clear();
  _movesFiredThisBar = 0;
  _wetFiredThisBar = 0;
  _nextWetAllowedMs = -Infinity;
  _lastBar = -1;
  _lastGlobalFireBar = -99;
  _rollingPeaks.length = 0;
  _rng = Math.random;
  clearAutoDubFireLog();
}
