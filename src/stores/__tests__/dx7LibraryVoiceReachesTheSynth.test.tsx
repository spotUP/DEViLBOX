/**
 * dx7LibraryVoiceReachesTheSynth.test.tsx - choosing a library voice in the DX7 editor
 * changes the instrument's DX7 parameters AND loads that bank into the synth.
 *
 * One wiring test, through the real entry point: DX7Controls (editor) -> onChange ->
 * useInstrumentStore.updateInstrument -> engine synth.loadLibraryBank (sentinel).
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor, within } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const loadLibraryBank = vi.fn();
const loadSysex = vi.fn();
const fakeSynth = { loadSysex, loadLibraryBank, loadPatchBank: vi.fn(), selectVoice: vi.fn(), loadVcedPreset: vi.fn(), _loadVcedData: vi.fn() };

vi.mock('@engine/ToneEngine', () => ({ getToneEngine: () => fakeEngine }));
vi.mock('../../engine/ToneEngine', () => ({ getToneEngine: () => fakeEngine }));
const fakeEngine = {
  instruments: new Map<number, unknown>(),
  getInstrumentKey: (id: number) => (id << 16) | 0xFFFF,
  instancesOf: (id: number) => [...fakeEngine.instruments.entries()].filter(([k]) => (k >> 16) === id).map(([, v]) => v),
  ensureInstrumentReady: async () => {},
};

import { useInstrumentStore } from '../useInstrumentStore';
import { DX7Controls } from '../../components/instruments/controls/DX7Controls';

const LIB = resolve(__dirname, '../../../public/data/sysex/dx7/');

const Editor: React.FC<{ id: number }> = ({ id }) => {
  const inst = useInstrumentStore(s => s.instruments.find(i => i.id === id))!;
  return (
    <DX7Controls
      instrument={inst as never}
      onChange={(u) => useInstrumentStore.getState().updateInstrument(id, u as never)}
    />
  );
};

describe('DX7 library voice reaches the instrument and the synth', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', async (url: string) => {
      const m = /data\/sysex\/dx7\/(.+)$/.exec(String(url));
      if (!m) return { ok: false };
      const buf = readFileSync(resolve(LIB, m[1]));
      return { ok: true, json: async () => JSON.parse(buf.toString('utf8')), arrayBuffer: async () => buf };
    });
    useInstrumentStore.setState({ instruments: [] });
    fakeEngine.instruments.clear();
    loadLibraryBank.mockClear();
  });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it('picking a voice from a library bank sets libraryBank/program and calls loadLibraryBank', async () => {
    const id = useInstrumentStore.getState().createInstrument({ name: 'DX7', type: 'synth', synthType: 'DX7', dx7: { volume: 1, bank: 0, program: 0 } } as never);
    fakeEngine.instruments.set((id << 16) | 0xFFFF, fakeSynth);
    const manifest = JSON.parse(readFileSync(resolve(LIB, 'manifest.json'), 'utf8'));
    const bank = manifest.banks[1];

    render(<Editor id={id} />);
    // Library browser: filter to the bank, browse it, click voice 5.
    fireEvent.change(await screen.findByLabelText('Search the library'), { target: { value: bank.name } });
    fireEvent.click(await screen.findByRole('option', { name: new RegExp(`^${bank.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`) }));
    fireEvent.click(within(screen.getByRole('listbox', { name: 'Voices' })).getAllByRole('option')[4]);

    await waitFor(() => expect(loadLibraryBank).toHaveBeenCalledWith(bank.file, 4));
    const dx7 = useInstrumentStore.getState().instruments.find(i => i.id === id)!.dx7!;
    expect(dx7.libraryBank).toBe(bank.file);
    expect(dx7.program).toBe(4);
    expect(dx7.bank).toBeUndefined();
  });
});
