// @vitest-environment node
/**
 * Regression: D50 was silent through the app engine path (synth tester:
 * loaded=true, producedSound=false). D50Synth created the Roland SA chip and
 * poked its registers on note on, but nothing ever called MAMEEngine.render(),
 * so the chip output never reached the synth's output node.
 */
import { describe, it, expect, vi } from 'vitest';

const fakeProcessor: { onaudioprocess: ((e: unknown) => void) | null; connected: unknown } = {
  onaudioprocess: null,
  connected: null,
};
const outputNode = { gain: { value: 1 }, disconnect() {}, context: { currentTime: 0 } };

vi.mock('@/utils/audio-context', () => ({
  getDevilboxAudioContext: () => ({
    createGain: () => outputNode,
    createScriptProcessor: () => ({
      set onaudioprocess(f: (e: unknown) => void) { fakeProcessor.onaudioprocess = f; },
      connect(n: unknown) { fakeProcessor.connected = n; },
    }),
  }),
  noteToMidi: () => 60,
  timeToSeconds: () => 0,
}));
vi.mock('@engine/mame/MAMEROMLoader', () => ({
  loadD50ROMs: async () => ({
    firmware: new Uint8Array(4), ic30: new Uint8Array(4), ic29: new Uint8Array(4),
  }),
}));
vi.mock('../../MAMEEngine', async () => {
  const actual = await vi.importActual<typeof import('../../MAMEEngine')>('../../MAMEEngine');
  // Real attachRenderer logic over a fake chip whose render() returns a constant signal.
  const engine = Object.create(actual.MAMEEngine.prototype) as typeof actual.MAMEEngine.prototype;
  Object.assign(engine, {
    init: async () => {},
    createInstance: () => 1,
    rsaLoadRoms: () => {},
    write: () => {},
    render: (_h: number, n: number) => ({ left: new Float32Array(n).fill(0.5), right: new Float32Array(n).fill(0.5) }),
  });
  return { ...actual, MAMEEngine: { getInstance: () => engine } };
});

describe('D50 through the engine path', () => {
  it('routes the rendered chip signal into its output node', async () => {
    const { D50Synth } = await import('../D50Synth');
    const synth = new D50Synth();
    await synth.init();
    expect(fakeProcessor.connected).toBe(outputNode);
    const outL = new Float32Array(512);
    const outR = new Float32Array(512);
    fakeProcessor.onaudioprocess!({ outputBuffer: { getChannelData: (c: number) => (c === 0 ? outL : outR) } });
    expect(Math.max(...outL)).toBeGreaterThan(0.1);
  });
});
