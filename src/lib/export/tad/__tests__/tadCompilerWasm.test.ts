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
  // Hashes from the native tad-compiler v0.4.2 CLI on the same project (golden: WASM == native).
  it('compiles the upstream example project to the same bytes as the native CLI', async () => {
    const files = Object.fromEntries(walk(EX).map((f) => [relative(EX, f), new Uint8Array(readFileSync(f))]));
    // @ts-expect-error generated JS module, no types
    const { default: create } = await import('../../../../../public/tad/tad-compiler.js');
    const tad = await openTadSession(files, create, (f) => resolve('public/tad', f));
    const P = '/p/example-project.terrificaudio';
    expect(tad.run(['check', P]).code).toBe(0);
    expect(tad.run(['ca65-export', '--lorom', '-a', '/o/a.s', '-b', '/o/a.bin', '-i', '/o/a.inc', '--segment', 'BANK1', P]).code).toBe(0);
    expect(tad.run(['song2spc', '-o', '/o/s0.spc', P, '1']).code).toBe(0);
    expect(sha(tad.read('/o/a.bin'))).toBe('74f262e3077d0ed34fb1799a54021eb476c9857ebce1e5e45629c22b5223d822');
    expect(sha(tad.read('/o/a.s'))).toBe('36e81263f8639553f55d690eca8cd2f217b3089db263368412b862cd71afbea4');
    expect(sha(tad.read('/o/s0.spc'))).toBe('acfb54904848f7d03e8ef673089c7543cd9123efa5d0318435ff23137abea800');
  }, 60000);
});
