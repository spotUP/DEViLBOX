// @vitest-environment node
/**
 * Regression: every FluidSynth instance played program 0 (piano). The factory
 * applies the instrument config (program, bank) right after construction,
 * before the worklet says 'ready'; set() only stores it then. On 'ready' the
 * engine called sendConfig(this.config), which diffs the config against
 * itself and so posted nothing. setPreset() had the same self-diff.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/utils/audio-context', () => {
  const node = () => ({ connect() {}, disconnect() {}, gain: { value: 0 } });
  const ctx = {
    sampleRate: 48000,
    destination: {},
    createGain: node,
    audioWorklet: { addModule: async () => {} },
  };
  return { getDevilboxAudioContext: () => ctx, noteToMidi: () => 60 };
});

type Msg = { type: string; index?: number; value?: number };
interface FakeNode { sent: Msg[]; port: { onmessage: ((e: { data: unknown }) => void) | null } }

async function startEngine() {
  const nodes: FakeNode[] = [];
  const g = globalThis as Record<string, unknown>;
  g.AudioWorkletNode = class {
    sent: Msg[] = [];
    port = { onmessage: null as FakeNode['port']['onmessage'], postMessage: (m: Msg) => { this.sent.push(m); } };
    constructor() { nodes.push(this); }
    connect() {}
    disconnect() {}
  };
  g.fetch = async () => ({ ok: true, status: 200, arrayBuffer: async () => new ArrayBuffer(0), text: async () => '' });

  const { FluidSynthSynthImpl } = await import('../FluidSynthSynth');
  const synth = new FluidSynthSynthImpl();
  for (let i = 0; i < 50 && nodes.length === 0; i++) await new Promise((r) => setTimeout(r, 1));
  return { synth, node: nodes[0] };
}

const setParams = (node: FakeNode) => node.sent.filter((m) => m.type === 'setParam');

describe('FluidSynth config set before the worklet is ready', () => {
  it('plays the instrument program and bank applied before ready, not program 0', async () => {
    const { synth, node } = await startEngine();
    synth.applyConfig({ program: 33, bank: 128 });
    expect(setParams(node)).toHaveLength(0);

    node.port.onmessage!({ data: { type: 'ready' } });

    expect(setParams(node)).toContainEqual({ type: 'setParam', index: 11, value: 33 });
    expect(setParams(node)).toContainEqual({ type: 'setParam', index: 12, value: 128 });
  });

  it('setPreset sends the preset values to a ready worklet', async () => {
    const { synth, node } = await startEngine();
    node.port.onmessage!({ data: { type: 'ready' } });
    node.sent.length = 0;

    synth.setPreset('Organ');

    const { FLUIDSYNTH_PRESETS } = await import('../FluidSynthSynth');
    expect(setParams(node)).toContainEqual({ type: 'setParam', index: 11, value: FLUIDSYNTH_PRESETS.Organ.program });
  });
});
