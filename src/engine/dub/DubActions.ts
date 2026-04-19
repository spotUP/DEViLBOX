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

import type { DrumPadEngine } from '../drumpad/DrumPadEngine';
import type { DubActionId, DubBusSettings } from '@/types/dub';
import type { DeckId } from '../dj/DeckEngine';
import { useDJStore } from '@/stores/useDJStore';
import { onNextDownbeat, getPhaseInfo } from '../dj/DJAutoSync';
import { useTransportStore } from '@/stores/useTransportStore';

/**
 * Pending-quantized-throw cancel functions. Registered here so
 * `engine.dubPanic()` can clear them via `clearAllPendingThrows()`. Holds
 * cancels for BOTH setTimeout-based throws (tracked/fallback paths) AND
 * beat-grid-scheduled throws via `onNextDownbeat` — whose internal timer
 * lives inside DJAutoSync and is only reachable through the returned
 * cancel fn. Without registering both, bar-quantized throws would escape
 * panic and still fire after the bus was killed.
 */
const _pendingThrowCancels = new Set<() => void>();

/** Called by DrumPadEngine.dubPanic() to cancel every in-flight throw. */
export function clearAllPendingThrows(): void {
  // Snapshot before iterating — each cancel removes itself from the set.
  const snapshot = Array.from(_pendingThrowCancels);
  _pendingThrowCancels.clear();
  for (const cancel of snapshot) {
    try { cancel(); } catch { /* ok */ }
  }
}

/**
 * Register a cancel fn so `clearAllPendingThrows` can invoke it, and
 * return a wrapped cancel that also removes itself from the set on call.
 * Use this for ANY scheduling primitive whose cancel we want panic to hit.
 */
function trackCancel(cancel: () => void): () => void {
  const wrapped = () => {
    _pendingThrowCancels.delete(wrapped);
    cancel();
  };
  _pendingThrowCancels.add(wrapped);
  return wrapped;
}

function trackedSetTimeout(fn: () => void, delayMs: number): () => void {
  let cleared = false;
  const t = setTimeout(() => {
    if (cleared) return;
    cleared = true;
    _pendingThrowCancels.delete(wrapped);
    fn();
  }, delayMs);
  const wrapped = () => {
    if (cleared) return;
    cleared = true;
    _pendingThrowCancels.delete(wrapped);
    clearTimeout(t);
  };
  _pendingThrowCancels.add(wrapped);
  return wrapped;
}

/**
 * BPM-sync the echo rate to a note division. Returns the delay time in ms
 * such that echo repeats land on the selected subdivision boundary of the
 * current tempo. 'off' means "use the user's slider value unchanged".
 *
 * Division math:
 *   1/4  = one beat            → 60000 / bpm
 *   1/8  = half a beat         → 30000 / bpm
 *   1/8D = dotted eighth       → 45000 / bpm  (classic dub skank delay)
 *   1/16 = quarter of a beat   → 15000 / bpm
 *   1/2  = two beats           → 120000 / bpm
 */
export function bpmSyncedEchoRate(
  bpm: number,
  division: DubBusSettings['echoSyncDivision'],
  fallbackMs: number,
): number {
  if (division === 'off') return fallbackMs;
  const safeBpm = Math.max(30, Math.min(300, bpm || 120));
  const beatMs = 60000 / safeBpm;
  switch (division) {
    case '1/4':  return beatMs;
    case '1/8':  return beatMs * 0.5;
    case '1/8D': return beatMs * 0.75;
    case '1/16': return beatMs * 0.25;
    case '1/2':  return beatMs * 2;
    default:     return fallbackMs;
  }
}

/**
 * Resolve the most musically-relevant BPM for dub sync. In DJ view the
 * "tracker" transport BPM may differ wildly from the currently-playing
 * deck — syncing echoes to 120 while a 140 BPM track spins would sound
 * terrible. Priority:
 *   1. The loudest audible deck's analysis BPM (beatGrid.bpm)
 *   2. That deck's detectedBPM fallback
 *   3. The transport BPM (tracker view / no decks playing)
 *   4. Default 120
 */
export function getActiveBpm(): number {
  try {
    const state = useDJStore.getState();
    const x = state.crossfaderPosition;
    const gainA = Math.cos(x * Math.PI * 0.5);
    const gainB = Math.sin(x * Math.PI * 0.5);
    const candidates: { bpm: number; volume: number }[] = [];
    if (state.decks.A.isPlaying && gainA > 0.05) {
      const bpm = state.decks.A.beatGrid?.bpm || state.decks.A.detectedBPM;
      if (bpm > 0) candidates.push({ bpm, volume: state.decks.A.volume * gainA });
    }
    if (state.decks.B.isPlaying && gainB > 0.05) {
      const bpm = state.decks.B.beatGrid?.bpm || state.decks.B.detectedBPM;
      if (bpm > 0) candidates.push({ bpm, volume: state.decks.B.volume * gainB });
    }
    if (state.decks.C.isPlaying) {
      const bpm = state.decks.C.beatGrid?.bpm || state.decks.C.detectedBPM;
      if (bpm > 0) candidates.push({ bpm, volume: state.decks.C.volume });
    }
    if (candidates.length) {
      candidates.sort((a, b) => b.volume - a.volume);
      return candidates[0].bpm;
    }
  } catch { /* DJ store not available */ }
  try {
    return useTransportStore.getState().bpm || 120;
  } catch { return 120; }
}

/**
 * Compute seconds until the next beat-subdivision boundary for the given
 * deck, given a pre-computed phase info. Returns `null` when no beat grid
 * is available. Accepts phaseInfo as a parameter so callers that make
 * multiple decisions in one press (e.g. picking the 1/16 target + then
 * computing time to it) only pay one Zustand/phase-compute cost.
 *
 * `phaseTarget` = position within the beat cycle (0 = on beat, 0.5 = "and",
 * 0.25 = 1/16). If the user is already AT the target (or within a 20 ms
 * window), returns 0 so the throw fires immediately instead of waiting a
 * full beat — otherwise well-timed presses feel broken.
 */
function timeToNextPhase(
  deckId: DeckId,
  phaseTarget: number,
  cachedPhase?: ReturnType<typeof getPhaseInfo>,
): number | null {
  const phase = cachedPhase ?? getPhaseInfo(deckId);
  const state = useDJStore.getState().decks[deckId];
  if (!phase || !state.beatGrid || state.beatGrid.bpm <= 0) return null;
  const beatPeriod = 60 / state.beatGrid.bpm;
  let delta = phaseTarget - phase.beatPhase;
  if (delta <= 0) delta += 1;
  // Near-target shortcut: user hit the pad on the boundary (within ~20 ms).
  // Fire immediately instead of waiting a full beat — otherwise quantize
  // makes precisely-timed live hits feel sluggish.
  const nearSec = 0.020;
  if (delta * beatPeriod < nearSec || (1 - delta) * beatPeriod < nearSec) return 0;
  return beatPeriod * delta;
}

/**
 * Quantize a dub-throw engage to the next beat-subdivision boundary.
 * Returns a cancel function (stop the scheduled fire mid-flight).
 *
 * Priority: deck beat-grid → Tone.Transport → fire now. In practice the
 * beat-grid path is what matters during a live set; Transport fallback
 * covers the "bus enabled but no decks loaded" edge case.
 */
function scheduleQuantizedThrow(
  deck: DeckId | null,
  quantize: DubBusSettings['throwQuantize'],
  fire: () => void,
): (() => void) | null {
  // Fire-inline paths return `null` so callers (`dub_throw*.engage`) don't
  // register a no-op releaser in `_dubReleasers` — a pad release would
  // then call a no-op, then delete the entry. Not broken, just churn.
  if (quantize === 'off') { fire(); return null; }

  if (deck) {
    if (quantize === 'bar') {
      // onNextDownbeat uses its own internal setTimeout that we can only
      // cancel via the returned fn — register with the panic-visible set.
      return trackCancel(onNextDownbeat(deck, fire));
    }
    // Cache phase once — we need it for the 1/16 target picker AND the time
    // computation; recomputing it twice per press is pure waste.
    const phase = getPhaseInfo(deck);
    // Pick the phase target within the beat cycle:
    //   '1/8'     = next half-beat boundary (0.5)
    //   'offbeat' = next "&" between beats   (0.5)
    //   '1/16'    = next 1/4-beat grid point — the lowest-fraction boundary
    //               STRICTLY GREATER than the current phase. Falls back to
    //               0 (which wraps to the next beat) if we're past 0.75.
    let phaseTarget: number;
    if (quantize === 'offbeat' || quantize === '1/8') {
      phaseTarget = 0.5;
    } else {
      // '1/16' — choose the next 0 / 0.25 / 0.5 / 0.75 boundary.
      const current = phase?.beatPhase ?? 0;
      phaseTarget = [0.25, 0.5, 0.75].find((p) => p > current) ?? 0;
    }
    const untilSec = timeToNextPhase(deck, phaseTarget, phase);
    if (untilSec == null) {
      // No beat grid yet — fire immediately rather than eat the press
      fire();
      return null;
    }
    if (untilSec === 0) { fire(); return null; }
    return trackedSetTimeout(fire, Math.max(0, untilSec * 1000 - 5 /* -5ms safety */));
  }

  // No active deck / beat grid — can't quantize against music. Fall back
  // to the transport BPM with a plain setTimeout. The previous Tone.Draw
  // + Transport.scheduleOnce approach was broken: Tone.Draw is for visual
  // callbacks (rAF-aligned, wrong for audio timing), and scheduleOnce
  // silently swallows the callback when Transport isn't running (which is
  // the common case in DJ view).
  try {
    const bpm = useTransportStore.getState().bpm || 120;
    const beatMs = 60000 / Math.max(30, Math.min(300, bpm));
    const delayMs =
      quantize === 'bar'                      ? beatMs * 4     // full bar (4/4)
      : quantize === '1/8' || quantize === 'offbeat' ? beatMs * 0.5
      : /* '1/16' */                            beatMs * 0.25;
    return trackedSetTimeout(fire, delayMs);
  } catch {
    fire();
    return null;
  }
}

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
    // Technically a fire-and-forget throw, but we declare `hold` so the
    // pad-release path picks up the cancel fn from `_dubReleasers` and can
    // abort a pending quantized throw (e.g. user taps 'bar'-quantized pad,
    // releases it, doesn't want the throw 3 seconds later). The fire itself
    // is instantaneous — there's no audible "hold" behavior from the user's
    // perspective, just the ability to cancel a scheduled throw.
    kind: 'hold',
    engage: (engine, s, bpm) => {
      const deck = resolveActiveDeck();
      if (!deck) return null;
      return scheduleQuantizedThrow(deck, s.throwQuantize, () => {
        engine.throwDeck(deck, s.deckTapAmount, secPerBeat(bpm) * s.throwBeats, 0.25);
      });
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
    kind: 'hold',  // see dub_throw for why throws are 'hold' — cancellable quantize
    engage: (engine, s, bpm) => {
      const deck = resolveActiveDeck();
      if (!deck) return null;
      return scheduleQuantizedThrow(deck, s.throwQuantize, () => {
        engine.throwDeck(deck, s.deckTapAmount, secPerBeat(bpm) * 0.125, 0.12);
      });
    },
  },
  dub_throw_short: {
    label: 'Throw (short, 1/4 beat)',
    group: 'Throw',
    kind: 'hold',
    engage: (engine, s, bpm) => {
      const deck = resolveActiveDeck();
      if (!deck) return null;
      return scheduleQuantizedThrow(deck, s.throwQuantize, () => {
        engine.throwDeck(deck, s.deckTapAmount, secPerBeat(bpm) * 0.25, 0.2);
      });
    },
  },
  dub_throw_long: {
    label: 'Throw (long, 2 beats)',
    group: 'Throw',
    kind: 'hold',
    engage: (engine, s, bpm) => {
      const deck = resolveActiveDeck();
      if (!deck) return null;
      return scheduleQuantizedThrow(deck, s.throwQuantize, () => {
        engine.throwDeck(deck, s.deckTapAmount, secPerBeat(bpm) * 2, 0.4);
      });
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
      // up on release while the deck fades in. Release times aligned so
      // dry-deck fade-in (0.5 s) and LPF open (0.5 s) finish together; no
      // window where the deck is back at full volume while the return
      // still sits muffled.
      const releaseSec = 0.5;
      const unmute = engine.muteAndDub(deck, s.deckTapAmount, releaseSec);
      const unfilter = engine.filterDrop(s.filterDropHz, 0.3, releaseSec);
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
    kind: 'hold',
    engage: (engine, s, bpm) => {
      // Broadcast throw quantizes against the currently-loudest deck so the
      // grab boundary aligns with the audible groove.
      const refDeck = resolveActiveDeck();
      return scheduleQuantizedThrow(refDeck, s.throwQuantize, () => {
        engine.throwDeck('ALL', s.deckTapAmount, secPerBeat(bpm) * s.throwBeats, 0.25);
      });
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
    engage: (engine, s) => {
      // Filter drop opens the active deck tap so the LPF sweep has content
      // to filter. Dry deck continues in parallel (use dub_combo_drop to
      // mute dry too).
      //
      // Release timing: the LPF needs 0.6 s to re-open to 20 kHz; the deck
      // tap must stay OPEN for that full window, otherwise the last portion
      // of the filter sweep runs against silence (audible as "filter opens
      // into nothing"). Tap releaseSec = filter upSec + 0.1 s buffer.
      const deck = resolveActiveDeck();
      const upSec = 0.6;
      const closeTap = deck ? engine.openDeckTap(deck, s.deckTapAmount, 0.01, upSec + 0.1) : null;
      const unfilter = engine.filterDrop(s.filterDropHz, 0.4, upSec);
      return () => {
        try { closeTap?.(); } catch { /* ok */ }
        try { unfilter(); } catch { /* ok */ }
      };
    },
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
