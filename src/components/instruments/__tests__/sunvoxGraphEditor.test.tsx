/**
 * SunVox one editor (plan 2026-10-24 A4-A8).
 *
 * Reachability: a new SunVoxSynth instrument -> UnifiedInstrumentEditor ('sunvox-synth' branch) -> SunVoxModularEditor
 * -> ToneEngine.getInstrument -> InstrumentFactory builds SunVoxModularSynth bound to the instrument (Generator -> Output)
 * -> Add Module -> knob -> engine.setModuleControl. Round trip: the debounced saveSong writes the handle bytes into
 * `sunvox.patchData`; a rebuild from the stored config has the same graph. Migration: schema 26 folds SunVoxModular.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

type Entry = { id: number; name: string; typeName: string; flags: number; inputs: number[]; outputs: number[]; controls: Array<{ name: string; min: number; max: number; value: number; type: number; group: number }> };

const fake = vi.hoisted(() => {
  const calls: Array<{ fn: string; args: unknown[] }> = [];
  const handles = new Map<number, Entry[]>();
  let nextHandle = 1;
  const ctl = () => [{ name: 'Volume', min: 0, max: 256, value: 128, type: 0, group: 0 }];
  const entry = (id: number, typeName: string): Entry => ({ id, name: typeName, typeName, flags: 0, inputs: [], outputs: [], controls: ctl() });
  const find = (h: number, id: number) => handles.get(h)!.find((m) => m.id === id)!;
  const engine = {
    output: {},
    ready: async () => {},
    createHandle: async () => { const h = nextHandle++; handles.set(h, [entry(0, 'Output')]); return h; },
    destroyHandle: (h: number) => { handles.delete(h); },
    newModule: async (h: number, type: string) => { const g = handles.get(h)!; const id = Math.max(...g.map((m) => m.id)) + 1; g.push(entry(id, type)); return id; },
    removeModule: async (h: number, id: number) => { handles.set(h, handles.get(h)!.filter((m) => m.id !== id)); },
    connectModules: async (h: number, src: number, dst: number) => { find(h, src).outputs.push(dst); find(h, dst).inputs.push(src); },
    disconnectModules: async () => {},
    setModuleControl: (h: number, id: number, c: number, v: number) => { find(h, id).controls[c].value = v; },
    getModuleGraph: async (h: number) => structuredClone(handles.get(h) ?? []),
    saveSong: async (h: number) => new TextEncoder().encode(JSON.stringify(handles.get(h))).buffer,
    loadSong: async (h: number, data: ArrayBuffer) => { handles.set(h, JSON.parse(new TextDecoder().decode(data))); },
    loadSynth: async (h: number) => engine.newModule(h, 'Generator'),
    sendMessage: () => {},
  };
  const recorded = new Proxy(engine, {
    get(t, k: string) {
      const v = (t as Record<string, unknown>)[k];
      return typeof v === 'function' ? (...args: unknown[]) => { calls.push({ fn: k, args }); return (v as (...a: unknown[]) => unknown)(...args); } : v;
    },
  });
  return { calls, handles, engine: recorded, synths: new Map<number, unknown>(), create: null as null | ((config: never) => unknown) };
});

vi.mock('@/engine/sunvox/SunVoxEngine', () => ({ SunVoxEngine: { getInstance: () => fake.engine } }));
vi.mock('@/utils/audio-context', async (orig) => ({ ...(await orig<Record<string, unknown>>()), getDevilboxAudioContext: () => ({ sampleRate: 48000 }) }));
// The real InstrumentFactory builds the voice (assigned below, after the imports, to avoid a mock import cycle).
vi.mock('@/engine/ToneEngine', () => ({
  getToneEngine: () => ({
    getInstrument: (id: number, config: never) => {
      if (!fake.synths.has(id)) fake.synths.set(id, fake.create!(config));
      return fake.synths.get(id);
    },
    invalidateInstrument: (id: number) => { fake.synths.delete(id); },
  }),
}));

import { UnifiedInstrumentEditor } from '@/components/instruments/editors/UnifiedInstrumentEditor';
import { useInstrumentStore } from '@stores/useInstrumentStore';
import { InstrumentFactory } from '@/engine/InstrumentFactory';
import { DEFAULT_SUNVOX, DEFAULT_SUNVOX_SYNTH_PATCH } from '@typedefs/instrument/defaults';
import type { InstrumentConfig } from '@typedefs/instrument';
import type { SunVoxModularSynth } from '@/engine/sunvox-modular/SunVoxModularSynth';
import { CURRENT_SCHEMA, migrateSavedProject } from '@/lib/persistence/migrations';

fake.create = (config) => InstrumentFactory.createInstrument(config);
const ID = 7;
const stored = () => useInstrumentStore.getState().instruments.find((i) => i.id === ID)!;
const types = (g: Entry[]) => g.map((m) => `${m.id}:${m.typeName}>${m.outputs.join(',')}`).sort();

beforeEach(() => { fake.calls.length = 0; fake.handles.clear(); fake.synths.clear(); });

describe('the SunVox graph editor', () => {
  it('builds Generator -> Output for a new instrument, adds a module and sends a knob move to the engine, then round-trips', async () => {
    const inst = { id: ID, name: 'SunVox', synthType: 'SunVoxSynth', sunvox: { ...DEFAULT_SUNVOX }, effects: [], volume: -6, pan: 0 } as unknown as InstrumentConfig;
    useInstrumentStore.setState({ instruments: [inst] });
    const Host = () => {
      const current = useInstrumentStore((s) => s.instruments.find((i) => i.id === ID)!);
      return <UnifiedInstrumentEditor instrument={current} onChange={(u) => useInstrumentStore.getState().updateInstrument(ID, u)} />;
    };
    render(<Host />);

    // A5: audible with no file. The engine built Generator -> Output and saved it into the instrument.
    await waitFor(() => expect(stored().sunvox?.patchData).toBeTruthy());
    expect(fake.calls.filter((c) => c.fn === 'newModule').map((c) => c.args[1])).toEqual(['Generator']);
    expect(stored().sunvox?.isSong).toBe(true);
    expect(stored().sunvox?.noteTargetModuleId).toBe(1);

    // A6: the editor shows the engine graph; add a module through the shelf, then move its knob in the rack.
    fireEvent.click(await screen.findByRole('button', { name: 'rack' }));
    fireEvent.click(screen.getByRole('button', { name: /Add Module/ }));
    fireEvent.click(screen.getAllByRole('button', { name: /^Filter\b/ })[0]);
    await waitFor(() => expect(fake.calls.filter((c) => c.fn === 'newModule').length).toBe(2));
    const filterId = fake.calls.filter((c) => c.fn === 'newModule')[1];
    expect(filterId.args[1]).toMatch(/Filter/);

    const knobs = await screen.findAllByRole('slider');
    const before = fake.calls.filter((c) => c.fn === 'setModuleControl').length;
    fireEvent.keyDown(knobs[knobs.length - 1], { key: 'ArrowUp' });
    await waitFor(() => expect(fake.calls.filter((c) => c.fn === 'setModuleControl').length, 'sentinel: engine ctl set').toBe(before + 1));

    // A7: the debounced saveSong puts the edited graph into sunvox.patchData.
    const synth = fake.synths.get(ID) as SunVoxModularSynth;
    const edited = types(await synth.getModuleGraph());
    expect(edited.some((s) => /Filter/.test(s))).toBe(true);
    await waitFor(() => expect(types(JSON.parse(new TextDecoder().decode(stored().sunvox!.patchData!)))).toEqual(edited), { timeout: 2000 });

    // Reload: a project save/load keeps the config; a fresh engine voice from it has the same graph.
    const reloaded = structuredClone(stored()) as InstrumentConfig;
    synth.dispose();
    const rebuilt = InstrumentFactory.createInstrument(reloaded) as unknown as SunVoxModularSynth;
    expect(types(await rebuilt.getModuleGraph())).toEqual(edited);
    expect(fake.calls.filter((c) => c.fn === 'loadSong').length).toBe(1);
  });
});

describe('schema 26 migration', () => {
  it('folds a stored SunVoxModular patch into a SunVoxSynth recipe and leaves song imports alone', () => {
    const project = {
      schemaVersion: 25,
      instruments: [
        { id: 1, name: 'Pad', synthType: 'SunVoxModular', sunvoxModular: DEFAULT_SUNVOX_SYNTH_PATCH },
        { id: 2, name: 'Song mod', synthType: 'SunVoxModular', sunvox: { ...DEFAULT_SUNVOX, patchData: new ArrayBuffer(4), isSong: true } },
      ],
    };
    migrateSavedProject(project, 25);
    expect(CURRENT_SCHEMA).toBe(26);
    expect(project.instruments[0]).toMatchObject({ synthType: 'SunVoxSynth', sunvox: { patchData: null }, sunvoxModular: DEFAULT_SUNVOX_SYNTH_PATCH });
    expect(project.instruments[1].synthType).toBe('SunVoxModular');
  });
});
