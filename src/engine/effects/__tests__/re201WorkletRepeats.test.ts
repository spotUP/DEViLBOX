/**
 * The RE-201 worklet, driven the way RE201Effect drives it (init message with
 * the WASM + JS, then the effect's parameters), must pass an echo.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(__dirname, '../../../..');
type Proc = {
  port: { postMessage(m: unknown): void; onmessage: ((e: { data: unknown }) => void) | null };
  handleMessage(d: unknown): Promise<void>;
  process(i: Float32Array[][], o: Float32Array[][]): boolean;
};
let Processor: new () => Proc;
const posted: unknown[] = [];

beforeAll(() => {
  const src = readFileSync(resolve(ROOT, 'public/re201/RE201.worklet.js'), 'utf8');
  const scope: Record<string, unknown> = {
    AudioWorkletProcessor: class { port = { postMessage: (m: unknown) => posted.push(m), onmessage: null }; },
    registerProcessor: (_n: string, cls: new () => Proc) => { Processor = cls; },
    sampleRate: 48000,
    currentTime: 0,
  };
  new Function(...Object.keys(scope), src)(...Object.values(scope));
});

async function makeProcessor(params: Record<string, number>): Promise<Proc> {
  const p = new Processor();
  const versions = Object.getOwnPropertyDescriptor(process, 'versions')!;
  Object.defineProperty(process, 'versions', { value: {}, configurable: true });
  try {
    await p.handleMessage({
      type: 'init', sampleRate: 48000,
      wasmBinary: readFileSync(resolve(ROOT, 'public/re201/RE201.wasm')),
      jsCode: readFileSync(resolve(ROOT, 'public/re201/RE201.js'), 'utf8'),
    });
  } finally { Object.defineProperty(process, 'versions', versions); }
  for (const [param, value] of Object.entries(params)) await p.handleMessage({ type: 'setParameter', param, value });
  return p;
}

function run(p: Proc, secs: number): number[] {
  const n = 128, sr = 48000, rms: number[] = [];
  let acc = 0, cnt = 0;
  for (let b = 0; b < (sr * secs) / n; b++) {
    const inL = new Float32Array(n);
    if (b < 19) for (let i = 0; i < n; i++) inL[i] = 0.5 * Math.sin(((b * n + i) * 2 * Math.PI * 800) / sr);
    const outL = new Float32Array(n), outR = new Float32Array(n);
    p.process([[inL, inL.slice()]], [[outL, outR]]);
    for (const v of outL) acc += v * v;
    cnt += n;
    if (cnt >= sr / 2) { rms.push(Math.sqrt(acc / cnt)); acc = 0; cnt = 0; }
  }
  return rms;
}

// What RE201Effect sends on 'ready' for the dub bus (RE201Adapter).
const DUB_BUS = { bass: 0.7, treble: 0.3, delayMode: 7, repeatRate: 0.383, intensity: 0.9, echoVolume: 0.9, reverbVolume: 0.2, inputLevel: 1 };

describe('the RE-201 worklet', { timeout: 60000 }, () => {
  it('passes an echo with the dub bus\'s settings', async () => {
    const t = run(await makeProcessor(DUB_BUS), 3);
    expect(t[0]).toBeGreaterThan(0.01);
    expect(t[2]).toBeGreaterThan(0.005);
  });

  it('keeps echoing after an earlier instance is disposed', async () => {
    const a = await makeProcessor(DUB_BUS);
    const b = await makeProcessor(DUB_BUS);
    await a.handleMessage({ type: 'dispose' });
    const t = run(b, 3);
    expect(t[0]).toBeGreaterThan(0.01);
    expect(t[2]).toBeGreaterThan(0.005);
  });

  it('keeps echoing when a later instance is created and disposed', async () => {
    const b = await makeProcessor(DUB_BUS);
    const c = await makeProcessor(DUB_BUS);
    await c.handleMessage({ type: 'dispose' });
    const t = run(b, 3);
    expect(t[0]).toBeGreaterThan(0.01);
  });
});
