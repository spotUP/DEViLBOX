/**
 * The PiyoPiyo worklet plays a real .pmd: audio from the first seconds,
 * every track audible, the mute mask silences it.
 *
 * The replayer is a port of piyopiyo-rs (0BSD) with no WASM; it is run here
 * under a minimal AudioWorkletGlobalScope with the real drum samples
 * (2026-10-05 broken-formats sweep, B5).
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = process.cwd();
type Proc = { handleMessage(d: unknown): Promise<void>; process(i: Float32Array[][], o: Float32Array[][]): boolean };
let proc: Proc;
const posted: { type?: string; message?: string; records?: number }[] = [];

function peak(seconds: number): number {
  const l = new Float32Array(128), r = new Float32Array(128);
  let p = 0;
  for (let done = 0; done < 44100 * seconds; done += 128) {
    proc.process([], [[l, r]]);
    for (let i = 0; i < 128; i++) { const a = Math.abs(l[i]); if (a > p) p = a; }
  }
  return p;
}

beforeAll(async () => {
  let Processor!: new () => Proc;
  const scope: Record<string, unknown> = {
    AudioWorkletProcessor: class { port = { postMessage: (m: { type?: string }) => posted.push(m), onmessage: null }; },
    registerProcessor: (_n: string, cls: new () => Proc) => { Processor = cls; },
    sampleRate: 44100, currentTime: 0,
  };
  new Function(...Object.keys(scope), readFileSync(resolve(ROOT, 'public/piyopiyo/PiyoPiyo.worklet.js'), 'utf8'))(...Object.values(scope));
  proc = new Processor();
  const drums: Record<string, ArrayBuffer> = {};
  for (const n of ['bass1', 'bass2', 'snare', 'hat1', 'hat2', 'cymbal']) {
    const b = readFileSync(resolve(ROOT, `public/piyopiyo/drums/${n}.bin`));
    drums[n] = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
  }
  await proc.handleMessage({ type: 'init', sampleRate: 44100, drums });
});

describe('PiyoPiyo worklet', () => {
  it('renders obj0176-1.pmd from the start, and the mute mask silences it', async () => {
    const b = readFileSync(resolve(ROOT, 'public/data/songs/studio-pixel---piyopiyo/obj0176-1.pmd'));
    await proc.handleMessage({ type: 'loadModule', moduleData: b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) });
    expect(posted.find((m) => m.type === 'moduleLoaded')?.records).toBe(256);
    expect(peak(2)).toBeGreaterThan(0.02);
    await proc.handleMessage({ type: 'setMuteMask', mask: 0 });
    expect(peak(0.5)).toBe(0);
    await proc.handleMessage({ type: 'setMuteMask', mask: 0xf });
    expect(peak(0.5)).toBeGreaterThan(0.02);
  });

  it('refuses a file without the PMD magic by name', async () => {
    await proc.handleMessage({ type: 'loadModule', moduleData: new Uint8Array(0x500).buffer });
    expect(posted.at(-1)?.type).toBe('error');
    expect(posted.at(-1)?.message).toMatch(/PMD magic/);
  });
});
