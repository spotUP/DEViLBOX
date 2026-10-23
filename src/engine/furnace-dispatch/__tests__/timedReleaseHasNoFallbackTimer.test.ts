/**
 * A Furnace note played with triggerAttackRelease releases once, at its
 * scheduled time. The synth also set a fallback timer for time + duration
 * + 50 ms that called triggerRelease(note) with no time. The scheduled
 * note-off had already removed the note, so the timer did nothing, except
 * when a later note had taken the same pitch: the timer then released that
 * note late and untimed. The worklet applies the timed note-off itself.
 */
import { describe, it, expect, vi } from 'vitest';
import { FurnaceDispatchSynth } from '../FurnaceDispatchSynth';

function wiredSynth() {
  const synth = Object.create(FurnaceDispatchSynth.prototype) as FurnaceDispatchSynth;
  const releases: Array<[string | number | undefined, number | undefined]> = [];
  Object.assign(synth, {
    engine: { getNativeCtx: () => ({ currentTime: 2 }) },
    currentChannel: 0,
    triggerAttack: () => {},
    triggerRelease: (note?: string | number, time?: number) => { releases.push([note, time]); },
  });
  return { synth, releases };
}

describe('timed Furnace release', () => {
  it('sends one note-off at time plus duration and sets no timer', () => {
    const { synth, releases } = wiredSynth();
    const timer = vi.spyOn(globalThis, 'setTimeout');
    synth.triggerAttackRelease('C4', 0.25, 3, 0.8);
    expect(timer).not.toHaveBeenCalled();
    timer.mockRestore();
    expect(releases).toEqual([['C4', 3.25]]);
  });

  it('a note with no time releases at the context time plus duration', () => {
    const { synth, releases } = wiredSynth();
    synth.triggerAttackRelease('C4', 0.5);
    expect(releases).toEqual([['C4', 2.5]]);
  });
});
