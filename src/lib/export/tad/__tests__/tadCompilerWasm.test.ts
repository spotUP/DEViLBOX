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
  // Hashes of the WASM build with the DEViLBOX driver patches (CPUIO3 level meter, set_sample_offset + spare
  // dir items, COMMON_DATA_ADDR one page up).
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
    expect([sha(tad.read('/o/a.bin')), sha(tad.read('/o/a.s')), sha(tad.read('/o/s0.spc'))]).toEqual([
      '142b7b3bd82e956b205b8b946383299379618696d5119fafce60c46ffff9dbc4',
      '2d5124d4e78de4a75b7f49cf7049af49624c3d2aea05cfab3b0a4cc41c1c2294',
      '61b41f8fd1478636313e6ae9b971a8a51cae9e9f1ab1e1656841b76806f294e2',
    ]);
  }, 60000);
});
