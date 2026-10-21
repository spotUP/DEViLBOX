/**
 * Reachability (SF3-9): a General MIDI file imported with the default options
 * plays through the shared FluidSynth host on the GM SoundFont. Drives the
 * importer entry point, builds every instrument through InstrumentFactory
 * (the path ToneEngine uses), and records what reaches the worklet through a
 * fake AudioWorkletNode: each instrument binds its own slot with the track's
 * bank and program, drum tracks switch their slot to a drum channel on bank
 * 128, a tracker cell plays the original MIDI key on that slot, and the WASM
 * and the GM SoundFont are fetched once for the whole song.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { Midi } from '@tonejs/midi';
import type { ChannelData } from '@typedefs/tracker';

vi.mock('@/utils/audio-context', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/utils/audio-context')>();
  const ctx = {
    sampleRate: 48000, destination: {},
    createGain: () => ({ gain: { value: 1 }, connect() {}, disconnect() {} }),
    audioWorklet: { addModule: async () => {} },
  };
  return { ...actual, getDevilboxAudioContext: () => ctx };
});

type Msg = Record<string, unknown> & { type: string };
const nodes: Array<{ posted: Msg[]; reply(d: Msg): void }> = [];
const fetches: string[] = [];

const FIXTURE = resolve(__dirname, '../../../__tests__/fixtures/midi/queen_majesty.mid');
const flush = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };

beforeAll(() => {
  const g = globalThis as Record<string, unknown>;
  g.AudioWorkletNode = class {
    posted: Msg[] = [];
    port = { onmessage: null as ((e: { data: unknown }) => void) | null, postMessage: (m: Msg) => { this.posted.push(m); } };
    constructor() { nodes.push(this); }
    connect() {}
    disconnect() {}
    reply(data: Msg) { this.port.onmessage?.({ data }); }
  };
  g.fetch = async (url: string) => {
    fetches.push(String(url));
    return { ok: true, status: 200, headers: { get: () => null }, body: null, arrayBuffer: async () => new ArrayBuffer(16), text: async () => '' };
  };
  delete g.caches;
});

describe('GM MIDI import reaches the FluidSynth host', () => {
  it('queen_majesty: every track plays its program on its own slot, drums on bank 128 at their GM key, one WASM and one GM SoundFont fetch', async () => {
    const { importMIDIFile } = await import('@lib/import/MIDIImporter');
    const { InstrumentFactory } = await import('@/engine/InstrumentFactory');
    const { xmNoteToNoteName } = await import('@/engine/replayer/PeriodTables');
    type Fluid = { slot: number; triggerAttack(n: string): unknown };

    const bytes = readFileSync(FIXTURE);
    const r = await importMIDIFile(new File([bytes], 'queen_majesty.mid'));
    const channels: ChannelData[] = r.patterns[0].channels;
    expect(channels.length).toBeGreaterThan(4);

    // Ground truth straight from the file: the GM programs of the melodic tracks.
    const midi = new Midi(bytes);
    const filePrograms = new Set(midi.tracks.filter((t) => t.notes.length && !t.instrument.percussion).map((t) => t.instrument.number));

    const built = channels.map((ch) => {
      const inst = r.instruments.find((i) => i.id === ch.instrumentId)!;
      expect(inst.synthType).toBe('FluidSynth');
      return { ch, inst, synth: InstrumentFactory.createInstrument(inst) as unknown as Fluid };
    });
    await flush();

    // One shared worklet; the host fires 'ready' then loads default.sf2, then stacks GM.
    expect(nodes).toHaveLength(1);
    const node = nodes[0];
    node.reply({ type: 'ready' });
    await flush();
    node.reply({ type: 'sf2Loaded', filename: 'default.sf2' });
    await flush();
    node.reply({ type: 'sf2Loaded', filename: 'GeneralUser-GS.sf2' });
    await flush();

    const slots = built.map((b) => b.synth.slot);
    expect(new Set(slots).size).toBe(slots.length);

    const on = (type: string, slot: number) => node.posted.filter((m) => m.type === type && m.channel === slot);
    let drums = 0;
    for (const { ch, inst, synth } of built) {
      const { program, bank } = inst.fluidsynth!;
      expect(on('bankSelect', synth.slot).at(-1)?.bank).toBe(bank);
      expect(on('programChange', synth.slot).at(-1)?.program).toBe(program);
      if (bank === 128) {
        drums++;
        expect(on('setChannelType', synth.slot).at(-1)?.channelType).toBe(1);
      } else {
        expect(filePrograms.has(program!)).toBe(true);
      }

      // A tracker cell: the key that reaches the worklet is the original MIDI note.
      const cell = ch.rows.find((c) => c.note > 0 && c.note < 97)!;
      synth.triggerAttack(xmNoteToNoteName(cell.note));
      const noteOn = on('noteOn', synth.slot).at(-1)!;
      expect(noteOn.channel).toBe(synth.slot);
      expect(noteOn.key).toBe(cell.note + 11);
    }
    expect(drums).toBeGreaterThan(0);

    // Closed hi-hat sounds GM key 42.
    const hats = built.find((b) => b.ch.name === 'Closed Hi-Hat')!;
    expect(on('noteOn', hats.synth.slot).at(-1)?.key).toBe(42);

    expect(fetches.filter((u) => u.endsWith('FluidSynth.wasm'))).toHaveLength(1);
    expect(fetches.filter((u) => u.endsWith('GeneralUser-GS.sf2'))).toHaveLength(1);
    expect(node.posted.filter((m) => m.type === 'loadSF2').map((m) => m.filename)).toEqual(['default.sf2', 'GeneralUser-GS.sf2']);
  });
});
