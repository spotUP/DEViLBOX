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

type Engage = (
  engine: DrumPadEngine,
  settings: DubBusSettings,
  bpm: number,
) => (() => void) | null;

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
  // ── Throws — momentary one-shots. Press grabs audio, decays on its own. ──
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
