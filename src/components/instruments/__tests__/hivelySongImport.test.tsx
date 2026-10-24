/**
 * Reachability: the Hively editor header (UnifiedInstrumentEditor -> SynthTypeDispatcher hively branch) carries
 * "Import from Song". It opens the import dialog; "Choose Song" opens the in-app browser at the bundled
 * songs/hivelytracker folder; picking a .hvl lists its instruments; toggling one and pressing Import adds it to
 * the song as a new HivelySynth instrument. Only fetch and the engine are faked.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const fakeEngine = {
  instruments: new Map<number, unknown>(),
  instancesOf: () => [],
  getInstrumentKey: (id: number) => (id << 16) | 0xFFFF,
  ensureInstrumentReady: async () => {},
  getInstrumentAnalyser: () => null,
};
vi.mock('@engine/ToneEngine', () => ({ getToneEngine: () => fakeEngine }));
vi.mock('../../../engine/ToneEngine', () => ({ getToneEngine: () => fakeEngine }));

import { useInstrumentStore } from '../../../stores/useInstrumentStore';
import { UnifiedInstrumentEditor } from '../editors/UnifiedInstrumentEditor';
import { extractInstrumentsFromHvl } from '../../../lib/import/formats/HivelyParser';
import { DEFAULT_HIVELY } from '../../../types/instrument/defaults';
import { resetFileBrowserMemory } from '../../dialogs/fileBrowserMemory';

const LIB = resolve(__dirname, '../../../../public/data/songs/hivelytracker/');
const PICKED = 'waiting for a message.hvl';
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
    const m = /data\/songs\/hivelytracker\/([^/?]+)$/.exec(String(url));
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

describe('Hively editor imports instruments from a bundled song', () => {
  it('opens songs/hivelytracker, lists the song instruments and adds the picked one as a new HivelySynth', async () => {
    const id = 51;
    useInstrumentStore.setState({
      instruments: [{ id, name: 'Mine', type: 'synth', synthType: 'HivelySynth', hively: { ...DEFAULT_HIVELY }, effects: [], volume: -6, pan: 0 } as never],
      currentInstrumentId: id,
    });
    const buf = readFileSync(resolve(LIB, PICKED));
    const expected = extractInstrumentsFromHvl(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
    expect(expected.length).toBeGreaterThan(0);

    render(<Editor id={id} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Import from Song' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Choose Song' }));
    fireEvent.doubleClick(await screen.findByText(PICKED));

    await waitFor(() => expect(fetched).toEqual([PICKED]));
    const toggles = await screen.findAllByRole('button', { name: expected[0].name || 'Unnamed' });
    fireEvent.click(toggles[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Import (1)' }));

    const st = useInstrumentStore.getState();
    expect(st.instruments.length).toBe(2);
    const added = st.instruments.find((i) => i.id !== id)!;
    expect(added.synthType).toBe('HivelySynth');
    if (expected[0].name) expect(added.name).toBe(expected[0].name);
    expect(added.hively).toEqual(expected[0].config);
    await waitFor(() => expect(screen.queryByRole('button', { name: /^Import \(/ })).toBeNull());
  });
});
