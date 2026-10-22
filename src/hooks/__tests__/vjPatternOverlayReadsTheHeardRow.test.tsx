/**
 * DJ-C follow-up: the VJ pattern overlay read the replayer's display ring at
 * Tone.now() + 10 ms - ahead of the sound. It must read the row the listener
 * hears: the context's currentTime minus the output latency
 * (heardContextTime). Mounts the real overlay through its rAF loop with a
 * tracker pattern in the stores and records the time it asks the ring for.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';

const LATENCY = 0.0333;
const CTX_TIME = 12.5;

const probe = vi.hoisted(() => ({ times: [] as number[] }));

vi.mock('tone', async (importOriginal) => ({
  ...(await importOriginal<typeof import('tone')>()),
  now: () => 99, // Tone.now() = currentTime + lookAhead; must NOT be what the overlay reads
  getContext: () => ({ rawContext: { currentTime: 12.5, outputLatency: 0.0333, baseLatency: 0.005 } }),
}));
vi.mock('@engine/TrackerReplayer', () => ({
  getTrackerReplayer: () => ({
    getStateAtTime: (t: number) => { probe.times.push(t); return null; },
    getSong: () => null,
  }),
}));
vi.mock('@engine/vj/AudioDataBus', () => ({
  AudioDataBus: class {
    enable() {}
    update() {}
    getFrame() { return { rms: 0, bassEnergy: 0, beat: false }; }
    dispose() {}
    disable() {}
  },
}));
vi.mock('@engine/dj/DJEngine', () => ({ getDJEngineIfActive: () => null }));
vi.mock('@engine/ToneEngine', () => ({ getToneEngine: () => ({}) }));

import { VJPatternOverlay } from '@components/vj/VJPatternOverlay';
import { useTrackerStore } from '@stores/useTrackerStore';
import { useTransportStore } from '@stores/useTransportStore';

describe('VJ pattern overlay reads the heard row', () => {
  let rafCb: ((t: number) => void) | null = null;
  beforeEach(() => {
    probe.times.length = 0;
    vi.stubGlobal('requestAnimationFrame', (cb: (t: number) => void) => { rafCb = cb; return 1; });
    vi.stubGlobal('cancelAnimationFrame', () => {});
    const ctx2d = new Proxy({}, { get: (_t, k) => (k === 'canvas' ? {} : () => ({ width: 0, addColorStop() {} })), set: () => true });
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx2d as never);
    const row = { note: 49, instrument: 1, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 };
    const pattern = { id: 'p', name: 'p', length: 1, channels: [{ id: 'c', name: 'c', rows: [row], muted: false, solo: false, collapsed: false, volume: 100, pan: 0, instrumentId: null, color: null }] };
    useTrackerStore.setState({ patterns: [pattern], currentPatternIndex: 0 } as never);
    useTransportStore.setState({ isPlaying: true, currentRow: 0 } as never);
  });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  it('asks the display ring for currentTime minus output latency, not Tone.now() + 10 ms', () => {
    render(<VJPatternOverlay sources={['tracker']} />);
    expect(rafCb).not.toBeNull();
    rafCb!(16); rafCb!(32);
    expect(probe.times.length).toBeGreaterThan(0); // sentinel: the loop ran and reached the ring
    for (const t of probe.times) expect(t).toBeCloseTo(CTX_TIME - LATENCY, 9);
  });
});
