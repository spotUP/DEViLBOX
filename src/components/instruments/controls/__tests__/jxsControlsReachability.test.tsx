/**
 * JayTrax instrument editor reachability: JxsControls (no onChange, as the app mounts it) -> editJxsInstrument ->
 * commitJxsModule -> song.jxsFileData + format store + JxsEngine.replaceModule (sentinel on a fake engine), and the
 * module the engine receives renders a different note on that instrument in the real WASM replayer.
 * Per-field behaviour (every field moves the render or is exempt) lives in JxsInstrumentFields.wasm.test.ts and
 * jxsInstrument.roundtrip.test.ts.
 */
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import fs from 'node:fs';
import path from 'node:path';
import { loadJxsWasm, renderNote, differs } from '../../../../engine/jxs/__tests__/jxsWasmHarness';
import { readJxsInstrument, jxsLayout } from '@/lib/import/formats/jxsInstrument';

const replaceModule = vi.fn();
const song: { jxsFileData?: ArrayBuffer } = {};
vi.mock('@/engine/TrackerReplayer', () => ({ getTrackerReplayer: () => ({ getSong: () => song }) }));
vi.mock('@/engine/jxs/JxsEngine', () => ({ JxsEngine: { hasInstance: () => true, getInstance: () => ({ replaceModule }) } }));

import { useFormatStore } from '@stores/useFormatStore';
import { JxsControls } from '../JxsControls';

const FILE = path.resolve(__dirname, '../../../../../public/data/songs/formats/jbells.jxs');
const INSTRUMENT = 4; // "bass": audible, plays its own wave
let m: any;
let original: Uint8Array;

beforeAll(async () => { m = await loadJxsWasm(); });
beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => new Proxy({}, { get: () => () => {}, set: () => true }) as never);
  original = new Uint8Array(fs.readFileSync(FILE));
  const copy = original.slice().buffer as ArrayBuffer;
  song.jxsFileData = copy;
  useFormatStore.setState({ jxsFileData: copy });
  replaceModule.mockClear();
});
afterEach(async () => {
  // let every commit the test started finish before the mocks go away
  await new Promise((r) => setTimeout(r, 100));
  cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

/** The bytes the engine was last given. */
const delivered = (): Uint8Array => new Uint8Array(replaceModule.mock.calls.at(-1)![0] as ArrayBuffer);
const q = (): number => jxsLayout(original)!.instrumentOffset[INSTRUMENT - 1];
const render0 = (b: Uint8Array): Float32Array => renderNote(m, b, INSTRUMENT);

describe('JxsControls drives the module and the engine', () => {
  it('Volume knob: bytes at the field change, the engine is handed the module, the rendered note differs', async () => {
    render(<JxsControls instrumentId={INSTRUMENT} />);
    const before = render0(original);
    const knob = screen.getByRole('slider', { name: 'Volume' });
    expect(Number(knob.getAttribute('aria-valuenow'))).toBe(readJxsInstrument(original, INSTRUMENT - 1)!.volume);
    fireEvent.keyDown(knob, { key: 'ArrowDown', shiftKey: true });
    await waitFor(() => expect(replaceModule).toHaveBeenCalled());
    const out = delivered();
    const at = q() + 38;
    expect(out[at] | (out[at + 1] << 8)).toBeLessThan(original[at] | (original[at + 1] << 8));
    expect(differs(before, render0(out))).toBe(true);
    // the song and the format store carry the same module
    expect(new Uint8Array(song.jxsFileData!)).toEqual(out);
    expect(new Uint8Array(useFormatStore.getState().jxsFileData as ArrayBuffer)).toEqual(out);
    // everything outside the field is untouched
    const changed = out.reduce((n, v, k) => n + (v !== original[k] ? 1 : 0), 0);
    expect(changed).toBeGreaterThan(0);
    expect(changed).toBeLessThanOrEqual(2);
  });

  it('Invert on the Waves tab rewrites the wave data and the note differs', async () => {
    render(<JxsControls instrumentId={INSTRUMENT} />);
    const before = render0(original);
    fireEvent.click(screen.getByRole('button', { name: 'Waves' }));
    fireEvent.click(screen.getByRole('button', { name: 'Invert' }));
    await waitFor(() => expect(replaceModule).toHaveBeenCalled());
    const out = delivered();
    expect(out.some((v, k) => v !== original[k])).toBe(true);
    expect(differs(before, render0(out))).toBe(true);
  });

  it('an Arpeggio step input writes the shared table and the note differs', async () => {
    render(<JxsControls instrumentId={INSTRUMENT} />);
    const before = render0(original);
    fireEvent.click(screen.getByRole('button', { name: 'Arpeggio' }));
    const step = screen.getByLabelText('Arpeggio step 2');
    fireEvent.change(step, { target: { value: '12' } });
    await waitFor(() => expect(replaceModule).toHaveBeenCalled());
    const out = delivered();
    expect(out.length).toBe(original.length);
    expect(out.some((v, k) => v !== original[k])).toBe(true);
    expect(differs(before, render0(out))).toBe(true);
  });
});
