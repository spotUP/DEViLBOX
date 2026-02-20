/**
 * DJKeyboardHandler - Keyboard shortcuts for DJ mode
 *
 * Left-hand keys = Deck A, right-hand keys = Deck B.
 * Installs a keydown listener when DJ mode is active.
 */

import { useEffect, useCallback } from 'react';
import { useDJStore } from '@/stores/useDJStore';
import { getDJEngine } from '@/engine/dj/DJEngine';
import { DJBeatSync } from '@/engine/dj/DJBeatSync';

type LoopSize = 1 | 2 | 4 | 8 | 16 | 32;

const LOOP_SIZES: LoopSize[] = [1, 2, 4, 8, 16, 32];

export function useDJKeyboardHandler(active: boolean): void {
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // Don't handle if typing in an input field
    const target = e.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') {
      return;
    }

    const engine = getDJEngine();
    const store = useDJStore.getState();
    const shift = e.shiftKey;

    let handled = true;

    switch (e.key.toLowerCase()) {
      // ================================================================
      // DECK A (left hand)
      // ================================================================
      case 'q': // Play/Pause
        if (engine.deckA.isPlaying()) {
          engine.deckA.pause();
          store.setDeckPlaying('A', false);
        } else {
          engine.deckA.play();
          store.setDeckPlaying('A', true);
        }
        break;

      case 'w':
        if (shift) {
          // Pitch up (coarse)
          store.setDeckPitch('A', store.decks.A.pitchOffset + 1);
        } else {
          // Cue (jump to cue point)
          engine.deckA.cue(store.decks.A.cuePoint);
        }
        break;

      case 'e': // Slip cue — jump at next pattern boundary
        engine.deckA.cue(store.decks.A.songPos + 1);
        break;

      case 'r': // Set cue point at current position
        store.setDeckCuePoint('A', engine.deckA.replayer.getSongPos());
        break;

      case 'a': // Nudge back
        engine.deckA.nudge(shift ? -5 : -2, shift ? 16 : 8);
        break;

      case 'd': // Nudge forward
        engine.deckA.nudge(shift ? 5 : 2, shift ? 16 : 8);
        break;

      case 's':
        if (shift) {
          // Pitch down (coarse)
          store.setDeckPitch('A', store.decks.A.pitchOffset - 1);
        } else {
          // Pitch reset
          store.setDeckPitch('A', 0);
        }
        break;

      case 'z': // Loop on/off
        if (store.decks.A.loopActive) {
          engine.deckA.clearLineLoop();
          store.setDeckLoop('A', 'off', false);
        } else {
          engine.deckA.setLineLoop(store.decks.A.lineLoopSize);
          store.setDeckLoop('A', 'line', true);
        }
        break;

      case 'x': { // Loop size decrease (halve)
        const idx = LOOP_SIZES.indexOf(store.decks.A.lineLoopSize);
        if (idx > 0) {
          const newSize = LOOP_SIZES[idx - 1];
          store.setDeckLoopSize('A', newSize);
          if (store.decks.A.loopActive) engine.deckA.setLineLoop(newSize);
        }
        break;
      }

      case 'c': { // Loop size increase (double)
        const idx = LOOP_SIZES.indexOf(store.decks.A.lineLoopSize);
        if (idx < LOOP_SIZES.length - 1) {
          const newSize = LOOP_SIZES[idx + 1];
          store.setDeckLoopSize('A', newSize);
          if (store.decks.A.loopActive) engine.deckA.setLineLoop(newSize);
        }
        break;
      }

      case '1': case '2': case '3': case '4': {
        const ch = parseInt(e.key) - 1;
        if (shift) {
          // Solo: enable only this channel
          store.setAllDeckChannels('A', false);
          store.toggleDeckChannel('A', ch);
        } else {
          store.toggleDeckChannel('A', ch);
        }
        break;
      }

      case '5': // All channels on
        store.setAllDeckChannels('A', true);
        break;

      case 'tab': // Repitch lock toggle
        e.preventDefault();
        store.setDeckState('A', { repitchLock: !store.decks.A.repitchLock });
        break;

      // ================================================================
      // DECK B (right hand)
      // ================================================================
      case 'p': // Play/Pause
        if (engine.deckB.isPlaying()) {
          engine.deckB.pause();
          store.setDeckPlaying('B', false);
        } else {
          engine.deckB.play();
          store.setDeckPlaying('B', true);
        }
        break;

      case 'o':
        if (shift) {
          // Pitch up (coarse)
          store.setDeckPitch('B', store.decks.B.pitchOffset + 1);
        } else {
          // Cue
          engine.deckB.cue(store.decks.B.cuePoint);
        }
        break;

      case 'i': // Slip cue
        engine.deckB.cue(store.decks.B.songPos + 1);
        break;

      case 'u': // Set cue point
        store.setDeckCuePoint('B', engine.deckB.replayer.getSongPos());
        break;

      case 'j': // Nudge back
        engine.deckB.nudge(shift ? -5 : -2, shift ? 16 : 8);
        break;

      case 'l': // Nudge forward
        engine.deckB.nudge(shift ? 5 : 2, shift ? 16 : 8);
        break;

      case 'k':
        if (shift) {
          // Pitch down (coarse)
          store.setDeckPitch('B', store.decks.B.pitchOffset - 1);
        } else {
          // Pitch reset
          store.setDeckPitch('B', 0);
        }
        break;

      case 'm': // Loop on/off
        if (store.decks.B.loopActive) {
          engine.deckB.clearLineLoop();
          store.setDeckLoop('B', 'off', false);
        } else {
          engine.deckB.setLineLoop(store.decks.B.lineLoopSize);
          store.setDeckLoop('B', 'line', true);
        }
        break;

      case ',': { // Loop size decrease
        const idx = LOOP_SIZES.indexOf(store.decks.B.lineLoopSize);
        if (idx > 0) {
          const newSize = LOOP_SIZES[idx - 1];
          store.setDeckLoopSize('B', newSize);
          if (store.decks.B.loopActive) engine.deckB.setLineLoop(newSize);
        }
        break;
      }

      case '.': { // Loop size increase
        const idx = LOOP_SIZES.indexOf(store.decks.B.lineLoopSize);
        if (idx < LOOP_SIZES.length - 1) {
          const newSize = LOOP_SIZES[idx + 1];
          store.setDeckLoopSize('B', newSize);
          if (store.decks.B.loopActive) engine.deckB.setLineLoop(newSize);
        }
        break;
      }

      case '7': case '8': case '9': case '0': {
        const chMap: Record<string, number> = { '7': 0, '8': 1, '9': 2, '0': 3 };
        const ch = chMap[e.key];
        if (shift) {
          store.setAllDeckChannels('B', false);
          store.toggleDeckChannel('B', ch);
        } else {
          store.toggleDeckChannel('B', ch);
        }
        break;
      }

      case '-': // All channels on
        store.setAllDeckChannels('B', true);
        break;

      case '\\': // Repitch lock toggle
        store.setDeckState('B', { repitchLock: !store.decks.B.repitchLock });
        break;

      // ================================================================
      // GLOBAL
      // ================================================================
      case ' ': // Crossfader: snap to center
        e.preventDefault();
        store.setCrossfader(0.5);
        engine.mixer.setCrossfader(0.5);
        break;

      case 'f': // Crossfader toward A
        store.setCrossfader(Math.max(0, store.crossfaderPosition - 0.05));
        engine.mixer.setCrossfader(store.crossfaderPosition);
        break;

      case 'g': // Crossfader toward B
        store.setCrossfader(Math.min(1, store.crossfaderPosition + 0.05));
        engine.mixer.setCrossfader(store.crossfaderPosition);
        break;

      case 't': // Sync Deck B BPM to Deck A
        {
          const semitones = DJBeatSync.syncBPM(engine.deckA, engine.deckB);
          store.setDeckPitch('B', semitones);
        }
        break;

      case '`': // Kill all audio
        engine.killAll();
        store.setDeckPlaying('A', false);
        store.setDeckPlaying('B', false);
        break;

      case 'f1': // PFL Deck A toggle
        e.preventDefault();
        store.setDeckPFL('A', !store.decks.A.pflEnabled);
        break;

      case 'f2': // PFL Deck B toggle
        e.preventDefault();
        store.setDeckPFL('B', !store.decks.B.pflEnabled);
        break;

      case 'f4': // Slip mode toggle (whichever deck was last active)
        e.preventDefault();
        // Toggle slip on deck A by default
        store.setDeckSlip('A', !store.decks.A.slipEnabled);
        engine.deckA.setSlipEnabled(!store.decks.A.slipEnabled);
        break;

      default:
        handled = false;
    }

    if (handled) {
      e.preventDefault();
      e.stopPropagation();
    }
  }, []);

  useEffect(() => {
    if (!active) return;

    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [active, handleKeyDown]);
}
