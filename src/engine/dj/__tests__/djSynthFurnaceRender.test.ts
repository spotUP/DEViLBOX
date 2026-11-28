/**
 * DJR-synth: a Furnace song renders on a DJ deck through the tracker's own engine (FurnaceDispatchEngine +
 * FurnaceDispatch.worklet.js + FurnaceDispatch.wasm, the processor hosted in-process) and carries per-voice scopes
 * and mono stems taken from the worklet's oscilloscope read.
 *
 * Before: the render worker threw "not yet supported in DJ renderer" for every isSynthFormat file.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, vi, beforeAll } from 'vitest';

vi.mock('@/engine/ToneEngine', () => ({
  getToneEngine: () => ({ setInstrumentOutputOverride: () => {}, preloadInstruments: async () => {}, ensureWASMSynthsReady: async () => {}, rerouteNativeEngine: () => {} }),
}));

import { servePublicToFetch } from '@/test/audio/realWebAudio';
import { exposeNodeGlobalsForEmscripten } from '@/test/wasm/webBundle';
import { installFurnaceFileOpsWasm, readSong } from '@/lib/import/__tests__/furnaceFileOpsWasmHarness';
import { renderWithSynth } from '@/workers/dj-render/synthRender';

const SONG = 'furnace/misc/meaningful_connection_es5506.fur';
const NAME = 'meaningful_connection_es5506.fur';

const peak = (a: Float32Array): number => { let p = 0; for (const v of a) p = Math.max(p, Math.abs(v)); return p; };

describe('a Furnace song renders on a DJ deck through the Furnace engine', () => {
  beforeAll(() => {
    installFurnaceFileOpsWasm();
    servePublicToFetch();
    exposeNodeGlobalsForEmscripten();
  });

  it('renders non-silent stereo, one scope per voice and non-flat mono stems', async () => {
    const r = await renderWithSynth(readSong(SONG), NAME, 0, () => {}, 8, true);
    expect(r.sampleRate).toBe(44100);
    expect(r.left.length).toBeGreaterThan(44100);
    expect(Math.max(peak(r.left), peak(r.right))).toBeGreaterThan(0.001);
    expect(r.channelScopes).toBeDefined();
    expect(r.monoStems?.length ?? 0).toBeGreaterThan(0);
    const sounding = (r.monoStems ?? []).filter((s) => { let m = 0; for (const v of s.mono) m = Math.max(m, Math.abs(v)); return m > 32; });
    expect(sounding.length).toBeGreaterThan(0);
  }, 300_000);
});
