/**
 * DJ Scratch Commands - Keyboard handlers for scratch routines and fader LFO.
 *
 * These work in the 'global' context so they fire from any sequencer view
 * (tracker, arrangement, DJ) when in DJ mode with a deck active.
 *
 * Active deck is determined by the last-touched deck (store.activeScratchDeck),
 * defaulting to Deck A. Commands toggle the pattern on/off like the UI buttons.
 */

import { getDJEngine } from '@engine/dj/DJEngine';
import { useDJStore } from '@stores/useDJStore';
import { useUIStore } from '@stores/useUIStore';
import { SCRATCH_PATTERNS } from '@engine/dj/DJScratchEngine';

type DeckId = 'A' | 'B' | 'C';
type FaderLFODivision = '1/4' | '1/8' | '1/16' | '1/32';

/** Returns whichever deck is currently playing, preferring A > B > C. */
function getActiveDeck(): DeckId {
  const { decks } = useDJStore.getState();
  if (decks.B.isPlaying && !decks.A.isPlaying) return 'B';
  if (decks.C.isPlaying && !decks.A.isPlaying && !decks.B.isPlaying) return 'C';
  return 'A';
}

function triggerPattern(patternName: string): boolean {
  const deckId = getActiveDeck();
  const store = useDJStore.getState();
  const current = store.decks[deckId].activePatternName;

  try {
    const deck = getDJEngine().getDeck(deckId);

    // Same pattern running → stop it
    if (current === patternName) {
      deck.stopPattern();
      store.setDeckPattern(deckId, null);
      useUIStore.getState().setStatusMessage(`Scratch: stopped`, false, 800);
      return true;
    }

    // Different pattern already running → ignore
    if (current !== null) {
      return true;
    }

    // Nothing running → start
    let quantizeWaitMs = 0;
    deck.playPattern(patternName, (waitMs) => {
      quantizeWaitMs = waitMs;
      setTimeout(() => store.setDeckPattern(deckId, patternName), waitMs);
      useUIStore.getState().setStatusMessage(`Scratch: ${patternName} (waiting…)`, false, waitMs + 200);
    });
    if (quantizeWaitMs === 0) {
      store.setDeckPattern(deckId, patternName);
      useUIStore.getState().setStatusMessage(`Scratch: ${patternName}`, false, 1200);
    }
  } catch {
    useUIStore.getState().setStatusMessage('DJ engine not active', false, 1000);
  }
  return true;
}

function triggerFaderLFO(division: FaderLFODivision | null): boolean {
  const deckId = getActiveDeck();
  const store = useDJStore.getState();

  try {
    const deck = getDJEngine().getDeck(deckId);
    const { faderLFOActive, faderLFODivision } = store.decks[deckId];

    if (division === null || (faderLFOActive && faderLFODivision === division)) {
      deck.stopFaderLFO();
      store.setDeckFaderLFO(deckId, false);
      useUIStore.getState().setStatusMessage('Fader LFO: OFF', false, 800);
    } else {
      deck.startFaderLFO(division);
      store.setDeckFaderLFO(deckId, true, division);
      useUIStore.getState().setStatusMessage(`Fader LFO: ${division}`, false, 1000);
    }
  } catch {
    useUIStore.getState().setStatusMessage('DJ engine not active', false, 1000);
  }
  return true;
}

// ── Pattern commands ──────────────────────────────────────────────────────────
export function djScratchBaby():  boolean { return triggerPattern(SCRATCH_PATTERNS[0].name); }
export function djScratchTrans(): boolean { return triggerPattern(SCRATCH_PATTERNS[1].name); }
export function djScratchFlare(): boolean { return triggerPattern(SCRATCH_PATTERNS[2].name); }
export function djScratchHydro(): boolean { return triggerPattern(SCRATCH_PATTERNS[3].name); }
export function djScratchCrab():  boolean { return triggerPattern(SCRATCH_PATTERNS[4].name); }
export function djScratchOrbit(): boolean { return triggerPattern(SCRATCH_PATTERNS[5].name); }
export function djScratchChirp(): boolean { return triggerPattern(SCRATCH_PATTERNS[6].name); }
export function djScratchStab():  boolean { return triggerPattern(SCRATCH_PATTERNS[7].name); }
export function djScratchScrbl(): boolean { return triggerPattern(SCRATCH_PATTERNS[8].name); }
export function djScratchTear():  boolean { return triggerPattern(SCRATCH_PATTERNS[9].name); }

// ── Advanced pattern commands (10-18) ────────────────────────────────────────
export function djScratchUzi():     boolean { return triggerPattern(SCRATCH_PATTERNS[10].name); }
export function djScratchTwiddle(): boolean { return triggerPattern(SCRATCH_PATTERNS[11].name); }
export function djScratch8Crab():   boolean { return triggerPattern(SCRATCH_PATTERNS[12].name); }
export function djScratch3Flare():  boolean { return triggerPattern(SCRATCH_PATTERNS[13].name); }
export function djScratchLaser():   boolean { return triggerPattern(SCRATCH_PATTERNS[14].name); }
export function djScratchPhaser():  boolean { return triggerPattern(SCRATCH_PATTERNS[15].name); }
export function djScratchTweak():   boolean { return triggerPattern(SCRATCH_PATTERNS[16].name); }
export function djScratchDrag():    boolean { return triggerPattern(SCRATCH_PATTERNS[17].name); }
export function djScratchVibrato(): boolean { return triggerPattern(SCRATCH_PATTERNS[18].name); }

export function djScratchStop(): boolean {
  const deckId = getActiveDeck();
  const store = useDJStore.getState();
  try {
    getDJEngine().getDeck(deckId).stopPattern();
    store.setDeckPattern(deckId, null);
    useUIStore.getState().setStatusMessage('Scratch: stopped', false, 800);
  } catch { /* engine not active */ }
  return true;
}

// ── Fader LFO commands ────────────────────────────────────────────────────────
export function djFaderLFOOff():  boolean { return triggerFaderLFO(null); }
export function djFaderLFO14():   boolean { return triggerFaderLFO('1/4'); }
export function djFaderLFO18():   boolean { return triggerFaderLFO('1/8'); }
export function djFaderLFO116():  boolean { return triggerFaderLFO('1/16'); }
export function djFaderLFO132():  boolean { return triggerFaderLFO('1/32'); }
