// @vitest-environment node
/**
 * SF3-6: FluidSynthSynthEngine is a facade over one slot (MIDI channel +
 * audio group) of the shared FluidSynthHost. Program and bank go to the slot
 * with bankSelect/programChange, notes carry channel = slot, and dispose
 * gives the slot back.
 *
 * Also the regression where every instance played program 0: the factory
 * applies program/bank right after construction, before the worklet is
 * ready; that config must reach the synth once the SoundFont is in.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/utils/audio-context', () => {
  const ctx = {
    sampleRate: 48000,
    destination: {},
    createGain: () => ({ gain: { value: 1 }, connect() {}, disconnect() {} }),
    audioWorklet: { addModule: async () => {} },
  };
  return { getDevilboxAudioContext: () => ctx, noteToMidi: (n: string) => (n === 'C4' ? 60 : 69) };
});

type Msg = Record<string, unknown> & { type: string };
interface FakeNode { posted: Msg[]; reply(data: Msg): void }

let nodes: FakeNode[];

beforeEach(() => {
  vi.resetModules();
  nodes = [];
  const g = globalThis as Record<string, unknown>;
  g.fetch = async () => ({ ok: true, status: 200, arrayBuffer: async () => new ArrayBuffer(8), text: async () => '' });
  g.AudioWorkletNode = class {
    posted: Msg[] = [];
    port = {
      onmessage: null as ((e: { data: unknown }) => void) | null,
      postMessage: (m: Msg) => { this.posted.push(m); },
    };
    constructor() { nodes.push(this as unknown as FakeNode); }
    connect() {}
    disconnect() {}
    reply(data: Msg) { this.port.onmessage?.({ data }); }
  };
});

const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };

async function bootHost(): Promise<FakeNode> {
  await flush();
  const node = nodes[0];
  node.reply({ type: 'ready' });
  await flush();
  node.reply({ type: 'sf2Loaded' });
  return node;
}

const onSlot = (node: FakeNode, slot: number, type: string) =>
  node.posted.filter((m) => m.type === type && m.channel === slot);

describe('FluidSynth instrument facade', () => {
  it('plays the program and bank applied before ready on its own slot, not program 0', async () => {
    const { FluidSynthSynthImpl } = await import('../FluidSynthSynth');
    const piano = new FluidSynthSynthImpl();
    const bass = new FluidSynthSynthImpl();
    bass.applyConfig({ program: 33 });
    const node = await bootHost();

    expect(piano.slot).not.toBe(bass.slot);
    expect(onSlot(node, bass.slot, 'programChange').at(-1)).toMatchObject({ program: 33 });
    expect(onSlot(node, piano.slot, 'programChange').at(-1)).toMatchObject({ program: 0 });
    // Never the old channel-0-only setParam 11/12.
    expect(node.posted.some((m) => m.type === 'setParam' && (m.index === 11 || m.index === 12))).toBe(false);
  });

  it('sends bankSelect before programChange and switches the channel type for the drum bank', async () => {
    const { FluidSynthSynthImpl } = await import('../FluidSynthSynth');
    const synth = new FluidSynthSynthImpl();
    const node = await bootHost();
    node.posted.length = 0;

    synth.applyConfig({ bank: 128, program: 25 });

    const mine = node.posted.filter((m) => m.channel === synth.slot).map((m) => m.type);
    expect(mine).toContain('setChannelType');
    expect(onSlot(node, synth.slot, 'setChannelType').at(-1)).toMatchObject({ channelType: 1 });
    expect(mine.lastIndexOf('bankSelect')).toBeLessThan(mine.lastIndexOf('programChange'));
    expect(onSlot(node, synth.slot, 'bankSelect').at(-1)).toMatchObject({ bank: 128 });
    expect(onSlot(node, synth.slot, 'programChange').at(-1)).toMatchObject({ program: 25 });
  });

  it('allocates a drum slot up front for a bank-128 config', async () => {
    const { FluidSynthSynthEngine } = await import('../FluidSynthSynth');
    const kit = new FluidSynthSynthEngine({ bank: 128, program: 0 });
    const node = await bootHost();
    expect(onSlot(node, kit.slot, 'setChannelType')).toEqual([
      { type: 'setChannelType', channel: kit.slot, channelType: 1 },
    ]);
  });

  it('scopes notes and all-notes-off to its slot', async () => {
    const { FluidSynthSynthEngine } = await import('../FluidSynthSynth');
    new FluidSynthSynthEngine();
    const synth = new FluidSynthSynthEngine();
    const node = await bootHost();

    synth.triggerAttack('C4', undefined, 1);
    synth.triggerRelease('C4');
    synth.triggerRelease();

    expect(onSlot(node, synth.slot, 'noteOn')).toEqual([{ type: 'noteOn', channel: synth.slot, key: 60, velocity: 127 }]);
    expect(onSlot(node, synth.slot, 'noteOff')).toEqual([{ type: 'noteOff', channel: synth.slot, key: 60 }]);
    expect(node.posted.filter((m) => m.type === 'allNotesOff')).toEqual([{ type: 'allNotesOff', channel: synth.slot }]);
  });

  it('applies transpose to the key and releases the key it played', async () => {
    const { FluidSynthSynthEngine } = await import('../FluidSynthSynth');
    const synth = new FluidSynthSynthEngine({ transpose: -12 });
    const node = await bootHost();

    synth.triggerAttack('C4');
    synth.set('transpose', 0);
    synth.triggerRelease('C4');

    expect(onSlot(node, synth.slot, 'noteOn')[0]).toMatchObject({ key: 48 });
    expect(onSlot(node, synth.slot, 'noteOff')[0]).toMatchObject({ key: 48 });
  });

  it('frees its slot and its host reference on dispose', async () => {
    const { FluidSynthSynthEngine } = await import('../FluidSynthSynth');
    const { FluidSynthHost } = await import('../FluidSynthHost');
    const { getDevilboxAudioContext } = await import('@/utils/audio-context');
    const synth = new FluidSynthSynthEngine();
    const node = await bootHost();
    const host = FluidSynthHost.peek(getDevilboxAudioContext())!;
    expect(host.slotUsers(synth.slot)).toBe(1);

    synth.dispose();

    expect(host.slotUsers(synth.slot)).toBe(0);
    expect(host.refCount).toBe(0);
    expect(onSlot(node, synth.slot, 'allSoundsOff')).toHaveLength(1);
    const next = new FluidSynthSynthEngine();
    expect(next.slot).toBe(synth.slot);
  });

  it('setPreset sends the preset program to its slot on a ready synth', async () => {
    const { FluidSynthSynthImpl, FLUIDSYNTH_PRESETS } = await import('../FluidSynthSynth');
    const synth = new FluidSynthSynthImpl();
    const node = await bootHost();
    node.posted.length = 0;

    synth.setPreset('Organ');

    expect(onSlot(node, synth.slot, 'programChange').at(-1)).toMatchObject({ program: FLUIDSYNTH_PRESETS.Organ.program });
  });
});
