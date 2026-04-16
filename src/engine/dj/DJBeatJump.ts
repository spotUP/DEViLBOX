/**
 * DJBeatJump - Shared beat jump logic for FX pads and keyboard shortcuts
 */

import { useDJStore } from '@/stores/useDJStore';
import { getDJEngine } from '@/engine/dj/DJEngine';
import { quantizeAction } from '@/engine/dj/DJQuantizedFX';
import { snapPositionToBeat, snapLoopLength } from '@/engine/dj/DJAutoSync';
import type { DeckId } from '@/engine/dj/DeckEngine';

/**
 * Jump playback by a number of beats (positive = forward, negative = backward).
 *
 * Quantize-aware: snaps the CURRENT position to the nearest beat first (no
 * drift accumulation), then adds `beats * beatPeriod`. The seek itself is
 * deferred to the next beat boundary so the jump always lands cleanly.
 *
 * Uses beat grid for accurate jumps when available, else falls back to 120
 * BPM estimate without snapping.
 */
export function beatJump(deckId: DeckId, beats: number): void {
  const fire = (): void => {
    try {
      const state = useDJStore.getState().decks[deckId];
      const engine = getDJEngine();
      const deck = engine.getDeck(deckId);
      const beatGrid = state.beatGrid;

      if (!beatGrid || beatGrid.bpm <= 0) {
        // No beat grid — use detected BPM or fallback to 120
        const bpm = state.detectedBPM || state.effectiveBPM || 120;
        const jumpSec = beats * (60 / bpm);
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

      // Have beat grid — snap current position to nearest beat THEN jump.
      // This prevents drift accumulation across many sequential jumps.
      const beatPeriod = 60 / beatGrid.bpm;
      const jumpSec = beats * beatPeriod;

      if (deck.playbackMode === 'audio') {
        const snappedNow = snapPositionToBeat(deckId, state.audioPosition, 'beat');
        const newPos = Math.max(0, snappedNow + jumpSec);
        deck.audioPlayer.seek(newPos);
        useDJStore.getState().setDeckState(deckId, { audioPosition: newPos, elapsedMs: newPos * 1000 });
      } else {
        // Tracker: snap by row index, not by seconds, so step by `beats` rows.
        const totalDur = state.durationMs > 0 ? state.durationMs / 1000 : 1;
        const totalPos = Math.max(state.totalPositions, 1);
        const currentSec = state.elapsedMs / 1000;
        const snappedNow = snapPositionToBeat(deckId, currentSec, 'beat');
        const targetSec = Math.max(0, snappedNow + jumpSec);
        const targetPos = Math.min(
          Math.max(0, Math.floor((targetSec / totalDur) * totalPos)),
          totalPos - 1,
        );
        deck.cue(targetPos, 0);
        useDJStore.getState().setDeckPosition(deckId, targetPos, 0);
      }
    } catch { /* engine not ready */ }
  };

  quantizeAction(deckId, fire, { kind: 'jump', allowSolo: true });
}

/**
 * Trigger a hot cue by index for a given deck.
 *
 * - If the hot cue exists: defer the jump to the next beat boundary and seek
 *   to the stored position.
 * - If the hot cue doesn't exist: capture the current position, snap it to
 *   the nearest beat in this deck's grid, and store it. Setting hot cues is
 *   immediate (no quantize delay) — the user-perceived intent is "remember
 *   this beat", and the snap makes sure subsequent triggers land cleanly.
 */
export function triggerHotCue(deckId: DeckId, index: number): void {
  const store = useDJStore.getState();
  const cue = store.decks[deckId].hotCues[index];

  if (!cue) {
    // SET — capture current position, snap to nearest beat, store immediately.
    try {
      const engine = getDJEngine();
      const deck = engine.getDeck(deckId);
      const HOT_CUE_COLORS = ['#E91E63', '#FF9800', '#2196F3', '#4CAF50', '#9C27B0', '#00BCD4', '#FFEB3B', '#F44336'];

      let positionSec = 0;
      if (deck.playbackMode === 'audio') {
        positionSec = deck.audioPlayer.getPosition();
      } else {
        positionSec = store.decks[deckId].elapsedMs / 1000;
      }
      const snappedSec = snapPositionToBeat(deckId, positionSec, 'beat');

      store.setHotCue(deckId, index, {
        position: snappedSec * 1000,
        color: HOT_CUE_COLORS[index] || '#FFFFFF',
        name: '',
      });
    } catch { /* engine not ready */ }
    return;
  }

  // TRIGGER — defer the jump to the next beat boundary.
  quantizeAction(
    deckId,
    () => {
      try {
        const engine = getDJEngine();
        const deck = engine.getDeck(deckId);
        const seconds = cue.position / 1000;
        if (deck.playbackMode === 'audio') {
          deck.audioPlayer.seek(seconds);
          useDJStore.getState().setDeckState(deckId, { audioPosition: seconds, elapsedMs: cue.position });
        } else {
          const state = useDJStore.getState().decks[deckId];
          if (state.durationMs > 0 && state.totalPositions > 0) {
            const pos = Math.floor((cue.position / state.durationMs) * state.totalPositions);
            deck.cue(Math.max(0, Math.min(pos, state.totalPositions - 1)), 0);
          }
        }
      } catch { /* engine not ready */ }
    },
    { kind: 'hotcue', allowSolo: true },
  );
}

/**
 * Activate a Serato saved loop by index for a given deck.
 *
 * Snaps the stored loop in-point to the nearest beat in this deck's grid
 * and rounds the loop length to the nearest power-of-2 beat count
 * (1/4..16). The activation seek itself is deferred to the next beat
 * boundary so loops always start cleanly on the grid.
 */
export function activateSeratoLoop(deckId: DeckId, index: number): void {
  const store = useDJStore.getState();
  const loops = store.decks[deckId].seratoLoops;
  const loop = loops.find(l => l.index === index);
  if (!loop) return;

  // Snap loop in to nearest beat, snap length to nearest power-of-2 beats.
  const rawIn = loop.startPosition / 1000;
  const rawOut = loop.endPosition / 1000;
  const inSec = snapPositionToBeat(deckId, rawIn, 'beat');

  const beatGrid = store.decks[deckId].beatGrid;
  let outSec = rawOut + (inSec - rawIn); // shift end by the same delta first
  if (beatGrid && beatGrid.bpm > 0) {
    const beatPeriod = 60 / beatGrid.bpm;
    const lengthBeats = (rawOut - rawIn) / beatPeriod;
    const snappedBeats = snapLoopLength(lengthBeats);
    outSec = inSec + snappedBeats * beatPeriod;
  }

  store.setAudioLoopIn(deckId, inSec);
  store.setAudioLoopOut(deckId, outSec);

  quantizeAction(
    deckId,
    () => {
      try {
        const engine = getDJEngine();
        const deck = engine.getDeck(deckId);
        deck.setAudioLoop(inSec, outSec);
        useDJStore.getState().setDeckLoop(deckId, 'line', true);
        if (deck.playbackMode === 'audio') {
          deck.audioPlayer.seek(inSec);
          useDJStore.getState().setDeckState(deckId, { audioPosition: inSec, elapsedMs: inSec * 1000 });
        }
      } catch { /* engine not ready */ }
    },
    { kind: 'loop', allowSolo: true },
  );
}
