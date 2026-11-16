import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, relative, join } from 'node:path';
import { createHash } from 'node:crypto';
import { openTadSession } from '../tadCompilerWasm';

const EX = 'tad-wasm/examples';
const walk = (d: string): string[] =>
  readdirSync(d).flatMap((n) => (statSync(join(d, n)).isDirectory() ? walk(join(d, n)) : [join(d, n)]));
const sha = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');

describe('tad-compiler WASM', () => {
  // Hashes of the WASM build with the DEViLBOX level-meter driver patch (audio-driver.asm mainloop, CPUIO3).
  // Before that patch they matched the native tad-compiler v0.4.2 CLI byte for byte; rebuild and update together.
  it('compiles the upstream example project to the recorded bytes', async () => {
    const files = Object.fromEntries(walk(EX).map((f) => [relative(EX, f), new Uint8Array(readFileSync(f))]));
    // @ts-expect-error generated JS module, no types
    const { default: create } = await import('../../../../../public/tad/tad-compiler.js');
    const tad = await openTadSession(files, create, (f) => resolve('public/tad', f));
    const P = '/p/example-project.terrificaudio';
    expect(tad.run(['check', P]).code).toBe(0);
    expect(tad.run(['ca65-export', '--lorom', '-a', '/o/a.s', '-b', '/o/a.bin', '-i', '/o/a.inc', '--segment', 'BANK1', P]).code).toBe(0);
    expect(tad.run(['song2spc', '-o', '/o/s0.spc', P, '1']).code).toBe(0);
    expect(sha(tad.read('/o/a.bin'))).toBe('6c60f991644b50a5d2b84974f0f8929938c033fd69df31e0eadc9294d10c5e9d');
    expect(sha(tad.read('/o/a.s'))).toBe('6e9fa30c5099da0496be0ae8d6729ed0c797836a1b0439d76214cf3661f0f6e8');
    expect(sha(tad.read('/o/s0.spc'))).toBe('722ccf3fb6762c6fcada885ad8e03b645a605c44761bb3de3eda6160b71d00cb');
  }, 60000);
});
