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
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastNote = 0;
  enabled = false;

  constructor(engine: VocoderEngine) {
    this.engine = engine;
  }

  start(): void {
    if (this.timer) return;
    this.enabled = true;

    // Poll at ~30Hz instead of subscribing to every store change.
    // The subscribe approach caused freezes because the selector ran on
    // every DJ store update (volume, EQ, crossfader animations, etc.).
    this.timer = setInterval(() => this.tick(), 33);

    console.log('[AutoTune] Started — following melody from active deck');
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.enabled = false;
    console.log('[AutoTune] Stopped');
  }

  private tick(): void {
    const djEngine = getDJEngineIfActive();
    if (!djEngine) return;

    const s = useDJStore.getState();

    // Pick the active deck
    const aPlaying = s.decks.A.isPlaying;
    const bPlaying = s.decks.B.isPlaying;
    let deckId: 'A' | 'B' = 'A';
    if (aPlaying && !bPlaying) deckId = 'A';
    else if (bPlaying && !aPlaying) deckId = 'B';
    else if (aPlaying && bPlaying) deckId = s.crossfaderPosition < 0.5 ? 'A' : 'B';

    const deck = djEngine.getDeck(deckId);
    const song = deck.replayer.getSong();
    if (!song?.patterns?.length || !song.songPositions?.length) return;

    const deckState = s.decks[deckId];
    const patIdx = song.songPositions[deckState.songPos] ?? 0;
    const pattern = song.patterns[patIdx];
    if (!pattern?.channels) return;

    const row = deckState.pattPos;

    // Find the highest pitched note on this row (likely the melody)
    let bestNote = 0;
    for (const ch of pattern.channels) {
      if (!ch.rows || row >= ch.rows.length) continue;
      const cell = ch.rows[row];
      if (cell && cell.note > 0 && cell.note < 97) {
        if (cell.note > bestNote) bestNote = cell.note;
      }
    }

    if (bestNote > 0 && bestNote !== this.lastNote) {
      this.lastNote = bestNote;
      const freq = noteToFreq(bestNote);
      const clamped = Math.max(65, Math.min(1000, freq));
      this.engine.setCarrierFreq(clamped);
    }
  }

  dispose(): void {
    this.stop();
  }
}
