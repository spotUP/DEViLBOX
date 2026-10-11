/**
 * Juggle executor (juggling plan sections 2, 6, 21, 22, 32-34, 46): places a
 * pattern on an absolute master beat and fires each action when the shared
 * musical clock (the deck position mapped through its beat grid) reaches it.
 * A timer only samples the clock and guards against runaway; the execution
 * point is the beat. Every action goes through one sink - the same DJ
 * actions the DJ view's buttons use. The safety governor runs per action:
 * no-silence, crossfader validity, cut frequency, contradictory actions,
 * conflicting loops, runaway FX, stuck patterns.
 */
import { realTimers, type ExecutorTimers } from '../transitionExecutor';
import type { DJJuggleAction, DJJugglePattern, JuggleEventKind } from './juggleTypes';

/** The one musical clock: fractional master beats and the current beat period. */
export interface JuggleClock {
  beatNow(): number;
  beatSec(): number;
}

/** `playing`: the deck runs and could sound; `audible`: it sounds now (playing and the crossfader lets it through). */
export interface SinkState { playing: { A: boolean; B: boolean }; audible: { A: boolean; B: boolean }; crossfader: number; loops: { A: boolean; B: boolean } }

/** Where actions land: the real one binds to DJActions / DjFxActions. */
export interface JuggleActionSink {
  apply(action: DJJuggleAction, info: { beatSec: number; beatNow: number; patternBeat: number }): void;
  state(): SinkState;
  /** Undo what the pattern changed that outlives its actions (filter moves): called once on every exit path. */
  restore?(): void;
  /** The heard bar-phase error of a deck against the other deck, seconds (null: no grid to measure on). */
  phaseError?(deck: 'A' | 'B'): number | null;
}

export interface JuggleEvent {
  kind: JuggleEventKind;
  beat: number;
  reason: string;
  action?: DJJuggleAction;
  pattern?: string;
}

export interface JuggleTraceEntry {
  action: DJJuggleAction;
  scheduledBeat: number;
  firedBeat: number | null;
  status: 'executed' | 'blocked' | 'skipped';
  reason?: string;
}

export interface JuggleExecutionResult {
  completed: boolean;
  aborted: boolean;
  /**
   * The pattern ended before its target deck was ever heard: refused before it started, or aborted
   * before the first cut onto that deck. Nothing was traded; the caller resolves without it.
   */
  refused?: boolean;
  reason: string;
  trace: JuggleTraceEntry[];
  fallbacks: number;
  events: JuggleEvent[];
  endBeat: number;
}

export interface JuggleExecutionOptions {
  clock: JuggleClock;
  sink: JuggleActionSink;
  timers?: ExecutorTimers;
  tickMs?: number;
  onEvent?: (e: JuggleEvent) => void;
  /** Extra abort check per tick: a reason aborts gracefully. */
  abortCheck?: () => string | null;
  /** Max crossfader cuts per beat before the governor blocks (transformer uses 2). */
  maxCutsPerBeat?: number;
  /** How late (beats) an action may fire before it is skipped as stale. */
  staleBeats?: number;
}

export interface JuggleExecution {
  pattern: DJJugglePattern;
  startBeat: number;
  endBeat: number;
  done: Promise<JuggleExecutionResult>;
  trace: JuggleTraceEntry[];
  /** Graceful: discard the rest, release to the primary. */
  abort(reason: string): void;
  /** Hard: stop the ticker, no further action (emergency path handles the decks). */
  cancel(reason: string): void;
  active(): boolean;
  nextActions(count: number): Array<{ deck: string; type: DJJuggleAction['type']; beat: number }>;
}

const CUT_TYPES = new Set<DJJuggleAction['type']>(['CutIn', 'CutOut', 'CrossfadeTo', 'CrossfadeFrom', 'HoldDeck', 'ReleaseDeck']);
const FX_TYPES = new Set<DJJuggleAction['type']>(['EchoThrow', 'ReverbThrow', 'FilterIn', 'FilterOut']);

export function executeJuggle(pattern: DJJugglePattern, startBeat: number, opts: JuggleExecutionOptions): JuggleExecution {
  const timers = opts.timers ?? realTimers;
  const tickMs = opts.tickMs ?? 15;
  const staleBeats = opts.staleBeats ?? 1;
  const maxCuts = opts.maxCutsPerBeat ?? 4;
  const events: JuggleEvent[] = [];
  const trace: JuggleTraceEntry[] = [];
  const beatsPerBar = Math.max(1, Math.round(pattern.actions.reduce((m, a) => Math.max(m, a.executeAtBeat), 0) / Math.max(1, pattern.durationBars)));
  const endBeat = startBeat + pattern.durationBars * beatsPerBar;
  const queue = pattern.actions
    .map((action, index) => ({ action, index, at: startBeat + action.executeAtBeat }))
    .sort((a, b) => a.at - b.at || a.index - b.index);
  let cursor = 0;
  let fallbacks = 0;
  let finished = false;
  let aborted = false;
  let interval: unknown = null;
  let watchdog: unknown = null;
  const cutsInBeat = new Map<number, number>();
  const fxInBar = new Map<number, number>();
  let resolve!: (r: JuggleExecutionResult) => void;
  const done = new Promise<JuggleExecutionResult>((r) => { resolve = r; });

  const emit = (kind: JuggleEventKind, reason: string, action?: DJJuggleAction): void => {
    const e: JuggleEvent = { kind, beat: opts.clock.beatNow(), reason, action, pattern: pattern.id };
    events.push(e);
    opts.onEvent?.(e);
  };

  const primary = pattern.sourceDeck === 'B' ? 'B' : 'A';
  const other = primary === 'A' ? 'B' : 'A';

  /** Section 32: the governor's reasons to block an action, or null. */
  const govern = (action: DJJuggleAction, now: number): string | null => {
    const st = opts.sink.state();
    if (CUT_TYPES.has(action.type)) {
      const key = Math.floor(now);
      const n = (cutsInBeat.get(key) ?? 0) + 1;
      if (n > maxCuts) return `excessive cut frequency (${n} in one beat)`;
      cutsInBeat.set(key, n);
    }
    if (action.type === 'CutOut' || action.type === 'CrossfadeFrom') {
      const target = action.deck === 'A' ? 'B' : 'A';
      if (action.deck !== 'BOTH' && !st.playing[target]) return 'would silence both decks';
    }
    if ((action.type === 'CutIn' || action.type === 'ReleaseDeck') && action.deck !== 'BOTH' && !st.playing[action.deck]) {
      // Cutting to a deck that cannot sound: block, hold what plays.
      return `deck ${action.deck} is not audible`;
    }
    if (action.type === 'StartLoop' || action.type === 'LoopResize') {
      if (action.deck !== 'BOTH' && action.type === 'StartLoop' && st.loops[action.deck]) return 'conflicting loop already active';
    }
    if (FX_TYPES.has(action.type)) {
      const bar = Math.floor(now / beatsPerBar);
      const n = (fxInBar.get(bar) ?? 0) + 1;
      if (n > 3) return 'runaway FX (more than 3 in a bar)';
      fxInBar.set(bar, n);
    }
    return null;
  };

  const noSilenceGuard = (now: number): void => {
    const st = opts.sink.state();
    if (st.audible.A || st.audible.B) return;
    fallbacks++;
    const safe = st.crossfader <= 0.5 ? 'A' : 'B';
    opts.sink.apply({ type: 'CutIn', deck: safe, executeAtBeat: now - startBeat, reason: 'no-silence invariant: force the safe deck' }, { beatSec: opts.clock.beatSec(), beatNow: now, patternBeat: now - startBeat });
    emit('juggleFallback', `both decks silent at beat ${now.toFixed(2)}: forced deck ${safe}`);
  };

  const finish = (completed: boolean, reason: string): void => {
    if (finished) return;
    finished = true;
    if (interval !== null) timers.clearInterval(interval);
    try { opts.sink.restore?.(); } catch { /* a restore failure must not block the exit */ }
    if (watchdog !== null) timers.clearTimeout(watchdog);
    for (; cursor < queue.length; cursor++) trace.push({ action: queue[cursor].action, scheduledBeat: queue[cursor].at, firedBeat: null, status: 'skipped', reason });
    emit(completed ? 'juggleCompleted' : 'juggleAborted', reason);
    resolve({ completed, aborted, reason, trace, fallbacks, events, endBeat });
  };

  const release = (reason: string): void => {
    const now = opts.clock.beatNow();
    const info = { beatSec: opts.clock.beatSec(), beatNow: now, patternBeat: now - startBeat };
    const st = opts.sink.state();
    const to = st.playing[primary] ? primary : st.playing[other] ? other : primary;
    opts.sink.apply({ type: 'ReleaseDeck', deck: to, executeAtBeat: now - startBeat, reason: `${reason}: release to deck ${to}` }, info);
    opts.sink.apply({ type: 'ResetDeck', deck: to === 'A' ? 'B' : 'A', executeAtBeat: now - startBeat, reason: `${reason}: reset the other deck` }, info);
  };

  const tick = (): void => {
    if (finished) return;
    const now = opts.clock.beatNow();
    const abortReason = opts.abortCheck?.();
    if (abortReason) { aborted = true; release(abortReason); finish(false, abortReason); return; }
    while (cursor < queue.length && queue[cursor].at <= now) {
      const { action, at } = queue[cursor];
      cursor++;
      const info = { beatSec: opts.clock.beatSec(), beatNow: now, patternBeat: now - startBeat };
      if (now - at > staleBeats) { trace.push({ action, scheduledBeat: at, firedBeat: null, status: 'skipped', reason: 'stale' }); emit('juggleActionBlocked', 'stale action skipped', action); continue; }
      const blocked = govern(action, now);
      if (blocked) { trace.push({ action, scheduledBeat: at, firedBeat: null, status: 'blocked', reason: blocked }); emit('juggleActionBlocked', blocked, action); continue; }
      try { opts.sink.apply(action, info); } catch (err) { trace.push({ action, scheduledBeat: at, firedBeat: now, status: 'blocked', reason: `sink error: ${err instanceof Error ? err.message : String(err)}` }); emit('juggleActionBlocked', 'sink error', action); continue; }
      trace.push({ action, scheduledBeat: at, firedBeat: now, status: 'executed' });
      emit('juggleActionExecuted', action.reason ?? action.type, action);
      noSilenceGuard(now);
    }
    if (cursor >= queue.length && now >= endBeat) finish(true, 'pattern complete');
  };

  for (const q of queue) emit('juggleActionScheduled', `${q.action.type} ${q.action.deck} at beat ${q.at.toFixed(2)}`, q.action);
  emit('juggleStarted', `${pattern.type} (${pattern.sequence}) from beat ${startBeat.toFixed(2)}`);
  interval = timers.setInterval(tick, tickMs);
  // Section 32: never an infinite pattern - the watchdog is the only ms timer and it only cleans up.
  const budgetMs = ((endBeat - opts.clock.beatNow()) * opts.clock.beatSec() * 1000) * 1.5 + 4000;
  watchdog = timers.setTimeout(() => { if (!finished) { aborted = true; release('watchdog'); finish(false, 'watchdog: pattern overran'); } }, Math.max(1000, budgetMs));
  tick();

  return {
    pattern, startBeat, endBeat, done, trace,
    abort(reason) { if (finished) return; aborted = true; release(reason); finish(false, reason); },
    cancel(reason) { if (finished) return; aborted = true; finish(false, reason); },
    active: () => !finished,
    nextActions: (count) => queue.slice(cursor, cursor + count).map((q) => ({ deck: q.action.deck, type: q.action.type, beat: q.at })),
  };
}
