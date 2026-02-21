/**
 * NoteRepeatEngine - Tempo-synced auto-retrigger for drum pads
 * While a pad is held and note repeat is enabled, the pad re-triggers
 * at the selected musical rate synced to the transport BPM.
 */

import type { DrumPad } from '../../types/drumpad';
import type { DrumPadEngine } from './DrumPadEngine';

export type NoteRepeatRate = '1/4' | '1/8' | '1/16' | '1/32' | '1/8T' | '1/16T';

/** Convert a musical rate to interval in seconds at a given BPM */
function rateToInterval(rate: NoteRepeatRate, bpm: number): number {
  const beatDuration = 60 / bpm; // Quarter note in seconds
  switch (rate) {
    case '1/4':   return beatDuration;
    case '1/8':   return beatDuration / 2;
    case '1/16':  return beatDuration / 4;
    case '1/32':  return beatDuration / 8;
    case '1/8T':  return beatDuration / 3;       // Triplet eighth
    case '1/16T': return beatDuration / 6;       // Triplet sixteenth
  }
}

export class NoteRepeatEngine {
  private engine: DrumPadEngine;
  private activePads: Map<number, { pad: DrumPad; velocity: number; timerId: ReturnType<typeof setInterval> }> = new Map();
  private rate: NoteRepeatRate = '1/16';
  private bpm: number = 125;
  private enabled: boolean = false;

  constructor(engine: DrumPadEngine) {
    this.engine = engine;
  }

  setRate(rate: NoteRepeatRate): void {
    this.rate = rate;
    // Restart all active repeats with new rate
    for (const [padId, state] of this.activePads.entries()) {
      clearInterval(state.timerId);
      const interval = rateToInterval(this.rate, this.bpm);
      state.timerId = setInterval(() => {
        this.engine.triggerPad(state.pad, state.velocity);
      }, interval * 1000);
    }
  }

  setBpm(bpm: number): void {
    this.bpm = bpm;
    // Restart all active repeats with new BPM
    if (this.activePads.size > 0) {
      this.setRate(this.rate); // Re-apply rate to recalc intervals
    }
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      this.stopAll();
    }
  }

  /** Start repeating a pad (called when pad is pressed while note repeat is on) */
  startRepeat(pad: DrumPad, velocity: number): void {
    if (!this.enabled) return;

    // Stop any existing repeat for this pad
    this.stopRepeat(pad.id);

    const interval = rateToInterval(this.rate, this.bpm);
    const timerId = setInterval(() => {
      this.engine.triggerPad(pad, velocity);
    }, interval * 1000);

    this.activePads.set(pad.id, { pad, velocity, timerId });
  }

  /** Stop repeating a pad (called on pad release) */
  stopRepeat(padId: number): void {
    const state = this.activePads.get(padId);
    if (state) {
      clearInterval(state.timerId);
      this.activePads.delete(padId);
    }
  }

  /** Stop all repeats */
  stopAll(): void {
    for (const [, state] of this.activePads) {
      clearInterval(state.timerId);
    }
    this.activePads.clear();
  }

  dispose(): void {
    this.stopAll();
  }
}
