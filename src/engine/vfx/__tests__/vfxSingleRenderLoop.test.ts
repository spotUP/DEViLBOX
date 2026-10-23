// @vitest-environment node
/**
 * Regression: "VFXSynth starts one render loop". VFXSynth carried its own copy
 * of the ScriptProcessor render loop next to the shared
 * MAMEEngine.attachRenderer used by the sibling chip synths. It must use the
 * shared one, and create exactly one processor per instance.
 */
import { describe, it, expect, vi } from 'vitest';

const created: unknown[] = [];
const attach = vi.fn();

vi.mock('@/utils/audio-context', () => ({
  getDevilboxAudioContext: () => ({
    createGain: () => ({ gain: { value: 1 }, disconnect() {}, context: { currentTime: 0 } }),
    createScriptProcessor: () => { const p = { connect() {}, onaudioprocess: null }; created.push(p); return p; },
  }),
  noteToMidi: () => 60,
  timeToSeconds: () => 0,
}));
vi.mock('@engine/mame/MAMEROMLoader', () => ({ loadVFXROMs: async () => null }));
vi.mock('../../MAMEEngine', async () => {
  const actual = await vi.importActual<typeof import('../../MAMEEngine')>('../../MAMEEngine');
  const engine = Object.create(actual.MAMEEngine.prototype) as typeof actual.MAMEEngine.prototype;
  Object.assign(engine, {
    init: async () => {},
    createInstance: () => 1,
    write: () => {},
    attachRenderer: (...a: unknown[]) => { attach(...a); },
  });
  return { ...actual, MAMEEngine: { getInstance: () => engine } };
});

describe('VFXSynth starts one render loop', () => {
  it('attaches the shared renderer once and builds no private processor', async () => {
    const { VFXSynth } = await import('../VFXSynth');
    const synth = new VFXSynth();
    await synth.init();
    await synth.init();
    expect(attach).toHaveBeenCalledTimes(1);
    expect(created.length).toBe(0);
  });
});
