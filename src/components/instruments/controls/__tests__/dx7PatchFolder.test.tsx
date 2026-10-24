/**
 * B6 reachability: the DX7 "Load SysEx File" button opens the in-app FileBrowser at the synth's mapped
 * folder (SYNTH_PATCH_DIRS: data/sysex/dx7, .syx only, listed from the real file manifest); double-clicking a
 * bundled file reads its bytes through the pick-file branch of useFileNavigation.handleLoad and the DX7
 * firmware receives them. Only the byte fetch is faked (it serves the real file from public/data/sysex/dx7).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import manifest from '../../../../generated/file-manifest.json';

const fakeSynth = { loadSysex: vi.fn(), _loadVcedData: vi.fn() };
const fakeEngine = {
  instruments: new Map<number, unknown>(),
  instancesOf: () => [fakeSynth],
  getInstrumentKey: (id: number) => (id << 16) | 0xFFFF,
  ensureInstrumentReady: async () => {},
};
vi.mock('@engine/ToneEngine', () => ({ getToneEngine: () => fakeEngine }));
vi.mock('../../../../engine/ToneEngine', () => ({ getToneEngine: () => fakeEngine }));

import { DX7Controls } from '../DX7Controls';
import { resetFileBrowserMemory } from '../../../dialogs/fileBrowserMemory';

const LIB = resolve(__dirname, '../../../../../public/data/sysex/dx7/');
const PICKED = 'benson-clav1.syx';
const pickedFetches: string[] = [];

beforeEach(() => {
  pickedFetches.length = 0;
  fakeSynth.loadSysex.mockClear();
  fakeEngine.instruments.set((7 << 16) | 0xFFFF, fakeSynth);
  vi.stubGlobal('fetch', async (url: string) => {
    const m = /data\/sysex\/dx7\/([^/?]+)$/.exec(String(url));
    if (!m) return { ok: false, status: 404, headers: new Headers() };
    if (m[1].endsWith('.syx')) pickedFetches.push(decodeURIComponent(m[1]));
    const buf = readFileSync(resolve(LIB, decodeURIComponent(m[1])));
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    return { ok: true, status: 200, headers: new Headers({ 'content-type': 'application/octet-stream' }), arrayBuffer: async () => ab, json: async () => JSON.parse(buf.toString('utf8')) };
  });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); resetFileBrowserMemory(); });

describe('DX7 Load SysEx File opens the bundled DX7 folder', () => {
  it('lists data/sysex/dx7 .syx files from the manifest, and picking one loads its bytes into the synth', async () => {
    const onChange = vi.fn();
    render(<DX7Controls instrument={{ id: 7, synthType: 'DX7', dx7: { bank: 0, program: 0 } }} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Load SysEx File' }));

    // Opened at the mapped folder: the entries are the manifest's dx7 files (a sample of them, by name).
    const onDisk = readdirSync(LIB).filter((f) => f.endsWith('.syx'));
    const inManifest = (manifest as string[]).filter((p) => p.startsWith('/public/data/sysex/dx7/') && p.endsWith('.syx'));
    expect(inManifest.length).toBe(onDisk.length);
    expect(await screen.findByText(PICKED)).toBeTruthy();
    // Nothing from the folder tree above (a sibling sysex folder's file is not listed).
    const other = (manifest as string[]).find((p) => p.startsWith('/public/data/sysex/') && !p.startsWith('/public/data/sysex/dx7/') && p.endsWith('.syx'));
    if (other) expect(screen.queryByText(other.split('/').pop()!)).toBeNull();

    fireEvent.doubleClick(screen.getByText(PICKED));

    // Sentinel: handleLoad's pick-file branch fetched exactly the picked bundled file (the song-load branch would not).
    await waitFor(() => expect(fakeSynth.loadSysex).toHaveBeenCalledTimes(1));
    expect(pickedFetches).toEqual([PICKED]);
    // The firmware got the bank bytes of the real file.
    const sent = new Uint8Array(fakeSynth.loadSysex.mock.calls[0][0] as ArrayBuffer);
    expect(sent.length).toBeGreaterThan(4000);
    // The instrument forgets its library/preset selection: the file is now the voice source.
    expect(onChange).toHaveBeenCalledWith({ dx7: { libraryBank: undefined, bank: undefined, vcedPreset: undefined, vced: undefined } });
    // Browser closed after the pick.
    await waitFor(() => expect(screen.queryByText(PICKED)).toBeNull());
  });
});
