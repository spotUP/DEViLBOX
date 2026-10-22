/**
 * Regression (2026-10-20): every note entered in the pattern editor called
 * ToneEngine.releaseAll(), which fades a Tone synth's volume to -Infinity and
 * restores the value it read at call time. A second call inside the 100 ms
 * restore window read the half-faded value, so each note left the ChipSynth
 * (and every Tone.js synth with a `volume` Param) quieter than the last.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('tone', async (orig) => {
  const actual = await orig<typeof import('tone')>();
  return { ...actual, now: () => 0 };
});

import { ToneEngine } from '../ToneEngine';

/** volume Param stand-in: rampTo drops the value to a mid-fade level, like Tone does while ramping. */
function fadingVolume(initialDb: number) {
  const p = {
    value: initialDb,
    cancelScheduledValues: vi.fn(),
    rampTo: vi.fn(() => { p.value = p.value - 6; }),
  };
  return p;
}

afterEach(() => vi.useRealTimers());

describe('ToneEngine.releaseAll', () => {
  it('restores the instrument volume it had before the first release, however many notes were entered', () => {
    vi.useFakeTimers();
    const volume = fadingVolume(-12);
    const synth = { volume, releaseAll: vi.fn() };
    const engine = Object.create(ToneEngine.prototype) as ToneEngine;
    const internals = engine as unknown as Record<string, unknown>;
    internals['instruments'] = new Map<number, unknown>([[(7 << 16) | 0, synth]]);
    internals['releaseRestoreTimeouts'] = new Map();
    internals['releaseRestoreVolumeDb'] = new Map();
    internals['releaseRestores'] = new Map();
    for (const m of ['activeVoices', 'channelActivePlayer', 'channelPitchState', 'slicePlayersMap', 'nativeEngineRouting']) {
      internals[m] = new Map();
    }

    for (let note = 0; note < 4; note++) {
      engine.releaseAll();
      vi.advanceTimersByTime(30); // next note lands mid-fade
    }
    vi.advanceTimersByTime(200);

    expect(synth.releaseAll).toHaveBeenCalledTimes(4);
    expect(volume.value).toBe(-12);
  });
});
