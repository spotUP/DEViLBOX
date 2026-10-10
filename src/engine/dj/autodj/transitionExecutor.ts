/**
 * DJTransitionExecutor (plan sections 15, 18, 19, 21, 37, 60): executes a
 * DJTransitionPlan through the existing deck and mixer primitives (the one
 * pitch path, the deck EQ/filter/volume/sends, the crossfader). One
 * automation clock samples the plan's keyframe curves; the executor never
 * invents a plan. On failure it degrades to the plan's emergency crossfade so
 * playback continues.
 */
import { getDJEngine } from '../DJEngine';
import {
  seekDeckAudio, setCrossfader, setDeckEQ, setDeckEchoSend, setDeckFilter, setDeckFilterResonance,
  setDeckKeyLock, setDeckPitch, setDeckReverbSend, setDeckVolume,
} from '../DJActions';
import { useDJStore } from '@/stores/useDJStore';
import { fireDjFx, releaseDjFx, type DjFxActionId } from '@/engine/drumpad/DjFxActions';
import { sampleCurve, type ExecutionTrace } from './transitionQuality';
import type { AutomationCurve, AutomationTarget, DJEffectEvent, DJTransitionPlan, FilterPlanKind } from './types';

export interface ExecutorTimers {
  now(): number;
  setInterval(fn: () => void, ms: number): unknown;
  clearInterval(id: unknown): void;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(id: unknown): void;
}

export const realTimers: ExecutorTimers = {
  now: () => (typeof performance !== 'undefined' ? performance.now() : Date.now()),
  setInterval: (fn, ms) => setInterval(fn, ms),
  clearInterval: (id) => clearInterval(id as ReturnType<typeof setInterval>),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
};

export interface ExecutionResult {
  completed: boolean;
  fellBack: 'none' | 'fallback' | 'emergency';
  error?: string;
  trace: ExecutionTrace;
  /** False when the incoming deck could not be started: the outgoing was kept playing (no-silence rule). */
  incomingPlaying: boolean;
}

export interface ExecuteOptions {
  /** Resolves when the quantised start moment arrives (the controller waits for the grid). */
  waitForStart?: () => Promise<void>;
  /** Called once the automation clock runs: the poll loop may now judge completion. */
  onSweepStarted?: () => void;
  onComplete?: (result: ExecutionResult) => void;
  timers?: ExecutorTimers;
  tickMs?: number;
  /** Seconds per beat of the outgoing deck at execution time (defaults from the plan's tempo). */
  beatSec?: number;
  /** Milliseconds the start actually landed after the planned moment (for the trace). */
  startOffsetMs?: number;
}

export interface ExecutionHandle {
  cancel(): void;
  readonly promise: Promise<ExecutionResult>;
  readonly plan: DJTransitionPlan;
}

type DeckRole = 'outgoing' | 'incoming';

function deckOf(plan: DJTransitionPlan, role: DeckRole): 'A' | 'B' {
  return role === 'outgoing' ? plan.outgoingDeck : plan.incomingDeck;
}

/** Apply one automation target value through the product's own actions. */
export function applyTarget(plan: DJTransitionPlan, target: AutomationTarget, value: number): void {
  if (target === 'crossfader') { setCrossfader(value); return; }
  const [role, what] = target.split('.') as [DeckRole, string];
  const deck = deckOf(plan, role);
  switch (what) {
    case 'eqLow': setDeckEQ(deck, 'low', value); break;
    case 'eqMid': setDeckEQ(deck, 'mid', value); break;
    case 'eqHigh': setDeckEQ(deck, 'high', value); break;
    case 'filter': setDeckFilter(deck, value); break;
    case 'volume': setDeckVolume(deck, value); break;
    case 'echoSend': setDeckEchoSend(deck, value); break;
    case 'reverbSend': setDeckReverbSend(deck, value); break;
  }
}

/** Effect events perform through the DJ FX registry, the same actions the pads fire (plan sections 17-19, 53). */
export const EFFECT_ACTIONS: Partial<Record<DJEffectEvent['kind'], DjFxActionId>> = {
  'echo-out': 'fx_deck_echo_out',
  'reverb-out': 'fx_deck_reverb_out',
  'reverb-expansion': 'fx_deck_reverb_out',
  'delay-throw': 'fx_deck_echo_throw',
  'filter-rise': 'fx_deck_filter_rise',
  brake: 'fx_deck_brake',
};

/** Filter plan kinds the registry performs; their plan curves are then descriptive, not driven. */
export function filterActionsFor(kind: FilterPlanKind, beats: number): Array<{ action: DjFxActionId; deck: 'outgoing' | 'incoming'; beats: number }> {
  switch (kind) {
    case 'resonant-build': return [{ action: 'fx_deck_filter_rise', deck: 'incoming', beats }, { action: 'fx_deck_filter_release', deck: 'outgoing', beats }];
    case 'release': case 'high-pass-sweep': return [{ action: 'fx_deck_filter_release', deck: 'outgoing', beats }];
    default: return [];
  }
}

/** All curves of a plan, by target (the last curve for a target wins). */
export function planCurves(plan: DJTransitionPlan): AutomationCurve[] {
  const map = new Map<AutomationTarget, AutomationCurve>();
  const all = [plan.crossfadePlan.curve, ...plan.bassPlan.curves, ...plan.eqPlan.curves, ...plan.filterPlan.curves];
  for (const c of all) map.set(c.target, c);
  return [...map.values()];
}

/** Reset a deck's transition state so the next use starts clean. */
export function resetDeckAfterTransition(deck: 'A' | 'B'): void {
  setDeckEQ(deck, 'low', 0); setDeckEQ(deck, 'mid', 0); setDeckEQ(deck, 'high', 0);
  setDeckFilter(deck, 0);
  setDeckVolume(deck, 1);
  setDeckEchoSend(deck, 0);
  setDeckReverbSend(deck, 0);
  try { getDJEngine().getDeck(deck).clearAudioLoop(); } catch { /* engine not ready */ }
}

/**
 * Execute a plan. Prepares the incoming deck (position, tempo, key lock,
 * first keyframes), waits for the quantised start, starts the incoming deck,
 * runs the automation clock, fires the effect events, stops the outgoing
 * deck and resets it. Any failure degrades to the emergency crossfade.
 */
export function executeTransition(plan: DJTransitionPlan, opts: ExecuteOptions = {}): ExecutionHandle {
  const timers = opts.timers ?? realTimers;
  const tickMs = opts.tickMs ?? 16;
  const beatSec = opts.beatSec ?? (60 / Math.max(60, plan.tempoPlan.outgoingBpm || 125));
  const trace: ExecutionTrace = { samples: [], events: [], startOffsetMs: opts.startOffsetMs ?? 0, completed: false, fellBack: 'none' };
  let cancelled = false;
  let intervalId: unknown = null;
  let resolveDone: (r: ExecutionResult) => void = () => {};
  const promise = new Promise<ExecutionResult>((resolve) => { resolveDone = resolve; });
  const curves = planCurves(plan);
  const out = plan.outgoingDeck;
  const inc = plan.incomingDeck;
  const target = inc === 'A' ? 0 : 1;
  const lastValues = new Map<AutomationTarget, number>();

  const apply = (t: AutomationTarget, v: number) => {
    const prev = lastValues.get(t);
    if (prev !== undefined && Math.abs(prev - v) < 0.002) return;
    lastValues.set(t, v);
    applyTarget(plan, t, v);
  };

  let finished = false;
  const finish = (result: ExecutionResult) => {
    if (intervalId !== null) { timers.clearInterval(intervalId); intervalId = null; }
    if (finished) return;
    finished = true;
    opts.onComplete?.(result);
    resolveDone(result);
  };

  const emergency = (error: string) => {
    // Plain crossfade to the incoming over four beats, then stop the outgoing. Never a hard cut from a software failure,
    // and never both decks silent: if the incoming cannot start, the outgoing keeps playing on its own side.
    trace.events.push(`emergency: ${error}`);
    trace.fellBack = 'emergency';
    const incomingDeck = (() => { try { return getDJEngine().getDeck(inc); } catch { return null; } })();
    const keepOutgoing = () => {
      trace.events.push('incoming deck silent: outgoing kept playing');
      try { setCrossfader(out === 'A' ? 0 : 1); } catch { /* */ }
      try { resetDeckAfterTransition(out); } catch { /* */ }
      try { getDJEngine().getDeck(out).play().catch(() => {}); } catch { /* */ }
      useDJStore.getState().setDeckPlaying(out, true);
      finish({ completed: false, fellBack: 'emergency', error: `${error}; incoming deck silent`, trace, incomingPlaying: false });
    };
    let playFailed = false;
    try { incomingDeck?.play().catch(() => { playFailed = true; }); } catch { playFailed = true; }
    const start = timers.now();
    const from = useDJStore.getState().crossfaderPosition;
    const durationMs = 4 * beatSec * 1000;
    if (intervalId !== null) timers.clearInterval(intervalId);
    intervalId = timers.setInterval(() => {
      let incomingAlive = true;
      try { incomingAlive = !playFailed && (incomingDeck ? incomingDeck.isPlaying() : true); } catch { incomingAlive = !playFailed; }
      if (!incomingAlive) {
        if (intervalId !== null) { timers.clearInterval(intervalId); intervalId = null; }
        keepOutgoing();
        return;
      }
      const p = Math.min(1, (timers.now() - start) / durationMs);
      try { setCrossfader(from + (target - from) * p); } catch { /* */ }
      if (p >= 1) {
        try { getDJEngine().getDeck(out).stop(); } catch { /* */ }
        useDJStore.getState().setDeckPlaying(out, false);
        try { resetDeckAfterTransition(out); } catch { /* */ }
        trace.completed = true;
        finish({ completed: true, fellBack: 'emergency', error, trace, incomingPlaying: true });
      }
    }, tickMs);
  };

  const run = async () => {
    try {
      // ── Prepare the incoming deck (plan sections 7, 12, 13) ─────────────
      seekDeckAudio(inc, Math.max(0, plan.incomingPosition));
      setDeckPitch(inc, plan.tempoPlan.incomingSemitones);
      setDeckKeyLock(inc, plan.keyPlan.keyLock);
      setDeckFilterResonance(inc, plan.filterPlan.resonance);
      setDeckFilterResonance(out, plan.filterPlan.resonance);
      // Filter kinds the registry performs own their targets; the plan's filter curves stay descriptive.
      const filterActions = filterActionsFor(plan.filterPlan.kind, plan.durationBeats);
      const registryOwned = new Set<AutomationTarget>(filterActions.map((f) => `${f.deck}.filter` as AutomationTarget));
      for (const c of curves) if (!registryOwned.has(c.target)) apply(c.target, sampleCurve(c.keyframes, 0));
      // Loops that must be in place before the start (plan section 51).
      if (plan.loop && plan.loop.deck === 'outgoing') {
        const len = Math.min(plan.loop.lengthBeats, 16) * beatSec;
        try { getDJEngine().getDeck(out).setAudioLoop(plan.loop.startSec, plan.loop.startSec + len); trace.events.push(`loop outgoing ${plan.loop.purpose}`); } catch { /* */ }
      }
      if (cancelled) return;

      // ── Wait for the grid ───────────────────────────────────────────────
      if (opts.waitForStart) await opts.waitForStart();
      if (cancelled) return;
      if (plan.humanize.startOffsetMs > 2) await new Promise<void>((r) => { timers.setTimeout(r, plan.humanize.startOffsetMs); });
      if (cancelled) return;

      // ── Start ───────────────────────────────────────────────────────────
      const incomingDeck = getDJEngine().getDeck(inc);
      await incomingDeck.play();
      useDJStore.getState().setDeckPlaying(inc, true);
      if (plan.loop && plan.loop.deck === 'incoming') {
        const len = Math.min(plan.loop.lengthBeats, 16) * beatSec;
        try { incomingDeck.setAudioLoop(plan.loop.startSec, plan.loop.startSec + len); trace.events.push(`loop incoming ${plan.loop.purpose}`); } catch { /* */ }
      }
      trace.events.push(`start ${plan.style} ${plan.durationBars} bars`);
      for (const f of filterActions) {
        const deck = f.deck === 'outgoing' ? out : inc;
        fireDjFx(f.action, { deck, beats: f.beats, source: 'autodj' });
        trace.events.push(`fx ${f.action} on ${deck} (${f.beats} beats)`);
      }
      opts.onSweepStarted?.();

      const startedAt = timers.now();
      const beatMs = beatSec * 1000;
      const totalBeats = plan.style === 'hardCut' ? 0.05 : plan.durationBeats;
      const firedEffects = new Set<number>();
      const firedActions: Array<{ action: DjFxActionId; deck: 'A' | 'B' }> = [];
      let sampleCounter = 0;
      let loopReleased = false;

      intervalId = timers.setInterval(() => {
        if (cancelled) { if (intervalId !== null) timers.clearInterval(intervalId); return; }
        const beat = (timers.now() - startedAt) / beatMs;
        try {
          for (const c of curves) if (!registryOwned.has(c.target)) apply(c.target, sampleCurve(c.keyframes, Math.min(beat, plan.durationBeats)));
          plan.effects.forEach((e, i) => {
            if (firedEffects.has(i) || beat + plan.humanize.fxOffsetMs / beatMs < e.beat) return;
            firedEffects.add(i);
            trace.events.push(`fx ${e.kind} at beat ${e.beat}`);
            if (e.kind === 'clean-release') { setDeckFilter(inc, 0); setDeckEQ(inc, 'low', 0); return; }
            const action = EFFECT_ACTIONS[e.kind];
            if (!action || e.kind === 'filter-rise') return; // filter rises come through the filter plan
            const deck = e.deck === 'outgoing' ? out : inc;
            fireDjFx(action, { deck, beats: e.lengthBeats, amount: e.amount, source: 'autodj' });
            firedActions.push({ action, deck });
          });
          // Release the incoming loop once the blend is past its middle: the track continues.
          if (plan.loop && plan.loop.deck === 'incoming' && !loopReleased && beat >= plan.loop.lengthBeats * plan.loop.repeats) {
            loopReleased = true;
            try { getDJEngine().getDeck(inc).clearAudioLoop(); } catch { /* */ }
          }
          if ((sampleCounter++ & 7) === 0) {
            // The values this executor applied (store writes are rAF-batched and lag the engine).
            trace.samples.push({
              beat, crossfader: lastValues.get('crossfader') ?? useDJStore.getState().crossfaderPosition,
              outgoingLow: lastValues.get('outgoing.eqLow') ?? 0, incomingLow: lastValues.get('incoming.eqLow') ?? 0,
              outgoingFilter: lastValues.get('outgoing.filter') ?? 0, incomingFilter: lastValues.get('incoming.filter') ?? 0,
              outgoingVolume: lastValues.get('outgoing.volume') ?? 1,
            });
          }
        } catch (err) {
          emergency(`automation failed: ${err instanceof Error ? err.message : String(err)}`);
          return;
        }
        if (beat >= totalBeats) {
          if (intervalId !== null) { timers.clearInterval(intervalId); intervalId = null; }
          // ── Finish: exact end values, stop and reset the outgoing deck ──
          try {
            setCrossfader(target);
            // Release what the registry still holds on the outgoing deck (an echo tail may keep ringing past the stop).
            for (const f of filterActions) if (f.deck === 'outgoing') releaseDjFx(f.action, { deck: out, source: 'autodj' });
            for (const a of firedActions) if (a.deck === out && a.action !== 'fx_deck_echo_out' && a.action !== 'fx_deck_reverb_out') releaseDjFx(a.action, { deck: out, source: 'autodj' });
            try { getDJEngine().getDeck(out).stop(); } catch { /* */ }
            useDJStore.getState().setDeckPlaying(out, false);
            resetDeckAfterTransition(out);
            setDeckEQ(inc, 'low', 0); setDeckEQ(inc, 'mid', 0); setDeckEQ(inc, 'high', 0);
            setDeckFilter(inc, 0);
            setDeckFilterResonance(inc, 1);
            if (plan.loop && plan.loop.deck === 'incoming') { try { getDJEngine().getDeck(inc).clearAudioLoop(); } catch { /* */ } }
          } catch { /* a reset failure must not block completion */ }
          trace.completed = true;
          trace.events.push('complete');
          finish({ completed: true, fellBack: 'none', trace, incomingPlaying: true });
        }
      }, tickMs);
    } catch (err) {
      if (cancelled) return;
      emergency(err instanceof Error ? err.message : String(err));
    }
  };

  void run();

  return {
    plan,
    promise,
    cancel: () => {
      // Cancelling a finished execution is a no-op: Auto DJ cancels on every
      // completion, and a second finish would report the transition twice and
      // release the incoming deck's effects mid-track.
      if (finished) return;
      cancelled = true;
      if (intervalId !== null) { timers.clearInterval(intervalId); intervalId = null; }
      try { setDeckEchoSend(out, 0); setDeckReverbSend(out, 0); } catch { /* */ }
      for (const f of filterActionsFor(plan.filterPlan.kind, plan.durationBeats)) releaseDjFx(f.action, { deck: f.deck === 'outgoing' ? out : inc, source: 'autodj' });
      for (const e of plan.effects) { const a = EFFECT_ACTIONS[e.kind]; if (a) releaseDjFx(a, { deck: e.deck === 'outgoing' ? out : inc, source: 'autodj' }); }
      finish({ completed: false, fellBack: trace.fellBack, error: 'cancelled', trace, incomingPlaying: (() => { try { return getDJEngine().getDeck(inc).isPlaying(); } catch { return false; } })() });
    },
  };
}
