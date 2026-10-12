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
  seekDeckAudio, setCrossfader, setDeckEQ, setDeckEQKillNow, setDeckEchoSend, setDeckFilter, setDeckFilterResonance,
  setDeckKeyLock, setDeckPitch, setDeckReverbSend, setDeckVolume, isDeckRewinding,
} from '../DJActions';
import { useDJStore } from '@/stores/useDJStore';
import { phaseAlign } from '../DJAutoSync';
import { fireDjFx, releaseDjFx, type DjFxActionId } from '@/engine/drumpad/DjFxActions';
import { sampleCurve, type ExecutionTrace } from './transitionQuality';
import type { AutomationCurve, AutomationTarget, DJEffectEvent, DJTransitionPlan, FilterPlanKind } from './types';

export { realTimers, type ExecutorTimers } from './executorTimers';
import { realTimers, type ExecutorTimers } from './executorTimers';

export interface ExecutionResult {
  completed: boolean;
  fellBack: 'none' | 'fallback' | 'emergency';
  error?: string;
  trace: ExecutionTrace;
  /** False when the incoming deck could not be started: the outgoing was kept playing (no-silence rule). */
  incomingPlaying: boolean;
  /** The plan that actually played when it is not the one executed: a refused juggle's normal-blend fallback. */
  executedPlan?: DJTransitionPlan;
  /** The plan's rewind ran instead of the transition: the outgoing plays again, the incoming never started. */
  rewound?: boolean;
}

export interface ExecuteOptions {
  /** Resolves when the plan's quantised start moment arrives (the controller waits for the grid). */
  waitForStart?: (plan: DJTransitionPlan) => Promise<void>;
  /** Called once the automation clock runs: the poll loop may now judge completion. */
  onSweepStarted?: () => void;
  onComplete?: (result: ExecutionResult) => void;
  timers?: ExecutorTimers;
  tickMs?: number;
  /** Seconds per beat of the outgoing deck at execution time (defaults from the plan's tempo). */
  beatSec?: number;
  /** Milliseconds the start actually landed after the planned moment (for the trace). */
  startOffsetMs?: number;
  /**
   * juggleTransition: perform the plan's trading ladder between the incoming
   * start and the release (juggling plan section 26). Resolves when the
   * ladder released onto the incoming or was aborted; the release curves run
   * after it. `refused`: nothing was traded (the incoming was never heard) -
   * the plan's normal-blend fallback runs instead of the release. Aborted
   * after the incoming was heard: the fallback blend runs too, onto the
   * incoming as it plays, ending on the ladder's landing (resumeBlendAfterHeardAbort).
   */
  performTrade?: (juggle: NonNullable<DJTransitionPlan['juggle']>) => Promise<{ completed: boolean; refused?: boolean; reason?: string }>;
  /** The outgoing deck's position now (seconds of its track): where a heard ladder abort's blend is placed. */
  outgoingPosition?: () => number;
  /**
   * The plan's scratch (scratch plan D8): started once, before the wait for the grid (an outgoing-deck
   * feature plays the bar before the start), alongside the curves - never delaying the start or the
   * release (section 28). Cancelled with the transition.
   */
  performScratch?: (scratch: NonNullable<DJTransitionPlan['scratch']>) => { done: Promise<{ completed: boolean; reason?: string }>; cancel(): void };
}

/** Scale a curve's keyframe beats by `k` (a blend run over a shorter length keeps its shape). */
const scaleCurve = (c: AutomationCurve, k: number): AutomationCurve => ({ ...c, keyframes: c.keyframes.map((f) => ({ ...f, beat: f.beat * k })) });

/**
 * A juggle transition whose ladder aborted after the incoming was heard
 * (drift, a vocal collision, the governor): the juggle released to the
 * outgoing (owner plan section 33: the strongest deck, a stable fader) and the
 * incoming plays on beneath it, in its phrase, from the ladder's start - it
 * cannot be re-cued without an audible jump. The graceful resolve (section 42)
 * is the plan's normal-blend fallback - its style, curves and bass handover -
 * run onto the incoming as it plays and ENDING on the ladder's landing: the
 * incoming phrase start (its drop) the ladder was handing over on, and where
 * the outgoing's room is guaranteed. It runs the fallback's planned length
 * when that fits between the next bar and the landing, else it is compressed
 * into the bars left (one bar at least, from the next bar) - never the 1-bar
 * release cut a ladder's length before the drop.
 */
export function resumeBlendAfterHeardAbort(plan: DJTransitionPlan, fallback: DJTransitionPlan, nowSec: number, beatSec: number): DJTransitionPlan {
  const bpb = plan.beatsPerBar || 4;
  const barSec = beatSec * bpb;
  const landingSec = plan.startTimeSec + (plan.juggle?.tradeBeats ?? 0) * beatSec;
  const nextBarSec = plan.startTimeSec + Math.ceil((nowSec - plan.startTimeSec) / barSec - 1e-6) * barSec;
  const barsLeft = Math.round((landingSec - nextBarSec) / barSec);
  const bars = Math.max(1, Math.min(fallback.durationBars, barsLeft));
  const startTimeSec = barsLeft >= 1 ? landingSec - bars * barSec : nextBarSec;
  const k = bars / Math.max(1, fallback.durationBars);
  const startBeat = plan.startBeat + Math.round((startTimeSec - plan.startTimeSec) / beatSec);
  return {
    ...fallback,
    id: `${fallback.id}-heard`,
    startTimeSec, startBeat, endBeat: startBeat + bars * bpb,
    durationBars: bars, durationBeats: bars * bpb,
    crossfadePlan: { ...fallback.crossfadePlan, curve: scaleCurve(fallback.crossfadePlan.curve, k), lengthBeats: fallback.crossfadePlan.lengthBeats * k },
    eqPlan: { ...fallback.eqPlan, curves: fallback.eqPlan.curves.map((c) => scaleCurve(c, k)) },
    filterPlan: { ...fallback.filterPlan, curves: fallback.filterPlan.curves.map((c) => scaleCurve(c, k)) },
    bassPlan: {
      ...fallback.bassPlan, curves: fallback.bassPlan.curves.map((c) => scaleCurve(c, k)),
      schedule: fallback.bassPlan.schedule.map((s) => ({ ...s, bar: s.bar * k })), handoverBar: fallback.bassPlan.handoverBar * k,
    },
    effects: fallback.effects.map((e) => ({ ...e, beat: e.beat * k, lengthBeats: e.lengthBeats * k })),
    // The incoming already plays from the ladder's start: no loop or cue jump re-places either deck.
    loop: undefined, cueJump: undefined,
    reasons: [...fallback.reasons, `ladder aborted after the incoming was heard: ${fallback.style} ${bars} bars onto the ladder's landing at ${landingSec.toFixed(1)} s`],
  };
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
    case 'lowKill': setDeckEQKillNow(deck, 'low', value >= 0.5); break;
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
  spinback: 'fx_deck_spinback',
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
/**
 * Key lock the Auto DJ engaged, per deck, with the deck's own state before it.
 * A plan turns key lock on for an incoming deck it pitches by more than half a
 * semitone; the deck then plays the whole track at that rate, so the lock
 * stays on while the track plays (releasing it mid-track would jump the key).
 * It is handed back when that track leaves the deck: wherever the deck is
 * stopped as the outgoing deck (this executor's finish, the emergency fade,
 * Auto DJ's completeTransition) - never while it still plays.
 * A plan that does not need key lock leaves the deck's own setting alone.
 */
const autoKeyLock = new Map<'A' | 'B', boolean>();

/** Engage key lock on `deck` for a plan that needs it, remembering the deck's own state. */
export function engageAutoKeyLock(deck: 'A' | 'B', needed: boolean): void {
  if (!needed) return;
  const own = useDJStore.getState().decks[deck].keyLockEnabled;
  if (!autoKeyLock.has(deck)) autoKeyLock.set(deck, own);
  if (!own) setDeckKeyLock(deck, true);
}

/** The track Auto DJ locked has left `deck`: give the deck its own key-lock state back. */
export function releaseAutoKeyLock(deck: 'A' | 'B'): void {
  if (!autoKeyLock.has(deck)) return;
  const own = autoKeyLock.get(deck)!;
  autoKeyLock.delete(deck);
  setDeckKeyLock(deck, own);
}

export function resetDeckAfterTransition(deck: 'A' | 'B'): void {
  setDeckEQ(deck, 'low', 0); setDeckEQ(deck, 'mid', 0); setDeckEQ(deck, 'high', 0);
  setDeckEQKillNow(deck, 'low', false);
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
  /** A refused juggle's normal blend, executed in this one's place. */
  let fallbackHandle: ExecutionHandle | null = null;
  let scratchHandle: { cancel(): void } | null = null;
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
    // The registry's filter moves run for the planned length, far past this four-beat fade: end them on both decks
    // now, or a live sweep keeps writing the filter of a deck the fade has already reset.
    for (const f of filterActionsFor(plan.filterPlan.kind, plan.durationBeats)) {
      try { releaseDjFx(f.action, { deck: f.deck === 'outgoing' ? out : inc, source: 'autodj' }); } catch { /* */ }
    }
    const incomingDeck = (() => { try { return getDJEngine().getDeck(inc); } catch { return null; } })();
    // The bass handover is abandoned: the incoming fades in with its low end.
    try { setDeckEQKillNow(inc, 'low', false); } catch { /* */ }
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
        releaseAutoKeyLock(out);
        try { resetDeckAfterTransition(out); } catch { /* */ }
        trace.completed = true;
        finish({ completed: true, fellBack: 'emergency', error, trace, incomingPlaying: true });
      }
    }, tickMs);
  };

  /**
   * A rewind instead of the transition (plan.rewind): on the grid moment the
   * outgoing deck's Rewind (fx_deck_rewind, the pad's) pulls the record back and
   * the same tune plays again; the incoming is never touched. A plan with a
   * rewind performs only the rewind: the transition is planned again from the
   * restart. When the deck refuses (not playing, or its platter already in a
   * gesture) the result says so (`rewound` false) and nothing else happens.
   */
  const performRewind = async (): Promise<void> => {
    if (opts.waitForStart) await opts.waitForStart(plan);
    if (cancelled) return;
    fireDjFx('fx_deck_rewind', { deck: out, source: 'autodj' });
    if (!isDeckRewinding(out)) {
      trace.events.push(`rewind refused on deck ${out}`);
      finish({ completed: false, fellBack: 'none', error: 'rewind refused: the deck is not playing or its platter is busy', trace, incomingPlaying: false, rewound: false });
      return;
    }
    trace.events.push(`rewind ${out}: from ${plan.rewind!.atSec.toFixed(1)} s back to ${plan.rewind!.restartSec.toFixed(1)} s`);
    await new Promise<void>((resolve) => {
      const id = timers.setInterval(() => { if (!isDeckRewinding(out)) { timers.clearInterval(id); resolve(); } }, tickMs);
    });
    trace.events.push('rewind: the tune plays again');
    trace.completed = true;
    finish({ completed: true, fellBack: 'none', trace, incomingPlaying: false, rewound: true });
  };

  const run = async () => {
    try {
      if (plan.rewind) { await performRewind(); return; }
      // ── Prepare the incoming deck (plan sections 7, 12, 13) ─────────────
      // The incoming is cued while stopped. One that already plays (the user
      // started it) is never seeked - an audible skip and a platter jump - it
      // keeps its place and is bent into phase once the transition starts.
      const incomingAlreadyPlaying = (() => { try { return getDJEngine().getDeck(inc).isPlaying(); } catch { return false; } })();
      if (incomingAlreadyPlaying) trace.events.push('incoming already playing: kept its position, bent into phase');
      else seekDeckAudio(inc, Math.max(0, plan.incomingPosition));
      setDeckPitch(inc, plan.tempoPlan.incomingSemitones);
      engageAutoKeyLock(inc, plan.keyPlan.keyLock);
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

      // ── Scratch (scratch plan D8): on its own beats, alongside everything below ──
      if (plan.scratch && opts.performScratch) {
        const s = plan.scratch;
        trace.events.push(`scratch ${s.kind} ${s.events.length} events`);
        try {
          const h = opts.performScratch(s);
          scratchHandle = h;
          void h.done.then((r) => { trace.events.push(`scratch ${r.completed ? 'released' : `ended: ${r.reason ?? 'not completed'}`}`); }, () => undefined);
        } catch (err) {
          trace.events.push(`scratch refused: ${err instanceof Error ? err.message : String(err)}`);
        }
      }

      // ── Wait for the grid ───────────────────────────────────────────────
      if (opts.waitForStart) await opts.waitForStart(plan);
      if (cancelled) return;
      if (plan.humanize.startOffsetMs > 2) await new Promise<void>((r) => { timers.setTimeout(r, plan.humanize.startOffsetMs); });
      if (cancelled) return;

      // ── Exits before the start (a spinback on the phrase end) ──────────────
      // An effect with a negative beat fires on the grid moment; the incoming
      // starts that many beats later (the next downbeat).
      const leadIns = plan.effects.filter((e) => e.beat < 0);
      if (leadIns.length > 0) {
        for (const e of leadIns) {
          const action = EFFECT_ACTIONS[e.kind];
          if (!action) continue;
          const deck = e.deck === 'outgoing' ? out : inc;
          fireDjFx(action, { deck, beats: e.lengthBeats, amount: e.amount, stopAfter: e.kind === 'spinback', source: 'autodj' });
          trace.events.push(`fx ${e.kind} ${-e.beat} beats before the start`);
        }
        const leadBeats = Math.max(...leadIns.map((e) => -e.beat));
        await new Promise<void>((r) => { timers.setTimeout(r, leadBeats * beatSec * 1000); });
        if (cancelled) return;
      }

      // ── Start ───────────────────────────────────────────────────────────
      const incomingDeck = getDJEngine().getDeck(inc);
      await incomingDeck.play();
      useDJStore.getState().setDeckPlaying(inc, true);
      if (incomingAlreadyPlaying) { try { phaseAlign(inc, out, 'bar'); } catch { /* grid missing */ } }
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

      // ── Trade stage (juggleTransition): the ladder runs before the release curves ──
      if (plan.style === 'juggleTransition' && plan.juggle && opts.performTrade) {
        trace.events.push(`juggle ladder ${plan.juggle.ladderBars.join('-')}`);
        let traded: { completed: boolean; refused?: boolean; reason?: string } = { completed: false };
        try { traded = await opts.performTrade(plan.juggle); } catch { traded = { completed: false }; }
        if (cancelled) return;
        const fallback = plan.juggle.fallback;
        const outgoingPlays = (() => { try { return getDJEngine().getDeck(out).isPlaying(); } catch { return false; } })();
        // A ladder that did not complete resolves as a normal transition, the plan's own fallback blend - never
        // the 1-bar release, a cut onto the incoming a ladder's length before its drop (owner plan sections 31,
        // 33, 42). Refused (the incoming never heard, the crossfader still on the outgoing): the blend from its
        // own phrase and mix-in. Aborted after the incoming was heard (the juggle released to the outgoing, the
        // incoming plays on beneath it): the blend onto the incoming as it plays, ending on the ladder's landing.
        // An outgoing that stopped leaves only the incoming: the release below completes onto it.
        const blend = traded.completed || !fallback ? null
          : traded.refused ? fallback
          : outgoingPlays && opts.outgoingPosition ? resumeBlendAfterHeardAbort(plan, fallback, opts.outgoingPosition(), beatSec)
          : null;
        if (blend) {
          trace.events.push(`ladder ${traded.refused ? 'refused' : 'aborted after the incoming was heard'}${traded.reason ? ` (${traded.reason})` : ''}: ${blend.style} ${blend.durationBars} bars at ${blend.startTimeSec.toFixed(1)} s`);
          trace.fellBack = 'fallback';
          if (traded.refused) {
            // The silent incoming stops; the blend cues it at its own mix-in.
            try { getDJEngine().getDeck(inc).stop(); } catch { /* */ }
            useDJStore.getState().setDeckPlaying(inc, false);
          }
          const inner = executeTransition(blend, { ...opts, performTrade: undefined, onComplete: undefined, onSweepStarted: undefined });
          fallbackHandle = inner;
          void inner.promise.then((r) => {
            trace.events.push(...r.trace.events);
            trace.samples.push(...r.trace.samples);
            trace.completed = r.completed;
            finish({ ...r, fellBack: r.fellBack === 'emergency' ? 'emergency' : 'fallback', trace, executedPlan: blend });
          });
          return;
        }
        if (!traded.completed) trace.events.push('ladder aborted: release now');
      }

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
            if (e.beat < 0) return; // fired before the start
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
              // A killed band reads as -60 dB (the kill switch is -Infinity on the deck).
              outgoingLow: (lastValues.get('outgoing.lowKill') ?? 0) >= 0.5 ? -60 : lastValues.get('outgoing.eqLow') ?? 0,
              incomingLow: (lastValues.get('incoming.lowKill') ?? 0) >= 0.5 ? -60 : lastValues.get('incoming.eqLow') ?? 0,
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
            releaseAutoKeyLock(out);
            resetDeckAfterTransition(out);
            setDeckEQ(inc, 'low', 0); setDeckEQ(inc, 'mid', 0); setDeckEQ(inc, 'high', 0);
            setDeckEQKillNow(inc, 'low', false);
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
      try { scratchHandle?.cancel(); } catch { /* the transition's cancel must complete */ }
      if (fallbackHandle) { fallbackHandle.cancel(); return; }
      if (intervalId !== null) { timers.clearInterval(intervalId); intervalId = null; }
      try { setDeckEchoSend(out, 0); setDeckReverbSend(out, 0); } catch { /* */ }
      // A cancelled handover leaves neither deck without its bass.
      try { setDeckEQKillNow(out, 'low', false); setDeckEQKillNow(inc, 'low', false); } catch { /* */ }
      for (const f of filterActionsFor(plan.filterPlan.kind, plan.durationBeats)) releaseDjFx(f.action, { deck: f.deck === 'outgoing' ? out : inc, source: 'autodj' });
      for (const e of plan.effects) { const a = EFFECT_ACTIONS[e.kind]; if (a) releaseDjFx(a, { deck: e.deck === 'outgoing' ? out : inc, source: 'autodj' }); }
      finish({ completed: false, fellBack: trace.fellBack, error: 'cancelled', trace, incomingPlaying: (() => { try { return getDJEngine().getDeck(inc).isPlaying(); } catch { return false; } })() });
    },
  };
}
