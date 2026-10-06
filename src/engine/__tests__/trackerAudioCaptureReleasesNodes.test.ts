/**
 * Song analysis does not leave an audio processor attached to the master after
 * every analysed song.
 *
 * Owner, 2026-10-06: the app slows down the more songs are loaded. Each
 * analysis tapped the master with a ScriptProcessorNode and a silent gain to
 * the destination; stopCapture() only cut the processor's output, so the master
 * kept feeding every dead processor.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

class FakeNode {
  inputs = new Set<FakeNode>();
  outputs = new Set<FakeNode>();
  onaudioprocess: unknown = null;
  gain = { value: 1 };
  connect(n: FakeNode) { this.outputs.add(n); n.inputs.add(this); return n; }
  disconnect(n?: FakeNode) {
    for (const o of [...this.outputs]) if (!n || o === n) { this.outputs.delete(o); o.inputs.delete(this); }
  }
}
const created: FakeNode[] = [];
const master = new FakeNode();
const ctx = {
  createScriptProcessor: () => { const n = new FakeNode(); created.push(n); return n; },
  createGain: () => { const n = new FakeNode(); created.push(n); return n; },
  destination: new FakeNode(),
};

vi.mock('tone', () => ({ getContext: () => ({ rawContext: ctx }) }));
vi.mock('@/engine/ToneEngine', () => ({ getToneEngine: () => ({ masterEffectsInput: {} }) }));
vi.mock('@/utils/audio-context', () => ({ getNativeAudioNode: () => master }));
vi.mock('@/stores/useTrackerAnalysisStore', () => ({
  useTrackerAnalysisStore: { getState: () => ({ startCapture: () => {}, setError: () => {}, setCaptureProgress: () => {} }) },
}));

import { startCapture, stopCapture } from '@/engine/TrackerAudioCapture';

describe('TrackerAudioCapture node lifetime', () => {
  beforeEach(() => { created.length = 0; master.outputs.clear(); ctx.destination.inputs.clear(); });

  it('leaves nothing attached to the master or the destination after ten songs', () => {
    for (let i = 0; i < 10; i++) {
      startCapture(`song${i}`, () => {});
      stopCapture();
    }
    expect(created.length).toBe(20);
    expect(master.outputs.size).toBe(0);
    expect(ctx.destination.inputs.size).toBe(0);
  });

  it('replaces the previous capture when a new song starts one', () => {
    startCapture('a', () => {});
    startCapture('b', () => {});
    expect(master.outputs.size).toBe(1);
    expect(ctx.destination.inputs.size).toBe(1);
    stopCapture();
    expect(master.outputs.size).toBe(0);
  });
});
