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

import { fire } from './DubRouter';
import { getPersona, type AutoDubPersona } from './AutoDubPersonas';
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
import type { Pattern } from '@/types/tracker';
import type { InstrumentConfig } from '@/types/instrument/defaults';

const TICK_MS = 250;
const HARD_FIRES_PER_BAR_CAP = 3;
const COOLDOWN_BARS = 6;
/** Cap on wet moves (echo/reverb-contributing) per bar, regardless of total
 *  budget. Without this cap, bar-phase echoThrow + transient-echoThrow +
 *  springSlam + echoBuildUp + reverseEcho all stack into a reverb mush
 *  (2026-04-21 feedback). Dry moves (tapeStop, filterDrop, channelMute,
 *  etc.) are unaffected. */
const WET_FIRES_PER_BAR_CAP = 1;
/** Rolling peak window for transient detection — last N ticks (~N * 250ms). */
const TRANSIENT_WINDOW = 8;
/** A channel's peak must exceed `RATIO * rollingAvg` to count as a transient. */
const TRANSIENT_RATIO = 1.6;
/** Minimum absolute peak for a transient to register — avoids noise floor spikes. */
const TRANSIENT_MIN_PEAK = 800;

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

/** Rule = "when this condition holds, consider firing `moveId` with weight
 *  `baseWeight`." channelRole narrows channel selection to channels matching
 *  that role (when roles are available — Phase 2). 'any' accepts any
 *  non-empty channel. Falls back to random channel pick if no role data. */
interface Rule {
  moveId: string;
  channelRole?: 'any' | 'percussion' | 'bass' | 'chord' | 'pad' | 'lead' | 'arpeggio';
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
  { moveId: 'dubSiren',
    condition: (c) => c.isNewBar && (c.bar % 4 === 1 || c.intensity > 0.7),
    baseWeight: 0.22, holdBars: 1 },
  // Reverse echo — Perry territory.
  { moveId: 'reverseEcho',
    condition: (c) => c.barPos > 0.75 && c.bar % 4 === 3,
    baseWeight: 0.10, wet: true },
  // Backward reverb — every 8 bars late.
  { moveId: 'backwardReverb',
    condition: (c) => c.barPos > 0.8 && c.bar % 8 === 6,
    baseWeight: 0.10, wet: true },
  // Tubby scream — rising through bar 2 of 4.
  { moveId: 'tubbyScream',
    condition: (c) => c.barPos > 0.7 && c.bar % 4 === 2,
    baseWeight: 0.10, wet: true },
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
  // oscBass and crushBass are intentionally excluded from AutoDub:
  // both are self-oscillating generators that stomp on the mix when
  // auto-fired. They are manual-only performance pads.
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
  const rollProb = ctx.intensity * 0.3 * rollDensityMult;
  if (rng() > rollProb) return null;

  const variance = ctx.persona.variance ?? 0;
  const hasRoles = ctx.roles.length > 0;
  const wetBudgetExhausted = ctx.wetFiredThisBar >= WET_FIRES_PER_BAR_CAP;
  const eligible: Array<{ rule: Rule; weight: number; matchingChannels: readonly number[] }> = [];

  for (const rule of RULES) {
    if (ctx.blacklist.has(rule.moveId)) continue;
    // Per-bar wet cap: once a wet move has fired this bar, skip every
    // other wet rule until the next bar. Dry moves (tapeStop, filterDrop,
    // channelMute, subSwell, etc.) stay eligible.
    if (rule.wet && wetBudgetExhausted) continue;

    const condOk = rule.condition(ctx) || (variance > 0 && rng() < variance * 0.1);
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
    const cooldownDecay = lastBar !== undefined
      ? Math.min(1, (ctx.bar - lastBar) / COOLDOWN_BARS)
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

    const weight = rule.baseWeight * ctx.intensity * persWeight * cooldownDecay * densityMult;
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
    if (picked.matchingChannels.length > 0) {
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
      channelId = picked.matchingChannels[picked.matchingChannels.length - 1];
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

let _timer: ReturnType<typeof setInterval> | null = null;
let _enableTimeMs = 0;
let _lastBar = -1;
let _movesFiredThisBar = 0;
let _wetFiredThisBar = 0;
const _heldDisposers = new Set<{ dispose(): void }>();
const _moveLastFiredBar = new Map<string, number>();
let _rng: () => number = Math.random;
/** Per-channel rolling peak history for transient detection. Grown lazily. */
const _rollingPeaks: number[][] = [];

function getChannelCount(): number {
  try {
    const mixer = useMixerStore.getState();
    const chans = (mixer as unknown as { channels?: unknown[] }).channels;
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

/** Feed the live tap into the runtime channel classifier (ChannelAudio-
 *  Classifier). Same data source as `detectTransientsFromOscilloscope` but
 *  accumulates samples into a ring buffer for spectral classification. */
function updateRuntimeClassifierFromOscilloscope(): void {
  try {
    const osc = useOscilloscopeStore.getState();
    const data = osc.channelData;
    if (!Array.isArray(data) || data.length === 0) return;
    updateChannelClassifierFromTap(data);
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

    const offlineRoles = classifySongRoles(patterns, lookup);
    const runtimeHints = getAllRuntimeChannelRoles(offlineRoles.length);
    const mergedRoles = mergeOfflineAndRuntimeRoles(offlineRoles, runtimeHints);

    // Names come from the first pattern — channel names are global per the
    // tracker store's updateChannelName (same name across all patterns).
    const nameSource = patterns[0];
    return {
      roles: mergedRoles,
      pattern,
      names: nameSource.channels.map(c => c.name ?? null),
      currentRow: transport.currentRow ?? 0,
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
    if (_heldDisposers.size > 0) {
      for (const d of _heldDisposers) {
        try { d.dispose(); } catch { /* ok */ }
      }
      _heldDisposers.clear();
    }
    return;
  }

  const bpm = transport.bpm || 120;
  const beats = ((performance.now() - _enableTimeMs) / 1000) * (bpm / 60);
  const bar = Math.floor(beats / 4);
  const barPos = (beats % 4) / 4;

  const isNewBar = bar !== _lastBar;
  if (isNewBar) {
    _lastBar = bar;
    _movesFiredThisBar = 0;
    _wetFiredThisBar = 0;
  }

  // Feed the live tap into the runtime spectral classifier BEFORE the
  // bundle is resolved — the bundle reads the classifier's current roles
  // and merges them with the offline analysis. Cheap: one FFT pass per
  // non-empty channel, capped at 4× per second by the tick cadence.
  updateRuntimeClassifierFromOscilloscope();

  const persona = getPersona(dub.autoDubPersona);
  const bundle = getCurrentPatternBundle();
  const roles = bundle.roles;
  const channelCount = roles.length > 0 ? roles.length : getChannelCount();
  const transientChannels = detectTransientsFromOscilloscope();

  // Density window: roughly a bar of notes at standard tracker speed.
  // Matches the look-ahead window so the two signals agree on what "the
  // upcoming passage" means.
  const densityByRole = computeDensityByRole(bundle.pattern, bundle.currentRow, roles, 16);

  const choice = chooseMove({
    bar, barPos, isNewBar,
    intensity: dub.autoDubIntensity,
    persona,
    blacklist: new Set(dub.autoDubMoveBlacklist),
    movesFiredThisBar: _movesFiredThisBar,
    wetFiredThisBar: _wetFiredThisBar,
    moveLastFiredBar: _moveLastFiredBar,
    channelCount,
    roles,
    transientChannels,
    currentPattern: bundle.pattern,
    currentRow: bundle.currentRow,
    channelNames: bundle.names,
    densityByRole,
  }, _rng);

  if (!choice) return;

  _recordAutoDubFire(choice.moveId);
  const disposer = fire(choice.moveId, choice.channelId, choice.params, 'live');
  _movesFiredThisBar += 1;
  if (choice.wet) _wetFiredThisBar += 1;
  _moveLastFiredBar.set(choice.moveId, bar);

  if (disposer) {
    _heldDisposers.add(disposer);
    const holdMs = (60000 / bpm) * 4 * choice.holdBars;
    setTimeout(() => {
      try { disposer.dispose(); } catch { /* ok */ }
      _heldDisposers.delete(disposer);
    }, holdMs);
  }
}

// ───────────────────────── Public API ─────────────────────────

export function startAutoDub(): void {
  if (_timer !== null) return;
  _enableTimeMs = performance.now();
  _lastBar = -1;
  _movesFiredThisBar = 0;
  _wetFiredThisBar = 0;
  _moveLastFiredBar.clear();
  _rollingPeaks.length = 0;
  // Drop any runtime role votes from a previous session / previous song so
  // stale classifications don't bleed into a fresh bundle. The classifier
  // needs ~2 s of live audio to refill before it starts voting again.
  resetRuntimeChannelClassifier();
  _timer = setInterval(tickImpl, TICK_MS);
}

/** Stop the loop AND dispose every currently-held move — the panic off. */
export function stopAutoDub(): void {
  if (_timer !== null) {
    clearInterval(_timer);
    _timer = null;
  }
  for (const d of _heldDisposers) {
    try { d.dispose(); } catch { /* ok */ }
  }
  _heldDisposers.clear();
}

export function isAutoDubRunning(): boolean {
  return _timer !== null;
}

// ───────────────────────── Fire log (bridge + CI assertions) ─────────────────
// Ring buffer of the last FIRE_LOG_CAP moves chosen by the tick loop.
// Exposed via getAutoDubFireLog / clearAutoDubFireLog MCP tools so
// ui-smoke tests can assert that role-targeted moves actually fired.

const FIRE_LOG_CAP = 200;
const _fireLog: string[] = [];

export function _recordAutoDubFire(moveId: string): void {
  _fireLog.push(moveId);
  if (_fireLog.length > FIRE_LOG_CAP) _fireLog.shift();
}

export function getAutoDubFireLog(): readonly string[] {
  return _fireLog;
}

export function clearAutoDubFireLog(): void {
  _fireLog.length = 0;
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
  _lastBar = -1;
  _rollingPeaks.length = 0;
  _rng = Math.random;
}
