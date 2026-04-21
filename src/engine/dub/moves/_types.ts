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

export interface DubMove {
  id: string;
  kind: 'trigger' | 'hold' | 'continuous';
  defaults: Record<string, number>;
  /**
   * Fire the move. Returns a disposer for hold-style moves (caller calls it on
   * release) or null for pure one-shots that run their own timeline. Trigger-
   * with-tail moves (like echoThrow) return a disposer that the router can
   * call on panic to bail out mid-flight.
   */
  execute(ctx: DubMoveContext): { dispose(): void } | null;
}
