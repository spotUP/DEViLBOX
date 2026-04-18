/**
 * DubActions — King Tubby-style dub moves driven by drumpads.
 *
 * Each entry maps a `DubActionId` to a pair of hooks:
 *
 *   engage(engine, settings, bpm): release | null
 *     Invoked on pad press. Returns a release function that the pad's
 *     release handler will call, OR null if the action is a one-shot
 *     that runs its own timeline and doesn't need a release call.
 *
 * The engine exposes the low-level API (openDeckTap / throwDeck / muteAndDub /
 * setSirenFeedback / filterDrop). These handlers just glue the `DubActionId`
 * enum to the appropriate engine method + the bus settings that control
 * intensity / duration.
 *
 * The DJ mixer must be attached to the engine (via `attachDJMixer`) for
 * deck-source actions to do anything; otherwise the engine no-ops. This keeps
 * the actions safe to assign when running outside the DJ view.
 */

import type { DrumPadEngine } from './DrumPadEngine';
import type { DubActionId, DubBusSettings } from '@/types/drumpad';
import type { DeckId } from '../dj/DeckEngine';
import { useDJStore } from '@/stores/useDJStore';

type Engage = (
  engine: DrumPadEngine,
  settings: DubBusSettings,
  bpm: number,
) => (() => void) | null;

/**
 * Resolve "the active deck" at the moment a dub pad is hit.
 *
 * Combines three signals to decide which deck is currently loudest in the
 * main mix:
 *   1. Is the deck playing at all? (non-playing decks never selected)
 *   2. Crossfader position — A is suppressed when fader is far-right, B
 *      when far-left; C bypasses the crossfader entirely.
 *   3. Channel volume — even if the crossfader favors A, if A's fader is
 *      down to 30% and B is at 80%, B is still louder.
 *
 * Returns null if no decks are playing. Falls back to the deck with the
 * highest effective volume when multiple are audible simultaneously.
 */
function resolveActiveDeck(): DeckId | null {
  const state = useDJStore.getState();
  const x = state.crossfaderPosition;
  const decks = state.decks;

  // Constant-power crossfader coefficients (matches the mixer's 'smooth' curve)
  const gainA = Math.cos(x * Math.PI * 0.5);
  const gainB = Math.sin(x * Math.PI * 0.5);

  const candidates: { deck: DeckId; volume: number }[] = [];
  if (decks.A.isPlaying && gainA > 0.05) {
    candidates.push({ deck: 'A', volume: decks.A.volume * gainA });
  }
  if (decks.B.isPlaying && gainB > 0.05) {
    candidates.push({ deck: 'B', volume: decks.B.volume * gainB });
  }
  // Deck C bypasses the crossfader — it's in the mix whenever playing.
  if (decks.C.isPlaying) {
    candidates.push({ deck: 'C', volume: decks.C.volume });
  }

  if (candidates.length === 0) return null;
  // Pick the loudest effective-volume deck; if tied, alphabetic order is fine
  // because the user sees a deterministic result they can learn to predict.
  candidates.sort((a, b) => b.volume - a.volume || a.deck.localeCompare(b.deck));
  return candidates[0].deck;
}

type DubActionHandler = {
  /** Human-readable label for the context menu. */
  label: string;
  /** Grouping for the menu (all entries share 'Sound System' root). */
  group: 'Throw' | 'Hold' | 'Mute & Dub' | 'FX';
  /** Is this a oneshot (no release needed) or a hold (release matters). */
  kind: 'oneshot' | 'hold';
  engage: Engage;
};

function deckFromAction(a: DubActionId): DeckId | 'ALL' | null {
  if (a.endsWith('_a')) return 'A';
  if (a.endsWith('_b')) return 'B';
  if (a.endsWith('_c')) return 'C';
  if (a.endsWith('_all')) return 'ALL';
  return null;
}

function secPerBeat(bpm: number): number {
  const safe = Math.max(30, Math.min(300, bpm || 120));
  return 60 / safe;
}

export const DUB_ACTION_HANDLERS: Record<DubActionId, DubActionHandler> = {
  // ── Auto-select: resolve the active deck at press time, then throw/hold/mute.
  //    These are the primary pads for live use — one button per gesture,
  //    follows the DJ's crossfader moves automatically.
  dub_throw: {
    label: 'Throw (active deck)',
    group: 'Throw',
    kind: 'oneshot',
    engage: (engine, s, bpm) => {
      const deck = resolveActiveDeck();
      if (!deck) return null;
      engine.throwDeck(deck, s.deckTapAmount, secPerBeat(bpm) * s.throwBeats, 0.25);
      return null;
    },
  },
  dub_hold: {
    label: 'Hold (active deck)',
    group: 'Hold',
    kind: 'hold',
    engage: (engine, s) => {
      const deck = resolveActiveDeck();
      if (!deck) return null;
      return engine.openDeckTap(deck, s.deckTapAmount, 0.005, 0.3);
    },
  },
  dub_mute: {
    label: 'Mute & Dub (active deck)',
    group: 'Mute & Dub',
    kind: 'hold',
    engage: (engine, s) => {
      const deck = resolveActiveDeck();
      if (!deck) return null;
      return engine.muteAndDub(deck, s.deckTapAmount, 0.35);
    },
  },
  dub_slap_back: {
    label: 'Slap Back (short)',
    group: 'Throw',
    kind: 'oneshot',
    engage: (engine, s, bpm) => {
      const deck = resolveActiveDeck();
      if (!deck) return null;
      // Very short grab + short release — one quick echo, no lingering tail.
      engine.throwDeck(deck, s.deckTapAmount, secPerBeat(bpm) * 0.125, 0.12);
      return null;
    },
  },
  dub_throw_short: {
    label: 'Throw (short, 1/4 beat)',
    group: 'Throw',
    kind: 'oneshot',
    engage: (engine, s, bpm) => {
      const deck = resolveActiveDeck();
      if (!deck) return null;
      engine.throwDeck(deck, s.deckTapAmount, secPerBeat(bpm) * 0.25, 0.2);
      return null;
    },
  },
  dub_throw_long: {
    label: 'Throw (long, 2 beats)',
    group: 'Throw',
    kind: 'oneshot',
    engage: (engine, s, bpm) => {
      const deck = resolveActiveDeck();
      if (!deck) return null;
      // Grabs a whole half-bar of audio — good for capturing a vocal
      // phrase or melodic hook and echoing it out over the next couple of bars.
      // Longer release (0.4s) so the tail breathes instead of choking off.
      engine.throwDeck(deck, s.deckTapAmount, secPerBeat(bpm) * 2, 0.4);
      return null;
    },
  },
  dub_combo_drop: {
    label: 'Combo Drop (mute + filter)',
    group: 'Mute & Dub',
    kind: 'hold',
    engage: (engine, s) => {
      const deck = resolveActiveDeck();
      if (!deck) return null;
      // The classic "drop": mute+dub takes the dry deck out, filter drop
      // simultaneously muffles the dub return — then the filter opens back
      // up on release while the deck fades in. Everything bundled in one pad.
      const unmute = engine.muteAndDub(deck, s.deckTapAmount, 0.35);
      const unfilter = engine.filterDrop(s.filterDropHz, 0.3, 0.5);
      return () => { unmute(); unfilter(); };
    },
  },

  // ── Explicit per-deck throws (power-user pads) ──
  dub_throw_a: {
    label: 'Throw Deck A',
    group: 'Throw',
    kind: 'oneshot',
    engage: (engine, s, bpm) => {
      engine.throwDeck('A', s.deckTapAmount, secPerBeat(bpm) * s.throwBeats, 0.25);
      return null;
    },
  },
  dub_throw_b: {
    label: 'Throw Deck B',
    group: 'Throw',
    kind: 'oneshot',
    engage: (engine, s, bpm) => {
      engine.throwDeck('B', s.deckTapAmount, secPerBeat(bpm) * s.throwBeats, 0.25);
      return null;
    },
  },
  dub_throw_c: {
    label: 'Throw Deck C',
    group: 'Throw',
    kind: 'oneshot',
    engage: (engine, s, bpm) => {
      engine.throwDeck('C', s.deckTapAmount, secPerBeat(bpm) * s.throwBeats, 0.25);
      return null;
    },
  },
  dub_throw_all: {
    label: 'Throw All Decks',
    group: 'Throw',
    kind: 'oneshot',
    engage: (engine, s, bpm) => {
      engine.throwDeck('ALL', s.deckTapAmount, secPerBeat(bpm) * s.throwBeats, 0.25);
      return null;
    },
  },

  // ── Holds — tap open while held. Longer captures. ──
  dub_hold_a: {
    label: 'Hold Deck A',
    group: 'Hold',
    kind: 'hold',
    engage: (engine, s) => engine.openDeckTap('A', s.deckTapAmount, 0.005, 0.3),
  },
  dub_hold_b: {
    label: 'Hold Deck B',
    group: 'Hold',
    kind: 'hold',
    engage: (engine, s) => engine.openDeckTap('B', s.deckTapAmount, 0.005, 0.3),
  },
  dub_hold_c: {
    label: 'Hold Deck C',
    group: 'Hold',
    kind: 'hold',
    engage: (engine, s) => engine.openDeckTap('C', s.deckTapAmount, 0.005, 0.3),
  },
  dub_hold_all: {
    label: 'Hold All Decks',
    group: 'Hold',
    kind: 'hold',
    engage: (engine, s) => engine.openDeckTap('ALL', s.deckTapAmount, 0.005, 0.3),
  },

  // ── Mute & Dub — dry deck drops, echo tail plays through. ──
  dub_mute_a: {
    label: 'Mute & Dub: Deck A',
    group: 'Mute & Dub',
    kind: 'hold',
    engage: (engine, s) => engine.muteAndDub('A', s.deckTapAmount, 0.35),
  },
  dub_mute_b: {
    label: 'Mute & Dub: Deck B',
    group: 'Mute & Dub',
    kind: 'hold',
    engage: (engine, s) => engine.muteAndDub('B', s.deckTapAmount, 0.35),
  },
  dub_mute_c: {
    label: 'Mute & Dub: Deck C',
    group: 'Mute & Dub',
    kind: 'hold',
    engage: (engine, s) => engine.muteAndDub('C', s.deckTapAmount, 0.35),
  },
  dub_mute_all: {
    label: 'Mute & Dub All (broadcast)',
    group: 'Mute & Dub',
    kind: 'hold',
    engage: (engine, s) => {
      // Mute every playing deck simultaneously — the full-mix "drop". Only
      // the echo tail is audible for the duration of the hold. Loops over
      // A/B/C and tracks per-deck releasers so release restores each deck
      // independently (important for Deck C which bypasses the crossfader).
      const state = useDJStore.getState();
      const releasers: (() => void)[] = [];
      for (const deck of ['A', 'B', 'C'] as const) {
        if (state.decks[deck].isPlaying) {
          releasers.push(engine.muteAndDub(deck, s.deckTapAmount, 0.35));
        }
      }
      if (releasers.length === 0) return null;
      return () => releasers.forEach((r) => { try { r(); } catch { /* ok */ } });
    },
  },

  // ── FX — bus-only actions (don't need a deck source). ──
  dub_siren: {
    label: 'Siren (feedback ramp)',
    group: 'FX',
    kind: 'hold',
    engage: (engine, s) => engine.setSirenFeedback(s.sirenFeedback, 0.08),
  },
  dub_filter_drop: {
    label: 'Filter Drop',
    group: 'FX',
    kind: 'hold',
    engage: (engine, s) => engine.filterDrop(s.filterDropHz, 0.4, 0.6),
  },
};

export function getDubActionLabel(id: DubActionId): string {
  return DUB_ACTION_HANDLERS[id]?.label ?? id;
}

/** Intended deck for a dub action, for UI purposes (e.g. coloring pads). */
export function getDubActionDeck(id: DubActionId): DeckId | 'ALL' | null {
  return deckFromAction(id);
}

/** All dub actions grouped by their menu group, in display order. */
export function getDubActionsByGroup(): Record<DubActionHandler['group'], DubActionId[]> {
  const groups: Record<DubActionHandler['group'], DubActionId[]> = {
    Throw: [], Hold: [], 'Mute & Dub': [], FX: [],
  };
  for (const id of Object.keys(DUB_ACTION_HANDLERS) as DubActionId[]) {
    groups[DUB_ACTION_HANDLERS[id].group].push(id);
  }
  return groups;
}
