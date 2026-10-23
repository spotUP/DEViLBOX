/**
 * Headless AudioWorklet harness: runs an engine's real worklet and WASM in
 * Node with a minimal AudioWorkletGlobalScope, so tests can drive messages and
 * process() calls and read what the worklet posts and writes.
 */
import { readFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// import.meta.url, not __dirname: a worker thread (the hang watchdogs) loads
// this file as native ESM, where __dirname does not exist.
export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

export type JsTransform = (code: string) => string | Promise<string>;
export type WorkletMsg = { type?: string; channels?: Int16Array[]; frame?: number; sampleRate?: number; message?: string };
export type WorkletProc = {
  handleMessage?(d: unknown): Promise<void>;
  _handleMessage?(d: unknown): Promise<void>;   // UADE's name for it
  _onMessage?(d: unknown): void;                // the per-note synth worklets' (Fred)
  process(i: Float32Array[][], o: Float32Array[][]): boolean;
  [k: string]: unknown;
};

/** Evaluate the shared worklet helpers (channel-stream.js, channel-outputs.js) once. */
/** A worklet module's `import { X } from '../shared/x.js'` becomes the imported file's text (a stand-in scope has no module loader). */
export function inlineWorkletImports(src: string, dir: string): string {
  // Imports nest (a MAME chip worklet imports the base, which imports the queue): resolve each against its own file's folder
  return src.replace(/^import \{[^}]*\} from '([^']+)';$/gm, (_m, rel: string) => {
    const file = resolve(ROOT, 'public', dir, rel);
    return inlineWorkletImports(readFileSync(file, 'utf8'), relative(resolve(ROOT, 'public'), dirname(file))).replace(/^export /gm, '');
  });
}

export function loadSharedWorkletScripts(): void {
  for (const f of ['public/worklets/channel-stream.js', 'public/worklets/channel-outputs.js', 'public/worklets/row-clip.js']) {
    new Function(readFileSync(resolve(ROOT, f), 'utf8'))();
  }
}

/**
 * Instantiate `public/<dir>/<stem>.worklet.js` and initialise its WASM from
 * `<wasmStem>.js/.wasm`. `clocked` makes the worklet's `currentTime` read `globalThis.__workletClock`,
 * which the test advances, for worklets that post on a timer (UADE's levels). (PumaTracker's differ in case: PumaTracker.worklet.js
 * beside Pumatracker.wasm, which only a case-insensitive disk forgives).
 */
export async function startWorklet(dir: string, stem: string, transform?: JsTransform, wasmStem = stem, clocked = false): Promise<{
  proc: WorkletProc;
  send: (m: unknown) => Promise<void>;
  posted: WorkletMsg[];
}> {
  let Processor!: new () => WorkletProc;
  const posted: WorkletMsg[] = [];
  const scope: Record<string, unknown> = {
    AudioWorkletProcessor: class { port = { postMessage: (m: WorkletMsg) => posted.push(m), onmessage: null }; },
    registerProcessor: (_n: string, cls: new () => WorkletProc) => { Processor = cls; },
    sampleRate: 48000, currentTime: 0,
  };
  new Function(...Object.keys(scope), inlineWorkletImports(clocked ? readFileSync(resolve(ROOT, `public/${dir}/${stem}.worklet.js`), 'utf8').replace(/\bcurrentTime\b/g, 'globalThis.__workletClock') : readFileSync(resolve(ROOT, `public/${dir}/${stem}.worklet.js`), 'utf8'), dir))(...Object.values(scope));
  const proc = new Processor();
  const send = async (m: unknown) => { await (proc.handleMessage ?? proc._handleMessage ?? proc._onMessage)!.call(proc, m); };
  const versions = Object.getOwnPropertyDescriptor(process, 'versions')!;
  Object.defineProperty(process, 'versions', { value: {}, configurable: true });
  try {
    await send({
      type: 'init', sampleRate: 48000,
      wasmBinary: readFileSync(resolve(ROOT, `public/${dir}/${wasmStem}.wasm`)),
      jsCode: await (transform ?? ((c: string) => c))(readFileSync(resolve(ROOT, `public/${dir}/${wasmStem}.js`), 'utf8')),
    });
    // The synth worklets start their WASM without returning the promise: wait for their ready post.
    for (let i = 0; i < 200 && proc._onMessage && !proc.handleMessage && !posted.some((p) => p.type === 'ready'); i++) await new Promise((r) => setTimeout(r, 10));
  } finally { Object.defineProperty(process, 'versions', versions); }
  return { proc, send, posted };
}

/** Read a song from the repo as an ArrayBuffer. */
export function songBuffer(path: string): ArrayBuffer {
  const b = readFileSync(resolve(ROOT, path));
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
}

/** `count` stereo outputs of `frames` samples. */
export function stereoOutputs(count: number, frames = 128): Float32Array[][] {
  return Array.from({ length: count }, () => [new Float32Array(frames), new Float32Array(frames)]);
}
