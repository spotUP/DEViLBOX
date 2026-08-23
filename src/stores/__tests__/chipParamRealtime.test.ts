/**
 * chipParamRealtime.test.ts — a chip knob edit must not resurrect other params.
 *
 * The editor used to send the WHOLE parameters object, rebuilt from its React
 * prop. Store writes are batched to the next animation frame, so right after a
 * preset change that prop still held the previous preset's values — and any
 * knob drag wrote the stale snapshot back wholesale. Concretely: pick Whisper
 * (noise_mode 1), switch preset (noise_mode 0), touch any knob, and the Noise
 * Mode toggle turned itself back on.
 *
 * The editor now sends only the changed key. These tests pin the store side of
 * that contract: a parameters delta MERGES, and two different parameters moved
 * in the same frame both survive the batching.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { useInstrumentStore } from '../useInstrumentStore';

/** Batched store writes flush on rAF; wait for one. */
const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));

function makeChipInstrument(): number {
  const id = useInstrumentStore.getState().createInstrument({
    name: 'Chip under test',
    type: 'synth',
    synthType: 'MAMETMS5220',
    parameters: { noise_mode: 1, energy_index: 9, pitch_index: 32 },
  });
  return id;
}

function paramsOf(id: number): Record<string, unknown> {
  return (useInstrumentStore.getState().instruments.find((i) => i.id === id)
    ?.parameters ?? {}) as Record<string, unknown>;
}

describe('chip parameter realtime updates', () => {
  beforeEach(() => {
    useInstrumentStore.setState({ instruments: [] });
  });

  it('merges a single-key delta instead of replacing the parameters object', async () => {
    const id = makeChipInstrument();
    useInstrumentStore.getState().updateInstrumentRealtime(id, {
      parameters: { k1_index: 22 },
    });
    await nextFrame();

    const params = paramsOf(id);
    expect(params.k1_index).toBe(22);
    // Untouched parameters survive.
    expect(params.energy_index).toBe(9);
    expect(params.pitch_index).toBe(32);
  });

  it('does not resurrect a parameter that was cleared after the editor read it', async () => {
    const id = makeChipInstrument();

    // A preset switch clears noise_mode...
    useInstrumentStore.getState().updateInstrumentRealtime(id, {
      parameters: { noise_mode: 0 },
    });
    await nextFrame();
    expect(paramsOf(id).noise_mode).toBe(0);

    // ...then a knob moves. A delta cannot carry the stale noise_mode back.
    useInstrumentStore.getState().updateInstrumentRealtime(id, {
      parameters: { pitch_index: 20 },
    });
    await nextFrame();

    expect(paramsOf(id).pitch_index).toBe(20);
    expect(paramsOf(id).noise_mode, 'noise_mode came back from a stale snapshot').toBe(0);
  });

  it('keeps both parameters when two controls move in the same frame', async () => {
    const id = makeChipInstrument();

    // No await between them: both land in one batch flush.
    useInstrumentStore.getState().updateInstrumentRealtime(id, { parameters: { k1_index: 5 } });
    useInstrumentStore.getState().updateInstrumentRealtime(id, { parameters: { k2_index: 7 } });
    await nextFrame();

    const params = paramsOf(id);
    expect(params.k1_index, 'first control was clobbered by the second').toBe(5);
    expect(params.k2_index).toBe(7);
  });

  it('still dedupes repeated writes of the SAME parameter within a frame', async () => {
    const id = makeChipInstrument();
    for (const v of [10, 20, 30]) {
      useInstrumentStore.getState().updateInstrumentRealtime(id, { parameters: { pitch_index: v } });
    }
    await nextFrame();
    expect(paramsOf(id).pitch_index).toBe(30);
  });
});
