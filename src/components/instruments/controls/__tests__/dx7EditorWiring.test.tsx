/**
 * The DX7 editor's tabs reach the firmware. One wiring test per tab, through the real entry point:
 * DX7LayoutPanel -> onChange -> useInstrumentStore.updateInstrument -> synth.setVcedParam / loadLibraryBank (sentinels
 * on a fake synth behind a fake engine), plus the values the panel shows are the firmware's, not the layout defaults.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor, within, act } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const setVcedParam = vi.fn();
const loadLibraryBank = vi.fn();
let firmware = new Uint8Array(155);
const fakeSynth = {
  loadSysex: vi.fn(), loadLibraryBank, loadPatchBank: vi.fn(), selectVoice: vi.fn(), loadVcedPreset: vi.fn(), _loadVcedData: vi.fn(),
  setVcedParam, readVoice: async () => firmware,
};
const fakeEngine = {
  instruments: new Map<number, unknown>(),
  getInstrumentKey: (id: number) => (id << 16) | 0xFFFF,
  ensureInstrumentReady: async () => {},
};
vi.mock('@engine/ToneEngine', () => ({ getToneEngine: () => fakeEngine }));
vi.mock('../../../../engine/ToneEngine', () => ({ getToneEngine: () => fakeEngine }));
vi.mock('@/engine/dx7/DX7Synth', async (orig) => {
  const real = await orig<typeof import('@/engine/dx7/DX7Synth')>();
  return { ...real, DX7Synth: Object.assign(real.DX7Synth, { subscribeVoiceStatus: () => () => {} }) };
});

import { useInstrumentStore } from '../../../../stores/useInstrumentStore';
import { DX7LayoutPanel } from '../DX7LayoutPanel';

const LIB = resolve(__dirname, '../../../../../public/data/sysex/dx7/');

const Editor: React.FC<{ id: number }> = ({ id }) => {
  const inst = useInstrumentStore((s) => s.instruments.find((i) => i.id === id))!;
  return <DX7LayoutPanel instrument={inst as never} onChange={(u) => useInstrumentStore.getState().updateInstrument(id, u as never)} />;
};

const knob = (label: string) => screen.getByRole('slider', { name: label });
const tab = (name: string) => fireEvent.click(screen.getByRole('tab', { name }));
const ID_BASE = 0;
let id = ID_BASE;

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => new Proxy({}, { get: () => () => {}, set: () => true }) as never);
  vi.stubGlobal('fetch', async (url: string) => {
    const m = /data\/sysex\/dx7\/(.+)$/.exec(String(url));
    if (!m) return { ok: false };
    const buf = readFileSync(resolve(LIB, m[1]));
    return { ok: true, json: async () => JSON.parse(buf.toString('utf8')), arrayBuffer: async () => buf };
  });
  firmware = new Uint8Array(155);
  firmware.fill(32, 145, 155);
  setVcedParam.mockClear(); loadLibraryBank.mockClear();
  useInstrumentStore.setState({ instruments: [] });
  fakeEngine.instruments.clear();
  id = useInstrumentStore.getState().createInstrument({ name: 'DX7', type: 'synth', synthType: 'DX7', dx7: { bank: 0, program: 0 } } as never);
  fakeEngine.instruments.set((id << 16) | 0xFFFF, fakeSynth);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('Voice tab', () => {
  it('Feedback to its maximum sends VCED 135 = 7, and Algorithm shows the firmware voice (not the layout default)', async () => {
    firmware[134] = 4; // algorithm 5
    render(<Editor id={id} />);
    await waitFor(() => expect(knob('Algorithm').getAttribute('aria-valuenow')).toBe('4'));
    fireEvent.keyDown(knob('Feedback'), { key: 'End' });
    await waitFor(() => expect(setVcedParam).toHaveBeenCalledWith(135, 7));
    expect(useInstrumentStore.getState().instruments.find((i) => i.id === id)!.dx7).toMatchObject({ vced: { '135': 7 } });
  });

  it('a second knob sends only its own key, and a knob never reloads the bank', async () => {
    render(<Editor id={id} />);
    fireEvent.keyDown(knob('Feedback'), { key: 'End' });
    await waitFor(() => expect(setVcedParam).toHaveBeenCalledTimes(1));
    fireEvent.keyDown(knob('Transpose'), { key: 'End' });
    await waitFor(() => expect(setVcedParam).toHaveBeenCalledWith(144, 48));
    expect(setVcedParam).toHaveBeenCalledTimes(2);
    expect(fakeSynth.loadPatchBank).not.toHaveBeenCalled();
    expect(loadLibraryBank).not.toHaveBeenCalled();
  });

  it('the Oscillator Key Sync toggle sends VCED 136 = 1', async () => {
    render(<Editor id={id} />);
    fireEvent.click(screen.getByRole('button', { name: 'Off' }));
    await waitFor(() => expect(setVcedParam).toHaveBeenCalledWith(136, 1));
  });

  it('renaming the voice writes the ten name bytes 145..154', async () => {
    render(<Editor id={id} />);
    const field = screen.getByLabelText('Voice Name');
    fireEvent.change(field, { target: { value: 'HELLO' } });
    fireEvent.keyDown(field, { key: 'Enter' });
    await waitFor(() => expect(setVcedParam).toHaveBeenCalledWith(145, 'H'.charCodeAt(0)));
    expect(setVcedParam).toHaveBeenCalledWith(149, 'O'.charCodeAt(0));
  });
});

describe('Operators tab', () => {
  it('Operator 3 Output Level reaches VCED 79 (operator 3 starts at 63), Operator 1 at 105+16', async () => {
    render(<Editor id={id} />);
    tab('Operators');
    tab('Operator 3');
    fireEvent.keyDown(knob('Output Level'), { key: 'End' });
    await waitFor(() => expect(setVcedParam).toHaveBeenCalledWith(79, 99));
    tab('Operator 1');
    fireEvent.keyDown(knob('Rate 1'), { key: 'Home' }); // firmware voice is all zeros here: no change, no call
    fireEvent.keyDown(knob('Level 2'), { key: 'End' });
    await waitFor(() => expect(setVcedParam).toHaveBeenCalledWith(105 + 5, 99));
  });

  it('the Frequency Mode toggle of Operator 2 sends VCED 101', async () => {
    render(<Editor id={id} />);
    tab('Operators');
    tab('Operator 2');
    fireEvent.click(screen.getByRole('button', { name: 'Ratio' })); // operator 2 starts at 84, mode at +17
    await waitFor(() => expect(setVcedParam).toHaveBeenCalledWith(101, 1));
  });
});

describe('Modulation tab', () => {
  it('LFO Speed reaches VCED 137 and Pitch Level 1 reaches VCED 130', async () => {
    render(<Editor id={id} />);
    tab('Modulation');
    fireEvent.keyDown(knob('LFO Speed'), { key: 'End' });
    await waitFor(() => expect(setVcedParam).toHaveBeenCalledWith(137, 99));
    fireEvent.keyDown(knob('Pitch Level 1'), { key: 'End' });
    await waitFor(() => expect(setVcedParam).toHaveBeenCalledWith(130, 99));
  });
});

describe('Library tab', () => {
  it('typing narrows the 246 banks; picking a voice sets libraryBank/program and loads the bank into the synth', async () => {
    const manifest = JSON.parse(readFileSync(resolve(LIB, 'manifest.json'), 'utf8'));
    const target = manifest.banks[1];
    render(<Editor id={id} />);
    tab('Library');
    const search = await screen.findByLabelText('Search the library');
    const banks = () => within(screen.getByRole('listbox', { name: 'Banks' })).getAllByRole('option');
    await waitFor(() => expect(banks()).toHaveLength(246));
    fireEvent.change(search, { target: { value: target.name } });
    await waitFor(() => expect(banks().length).toBeLessThan(246));
    fireEvent.click(banks().find((b) => b.textContent?.startsWith(target.name))!);
    const voices = within(screen.getByRole('listbox', { name: 'Voices' }));
    fireEvent.click(voices.getAllByRole('option')[4]);
    await waitFor(() => expect(loadLibraryBank).toHaveBeenCalledWith(target.file, 4));
    const dx7 = useInstrumentStore.getState().instruments.find((i) => i.id === id)!.dx7!;
    expect(dx7).toMatchObject({ libraryBank: target.file, program: 4 });
    expect(dx7.bank).toBeUndefined();
  });

  it('a library pick clears the knob edits of the previous voice', async () => {
    render(<Editor id={id} />);
    fireEvent.keyDown(knob('Feedback'), { key: 'End' });
    await waitFor(() => expect(setVcedParam).toHaveBeenCalled());
    tab('Library');
    const voices = await screen.findByRole('listbox', { name: 'Voices' });
    await act(async () => { fireEvent.click(within(voices).getAllByRole('option')[0]); });
    await waitFor(() => expect(loadLibraryBank).toHaveBeenCalled());
    expect(useInstrumentStore.getState().instruments.find((i) => i.id === id)!.dx7!.vced).toBeUndefined();
  });
});

describe('no dx7 values', () => {
  it('every tab renders for an instrument without a dx7 config and an engine that has no synth', () => {
    fakeEngine.instruments.clear();
    useInstrumentStore.setState({ instruments: [] });
    const bare = useInstrumentStore.getState().createInstrument({ name: 'DX7', type: 'synth', synthType: 'DX7' } as never);
    render(<Editor id={bare} />);
    for (const name of ['Operators', 'Modulation', 'Library', 'Voice']) {
      expect(() => tab(name)).not.toThrow();
    }
    tab('Operators');
    for (let n = 1; n <= 6; n++) { tab(`Operator ${n}`); expect(knob('Output Level')).toBeTruthy(); }
  });
});
