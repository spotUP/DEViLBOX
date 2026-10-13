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
import { fireDjFx, releaseDjFx } from '@engine/drumpad/DjFxActions';
import { fxIdForPattern } from '@engine/dj/scratch/scratchActionMap';
import { toggleThreeDeckShowcase } from '@engine/dj/DJActions';

type DeckId = 'A' | 'B' | 'C';
type FaderLFODivision = '1/4' | '1/8' | '1/16' | '1/32';

// Immediate guard to prevent concurrent triggers before state updates propagate
const activePatterns: Record<DeckId, string | null> = { A: null, B: null, C: null };

/** Clear the pattern guard for a deck (called when pattern ends naturally) */
export function clearPatternGuard(deckId: DeckId): void {
  activePatterns[deckId] = null;
}

/** Returns whichever deck is currently playing, preferring A > B > C. */
function getActiveDeck(): DeckId {
  const { decks } = useDJStore.getState();
  if (decks.B.isPlaying && !decks.A.isPlaying) return 'B';
  if (decks.C.isPlaying && !decks.A.isPlaying && !decks.B.isPlaying) return 'C';
  return 'A';
}

// Every pattern goes through the DJ FX registry (owner scratch plan section
// 81, one action path): `fireDjFx` plays it on the deck, `releaseDjFx`
// stops it. The guard below only keeps a held key from re-firing.

function firePattern(deckId: DeckId, patternName: string): boolean {
  const fxId = fxIdForPattern(patternName);
  if (!fxId) return false;
  let quantizeWaitMs = 0;
  const ok = fireDjFx(fxId, {
    deck: deckId,
    source: 'keyboard',
    onWaiting: (waitMs) => {
      quantizeWaitMs = waitMs;
      useUIStore.getState().setStatusMessage(`Scratch: ${patternName} (waiting…)`, false, waitMs + 200);
    },
  });
  if (ok && quantizeWaitMs === 0) {
    useUIStore.getState().setStatusMessage(`Scratch: ${patternName}`, false, 1200);
  }
  return ok;
}

function releasePattern(deckId: DeckId, patternName: string): void {
  const fxId = fxIdForPattern(patternName);
  if (fxId) releaseDjFx(fxId, { deck: deckId, source: 'keyboard' });
}

function triggerPattern(patternName: string): boolean {
  const deckId = getActiveDeck();
  const current = activePatterns[deckId];

  // Same pattern running → stop it
  if (current === patternName) {
    releasePattern(deckId, patternName);
    activePatterns[deckId] = null;
    useUIStore.getState().setStatusMessage(`Scratch: stopped`, false, 800);
    return true;
  }

  // Different pattern already running → ignore
  if (current !== null) {
    return true;
  }

  // Nothing running → set IMMEDIATE guard, then fire
  activePatterns[deckId] = patternName;
  if (!firePattern(deckId, patternName)) {
    activePatterns[deckId] = null;
    useUIStore.getState().setStatusMessage('DJ engine not active', false, 1000);
  }
  return true;
}

// Hold-down behavior: start scratch pattern on press
function startPattern(patternName: string): boolean {
  const deckId = getActiveDeck();
  const current = activePatterns[deckId];

  // Already playing something → ignore
  if (current !== null) {
    return true;
  }

  // Set IMMEDIATE guard, then fire
  activePatterns[deckId] = patternName;
  if (!firePattern(deckId, patternName)) {
    activePatterns[deckId] = null;
    useUIStore.getState().setStatusMessage('DJ engine not active', false, 1000);
  }
  return true;
}

// Hold-down behavior: stop scratch pattern on release
function stopPattern(): boolean {
  const deckId = getActiveDeck();
  const current = activePatterns[deckId];

  // Nothing running → ignore
  if (current === null) {
    return true;
  }

  // Hard-stop (the registry's release) and decay pitch/tempo back to rest.
  // `finishCycle` waits for the cycle to end before restoring pitch, and some
  // patterns (Orbit, Stab, etc.) that end in a backward phase can leave the
  // song pitched down if anything interrupts the cycle-end tick.
  releasePattern(deckId, current);
  activePatterns[deckId] = null;
  useUIStore.getState().setStatusMessage(`Scratch: stopped`, false, 800);
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

// ── Pattern commands (hold-down behavior: true = press, false = release) ──────
export function djScratchBaby(start: boolean = true):  boolean { return start ? startPattern(SCRATCH_PATTERNS[0].name) : stopPattern(); }
export function djScratchTrans(start: boolean = true): boolean { return start ? startPattern(SCRATCH_PATTERNS[1].name) : stopPattern(); }
export function djScratchFlare(start: boolean = true): boolean { return start ? startPattern(SCRATCH_PATTERNS[2].name) : stopPattern(); }
export function djScratchHydro(start: boolean = true): boolean { return start ? startPattern(SCRATCH_PATTERNS[3].name) : stopPattern(); }
export function djScratchCrab(start: boolean = true):  boolean { return start ? startPattern(SCRATCH_PATTERNS[4].name) : stopPattern(); }
export function djScratchOrbit(start: boolean = true): boolean { return start ? startPattern(SCRATCH_PATTERNS[5].name) : stopPattern(); }
export function djScratchChirp(start: boolean = true): boolean { return start ? startPattern(SCRATCH_PATTERNS[6].name) : stopPattern(); }
export function djScratchStab(start: boolean = true):  boolean { return start ? startPattern(SCRATCH_PATTERNS[7].name) : stopPattern(); }
export function djScratchScrbl(start: boolean = true): boolean { return start ? startPattern(SCRATCH_PATTERNS[8].name) : stopPattern(); }
export function djScratchTear(start: boolean = true):  boolean { return start ? startPattern(SCRATCH_PATTERNS[9].name) : stopPattern(); }

// ── Advanced pattern commands (10-18) ────────────────────────────────────────
export function djScratchUzi(start?: boolean):     boolean { 
  if (start === true) return startPattern(SCRATCH_PATTERNS[10].name);
  if (start === false) return stopPattern();
  return triggerPattern(SCRATCH_PATTERNS[10].name);
}
export function djScratchTwiddle(start?: boolean): boolean { 
  if (start === true) return startPattern(SCRATCH_PATTERNS[11].name);
  if (start === false) return stopPattern();
  return triggerPattern(SCRATCH_PATTERNS[11].name);
}
export function djScratch8Crab(start?: boolean):   boolean { 
  if (start === true) return startPattern(SCRATCH_PATTERNS[12].name);
  if (start === false) return stopPattern();
  return triggerPattern(SCRATCH_PATTERNS[12].name);
}
export function djScratch3Flare(start?: boolean):  boolean { 
  if (start === true) return startPattern(SCRATCH_PATTERNS[13].name);
  if (start === false) return stopPattern();
  return triggerPattern(SCRATCH_PATTERNS[13].name);
}
export function djScratchLaser(start?: boolean):   boolean { 
  if (start === true) return startPattern(SCRATCH_PATTERNS[14].name);
  if (start === false) return stopPattern();
  return triggerPattern(SCRATCH_PATTERNS[14].name);
}
export function djScratchPhaser(start?: boolean):  boolean { 
  if (start === true) return startPattern(SCRATCH_PATTERNS[15].name);
  if (start === false) return stopPattern();
  return triggerPattern(SCRATCH_PATTERNS[15].name);
}
export function djScratchTweak(start?: boolean):   boolean { 
  if (start === true) return startPattern(SCRATCH_PATTERNS[16].name);
  if (start === false) return stopPattern();
  return triggerPattern(SCRATCH_PATTERNS[16].name);
}
export function djScratchDrag(start?: boolean):    boolean { 
  if (start === true) return startPattern(SCRATCH_PATTERNS[17].name);
  if (start === false) return stopPattern();
  return triggerPattern(SCRATCH_PATTERNS[17].name);
}
export function djScratchVibrato(start?: boolean): boolean { 
  if (start === true) return startPattern(SCRATCH_PATTERNS[18].name);
  if (start === false) return stopPattern();
  return triggerPattern(SCRATCH_PATTERNS[18].name);
}

export function djScratchStop(): boolean {
  const deckId = getActiveDeck();
  activePatterns[deckId] = null;
  if (fireDjFx('fx_scratch_stop', { deck: deckId, source: 'keyboard' })) {
    useUIStore.getState().setStatusMessage('Scratch: stopped', false, 800);
  }
  return true;
}

// ── Fader LFO commands ────────────────────────────────────────────────────────
export function djFaderLFOOff():  boolean { return triggerFaderLFO(null); }
export function djFaderLFO14():   boolean { return triggerFaderLFO('1/4'); }
export function djFaderLFO18():   boolean { return triggerFaderLFO('1/8'); }
export function djFaderLFO116():  boolean { return triggerFaderLFO('1/16'); }
export function djFaderLFO132():  boolean { return triggerFaderLFO('1/32'); }

// ── Three Deck Showcase (owner decision 2026-10-13) ──────────────────────────
/** Start or end the Three Deck Showcase - the demo's whole three-deck render while the set holds. */
export function djThreeDeckShowcase(): boolean {
  void toggleThreeDeckShowcase().then((s) => {
    const msg = s.status === 'idle' ? (s.reason ? `Three Deck Showcase: ${s.reason}` : 'Three Deck Showcase: ended') : `Three Deck Showcase: ${s.status}`;
    useUIStore.getState().setStatusMessage(msg, false, 1500);
  });
  return true;
}
