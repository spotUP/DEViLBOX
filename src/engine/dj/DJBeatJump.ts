/**
 * DJBeatJump - Shared beat jump logic for FX pads and keyboard shortcuts
 */

import { useDJStore } from '@/stores/useDJStore';
import { getDJEngine } from '@/engine/dj/DJEngine';
import type { DeckId } from '@/engine/dj/DeckEngine';

/**
 * Jump playback by a number of beats (positive = forward, negative = backward).
 * Uses beat grid for accurate jumps when available, else falls back to 120 BPM estimate.
 */
export function beatJump(deckId: DeckId, beats: number): void {
  try {
    const state = useDJStore.getState().decks[deckId];
    const engine = getDJEngine();
    const deck = engine.getDeck(deckId);
    const beatGrid = state.beatGrid;

    if (!beatGrid || beatGrid.bpm <= 0) {
      // No beat grid — fall back to fixed time jump (assume 120 BPM)
      const jumpSec = beats * 0.5; // 120 BPM = 0.5s per beat
      if (deck.playbackMode === 'audio') {
        const newPos = Math.max(0, state.audioPosition + jumpSec);
        deck.audioPlayer.seek(newPos);
        useDJStore.getState().setDeckState(deckId, { audioPosition: newPos, elapsedMs: newPos * 1000 });
      } else {
        const jumpPositions = Math.round(beats);
        const newPos = Math.max(0, Math.min(state.totalPositions - 1, state.songPos + jumpPositions));
        deck.cue(newPos, 0);
        useDJStore.getState().setDeckPosition(deckId, newPos, 0);
      }
      return;
    }

    // Have beat grid — jump by precise beat times
    const beatPeriod = 60 / beatGrid.bpm;
    const jumpSec = beats * beatPeriod;

    if (deck.playbackMode === 'audio') {
      const newPos = Math.max(0, state.audioPosition + jumpSec);
      deck.audioPlayer.seek(newPos);
      useDJStore.getState().setDeckState(deckId, { audioPosition: newPos, elapsedMs: newPos * 1000 });
    } else {
      // Convert seconds to song positions
      const totalDur = state.durationMs > 0 ? state.durationMs / 1000 : 1;
      const totalPos = Math.max(state.totalPositions, 1);
      const currentSec = state.elapsedMs / 1000;
      const targetSec = Math.max(0, currentSec + jumpSec);
      const targetPos = Math.min(
        Math.max(0, Math.floor((targetSec / totalDur) * totalPos)),
        totalPos - 1,
      );
      deck.cue(targetPos, 0);
      useDJStore.getState().setDeckPosition(deckId, targetPos, 0);
    }
  } catch { /* engine not ready */ }
}

/**
 * Trigger a hot cue by index for a given deck.
 * If the hot cue exists, jump to it. If not, set a new one at current position.
 */
export function triggerHotCue(deckId: DeckId, index: number): void {
  try {
    const store = useDJStore.getState();
    const cue = store.decks[deckId].hotCues[index];
    const engine = getDJEngine();
    const deck = engine.getDeck(deckId);

    if (cue) {
      // Jump to cue
      const seconds = cue.position / 1000;
      if (deck.playbackMode === 'audio') {
        deck.audioPlayer.seek(seconds);
        store.setDeckState(deckId, { audioPosition: seconds, elapsedMs: cue.position });
      } else {
        const state = store.decks[deckId];
        if (state.durationMs > 0 && state.totalPositions > 0) {
          const pos = Math.floor((cue.position / state.durationMs) * state.totalPositions);
          deck.cue(Math.max(0, Math.min(pos, state.totalPositions - 1)), 0);
        }
      }
    } else {
      // Set new hot cue at current position
      const HOT_CUE_COLORS = ['#E91E63', '#FF9800', '#2196F3', '#4CAF50', '#9C27B0', '#00BCD4', '#FFEB3B', '#F44336'];
      let positionMs = 0;
      if (deck.playbackMode === 'audio') {
        positionMs = deck.audioPlayer.getPosition() * 1000;
      } else {
        positionMs = store.decks[deckId].elapsedMs;
      }
      store.setHotCue(deckId, index, {
        position: positionMs,
        color: HOT_CUE_COLORS[index] || '#FFFFFF',
        name: '',
      });
    }
  } catch { /* engine not ready */ }
}

/**
 * Activate a Serato saved loop by index for a given deck.
 * Sets the audio loop to the Serato loop's start/end positions.
 */
export function activateSeratoLoop(deckId: DeckId, index: number): void {
  try {
    const store = useDJStore.getState();
    const loops = store.decks[deckId].seratoLoops;
    const loop = loops.find(l => l.index === index);
    if (!loop) return;

    const engine = getDJEngine();
    const deck = engine.getDeck(deckId);
    const inSec = loop.startPosition / 1000;
    const outSec = loop.endPosition / 1000;

    store.setAudioLoopIn(deckId, inSec);
    store.setAudioLoopOut(deckId, outSec);
    deck.setAudioLoop(inSec, outSec);
    store.setDeckLoop(deckId, 'line', true);

    // Also jump to loop start
    if (deck.playbackMode === 'audio') {
      deck.audioPlayer.seek(inSec);
      store.setDeckState(deckId, { audioPosition: inSec, elapsedMs: loop.startPosition });
    }
  } catch { /* engine not ready */ }
}
