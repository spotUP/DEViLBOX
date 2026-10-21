// @vitest-environment node
/**
 * SF3-7: the GM SoundFont is fetched once and kept in the Cache API, so a
 * later load (this page or the next session) makes no network request, and
 * a FluidSynth host stacks it on default.sf2 exactly once.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const statusMessages: string[] = [];
vi.mock('@/stores/useUIStore', () => ({
  useUIStore: { getState: () => ({ setStatusMessage: (msg: string) => { statusMessages.push(msg); } }) },
}));

let fetches: string[];
let store: Map<string, ArrayBuffer>;

function fakeResponse(bytes: ArrayBuffer, ok = true): Response {
  return {
    ok, status: ok ? 200 : 404,
    headers: { get: () => null },
    body: null,
    arrayBuffer: async () => bytes.slice(0),
    text: async () => '',
  } as unknown as Response;
}

beforeEach(() => {
  vi.resetModules();
  statusMessages.length = 0;
  fetches = [];
  store = new Map();
  const g = globalThis as Record<string, unknown>;
  g.fetch = async (url: string) => {
    fetches.push(url);
    return fakeResponse(new Uint8Array(url.endsWith('GeneralUser-GS.sf2') ? 64 : 8).buffer);
  };
  g.Response = class {
    private readonly bytes: ArrayBuffer;
    constructor(bytes: ArrayBuffer) { this.bytes = bytes; }
    async arrayBuffer() { return this.bytes.slice(0); }
  };
  g.caches = {
    open: async () => ({
      match: async (url: string) => (store.has(url) ? fakeResponse(store.get(url)!) : undefined),
      put: async (url: string, res: Response) => { store.set(url, await res.arrayBuffer()); },
    }),
  };
});

const gmFetches = () => fetches.filter((u) => u.endsWith('GeneralUser-GS.sf2'));

describe('GM SoundFont loader', () => {
  it('fetches once, then serves later loads from the Cache API with no network request', async () => {
    const { loadGMSoundFont, gmSoundFontUrl } = await import('../gmSoundFont');
    const first = await loadGMSoundFont();
    expect(first?.byteLength).toBe(64);
    expect(gmFetches()).toHaveLength(1);
    expect(store.has(gmSoundFontUrl())).toBe(true);

    // A new page: fresh module state, same cache.
    vi.resetModules();
    const again = await import('../gmSoundFont');
    const second = await again.loadGMSoundFont();
    expect(second?.byteLength).toBe(64);
    expect(gmFetches()).toHaveLength(1);
  });

  it('gives concurrent callers one fetch and separate buffers', async () => {
    const { loadGMSoundFont } = await import('../gmSoundFont');
    const [a, b] = await Promise.all([loadGMSoundFont(), loadGMSoundFont()]);
    expect(gmFetches()).toHaveLength(1);
    expect(a).not.toBe(b);
    expect(b?.byteLength).toBe(64);
  });

  it('returns null with a status message when the fetch fails, and does not cache it', async () => {
    (globalThis as Record<string, unknown>).fetch = async (url: string) => {
      fetches.push(url);
      return fakeResponse(new ArrayBuffer(0), false);
    };
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { loadGMSoundFont } = await import('../gmSoundFont');
    expect(await loadGMSoundFont()).toBeNull();
    expect(store.size).toBe(0);
    expect(statusMessages.at(-1)).toMatch(/failed/);
  });

  it('still loads when the Cache API is unavailable', async () => {
    delete (globalThis as Record<string, unknown>).caches;
    const { loadGMSoundFont } = await import('../gmSoundFont');
    expect((await loadGMSoundFont())?.byteLength).toBe(64);
  });
});

describe('FluidSynthHost GM SoundFont', () => {
  it('stacks the GM SoundFont after default.sf2, once, for any number of gm instruments', async () => {
    vi.doMock('@/utils/audio-context', () => {
      const ctx = {
        sampleRate: 48000, destination: {},
        createGain: () => ({ gain: { value: 1 }, connect() {}, disconnect() {} }),
        audioWorklet: { addModule: async () => {} },
      };
      return { getDevilboxAudioContext: () => ctx, noteToMidi: () => 60 };
    });
    type Msg = Record<string, unknown> & { type: string };
    const nodes: Array<{ posted: Msg[]; reply(d: Msg): void }> = [];
    (globalThis as Record<string, unknown>).AudioWorkletNode = class {
      posted: Msg[] = [];
      port = { onmessage: null as ((e: { data: unknown }) => void) | null, postMessage: (m: Msg) => { this.posted.push(m); } };
      constructor() { nodes.push(this); }
      connect() {}
      disconnect() {}
      reply(data: Msg) { this.port.onmessage?.({ data }); }
    };
    const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };

    const { FluidSynthSynthImpl } = await import('../FluidSynthSynth');
    new FluidSynthSynthImpl({ soundFont: 'gm' });
    new FluidSynthSynthImpl({ soundFont: 'gm', bank: 128 });
    new FluidSynthSynthImpl().applyConfig({ soundFont: 'gm' });
    await flush();
    const node = nodes[0];
    node.reply({ type: 'ready' });
    await flush();
    node.reply({ type: 'sf2Loaded', filename: 'default.sf2' });
    await flush();

    const loads = node.posted.filter((m) => m.type === 'loadSF2').map((m) => m.filename);
    expect(loads).toEqual(['default.sf2', 'GeneralUser-GS.sf2']);
    expect(gmFetches()).toHaveLength(1);
  });
});
