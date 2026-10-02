/**
 * A real Web Audio implementation for tests: node-web-audio-api renders audio
 * in Node, so a test can build the real `DubBus` (and real Tone) on an
 * OfflineAudioContext and measure what comes out of it, instead of asserting
 * on source text.
 *
 * Call `installRealWebAudio()` before importing Tone or anything that imports
 * it: Tone creates its default context, and checks `instanceof` against these
 * globals, at module load.
 */
import * as webAudio from 'node-web-audio-api';
import { dirname, join } from 'node:path';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { readFile } from 'node:fs/promises';

/** Worklet modules and public files still loading — see `audioLoadsSettled`. */
let inFlight = 0;
/** Captured at load, so waiting for real I/O works under fake timers. */
const realSetTimeout = globalThis.setTimeout.bind(globalThis);

/** Wait `ms` of real time, whatever the test has done to the timers. */
export const realDelay = (ms: number): Promise<void> => new Promise((resolve) => realSetTimeout(resolve, ms));
const track = <T>(p: Promise<T>): Promise<T> => {
  inFlight++;
  return p.finally(() => { inFlight--; });
};

/**
 * Resolve once nothing has been loading for `quietMs` of real time. A
 * worklet effect splices itself in when its module and WASM arrive, so a
 * render started before then has its graph change under it. Waits on the
 * real clock, so it works while a test runs on fake timers.
 */
export async function audioLoadsSettled(quietMs = 300, timeoutMs = 15000): Promise<void> {
  const now = () => Number(process.hrtime.bigint() / 1_000_000n);
  const start = now();
  let quietSince = inFlight === 0 ? now() : 0;
  while (now() - start < timeoutMs) {
    await new Promise((resolve) => realSetTimeout(resolve, 25));
    if (inFlight > 0) { quietSince = 0; continue; }
    if (!quietSince) quietSince = now();
    if (now() - quietSince >= quietMs) return;
  }
  throw new Error(`audio loads still in flight after ${timeoutMs} ms (${inFlight})`);
}

const GLOBALS = [
  'AnalyserNode', 'AudioBuffer', 'AudioBufferSourceNode', 'AudioContext', 'AudioDestinationNode',
  'AudioListener', 'AudioNode', 'AudioParam', 'AudioScheduledSourceNode', 'AudioWorklet',
  'AudioWorkletNode', 'BaseAudioContext', 'BiquadFilterNode', 'ChannelMergerNode',
  'ChannelSplitterNode', 'ConstantSourceNode', 'ConvolverNode', 'DelayNode',
  'DynamicsCompressorNode', 'GainNode', 'IIRFilterNode', 'OfflineAudioContext',
  'OscillatorNode', 'PannerNode', 'PeriodicWave', 'StereoPannerNode', 'WaveShaperNode',
] as const;

export function installRealWebAudio(): void {
  const g = globalThis as unknown as Record<string, unknown>;
  const src = webAudio as unknown as Record<string, unknown>;
  for (const name of GLOBALS) {
    if (src[name]) g[name] = src[name];
  }
  // standardized-audio-context (inside Tone) reads the native constructors off
  // `window`, which the node test environment does not have.
  if (typeof g.window !== 'object' || !g.window) g.window = globalThis;
  if (typeof g.window === 'object' && g.window) {
    for (const name of GLOBALS) (g.window as Record<string, unknown>)[name] = src[name];
  }
}

/**
 * Seeded randomness for every worklet scope. Processors that model analogue
 * scatter seed their noise from `std::random_device`, which Emscripten draws
 * from `crypto.getRandomValues` (the Aelapse spring does): right for the
 * instrument, but it made two identical renders differ by 2 dB.
 */
const DETERMINISTIC_PRELUDE = `{
  let s = 0x2545f491;
  const next = () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 4294967296; };
  Math.random = next;
  Object.defineProperty(globalThis, 'crypto', { configurable: true, value: {
    getRandomValues(a) { for (let i = 0; i < a.length; i++) a[i] = (next() * 256) | 0; return a; },
  } });
}
`;

/**
 * The app loads worklets by site path (`/worklets/x.worklet.js`), which the
 * dev server serves out of `public/`. Load those files from disk instead, with
 * the seeded prelude in front, so the real processors run (not their
 * passthrough fallbacks) and run the same way every time.
 */
export function resolveWorkletsFromPublic(root = process.cwd()): void {
  const proto = (webAudio as unknown as { AudioWorklet: { prototype: { addModule(url: string): Promise<void> } } }).AudioWorklet.prototype;
  const original = proto.addModule;
  if ((original as { _public?: boolean })._public) return;
  const outDir = mkdtempSync(join(tmpdir(), 'devilbox-worklets-'));
  const patched = function (this: unknown, url: string): Promise<void> {
    if (typeof url !== 'string' || !url.startsWith('/')) return track(original.call(this, url));
    const rel = url.split('?')[0];
    const source = readFileSync(join(root, 'public', rel), 'utf8');
    const out = join(outDir, rel);
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, DETERMINISTIC_PRELUDE + source);
    return track(original.call(this, out));
  };
  (patched as { _public?: boolean })._public = true;
  proto.addModule = patched;
}

/**
 * Serve the app's `public/` files to `fetch`. WASM effects fetch their `.js`
 * glue and `.wasm` by site path; under happy-dom that resolves against
 * localhost:3000, nothing answers, and every effect stays on its passthrough.
 */
export function servePublicToFetch(root = process.cwd()): void {
  const g = globalThis as unknown as { fetch: typeof fetch; window?: { fetch: typeof fetch } };
  const original = g.fetch;
  if ((original as { _public?: boolean })._public) return;
  const patched = ((input: RequestInfo | URL, init?: RequestInit) => track(serve(input, init))) as typeof fetch;
  const serve = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const url = new URL(raw, 'http://localhost:3000');
    if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
      const body = await readFile(join(root, 'public', decodeURIComponent(url.pathname)));
      const type = url.pathname.endsWith('.wasm') ? 'application/wasm' : 'text/javascript';
      return new Response(body, { status: 200, headers: { 'content-type': type } });
    }
    return original(input, init);
  };
  (patched as { _public?: boolean })._public = true;
  g.fetch = patched;
  if (g.window) g.window.fetch = patched;
}
