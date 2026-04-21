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
import { useOscilloscopeStore } from '@/stores/useOscilloscopeStore';
import { classifyPattern, type ChannelRole } from '@/bridge/analysis/MusicAnalysis';

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
  // High-intensity siren on bar 1 of 4.
  { moveId: 'dubSiren',
    condition: (c) => c.intensity > 0.6 && c.isNewBar && c.bar % 4 === 1,
    baseWeight: 0.10, holdBars: 1 },
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
];

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

  const rollProb = ctx.intensity * 0.3;
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
        for (let i = 0; i < ctx.roles.length; i++) {
          const r = ctx.roles[i];
          if (r === 'empty') continue;
          if (want === 'any' || r === want) matches.push(i);
        }
        if (matches.length === 0) continue;
        matchingChannels = matches;
      } else if (ctx.channelCount > 0) {
        // No classification — any channel is fair game
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

    const weight = rule.baseWeight * ctx.intensity * persWeight * cooldownDecay;
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
      channelId = picked.matchingChannels[Math.floor(rng() * picked.matchingChannels.length)];
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

/** Resolve the currently-playing pattern's channel roles. Returns an empty
 *  array if no song is loaded, the pattern is out of range, or the store
 *  isn't ready — callers fall through to the Phase-1 random-channel path. */
function getCurrentPatternRoles(): ChannelRole[] {
  try {
    const tracker = useTrackerStore.getState();
    const patterns = tracker.patterns;
    if (!Array.isArray(patterns) || patterns.length === 0) return [];
    const idx = useTransportStore.getState().currentPatternIndex ?? 0;
    const pattern = patterns[Math.max(0, Math.min(idx, patterns.length - 1))];
    if (!pattern || !pattern.channels?.length) return [];
    return classifyPattern(pattern).map(a => a.role);
  } catch {
    return [];
  }
}

function tickImpl(): void {
  const dub = useDubStore.getState();
  if (!dub.autoDubEnabled) {
    stopAutoDub();
    return;
  }

  const transport = useTransportStore.getState();
  if (!transport.isPlaying) return;

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

  const persona = getPersona(dub.autoDubPersona);
  const roles = getCurrentPatternRoles();
  const channelCount = roles.length > 0 ? roles.length : getChannelCount();
  const transientChannels = detectTransientsFromOscilloscope();

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
  }, _rng);

  if (!choice) return;

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
