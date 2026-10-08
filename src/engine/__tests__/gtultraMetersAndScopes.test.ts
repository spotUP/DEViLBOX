/**
 * A dropped GoatTracker .sng shows channel VU meters and channel oscilloscopes.
 *
 * Owner, 2026-10-08 (E18): $3jammar-akhbar.sng opens in GTUltraView and plays,
 * with no VU meters and no scopes. The GT worklet rendered one stereo mix and
 * never fed the shared oscilloscope store that the meters and the scopes both
 * read. Now reSID writes every voice's own output beside the mix and the
 * worklet streams it (worklets/channel-stream.js).
 *
 * Drives the product path: openUserSong of the real file, then the real
 * GTUltraEngine over the real worklet and WASM (only the browser's
 * AudioWorkletNode is stood in for), then reads what the meters read.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, basename } from 'node:path';
import { loadSharedWorkletScripts, ROOT, type WorkletProc } from './workletHarness';

vi.mock('@/engine/ToneEngine', () => {
  const engine = {
    releaseAll: vi.fn(), disposeAllInstruments: vi.fn(), preloadInstruments: vi.fn(async () => {}),
    invalidateInstrument: vi.fn(), setBPM: vi.fn(),
  };
  return { getToneEngine: () => engine };
});
vi.mock('@/stores/useNotificationStore', () => ({ notify: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() } }));
vi.mock('@/lib/modland/ModlandDetector', () => ({ checkModlandFile: vi.fn(async () => ({ found: true })), markKnownSource: vi.fn(), isKnownSource: () => true }));
vi.mock('@stores/useInstrumentTypeStore', () => ({
  useInstrumentTypeStore: { getState: () => ({ resetClassified: () => {}, classifyInstruments: () => {} }) },
}));
vi.mock('@/lib/songdb', () => ({ computeSongDBHash: () => '', lookupSongDB: async () => null }));

import { GTUltraEngine } from '@/engine/gtultra/GTUltraEngine';
import { useGTUltraStore } from '@/stores/useGTUltraStore';
import { useOscilloscopeStore, liveScopeFrame } from '@/stores/useOscilloscopeStore';
import { waveformVuLevel } from '@/components/tracker/waveformVuLevel';
import { openUserSong } from '@/lib/song/openUserSong';

const GT = 'public/data/songs/goat-tracker-ultra/$3jammar-akhbar.sng';

/** The browser's AudioWorkletNode over the real GT worklet class; its two ports talk directly. */
function installWorkletNode(): { processor: () => WorkletProc } {
  let Processor!: new () => WorkletProc;
  let instance!: WorkletProc;
  const scope: Record<string, unknown> = {
    AudioWorkletProcessor: class {
      port = { postMessage: (m: unknown) => { node.port.onmessage?.({ data: m }); }, onmessage: null };
    },
    registerProcessor: (_n: string, cls: new () => WorkletProc) => { Processor = cls; },
    sampleRate: 48000, currentTime: 0,
  };
  new Function(...Object.keys(scope), readFileSync(resolve(ROOT, 'public/gtultra/GTUltra.worklet.js'), 'utf8'))(...Object.values(scope));
  let node!: { port: { postMessage: (m: unknown) => void; onmessage: ((e: { data: unknown }) => void) | null }; connect: () => void };
  vi.stubGlobal('AudioWorkletNode', class {
    port = {
      postMessage: (m: { type?: string }) => {
        const handle = (instance as unknown as { handleMessage(d: unknown): Promise<void> }).handleMessage.bind(instance);
        // emscripten picks its Node loader when process.versions.node exists
        const versions = Object.getOwnPropertyDescriptor(process, 'versions')!;
        if (m.type === 'init') Object.defineProperty(process, 'versions', { value: {}, configurable: true });
        void handle(m).finally(() => { if (m.type === 'init') Object.defineProperty(process, 'versions', versions); });
      },
      onmessage: null as ((e: { data: unknown }) => void) | null,
    };
    connect() {}
    disconnect() {}
    constructor() {
      node = this as unknown as typeof node;
      instance = new Processor();
    }
  });
  return { processor: () => instance };
}

function fakeContext(): AudioContext {
  const gain = () => ({ gain: { value: 1 }, connect() {}, disconnect() {} });
  return { audioWorklet: { addModule: async () => {} }, createGain: gain, destination: {}, state: 'running', sampleRate: 48000 } as unknown as AudioContext;
}

beforeAll(() => {
  loadSharedWorkletScripts();
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const file = String(url).split('?')[0].replace(/^\//, 'public/');
    return new Response(readFileSync(resolve(ROOT, file)) as unknown as BodyInit);
  }));
});

describe('a dropped GoatTracker song', () => {
  it('feeds every channel its own waveform to the meters and scopes while it plays, and clears them on stop', async () => {
    const worklet = installWorkletNode();

    const bytes = new Uint8Array(readFileSync(resolve(ROOT, GT)));
    await openUserSong(new File([bytes as unknown as BlobPart], basename(GT)), 'drop', undefined, () => {});
    const pending = useGTUltraStore.getState().pendingSongData;
    expect(pending?.byteLength).toBeGreaterThan(0);

    const engine = new GTUltraEngine(fakeContext());
    await engine.init();
    await engine.ready;
    engine.loadSong(pending!.buffer.slice(pending!.byteOffset, pending!.byteOffset + pending!.byteLength) as ArrayBuffer);
    await vi.waitFor(() => expect(useOscilloscopeStore.getState().numChannels).toBeGreaterThan(0));
    const channels = useOscilloscopeStore.getState().numChannels;
    expect(channels).toBe(3);

    engine.play();
    const out = [[new Float32Array(128), new Float32Array(128)]];
    const peaks = new Array<number>(channels).fill(0);
    // The song brings its voices in one by one: run until all three have sounded.
    for (let block = 0; block < 4000 && peaks.some((p) => p <= 0.01); block++) {
      worklet.processor().process([], out);
      const frame = liveScopeFrame();
      if (!frame) continue;
      for (let c = 0; c < channels; c++) {
        const w = frame[c];
        if (!w) continue;
        peaks[c] = Math.max(peaks[c], waveformVuLevel(null, w));
      }
    }
    for (let c = 0; c < channels; c++) expect(peaks[c], `channel ${c + 1} meter level`).toBeGreaterThan(0.01);

    // Each channel carries its own voice, not one mix copied three times.
    const last = useOscilloscopeStore.getState().channelData;
    expect(Array.from(last[0]!)).not.toEqual(Array.from(last[1]!));
    expect(Array.from(last[1]!)).not.toEqual(Array.from(last[2]!));

    engine.stop();
    const after = useOscilloscopeStore.getState();
    expect(after.isActive).toBe(false);
    expect(liveScopeFrame()).toBeNull();
    engine.dispose();
  }, 120_000);
});
