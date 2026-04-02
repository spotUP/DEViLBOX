/**
 * VocoderAutoTune — tracks the melody from the active DJ deck and
 * feeds the note frequency to the vocoder's carrier oscillator.
 *
 * When enabled, the vocoder's carrier pitch follows the music
 * so your voice is auto-tuned to the currently playing melody.
 *
 * Reads pattern data from the active deck's replayer on each row tick,
 * finds the highest non-percussion note, converts to Hz, and calls
 * VocoderEngine.setCarrierFreq().
 */

import { useDJStore } from '@/stores/useDJStore';
import { getDJEngineIfActive } from '@/engine/dj/DJEngine';
import type { VocoderEngine } from './VocoderEngine';

// MIDI note → frequency (A4 = 440 Hz)
function noteToFreq(note: number): number {
  // Tracker note format: 1 = C-0, 13 = C-1, 25 = C-2, ...
  // MIDI: 60 = C-4, so tracker note N maps to MIDI = N + 23 (approximately)
  // More precisely: tracker C-4 = note 49, MIDI C-4 = 60
  const midi = note + 11; // adjust tracker→MIDI offset
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export class VocoderAutoTune {
  private engine: VocoderEngine;
  private unsubscribe: (() => void) | null = null;
  private lastNote = 0;
  private activeDeck: 'A' | 'B' = 'A';
  enabled = false;

  constructor(engine: VocoderEngine) {
    this.engine = engine;
  }

  start(): void {
    if (this.unsubscribe) return;
    this.enabled = true;

    // Subscribe to position changes on whichever deck is playing
    this.unsubscribe = useDJStore.subscribe(
      (s) => {
        // Track whichever deck is currently playing
        const aPlaying = s.decks.A.isPlaying;
        const bPlaying = s.decks.B.isPlaying;
        if (aPlaying && !bPlaying) this.activeDeck = 'A';
        else if (bPlaying && !aPlaying) this.activeDeck = 'B';
        // If both playing (transition), follow the one with crossfader
        else if (aPlaying && bPlaying) {
          this.activeDeck = s.crossfaderPosition < 0.5 ? 'A' : 'B';
        }
        return s.decks[this.activeDeck].pattPos;
      },
      () => this.onRowChange(),
    );

    console.log('[AutoTune] Started — following melody from active deck');
  }

  stop(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.enabled = false;
    console.log('[AutoTune] Stopped');
  }

  private onRowChange(): void {
    const djEngine = getDJEngineIfActive();
    if (!djEngine) return;

    const deck = djEngine.getDeck(this.activeDeck);
    const song = deck.replayer.getSong();
    if (!song?.patterns?.length || !song.songPositions?.length) return;

    const state = useDJStore.getState().decks[this.activeDeck];
    const patIdx = song.songPositions[state.songPos] ?? 0;
    const pattern = song.patterns[patIdx];
    if (!pattern?.channels) return;

    const row = state.pattPos;

    // Find the highest pitched note on this row (likely the melody)
    let bestNote = 0;
    for (const ch of pattern.channels) {
      if (!ch.rows || row >= ch.rows.length) continue;
      const cell = ch.rows[row];
      if (cell && cell.note > 0 && cell.note < 97) { // 97 = note-off
        if (cell.note > bestNote) {
          bestNote = cell.note;
        }
      }
    }

    // Only update if we found a real note and it changed
    if (bestNote > 0 && bestNote !== this.lastNote) {
      this.lastNote = bestNote;
      const freq = noteToFreq(bestNote);
      // Clamp to reasonable vocal range for vocoder carrier
      const clamped = Math.max(65, Math.min(1000, freq));
      this.engine.setCarrierFreq(clamped);
    }
  }

  dispose(): void {
    this.stop();
  }
}
