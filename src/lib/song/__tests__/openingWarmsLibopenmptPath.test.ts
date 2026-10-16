/**
 * Opening a song that plays through libopenmpt warms that path at once: the
 * soundlib WASM, the libopenmpt worklet engine and the SynthEffectProcessor
 * chunk. These used to load inside the first play() after a page load and
 * held row 1 back by ~500 ms on that play only (doubletrigger.dbx, findings
 * thoughts/spot/2026-10-15_dx7-double-findings.md "First-play 500 ms delay").
 * One test through applySong; a song for another engine is not warmed.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const warm = vi.hoisted(() => ({ soundlib: 0, engineReady: 0, effectChunk: 0 }));

vi.mock('@/engine/ToneEngine', () => {
  const engine = {
    releaseAll: vi.fn(), disposeAllInstruments: vi.fn(), preloadInstruments: vi.fn(async () => {}),
    invalidateInstrument: vi.fn(), setBPM: vi.fn(), ensureInstrumentReady: vi.fn(),
  };
  return { getToneEngine: () => engine };
});
vi.mock('@stores/useInstrumentTypeStore', () => ({
  useInstrumentTypeStore: { getState: () => ({ resetClassified: () => {}, classifyInstruments: () => {} }) },
}));
vi.mock('@lib/import/wasm/OpenMPTSoundlib', () => ({
  preloadSoundlib: vi.fn(async () => { warm.soundlib++; }),
}));
vi.mock('@engine/libopenmpt/LibopenmptEngine', () => ({
  LibopenmptEngine: { getInstance: () => ({ ready: async () => { warm.engineReady++; } }) },
}));
vi.mock('@engine/replayer/SynthEffectProcessor', () => {
  warm.effectChunk++;
  return { SynthEffectProcessor: class {} };
});

import { applySong, type SongToApply } from '@/lib/song/applySong';
import { routesThroughLibopenmpt } from '@/engine/libopenmpt/warmLibopenmptPlayback';

const song = (engine: SongToApply['engine']): SongToApply => ({
  instruments: [],
  patterns: [{ id: 'p0', name: 'P0', length: 8, channels: [] } as unknown as SongToApply['patterns'][number]],
  order: [0],
  bpm: 125,
  speed: 6,
  metadata: { name: 'doubletrigger' },
  originalModuleData: null,
  engine,
  preload: false,
});

const settle = () => new Promise((r) => setTimeout(r, 0));

describe('opening a song warms the libopenmpt playback path', () => {
  beforeEach(() => { warm.soundlib = 0; warm.engineReady = 0; });

  it('an instrument-level song (.dbx, empty-XM path) warms soundlib and engine at open; a Hively song does not', async () => {
    await applySong(song({}), 'import');
    await settle();
    expect(warm.soundlib).toBe(1);
    expect(warm.engineReady).toBe(1);
    expect(warm.effectChunk).toBe(1);

    warm.soundlib = 0; warm.engineReady = 0;
    await applySong(song({ hivelyFileData: new ArrayBuffer(4) }), 'import');
    await settle();
    expect(warm.soundlib).toBe(0);
    expect(warm.engineReady).toBe(0);
  });

  it('the routing rule matches play(): module data yes, other engines and native samples no', () => {
    expect(routesThroughLibopenmpt({})).toBe(true);
    expect(routesThroughLibopenmpt({ libopenmptFileData: new ArrayBuffer(4) })).toBe(true);
    expect(routesThroughLibopenmpt({ furnaceNative: {} })).toBe(false);
    expect(routesThroughLibopenmpt({ nativeSamplePlayback: true })).toBe(false);
    expect(routesThroughLibopenmpt({ goatTrackerData: new Uint8Array(1) })).toBe(false);
    expect(routesThroughLibopenmpt({ sf2StoreData: {} })).toBe(false);
    expect(routesThroughLibopenmpt({ hivelyFileData: undefined, format: 'XM' })).toBe(true);
  });
});
