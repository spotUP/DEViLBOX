/**
 * Gate D — `PerformanceContext`, the performer's memory.
 *
 * One snapshot of everything a decision needs: where the music is, what is
 * about to happen, what just happened, what the performer itself has been
 * doing, and how much wet energy is already in the air. Gates E-L read from
 * it; none of them re-derive any of it.
 *
 * Two pieces, deliberately separated:
 *
 *  - `PerformanceMemory` is the only mutable part. It owns what accumulates
 *    over time — gestures in flight, moves recently fired, phrase history —
 *    and it learns them by SUBSCRIBING TO `DubRouter`, not by being told.
 *    That matters: the router is the single execution path for human, MIDI,
 *    pad, lane, MCP and AI fires alike, so the AI's memory includes what the
 *    user just did by hand. An AI-only log would make the performer deaf to
 *    its own player.
 *
 *  - `buildPerformanceContext` is pure assembly: a frozen snapshot per tick,
 *    with no store imports, so it stays testable exactly like the Gate B
 *    clock and the Gate C event model.
 *
 * What is NOT invented here: `spectralDensity` has no measurement wired yet,
 * so it is `null` rather than a plausible-looking number. Gate G owns the
 * per-move energy accounting; this file reports only what can be read today.
 */

import type { MusicalClockSettings, MusicalPosition } from './musicalClock';
import { DEFAULT_MUSICAL_CLOCK_SETTINGS, computeMusicalPosition } from './musicalClock';
import type { MusicalChannelProfile } from './musicalChannelProfile';
import type { ChannelEventSource, LookAheadWindow, MusicalEvent } from './musicalEvents';
import { eventsInWindow, rowsForWindow } from './musicalEvents';

// ───────────────────────────── Intention ─────────────────────────────────

/**
 * What the performer wants musically, chosen BEFORE the move (Gate E).
 * Declared here because the context carries it; the layer that decides it
 * lands in Gate E.
 */
export type Intention =
  | 'REST'
  | 'ACCENT'
  | 'ANSWER'
  | 'SPACE'
  | 'BUILD'
  | 'DROP'
  | 'TEXTURE'
  | 'TRANSITION'
  | 'RESET';

/** What an intention is aimed at. A channel, the whole mix, or nothing yet. */
export interface IntentionTarget {
  kind: 'channel' | 'mix' | 'none';
  channelId?: number;
  /** Why this target — kept for the fire log and for explaining a decision. */
  reason?: string;
}

export const NO_TARGET: IntentionTarget = { kind: 'none' };

// ─────────────────────────── Moves and gestures ──────────────────────────

/** A move currently held — fired, disposer not yet called. */
export interface ActiveGesture {
  invocationId: string;
  moveId: string;
  channelId?: number;
  startedRow: number;
  startedTimeSec: number;
  source: 'live' | 'lane';
}

/** A move that has fired, whether or not it has released. */
export interface RecentMove {
  invocationId: string;
  moveId: string;
  channelId?: number;
  row: number;
  timeSec: number;
  source: 'live' | 'lane';
  /** Present once the hold released. One-shots never get one. */
  releasedRow?: number;
  releasedTimeSec?: number;
}

/** One phrase the performer has been through, closed when the phrase turns. */
export interface PhraseRecord {
  phrase: number;
  /** Moves fired during the phrase. */
  moves: number;
  /** Of those, how many were the performer's own (not lane playback). */
  liveMoves: number;
  /** True when the performer fired nothing at all — a real rest, and the
   *  thing Gate E needs in order to avoid two silent phrases in a row. */
  wasRest: boolean;
}

// ────────────────────────────── Energy ───────────────────────────────────

/**
 * How much processed sound is already in the air.
 *
 * `wet` and `feedback` are read from the bus settings that actually govern
 * them, so they are measurements rather than estimates. `spectralDensity` has
 * no source wired yet and is therefore `null` — a number here would be
 * invented, and Gate G is where the per-move accounting arrives.
 */
export interface EnergyState {
  /** 0..1 — wet signal returning to the mix (return gain × wettest stage). */
  wet: number | null;
  /** 0..1 — how much of the echo's output is being fed back in. */
  feedback: number | null;
  /** 0..1 — how crowded the spectrum is. Null until Gate G measures it. */
  spectralDensity: number | null;
  /** Moves in flight right now — the cheapest honest density signal there is. */
  gesturesInFlight: number;
}

/** The subset of dub-bus settings that determine audible wet energy. */
export interface WetEnergyInputs {
  returnGain: number;
  echoWet: number;
  springWet: number;
  echoIntensity: number;
  extFeedbackGain: number;
}

/**
 * Wet energy from the settings that produce it.
 *
 * `wet` is the return gain scaled by the wettest stage feeding it: with the
 * return closed nothing is audible however wet the stages are, and with the
 * stages dry the return carries nothing. `feedback` combines the echo's own
 * regeneration with the external feedback tap, which is the pair that decides
 * whether a tail rings on or dies.
 */
export function readWetEnergy(
  s: WetEnergyInputs,
  gesturesInFlight: number,
): EnergyState {
  const clamp01 = (v: number) => Math.max(0, Math.min(1, Number.isFinite(v) ? v : 0));
  const wettestStage = Math.max(clamp01(s.echoWet), clamp01(s.springWet));
  return {
    wet: clamp01(s.returnGain) * wettestStage,
    feedback: clamp01(clamp01(s.echoIntensity) + clamp01(s.extFeedbackGain)),
    spectralDensity: null,
    gesturesInFlight: Math.max(0, gesturesInFlight),
  };
}

// ──────────────────────────── Arrangement ────────────────────────────────

/**
 * Where the song is in its own structure.
 *
 * Supplied by the caller rather than read from a store, so this module stays
 * pure. The tracker adapter fills it from the pattern order; a DJ adapter
 * would fill it from the deck's arrangement markers.
 */
export interface ArrangementSnapshot {
  /** Index into the pattern ORDER, not the pattern list. */
  orderIndex: number;
  orderLength: number;
  /** The pattern the order resolves to at `orderIndex`. */
  patternIndex: number;
  /** Rows in the current pattern. */
  patternRows: number;
  /** True on the last entry of the order — a transition is imminent. */
  isLastInOrder: boolean;
  /** True when the next order entry resolves to a different pattern. */
  patternChangesNext: boolean;
}

// ───────────────────────────── The context ───────────────────────────────

export interface PerformanceContext {
  /** Absolute row the transport is on. */
  row: number;
  /** Ticks per row in force — the speed everything else is derived from. */
  ticksPerRow: number;
  bpm: number;
  clockSettings: MusicalClockSettings;
  /** Gate B: bar/beat/phrase, fractional positions, next boundaries. */
  position: MusicalPosition;

  /** Gate C: what is coming, per look-ahead window, nearest first. */
  upcoming: Readonly<Record<LookAheadWindow, readonly MusicalEvent[]>>;
  /** What sounded in the bar just gone, nearest-to-now first. */
  recentEvents: readonly MusicalEvent[];

  /** Gate C: one profile per channel, by channel index. */
  channelProfiles: ReadonlyMap<number, MusicalChannelProfile>;
  arrangement: ArrangementSnapshot | null;

  recentMoves: readonly RecentMove[];
  activeGestures: readonly ActiveGesture[];
  energy: EnergyState;

  currentIntention: Intention;
  currentTarget: IntentionTarget;

  /** Milliseconds since the performer last fired anything. Infinity if never. */
  timeSinceLastActionMs: number;
  /** Rows since the last fire, on the current grid. Infinity if never. */
  rowsSinceLastAction: number;
  phraseHistory: readonly PhraseRecord[];
}

// ───────────────────────────── The memory ────────────────────────────────

const DEFAULT_RECENT_MOVES = 64;
const DEFAULT_PHRASE_HISTORY = 32;

export interface PerformanceMemoryOptions {
  recentMoveCap?: number;
  phraseHistoryCap?: number;
  /** Injectable clock so tests do not depend on wall time. */
  now?: () => number;
}

/** Minimal shape of the two router events this memory listens to. */
export interface RouterFireLike {
  invocationId: string;
  moveId: string;
  channelId?: number;
  row: number;
  timeSec: number;
  source: 'live' | 'lane';
  isHold?: boolean;
}

export interface RouterReleaseLike {
  invocationId: string;
  row: number;
  timeSec: number;
}

/**
 * The mutable half: what the performer remembers.
 *
 * Fed by the router's own fire/release stream, so every surface that can fire
 * a move — including the user's hands — lands here. Nothing in this class
 * decides anything; it only remembers.
 */
export class PerformanceMemory {
  private readonly recentMoveCap: number;
  private readonly phraseHistoryCap: number;
  private readonly now: () => number;

  private readonly gestures = new Map<string, ActiveGesture>();
  private readonly moves: RecentMove[] = [];
  private readonly phrases: PhraseRecord[] = [];

  private lastActionMs = Number.NEGATIVE_INFINITY;
  private lastActionRow: number | null = null;
  private intention: Intention = 'REST';
  private target: IntentionTarget = NO_TARGET;

  /** Phrase currently being accumulated. */
  private openPhrase: { phrase: number; moves: number; liveMoves: number } | null = null;

  constructor(opts: PerformanceMemoryOptions = {}) {
    this.recentMoveCap = opts.recentMoveCap ?? DEFAULT_RECENT_MOVES;
    this.phraseHistoryCap = opts.phraseHistoryCap ?? DEFAULT_PHRASE_HISTORY;
    this.now = opts.now ?? (() => Date.now());
  }

  // ── router stream ──

  noteFire(event: RouterFireLike): void {
    const move: RecentMove = {
      invocationId: event.invocationId,
      moveId: event.moveId,
      channelId: event.channelId,
      row: event.row,
      timeSec: event.timeSec,
      source: event.source,
    };
    this.moves.push(move);
    if (this.moves.length > this.recentMoveCap) this.moves.shift();

    if (event.isHold) {
      this.gestures.set(event.invocationId, {
        invocationId: event.invocationId,
        moveId: event.moveId,
        channelId: event.channelId,
        startedRow: event.row,
        startedTimeSec: event.timeSec,
        source: event.source,
      });
    }

    this.lastActionMs = this.now();
    this.lastActionRow = event.row;
    if (this.openPhrase) {
      this.openPhrase.moves++;
      if (event.source === 'live') this.openPhrase.liveMoves++;
    }
  }

  noteRelease(event: RouterReleaseLike): void {
    this.gestures.delete(event.invocationId);
    // Walk backwards: the matching fire is almost always the most recent one.
    for (let i = this.moves.length - 1; i >= 0; i--) {
      if (this.moves[i].invocationId === event.invocationId) {
        this.moves[i] = {
          ...this.moves[i],
          releasedRow: event.row,
          releasedTimeSec: event.timeSec,
        };
        return;
      }
    }
  }

  /**
   * Advance phrase bookkeeping. Call once per tick with the current position;
   * a phrase closes when the phrase index changes, and a phrase that saw no
   * fires is recorded as a rest — which is the fact Gate E's REST decision
   * needs and cannot reconstruct afterwards.
   */
  observePosition(position: Pick<MusicalPosition, 'phrase'>): void {
    const phrase = Math.floor(position.phrase);
    if (!this.openPhrase) {
      this.openPhrase = { phrase, moves: 0, liveMoves: 0 };
      return;
    }
    if (this.openPhrase.phrase === phrase) return;
    this.closePhrase();
    this.openPhrase = { phrase, moves: 0, liveMoves: 0 };
  }

  private closePhrase(): void {
    const open = this.openPhrase;
    if (!open) return;
    this.phrases.push({
      phrase: open.phrase,
      moves: open.moves,
      liveMoves: open.liveMoves,
      wasRest: open.moves === 0,
    });
    if (this.phrases.length > this.phraseHistoryCap) this.phrases.shift();
  }

  // ── intention (written by Gate E) ──

  setIntention(intention: Intention, target: IntentionTarget = NO_TARGET): void {
    this.intention = intention;
    this.target = target;
  }

  getIntention(): Intention { return this.intention; }
  getTarget(): IntentionTarget { return this.target; }

  // ── reads ──

  getActiveGestures(): readonly ActiveGesture[] {
    return Array.from(this.gestures.values());
  }

  getRecentMoves(): readonly RecentMove[] {
    return this.moves.slice();
  }

  getPhraseHistory(): readonly PhraseRecord[] {
    return this.phrases.slice();
  }

  msSinceLastAction(): number {
    if (!Number.isFinite(this.lastActionMs)) return Number.POSITIVE_INFINITY;
    return Math.max(0, this.now() - this.lastActionMs);
  }

  rowsSinceLastAction(currentRow: number): number {
    if (this.lastActionRow === null) return Number.POSITIVE_INFINITY;
    return Math.max(0, currentRow - this.lastActionRow);
  }

  /**
   * Transport stop or a seek. Gestures in flight are no longer in flight —
   * their disposers ran or never will — and row-relative memory is
   * meaningless across a jump, so it is dropped rather than left to report a
   * negative or enormous distance. Phrase history and move history survive:
   * what the performer did is still what it did.
   */
  reset(): void {
    this.gestures.clear();
    this.lastActionRow = null;
    this.closePhrase();
    this.openPhrase = null;
  }

  /** Full wipe — a new song, not a seek. */
  clear(): void {
    this.gestures.clear();
    this.moves.length = 0;
    this.phrases.length = 0;
    this.openPhrase = null;
    this.lastActionMs = Number.NEGATIVE_INFINITY;
    this.lastActionRow = null;
    this.intention = 'REST';
    this.target = NO_TARGET;
  }
}

// ──────────────────────────── The assembly ───────────────────────────────

const ALL_WINDOWS: readonly LookAheadWindow[] = ['1/16', '1/8', '1/4', 'beat', 'bar', 'phrase'];

export interface PerformanceContextInputs {
  row: number;
  ticksPerRow: number;
  bpm: number;
  clockSettings?: Partial<MusicalClockSettings>;
  /** Gate C event sources, one per channel. */
  sources: readonly ChannelEventSource[];
  channelProfiles?: ReadonlyMap<number, MusicalChannelProfile>;
  arrangement?: ArrangementSnapshot | null;
  energy: EnergyState;
}

/**
 * Assemble the snapshot. Pure: same inputs, same output, no clock reads
 * beyond the memory's own `msSinceLastAction`.
 */
export function buildPerformanceContext(
  memory: PerformanceMemory,
  inputs: PerformanceContextInputs,
): PerformanceContext {
  const settings: MusicalClockSettings = {
    meter: { ...DEFAULT_MUSICAL_CLOCK_SETTINGS.meter, ...inputs.clockSettings?.meter },
    phraseBars: inputs.clockSettings?.phraseBars ?? DEFAULT_MUSICAL_CLOCK_SETTINGS.phraseBars,
  };
  const position = computeMusicalPosition(inputs.row, inputs.ticksPerRow, settings);

  const upcoming = {} as Record<LookAheadWindow, readonly MusicalEvent[]>;
  for (const window of ALL_WINDOWS) {
    upcoming[window] = eventsInWindow(inputs.sources, inputs.row, window, inputs.ticksPerRow, settings);
  }

  // The bar just gone, nearest-to-now first. Half-open the other way round
  // from the look-ahead — the row the transport is ON is now, not past — so
  // an event is never both recent and upcoming.
  const barRows = rowsForWindow('bar', inputs.ticksPerRow, settings);
  const recentEvents: MusicalEvent[] = [];
  for (const source of inputs.sources) {
    for (const onset of source.onsets) {
      if (onset.row < inputs.row && onset.row >= inputs.row - barRows) {
        recentEvents.push({
          row: onset.row,
          channel: source.channel,
          note: onset.note,
          strength: onset.strength ?? 1,
          profile: source.profile,
        });
      }
    }
  }
  recentEvents.sort((a, b) => b.row - a.row);

  return Object.freeze({
    row: inputs.row,
    ticksPerRow: inputs.ticksPerRow,
    bpm: inputs.bpm,
    clockSettings: settings,
    position,
    upcoming,
    recentEvents,
    channelProfiles: inputs.channelProfiles ?? new Map<number, MusicalChannelProfile>(),
    arrangement: inputs.arrangement ?? null,
    recentMoves: memory.getRecentMoves(),
    activeGestures: memory.getActiveGestures(),
    energy: inputs.energy,
    currentIntention: memory.getIntention(),
    currentTarget: memory.getTarget(),
    timeSinceLastActionMs: memory.msSinceLastAction(),
    rowsSinceLastAction: memory.rowsSinceLastAction(inputs.row),
    phraseHistory: memory.getPhraseHistory(),
  });
}

// ───────────────────────── Convenience readers ───────────────────────────

/** Is a given move already in flight (optionally on a given channel)? */
export function isGestureActive(
  ctx: PerformanceContext,
  moveId: string,
  channelId?: number,
): boolean {
  return ctx.activeGestures.some(
    g => g.moveId === moveId && (channelId === undefined || g.channelId === channelId),
  );
}

/** How many times a move fired within the last `rows` rows. */
export function movesFiredWithin(
  ctx: PerformanceContext,
  rows: number,
  moveId?: string,
): number {
  const floor = ctx.row - rows;
  return ctx.recentMoves.filter(
    m => m.row > floor && m.row <= ctx.row && (moveId === undefined || m.moveId === moveId),
  ).length;
}

/** The phrase just closed, or null before the first one turns over. */
export function lastPhrase(ctx: PerformanceContext): PhraseRecord | null {
  return ctx.phraseHistory.length > 0 ? ctx.phraseHistory[ctx.phraseHistory.length - 1] : null;
}
