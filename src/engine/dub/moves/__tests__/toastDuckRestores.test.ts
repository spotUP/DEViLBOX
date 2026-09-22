import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * "i turned toast on off some times and most audio died, i think i only hear
 * the dub fx now" (2026-09-22). Measured at rmsAvg 0.0259 against 0.16 before
 * — about two toggles' worth of a 0.4x duck.
 *
 * `applyDuck` snapshotted `g.value` at the moment it ducked. Toggle Toast
 * again while the release ramp is still running, or while it is still ducked,
 * and the snapshot IS the ducked value — so release "restores" to 0.4x, the
 * next toggle to 0.16x, and so on. The dry buses collapse geometrically while
 * the wet return, never ducked, carries on alone.
 *
 * The baseline is now remembered per param on the FIRST duck and forgotten
 * only when the last overlapping Toast lets go.
 */

/**
 * An AudioParam stub where a RAMP TAKES TIME.
 *
 * This is the whole point: the bug needs a press that lands while the release
 * ramp from the previous press is still running, so `g.value` is still ducked
 * when the next duck reads it. A stub that applies ramps instantly cannot
 * reproduce it, and every assertion here passes for the wrong reason.
 */
class FakeParam {
  value: number;
  /** Where the running ramp is heading, until `settle()` lets it arrive. */
  pending: number | null = null;
  constructor(v: number) { this.value = v; }
  cancelScheduledValues() { return this; }
  setValueAtTime(v: number) { this.value = v; return this; }
  linearRampToValueAtTime(v: number) { this.pending = v; return this; }
  /** Let every scheduled ramp finish. */
  settle() { if (this.pending !== null) { this.value = this.pending; this.pending = null; } }
}

const settleAll = () => { masterInput.gain.settle(); synthBus.gain.settle(); };

const masterInput = { gain: new FakeParam(1) };
const synthBus = { gain: new FakeParam(1) };

vi.mock('@/engine/ToneEngine', () => ({
  getToneEngine: () => ({ masterInput, synthBus }),
}));
// An already-running DJ mic, so the duck path is reached synchronously
// enough to await. With no mic Toast never ducks at all, and every assertion
// below would pass for the wrong reason.
vi.mock('@/engine/dj/DJEngine', () => ({
  getDJEngineIfActive: () => ({
    mic: { isActive: true, getSourceNode: () => ({ connect() {} }) },
  }),
}));
vi.mock('tone', () => ({ getContext: () => ({ rawContext: {} }) }));

import { toast } from '../toast';

/** A bus whose input node hands back a context with the nodes Toast needs. */
const makeBus = () => ({
  inputNode: {
    context: {
      currentTime: 0,
      createGain: () => ({
        gain: new FakeParam(0),
        connect() {}, disconnect() {},
      }),
    },
  },
});

/** Press and wait for the async mic path that performs the duck. */
const press = async () => {
  const held = toast.execute({ bus: makeBus(), params: {} } as never);
  await Promise.resolve();
  await Promise.resolve();
  return held;
};

beforeEach(() => {
  masterInput.gain.value = 1;
  synthBus.gain.value = 1;
});

describe('Toast gives the dry buses back', () => {
  it('ducks on press and restores on release', async () => {
    const held = await press();
    settleAll();
    expect(masterInput.gain.value, 'the duck never happened — the rest would pass vacuously')
      .toBeCloseTo(0.4, 5);
    held?.dispose();
    settleAll();
    expect(masterInput.gain.value).toBeCloseTo(1, 5);
  });

  it('survives repeated toggling — the audio does not walk down', async () => {
    // Each toggle lands while the previous release ramp is still in flight,
    // which is what a hand on a pad actually does.
    for (let i = 0; i < 5; i++) {
      const held = await press();
      settleAll();               // the duck arrives
      held?.dispose();           // release ramp starts — and is NOT settled
    }
    settleAll();                 // everything finally arrives

    // Before the fix each cycle multiplied by 0.4: after five, 0.01024.
    expect(
      masterInput.gain.value,
      'the dry bus walked down with every toggle — this is the report'
    ).toBeCloseTo(1, 5);
    expect(synthBus.gain.value).toBeCloseTo(1, 5);
  });

  it('a second press while the first is still held does not lower the baseline', async () => {
    const first = await press();
    settleAll();
    const second = await press();    // ducks again from an already-ducked value
    settleAll();
    second?.dispose();
    first?.dispose();
    settleAll();

    expect(masterInput.gain.value).toBeCloseTo(1, 5);
  });

  it('a double release cannot over-restore', async () => {
    const held = await press();
    settleAll();
    held?.dispose();
    held?.dispose();
    settleAll();
    expect(masterInput.gain.value).toBeCloseTo(1, 5);
  });
});
