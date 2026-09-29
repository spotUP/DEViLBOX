/**
 * The Exciter adds harmonics, not level.
 *
 * Its shaper kept the linear term, so the driven high band itself
 * (x(1 + 20*amount)) went back into the mix: at amount 0.25 the effect read
 * +10.5 dB on a full-spectrum signal and +2.8 dB even at amount 0.05
 * (measured in Chrome, 2026-09-29) - a treble boost, not an exciter. Runs the
 * real Exciter WASM.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ROOT } from '@engine/__tests__/workletHarness';

type ExciterModule = {
  _malloc(n: number): number; _free(p: number): void;
  _exciter_create(sr: number): number;
  _exciter_process(h: number, iL: number, iR: number, oL: number, oR: number, n: number): void;
  _exciter_set_amount(h: number, v: number): void; _exciter_set_blend(h: number, v: number): void;
};

/** The module's memory: this build exports no HEAP views, so capture it at instantiation. */
let memory: WebAssembly.Memory | null = null;
const heap = () => new Float32Array(memory!.buffer);

async function loadExciter(): Promise<ExciterModule> {
  const js = readFileSync(resolve(ROOT, 'public/exciter/Exciter.js'), 'utf8');
  const factory = new Function(`${js}\nreturn createExciter;`)() as (o: object) => Promise<ExciterModule>;
  const versions = Object.getOwnPropertyDescriptor(process, 'versions')!;
  Object.defineProperty(process, 'versions', { value: {}, configurable: true });
  const instantiate = WebAssembly.instantiate;
  const capture = async (source: BufferSource, imports?: WebAssembly.Imports) => {
    const r = await instantiate(source, imports);
    memory = Object.values(r.instance.exports).find((v) => v instanceof WebAssembly.Memory) as WebAssembly.Memory;
    return r;
  };
  WebAssembly.instantiate = capture as unknown as typeof instantiate;
  try {
    return await factory({ wasmBinary: readFileSync(resolve(ROOT, 'public/exciter/Exciter.wasm')) });
  } finally {
    WebAssembly.instantiate = instantiate;
    Object.defineProperty(process, 'versions', versions);
  }
}

function rms(a: Float32Array): number {
  let s = 0; for (const v of a) s += v * v; return Math.sqrt(s / a.length);
}

describe('Exciter', () => {
  it('stays within 2.5 dB of its input on half-scale white noise at amount 0.25 (was +9 dB)', async () => {
    const m = await loadExciter();
    const h = m._exciter_create(48000);
    m._exciter_set_amount(h, 0.25);
    m._exciter_set_blend(h, 0.4);
    const n = 48000;
    const input = new Float32Array(n);
    let seed = 1;
    for (let i = 0; i < n; i++) { seed = (seed * 1103515245 + 12345) >>> 0; input[i] = ((seed / 2 ** 32) * 2 - 1) * 0.5; }
    const bytes = n * 4;
    const iL = m._malloc(bytes), iR = m._malloc(bytes), oL = m._malloc(bytes), oR = m._malloc(bytes);
    heap().set(input, iL >> 2); heap().set(input, iR >> 2);
    m._exciter_process(h, iL, iR, oL, oR, n);
    const out = heap().slice(oL >> 2, (oL >> 2) + n);
    const gainDb = 20 * Math.log10(rms(out) / rms(input));
    expect(Math.abs(gainDb)).toBeLessThan(2.5);
    expect(out.some((v, i) => v !== input[i])).toBe(true); // it still does something
  });
});
