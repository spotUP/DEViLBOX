/**
 * Headless AudioWorklet harness: runs an engine's real worklet and WASM in
 * Node with a minimal AudioWorkletGlobalScope, so tests can drive messages and
 * process() calls and read what the worklet posts and writes.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export const ROOT = resolve(__dirname, '../../..');

export type JsTransform = (code: string) => string | Promise<string>;
export type WorkletMsg = { type?: string; channels?: Int16Array[]; frame?: number; sampleRate?: number; message?: string };
export type WorkletProc = {
  handleMessage?(d: unknown): Promise<void>;
  _handleMessage?(d: unknown): Promise<void>;   // UADE's name for it
  process(i: Float32Array[][], o: Float32Array[][]): boolean;
  [k: string]: unknown;
};

/** Evaluate the shared worklet helpers (channel-stream.js, channel-outputs.js) once. */
export function loadSharedWorkletScripts(): void {
  for (const f of ['public/worklets/channel-stream.js', 'public/worklets/channel-outputs.js']) {
    new Function(readFileSync(resolve(ROOT, f), 'utf8'))();
  }
}

/** Instantiate `public/<dir>/<stem>.worklet.js` and initialise its WASM. */
export async function startWorklet(dir: string, stem: string, transform?: JsTransform): Promise<{
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
  new Function(...Object.keys(scope), readFileSync(resolve(ROOT, `public/${dir}/${stem}.worklet.js`), 'utf8'))(...Object.values(scope));
  const proc = new Processor();
  const send = (m: unknown) => (proc.handleMessage ?? proc._handleMessage)!.call(proc, m);
  const versions = Object.getOwnPropertyDescriptor(process, 'versions')!;
  Object.defineProperty(process, 'versions', { value: {}, configurable: true });
  try {
    await send({
      type: 'init', sampleRate: 48000,
      wasmBinary: readFileSync(resolve(ROOT, `public/${dir}/${stem}.wasm`)),
      jsCode: await (transform ?? ((c: string) => c))(readFileSync(resolve(ROOT, `public/${dir}/${stem}.js`), 'utf8')),
    });
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
