import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { loadWASMAssets, createWASMAssetsCache, type WASMLoaderConfig } from '../WASMSingletonBase';

/**
 * A WASM engine must be able to boot MORE THAN ONCE on the same AudioContext.
 *
 * UADE could not, and every UADE song after the first played silent
 * (2026-09-24, reported as "most uade formats seems broken ... maniacs of
 * noise plays silent", and "it works better when loaded from the tracker than
 * from the jukebox" — the jukebox loads song after song in one page session,
 * where the tracker's reloads hid it).
 *
 * The engine transferred the cache's only copy of the binary into the worklet
 * and nulled the cache. The loader then refused to fetch it again, because it
 * asked only whether the CONTEXT had been loaded — not whether the bytes were
 * still there. The second worklet got `wasmBinary: null`, Emscripten fell back
 * to XHR, and an AudioWorklet has no XMLHttpRequest:
 *
 *   Aborted(ReferenceError: XMLHttpRequest is not defined)
 *     at instantiateArrayBuffer ... at createWasm
 *
 * which marked the engine poisoned, which recreated it, which failed the same
 * way — a cascade that never recovers inside one page load.
 */
describe('the asset loader refills a cache that lost its bytes', () => {
  const config: WASMLoaderConfig = {
    dir: 'uade',
    workletFile: 'UADE.worklet.js',
    wasmFile: 'UADE.wasm',
    jsFile: 'UADE.js',
  };

  /** Enough AudioContext for the loader: it only registers the worklet module. */
  const fakeContext = () =>
    ({ audioWorklet: { addModule: vi.fn().mockResolvedValue(undefined) } }) as unknown as AudioContext;

  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn(async (url: string) =>
      url.includes('.wasm')
        ? ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) } as unknown as Response)
        : ({ ok: true, text: async () => 'var createUADE;' } as unknown as Response),
    );
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => vi.unstubAllGlobals());

  it('fetches the binary again after the engine gave its copy away', async () => {
    const cache = createWASMAssetsCache();
    const ctx = fakeContext();

    await loadWASMAssets(ctx, cache, config);
    expect(cache.wasmBinary, 'first load must fill the cache').not.toBeNull();

    // What createNode() used to do: hand the buffer over and drop the copy.
    cache.wasmBinary = null;

    await loadWASMAssets(ctx, cache, config);
    expect(
      cache.wasmBinary,
      'a second engine on the same context must still get the bytes',
    ).not.toBeNull();
  });

  it('still short-circuits when the cache is intact', async () => {
    const cache = createWASMAssetsCache();
    const ctx = fakeContext();

    await loadWASMAssets(ctx, cache, config);
    const callsAfterFirst = fetchMock.mock.calls.length;

    await loadWASMAssets(ctx, cache, config);
    expect(fetchMock.mock.calls.length, 'no refetch when nothing was lost').toBe(callsAfterFirst);
  });

  it('shares an in-flight load instead of fetching twice', async () => {
    const cache = createWASMAssetsCache();
    const ctx = fakeContext();

    await Promise.all([
      loadWASMAssets(ctx, cache, config),
      loadWASMAssets(ctx, cache, config),
    ]);

    // One .wasm + one .js, not two of each.
    expect(fetchMock.mock.calls.length).toBe(2);
  });
});
