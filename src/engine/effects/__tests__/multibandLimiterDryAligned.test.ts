/**
 * MultibandLimiter dry path is aligned with the lookahead-delayed wet path.
 *
 * The WASM delays its bands by 64 samples and carries the same delay and split
 * phase on its own dry side, but the wrapper also fed the raw input through an
 * undelayed dryGain: at wet < 1 the early dry combed against the delayed wet
 * and smeared transients. Once the WASM is live the wrapper must send it the
 * mix and keep its own dry branch silent.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { FakeGain } = vi.hoisted(() => ({
  FakeGain: class {
    gain = { value: 1 };
    constructor(v = 1) { this.gain.value = v; }
    connect() { return this; }
    dispose() { return this; }
  },
}));
vi.mock('tone', () => ({
  Gain: FakeGain,
  ToneAudioNode: class { dispose() { return this; } },
  getContext: () => ({ rawContext: { createGain: () => ({ gain: { value: 0 }, connect: () => undefined }), destination: {} } }),
}));
vi.mock('@utils/audio-context', () => ({ getNativeAudioNode: () => ({ connect: () => undefined }) }));

const posted: Array<{ type: string; param?: string; value?: number }> = [];
let node: { port: { onmessage: ((e: { data: unknown }) => void) | null; postMessage: (m: never) => void }; connect: () => void; disconnect: () => void };

import { MultibandLimiterEffect } from '../MultibandLimiterEffect';

type FakeGainNode = InstanceType<typeof FakeGain>;
type Internals = { dryGain: FakeGainNode; wetGain: FakeGainNode };
type Statics = { ensureInitialized: () => Promise<void>; wasmBinary: ArrayBuffer; jsCode: string };

describe('MultibandLimiter dry path alignment', () => {
  beforeEach(() => {
    posted.length = 0;
    vi.stubGlobal('AudioWorkletNode', function () {
      node = {
        port: { onmessage: null, postMessage: (m) => { posted.push(m); } },
        connect: () => undefined, disconnect: () => undefined,
      };
      return node;
    });
    const S = MultibandLimiterEffect as unknown as Statics;
    vi.spyOn(S, 'ensureInitialized').mockResolvedValue();
    S.wasmBinary = new ArrayBuffer(8);
    S.jsCode = '';
  });

  it('routes the dry/wet mix through the WASM, not an undelayed dry branch, once live', async () => {
    const fx = new MultibandLimiterEffect({ wet: 0.5 });
    const i = fx as unknown as Internals;
    await new Promise((r) => setTimeout(r, 0));
    // Before the WASM answers, the passthrough mixes in the wrapper.
    expect(i.dryGain.gain.value).toBe(0.5);

    node.port.onmessage!({ data: { type: 'ready' } });
    expect(i.dryGain.gain.value).toBe(0);
    expect(i.wetGain.gain.value).toBe(1);

    posted.length = 0;
    fx.wet = 0.25;
    expect(posted).toContainEqual({ type: 'parameter', param: 'mix', value: 0.25 });
    expect(i.dryGain.gain.value).toBe(0);
    expect(i.wetGain.gain.value).toBe(1);
  });
});
