/**
 * Dub move shared types.
 *
 * Every move (echoThrow today; dubStab, channelMute, filterDrop, … in later
 * phases) implements `DubMove` and executes as a pure function over the
 * context. Same function fires for live UI, keyboard, MIDI CC, and lane
 * playback — single code path per move, no drift between surfaces.
 */

import type { DubBus } from '../DubBus';
import type { DeckId } from '../../dj/DeckEngine';

export interface DubMoveContext {
  bus: DubBus;
  /** Target tracker channel (0-based). Undefined for global moves. */
  channelId?: number;
  /**
   * Originating DJ deck, when the fire came from a DJ-context pad / MIDI
   * route. Used by moves that call `bus.openChannelTap(ch, amt, atk, {
   * deckId })` to route through the deck-scoped tap instead of the
   * tracker-view global channel tap. Undefined for tracker-view moves.
   */
  deckId?: DeckId;
  /** Merged params — move defaults overridden by anything the caller passed. */
  params: Record<string, number>;
  /** Current transport BPM — used to convert beat-based params (throwBeats) to ms. */
  bpm: number;
  /** 'live' = user performing; 'lane' = DubLanePlayer firing a recorded event. */
  source: 'live' | 'lane';
}

/**
 * What a fired move hands back.
 *
 * `update` is optional and deliberately rare. A move offers it only when one
 * of its parameters can meaningfully MOVE while the move is held — a filter
 * frequency, not a delay preset — and offering it is what lets a gesture trace
 * a `ramp` or `sweep` over the hold (Gate F4). A move without it is held
 * plainly, and the gesture says so rather than pretending.
 */
export interface DubMoveHandle {
  dispose(): void;
  update?(params: Record<string, number>): void;
}

export interface DubMove {
  id: string;
  kind: 'trigger' | 'hold' | 'continuous';
  defaults: Record<string, number>;
  /**
   * Fire the move. Returns a handle for hold-style moves (caller disposes it on
   * release) or null for pure one-shots that run their own timeline. Trigger-
   * with-tail moves (like echoThrow) return a handle whose dispose the router
   * can call on panic to bail out mid-flight.
   */
  execute(ctx: DubMoveContext): DubMoveHandle | null;
}
