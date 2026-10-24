/**
 * Reachability: the Furnace editor's "Load Instrument" button (UnifiedInstrumentEditor -> SynthTypeDispatcher
 * furnace branch) opens the in-app browser at the chip's bundled folder (SYNTH_PATCH_DIRS: instruments/furnace/GB
 * for FurnaceGB, .fui and .dmp). Double-clicking a bundled .fui reads its bytes and the instrument store replaces
 * the Furnace config of THE INSTRUMENT BEING EDITED (not a new instrument). Only fetch and the engine are faked.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import manifest from '../../../../generated/file-manifest.json';

const fakeEngine = {
  instruments: new Map<number, unknown>(),
  instancesOf: () => [],
  getInstrumentKey: (id: number) => (id << 16) | 0xFFFF,
  ensureInstrumentReady: async () => {},
  getInstrumentAnalyser: () => null,
};
vi.mock('@engine/ToneEngine', () => ({ getToneEngine: () => fakeEngine }));
vi.mock('../../../../engine/ToneEngine', () => ({ getToneEngine: () => fakeEngine }));

import { useInstrumentStore } from '../../../../stores/useInstrumentStore';
import { UnifiedInstrumentEditor } from '../../editors/UnifiedInstrumentEditor';
import { FurnaceParser } from '../../../../lib/import/formats/FurnaceParser';
import { resetFileBrowserMemory } from '../../../dialogs/fileBrowserMemory';

const LIB = resolve(__dirname, '../../../../../public/data/instruments/furnace/GB/');
const PICKED = 'GB_Lead.fui';
const fetched: string[] = [];

const Editor: React.FC<{ id: number }> = ({ id }) => {
  const inst = useInstrumentStore((s) => s.instruments.find((i) => i.id === id))!;
  return <UnifiedInstrumentEditor instrument={inst} onChange={(u) => useInstrumentStore.getState().updateInstrument(id, u)} />;
};

beforeEach(() => {
  fetched.length = 0;
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => new Proxy({}, { get: () => () => {}, set: () => true }) as never);
  vi.stubGlobal('fetch', async (url: string) => {
    const m = /data\/instruments\/furnace\/GB\/([^/?]+)$/.exec(String(url));
    if (!m) return { ok: false, status: 404, headers: new Headers() };
    const name = decodeURIComponent(m[1]);
    fetched.push(name);
    const buf = readFileSync(resolve(LIB, name));
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    return { ok: true, status: 200, headers: new Headers({ 'content-type': 'application/octet-stream' }), arrayBuffer: async () => ab };
  });
  useInstrumentStore.setState({ instruments: [] });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); resetFileBrowserMemory(); });

describe('Furnace Load Instrument opens the chip folder and loads into the current instrument', () => {
  it('lists the GB folder, and picking a .fui replaces the edited instrument furnace config', async () => {
    const id = 41;
    useInstrumentStore.setState({
      instruments: [{ id, name: 'Mine', type: 'synth', synthType: 'FurnaceGB', effects: [], volume: -6, pan: 0 } as never, { id: 99, name: 'Other', type: 'synth', synthType: 'FurnaceGB', effects: [], volume: -6, pan: 0 } as never],
      currentInstrumentId: id,
    });
    const parse = vi.spyOn(FurnaceParser, 'parse');
    render(<Editor id={id} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Load Instrument' }));

    const gbFiles = (manifest as string[]).filter((p) => p.startsWith('/public/data/instruments/furnace/GB/') && /\.(fui|dmp)$/.test(p));
    expect(gbFiles.length).toBeGreaterThan(0);
    expect(await screen.findByText(PICKED)).toBeTruthy();
    fireEvent.doubleClick(screen.getByText(PICKED));

    await waitFor(() => expect(parse).toHaveBeenCalledTimes(1));
    expect(fetched).toEqual([PICKED]);
    const { name, config } = parse.mock.results[0].value as { name: string; config: unknown };
    const st = useInstrumentStore.getState();
    expect(st.instruments.length).toBe(2); // loaded in place, no new instrument
    const mine = st.instruments.find((i) => i.id === id)!;
    expect(mine.furnace).toEqual(config);
    if (name) expect(mine.name).toBe(name);
    expect(st.instruments.find((i) => i.id === 99)!.furnace).toBeUndefined();
    await waitFor(() => expect(screen.queryByText(PICKED)).toBeNull());
  });
});
