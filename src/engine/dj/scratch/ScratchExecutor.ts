/**
 * Scratch executor (owner plan `thoughts/shared/plans/2026-10-08-dj-view-scratch-plan.md`
 * sections 8, 11, 18, 60, 83; ledger SCR-P3.5).
 *
 * Turns a planned `ScratchEvent` (beats, role, gesture, source) into engine
 * calls on the deck's beat clock - the same `JuggleClock` and `ExecutorTimers`
 * the juggling executor runs on:
 *
 *   stroke (the registry's one action path)  ->  true re-cue (section 18) in the
 *   gesture's first closed fader window  ->  release (+ restore, section 60)
 *
 * The action path is `fireDjFx('fx_scratch_<gesture>', {source: 'autodj', ...})`
 * / `releaseDjFx`; the executor never calls a deck or a voice directly. A
 * record gesture is scheduled sample-accurately ahead of its beat (`at`, the
 * context time of the beat); a deck gesture starts on the tick that reaches
 * its beat, and a returns-to-anchor deck gesture is re-cued to its anchor on
 * the first tick its fader window is closed (the listener does not hear the
 * jump; audit SA-M3: before the stroke the deck is audible, so a re-cue
 * there never happened).
 *
 * A run gives back what its gestures changed (section 60, audit SA-M4): each
 * field a gesture touches (`fieldsTouchedBy`: a deck gesture its deck's rate,
 * scratch fader and ring; the crossfader only when its windows name it; a
 * record gesture none of them) is captured when the first gesture touching it
 * starts, and only those fields are restored when the last one ends, on every
 * exit path (release, cancel). Fields no gesture touched belong to whoever
 * moves them (the Auto DJ's crossfade, the user's pitch).
 */

import type { JuggleClock } from '../autodj/juggle/juggleExecutor';
import { realTimers, type ExecutorTimers } from '../autodj/transitionExecutor';
import type { DjFxActionId, DjFxFireOptions, DjFxSource } from '../../drumpad/DjFxActions';
import type { DeckRecueResult } from './deckRecue';
import { fieldsTouchedBy, type ScratchField, type ScratchSnapshot, type ScratchStateProbe } from './scratchSnapshot';
import { getGesture } from './scratchGestureCatalog';
import type { DeckScratchAnchor, ScratchEvent } from './scratchTypes';
import type { ScratchCue } from './ScratchRecordVoice';

/** Reachability sentinels (SCR-P3.R3). */
export const scratchExecutorStats = { started: 0, released: 0, restores: 0, recuesUnavailable: 0 };

export interface ScratchExecutorEvent {
  kind: 'started' | 'released' | 'restored' | 'recueUnavailable' | 'refused' | 'cancelled';
  beat: number;
  gesture: string;
  reason?: string;
}

export interface ScratchExecutorDeps {
  /** The deck's beat clock (`analysisClock`: the juggling executor's clock). */
  clock: JuggleClock;
  /** Audio context time in seconds (`ctx.currentTime`). */
  contextTime(): number;
  /** The one action path: `fireDjFx` / `releaseDjFx`. */
  fire(id: DjFxActionId, opts: DjFxFireOptions & { source: DjFxSource }): boolean;
  release(id: DjFxActionId, opts: DjFxFireOptions & { source: DjFxSource }): void;
  /** Captures / restores the state a scratch touches (section 60). */
  probe: ScratchStateProbe;
  /** Deck events with `returnToAnchor`: re-cue the deck to the anchor (`DeckEngine.recueScratch`); required. */
  recueDeck(deck: 'A' | 'B', anchorSec: number): DeckRecueResult;
  timers?: ExecutorTimers;
  /** Tick period of the single `setInterval` (5 ms). */
  tickMs?: number;
  /** How far ahead (seconds) a record gesture is handed to the worklet. */
  lookaheadSec?: number;
  onEvent?(e: ScratchExecutorEvent): void;
}

export interface ScratchRun {
  readonly event: ScratchEvent;
  /** Beat the stroke was handed to the engine for (the planned beat, humanized). */
  startedBeat: number | null;
  /** Context time the record gesture was scheduled at (record events). */
  at: number | null;
  recue: DeckRecueResult | null;
  /** A returns-to-anchor deck gesture still waiting for its closed fader window. */
  recuePending: boolean;
  state: 'pending' | 'running' | 'ending' | 'released' | 'cancelled' | 'refused';
}

interface Entry extends ScratchRun {
  id: DjFxActionId;
  opts: DjFxFireOptions & { source: DjFxSource };
}

const SOURCE: DjFxSource = 'autodj';

export class ScratchExecutor {
  private readonly deps: ScratchExecutorDeps;
  private readonly timers: ExecutorTimers;
  private entries: Entry[] = [];
  private interval: unknown = null;
  private snapshot: ScratchSnapshot | null = null;
  private touched = new Set<ScratchField>();
  /** The before-values of the last run and the fields given back (tests, telemetry). */
  lastRestored: ScratchSnapshot | null = null;
  lastRestoredFields: ScratchField[] = [];

  constructor(deps: ScratchExecutorDeps) {
    this.deps = deps;
    this.timers = deps.timers ?? realTimers;
  }

  /** Queue an event; it starts when its beat comes within the lookahead. */
  schedule(event: ScratchEvent): ScratchRun {
    const id = `fx_scratch_${event.gesture}` as DjFxActionId;
    const opts: DjFxFireOptions & { source: DjFxSource } = {
      source: SOURCE,
      role: event.role,
      amount: event.velocity,
      beats: event.durationBeats,
    };
    if (event.deck) opts.deck = event.deck;
    if (event.source.type === 'CRATE') {
      opts.record = event.source.recordId;
      opts.anchor = event.anchor.position as ScratchCue;
    }
    const entry: Entry = { event, id, opts, startedBeat: null, at: null, recue: null, recuePending: false, state: 'pending' };
    this.entries.push(entry);
    this.ensureTicking();
    return entry;
  }

  /** Events not yet finished. */
  get active(): number { return this.entries.length; }

  private ensureTicking(): void {
    if (this.interval !== null) return;
    this.interval = this.timers.setInterval(() => this.tick(), this.deps.tickMs ?? 5);
  }

  private stopTicking(): void {
    if (this.interval === null) return;
    this.timers.clearInterval(this.interval);
    this.interval = null;
  }

  private emit(kind: ScratchExecutorEvent['kind'], gesture: string, reason?: string): void {
    this.deps.onEvent?.({ kind, beat: this.deps.clock.beatNow(), gesture, reason });
  }

  private tick(): void {
    const { clock } = this.deps;
    const beat = clock.beatNow();
    const beatSec = clock.beatSec();
    const lookahead = this.deps.lookaheadSec ?? 0.1;
    for (const e of [...this.entries]) {
      const ev = e.event;
      if (e.state === 'pending') {
        const humanize = ev.humanizeMs / 1000;
        const dueSec = (ev.executeAtBeat - beat) * beatSec + humanize;
        const isRecord = ev.source.type === 'CRATE';
        if (isRecord ? dueSec <= lookahead : dueSec <= 1e-4) this.start(e, Math.max(0, dueSec), beat);
      } else if (e.state === 'running') {
        if (e.recuePending) this.tryRecue(e);
        const endBeat = ev.executeAtBeat + ev.durationBeats;
        const endSec = (endBeat - beat) * beatSec + ev.humanizeMs / 1000;
        if (ev.source.type === 'CRATE') {
          // a record gesture's stop is handed to the worklet ahead of time, at the end beat's context time
          if (endSec <= lookahead) {
            this.deps.release(e.id, { ...e.opts, at: this.deps.contextTime() + Math.max(0, endSec), finishCycle: false });
            scratchExecutorStats.released++;
            e.state = 'ending';
          }
        } else if (beat >= endBeat - 1e-6) {
          this.finish(e, 'released');
        }
      } else if (e.state === 'ending' && beat >= ev.executeAtBeat + ev.durationBeats - 1e-6) {
        this.finish(e, 'released');
      }
    }
    if (this.entries.length === 0) this.stopTicking();
  }

  private start(e: Entry, dueSec: number, beat: number): void {
    const ev = e.event;
    // the before-value of each field this gesture changes, taken when the first gesture touching it starts
    const fresh = fieldsTouchedBy(ev.source.type, getGesture(ev.gesture).faderWindows).filter((f) => !this.touched.has(f));
    if (fresh.length) {
      const now = this.deps.probe.capture();
      if (!this.snapshot) this.snapshot = now;
      for (const f of fresh) {
        (this.snapshot as unknown as Record<ScratchField, number | boolean>)[f] = now[f];
        this.touched.add(f);
      }
    }
    if (ev.source.type === 'CRATE') {
      e.at = this.deps.contextTime() + dueSec;
      e.opts.at = e.at;
    }
    const ok = this.deps.fire(e.id, e.opts);
    if (!ok) {
      e.state = 'refused';
      this.emit('refused', ev.gesture, 'the registry refused the action');
      this.drop(e);
      return;
    }
    e.state = 'running';
    e.recuePending = ev.source.type === 'DECK' && ev.returnToAnchor;
    e.startedBeat = beat + dueSec / Math.max(1e-9, this.deps.clock.beatSec());
    scratchExecutorStats.started++;
    this.emit('started', ev.gesture);
  }

  /** Re-cue a returns-to-anchor deck gesture once its fader window is closed (section 18). */
  private tryRecue(e: Entry): void {
    const ev = e.event;
    if (ev.source.type !== 'DECK') { e.recuePending = false; return; }
    const r = this.deps.recueDeck(ev.deck ?? ev.source.deck, (ev.anchor as DeckScratchAnchor).position);
    if (r.mode === 'waiting') return;
    e.recuePending = false;
    e.recue = r;
    if (!r.returnsToAnchor) {
      scratchExecutorStats.recuesUnavailable++;
      this.emit('recueUnavailable', ev.gesture, r.reason);
    }
  }

  private finish(e: Entry, state: 'released' | 'cancelled'): void {
    if (e.recuePending) {
      e.recuePending = false;
      scratchExecutorStats.recuesUnavailable++;
      this.emit('recueUnavailable', e.event.gesture, 'the gesture had no closed fader window to re-cue in');
    }
    if (e.state === 'ending' && state === 'cancelled') {
      // a record stroke whose stop is scheduled ahead: cancel stops it now (audit SA-m7)
      this.deps.release(e.id, { ...e.opts, at: undefined, finishCycle: false });
    }
    if (e.state === 'running') {
      // a deck stroke at its end beat finishes the cycle it is in (it plays whole cycles and ends
      // itself); a cancel stops it now
      this.deps.release(e.id, { ...e.opts, at: undefined, finishCycle: state === 'released' && e.event.source.type !== 'CRATE' });
      scratchExecutorStats.released++;
    }
    e.state = state;
    this.emit(state === 'released' ? 'released' : 'cancelled', e.event.gesture);
    this.drop(e);
  }

  /** Remove an entry; the last one out gives back the fields the run touched (section 60). */
  private drop(e: Entry): void {
    this.entries = this.entries.filter((x) => x !== e);
    if (!this.entries.some((x) => x.state === 'running' || x.state === 'ending') && this.snapshot) {
      const snap = this.snapshot;
      const fields = [...this.touched];
      this.snapshot = null;
      this.touched.clear();
      this.deps.probe.restore(snap, fields);
      this.lastRestored = snap;
      this.lastRestoredFields = fields;
      scratchExecutorStats.restores++;
      this.emit('restored', e.event.gesture);
    }
    if (this.entries.length === 0) this.stopTicking();
  }

  /** Every exit path: release what runs, drop what waits, restore the snapshot. */
  cancel(): void {
    for (const e of [...this.entries]) this.finish(e, 'cancelled');
    this.stopTicking();
  }
}
