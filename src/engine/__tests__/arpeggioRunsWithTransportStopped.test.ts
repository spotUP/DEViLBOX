/**
 * ChipSynth ships with its arpeggio enabled. A live preview note (keyboard,
 * synth tester) is played while the song Transport is stopped; the arpeggiator
 * must still step, or the instrument is silent.
 *
 * Tone is mocked at the scheduling boundary: a Transport-scheduled Loop only
 * fires while the Transport runs (never here), a free-running Clock fires
 * whenever its ticker does (driven by hand).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const clocks: Array<{ cb: () => void; started: boolean }> = [];

vi.mock('tone', () => {
  class Loop {
    // Scheduled on a stopped Transport: never fires.
    constructor(_cb: () => void, _interval: unknown) {}
    start() { return this; }
    stop() { return this; }
    dispose() { return this; }
    interval: unknown = 0;
  }
  class Clock {
    frequency = { value: 0 };
    private entry: { cb: () => void; started: boolean };
    constructor(opts: { callback: () => void; frequency: number }) {
      this.frequency.value = opts.frequency;
      this.entry = { cb: opts.callback, started: false };
      clocks.push(this.entry);
    }
    start() { this.entry.started = true; return this; }
    stop() { this.entry.started = false; return this; }
    dispose() { this.entry.started = false; return this; }
  }
  return {
    Loop,
    Clock,
    Time: (v: number | string) => ({ toSeconds: () => (typeof v === 'number' ? v : 0.25) }),
    getTransport: () => ({ bpm: { value: 120 }, state: 'stopped' }),
  };
});

import { ArpeggioEngine } from '../ArpeggioEngine';

beforeEach(() => { clocks.length = 0; });

describe('ArpeggioEngine with the Transport stopped', () => {
  it('steps through its notes on a free-running clock', () => {
    const notes: string[] = [];
    const arp = new ArpeggioEngine({
      config: {
        enabled: true, speed: 30, speedUnit: 'hz', mode: 'loop',
        steps: [{ noteOffset: 0 }, { noteOffset: 12 }],
      },
      onNoteOn: (n: string) => notes.push(n),
      onNoteOff: () => {},
    } as ConstructorParameters<typeof ArpeggioEngine>[0]);
    arp.start('C4', 1);
    expect(clocks).toHaveLength(1);
    expect(clocks[0].started).toBe(true);
    clocks[0].cb();
    clocks[0].cb();
    expect(notes).toEqual(['C4', 'C5']);
    arp.stopAll();
    expect(clocks[0].started).toBe(false);
  });
});
