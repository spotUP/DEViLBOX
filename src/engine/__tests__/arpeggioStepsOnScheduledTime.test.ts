/**
 * ChipSynth arps sounded loose: the arpeggiator clock calls back ahead of
 * each step (lookahead) with the step's scheduled audio time, but the steps
 * were triggered at "now", i.e. on JS timer jitter. Every step must carry the
 * clock's scheduled time through to the note callbacks.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const clocks: Array<{ cb: (time: number) => void }> = [];

vi.mock('tone', () => {
  class Clock {
    frequency = { value: 0 };
    constructor(opts: { callback: (time: number) => void; frequency: number }) {
      this.frequency.value = opts.frequency;
      clocks.push({ cb: opts.callback });
    }
    start() { return this; }
    stop() { return this; }
    dispose() { return this; }
  }
  return {
    Clock,
    Time: (v: number | string) => ({ toSeconds: () => (typeof v === 'number' ? v : 0.25) }),
    getTransport: () => ({ bpm: { value: 120 }, state: 'stopped' }),
  };
});

import { ArpeggioEngine } from '../ArpeggioEngine';

beforeEach(() => { clocks.length = 0; });

describe('ArpeggioEngine step timing', () => {
  it('triggers each step at the clock scheduled time, not at callback time', () => {
    const ons: Array<number | undefined> = [];
    const offs: Array<number | undefined> = [];
    const arp = new ArpeggioEngine({
      config: {
        enabled: true, speed: 30, speedUnit: 'hz', mode: 'loop',
        steps: [{ noteOffset: 0 }, { noteOffset: 12 }],
      } as never,
      onNoteOn: (_n, _v, _d, time) => { ons.push(time); },
      onNoteOff: (_n, time) => { offs.push(time); },
    });
    arp.start('C4', 1);
    clocks[0].cb(10.0);
    clocks[0].cb(10.0333);
    expect(ons).toEqual([10.0, 10.0333]);
    expect(offs).toEqual([10.0333]);
    arp.stopAll();
  });
});
