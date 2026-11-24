/**
 * The GTUltra worklet has no fetch: it hands the engine its wasm bytes as
 * Module.wasmBinary (public/gtultra/GTUltra.worklet.js). A glue build that
 * ignores wasmBinary compiles an empty buffer there and every GoatTracker song
 * opens empty and silent (2026-11-24). locateFile points at a missing file so
 * the glue cannot fall back to reading GTUltra.wasm from disk, as in node.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

interface GTModule {
  cwrap: (name: string, ret: string | null, args: string[]) => (...a: number[]) => number;
  _malloc: (n: number) => number;
  HEAPU8: Uint8Array;
  HEAPF32: Float32Array | undefined;
}

const dir = join(process.cwd(), 'public/gtultra');
const SONG = join(process.cwd(), 'public/data/songs/goat-tracker-ultra/Jammer/$3LastNight_Jammer.sng');

describe('GTUltra glue in the worklet situation', () => {
  it('a GoatTracker song opens with patterns and plays audibly from wasmBinary alone', async () => {
    const js = readFileSync(join(dir, 'GTUltra.js'), 'utf8');
    const wasmBinary = readFileSync(join(dir, 'GTUltra.wasm'));
    const factory = new Function('require', '__dirname', '__filename', `${js}\nreturn createGTUltra;`)(
      createRequire(import.meta.url), dir, join(dir, 'GTUltra.js'),
    ) as (m: object) => Promise<GTModule>;
    const m = await factory({
      wasmBinary,
      locateFile: () => '/nonexistent/GTUltra.wasm',
      print: () => {}, printErr: () => {},
    });

    const c = (n: string, r: string | null, a: string[]) => m.cwrap(n, r, a);
    c('gt_init', null, ['number', 'number'])(44100, 0);
    const sng = readFileSync(SONG);
    const ptr = m._malloc(sng.length);
    m.HEAPU8.set(sng, ptr);
    expect(c('gt_load_sng', 'number', ['number', 'number'])(ptr, sng.length)).toBeTruthy();
    expect(c('gt_get_num_patterns', 'number', [])()).toBeGreaterThan(0);

    // A pattern holds at least one note (GT note bytes 0x60..0xBC).
    const patPtr = c('gt_get_pattern_ptr', 'number', ['number'])(0);
    const patLen = c('gt_get_pattern_length', 'number', ['number'])(0);
    const bytes = m.HEAPU8.subarray(patPtr, patPtr + patLen * 4);
    expect(bytes.some((b, i) => i % 4 === 0 && b >= 0x60 && b <= 0xbc)).toBe(true);

    c('gt_stop', null, [])();
    c('gt_play', null, ['number', 'number', 'number'])(0, 0, 0);
    const N = 128; // one AudioWorklet render quantum, as the worklet renders
    const l = m._malloc(N * 4), r = m._malloc(N * 4);
    const render = c('gt_render_audio', null, ['number', 'number', 'number']);
    let peak = 0;
    for (let done = 0; done < 44100 * 2; done += N) {
      render(l, r, N);
      const view = new Float32Array(m.HEAPU8.buffer, l, N);
      for (const v of view) peak = Math.max(peak, Math.abs(v));
    }
    expect(peak).toBeGreaterThan(0.001);
  });
});
