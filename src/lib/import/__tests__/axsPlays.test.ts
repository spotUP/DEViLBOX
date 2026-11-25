/**
 * AXS (AXSF) songs: the axs WASM replayer (axs-wasm, clean-room) plays a corpus song non-silent,
 * at a sane length, faster than real time per 128-frame block at 48 kHz; the C++ grid parses and
 * the app import (parseModuleToSong) reaches it. Corpus: test-data/axs (git-ignored, skipped when absent).
 */
import { describe, it, expect, vi } from 'vitest';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { isAxsFormat, parseAxsFile } from '@/lib/import/formats/AxsParser';
import type { CreateAxsEdit } from '@/engine/axs/axsEditWasm';

const create: CreateAxsEdit = async () =>
  (await import('../../../../public/axs/AxsEdit.js')).default({ locateFile: (f: string) => resolve('public/axs', f) });

vi.mock('@/engine/axs/axsEditWasm', async (orig) => {
  const real = await orig<typeof import('@/engine/axs/axsEditWasm')>();
  return { ...real, axsGrid: (b: Uint8Array, c?: CreateAxsEdit) => real.axsGrid(b, c ?? create) };
});

const DIR = resolve('test-data/axs');
const SONG = resolve(DIR, 'Luigi_Auriemma__sonathack.axs');
const has = existsSync(SONG);

describe('AXS replayer', () => {
  it.skipIf(!has)('plays sonathack non-silent, sane length, faster than real time', async () => {
    const bytes = new Uint8Array(readFileSync(SONG));
    expect(isAxsFormat(bytes)).toBe(true);
    const m = await create();
    const ptr = m._malloc(bytes.length);
    m.HEAPU8.set(bytes, ptr);
    expect(m._axs_open(ptr, bytes.length, 48000), m.UTF8ToString(m._axs_error())).toBe(1);
    m._free(ptr);
    const ms = m._axs_duration_ms();
    expect(ms).toBeGreaterThan(5_000);
    expect(ms).toBeLessThan(20 * 60_000);
    const out = m._malloc(128 * 2 * 4);
    let sum = 0, n = 0, peak = 0, worst = 0, total = 0, done = 0, worstAt = -1;
    const over: number[] = [];
    const blocks = Math.ceil((10 * 48000) / 128);  // first 10 seconds
    for (let b = 0; b < blocks; b++) {
      const t0 = performance.now();
      const got = m._axs_render(out, 128);
      const dt = performance.now() - t0;
      total += dt; done++;
      if (b >= 16 && dt > worst) { worst = dt; worstAt = b; }  // after wasm tier-up
      if (dt > (128 / 48000) * 1000) over.push(b);
      const f = m.HEAPF32.subarray(out >> 2, (out >> 2) + got * 2);
      for (const v of f) { sum += v * v; n++; peak = Math.max(peak, Math.abs(v)); }
      if (got < 128) break;
    }
    m._free(out);
    m._axs_close();
    const rms = Math.sqrt(sum / Math.max(1, n));
    console.log(`[axs] sonathack ${ms} ms, rms ${rms.toFixed(4)}, peak ${peak.toFixed(3)}, mean block ${(total / done).toFixed(3)} ms, worst block ${worst.toFixed(3)} ms at ${worstAt} of ${(128 / 48).toFixed(3)}, over budget ${over.join(',')}`);
    expect(rms).toBeGreaterThan(0.001);
    expect(peak).toBeLessThanOrEqual(1);
    expect(total / done).toBeLessThan((128 / 48000) * 1000 / 4);
    // The render path allocates nothing; single over-budget blocks are host jitter (nice 19, shared
    // machine), so the gate is the mean plus at most 1% of blocks over the 128-frame budget.
    expect(over.length).toBeLessThanOrEqual(Math.ceil(done / 100));
  });

  it.skipIf(!has)('grid parses and parseModuleToSong reaches the AXS parser', async () => {
    const bytes = new Uint8Array(readFileSync(SONG));
    const song = (await parseAxsFile(bytes, 'sonathack.axs', create))!;
    expect(song.format).toBe('AXS');
    expect(song.patterns.length).toBeGreaterThan(0);
    expect(song.songPositions.length).toBeGreaterThan(0);
    const notes = song.patterns.flatMap(p => p.channels.flatMap(c => c.rows)).filter(c => c.note > 0 && c.note < 97).length;
    expect(notes).toBeGreaterThan(0);
    const { parseModuleToSong } = await import('../parseModuleToSong');
    const viaApp = await parseModuleToSong(new File([bytes.slice().buffer as ArrayBuffer], 'Luigi_Auriemma__sonathack.axs'));
    expect(viaApp.format).toBe('AXS');
    expect(viaApp.axsFileData?.byteLength).toBe(bytes.length);
    expect(viaApp.patterns.length).toBe(song.patterns.length);
  });
});
