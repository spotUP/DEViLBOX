/**
 * Loading song after song does not grow the UADE WASM heap.
 *
 * Owner, 2026-10-06: a jukebox stress test (30+ songs) aborted UADE with
 * "Cannot enlarge memory, requested 134250496 bytes, but the limit is
 * 134217728" while loading dragon'sbreath ingame 1.dsc. Every load after a
 * rendered song resets the core in place (uade_wasm_full_reset), and the core
 * re-ran memory_init() (the whole Amiga address space, ~9 MB) and
 * read_table68k() (1 MB) without freeing the previous run: ~10 MB per load.
 * Runs the real worklet and WASM; a leak shows as live malloc bytes climbing
 * per load, or as the heap reaching its limit.
 */
import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { startWorklet, songBuffer } from './workletHarness';
import { uadePlayerHint } from '@/lib/import/uadePlayerHint';

const DSC = "public/data/songs/digital-sonix-and-chrome/David Hanlon/";
const SONGS = [
  DSC + "dragon'sbreath ingame 1.dsc",
  DSC + "dragon'sbreath demo 1.dsc",
  'public/data/songs/david-whittaker/garfield2+.dw',
  'public/data/songs/ben-daglish/motorhead-titleandingame.bd',
  "public/data/songs/formats/dragon'sbreath_fanfares.dsc",
];
const LOADS = 25;
const WARM_UP = 6;

interface Wasm { HEAPU8: Uint8Array; _uade_wasm_heap_used?: () => number }

describe('UADE heap across song loads', { timeout: 120000 }, () => {
  it('keeps live malloc bytes and heap size flat while loading and playing 25 songs', async () => {
    const { send, proc, posted } = await startWorklet('uade', 'UADE', async (c) => (await import('@/engine/uade/UADEEngine')).uadeTransform(c));
    const wasm = () => proc._wasm as Wasm;
    const out = [[new Float32Array(128), new Float32Array(128)]];
    const used: number[] = [];
    let peakHeap = 0;
    for (let i = 0; i < LOADS; i++) {
      const path = SONGS[i % SONGS.length];
      const name = path.split('/').pop()!;
      await send({ type: 'load', buffer: songBuffer(join(process.cwd(), path)), filenameHint: uadePlayerHint(name), skipScan: true });
      await send({ type: 'play' });
      // Rendering is what makes the next load reset the core in place.
      for (let k = 0; k < 200; k++) proc.process([], out);
      peakHeap = Math.max(peakHeap, wasm().HEAPU8.length);
      used.push(wasm()._uade_wasm_heap_used?.() ?? 0);
    }
    // The 48 MB initial heap never has to grow.
    expect(peakHeap).toBeLessThanOrEqual(50331648);
    expect(posted.filter((m) => m.type === 'error')).toEqual([]);
    expect(wasm()._uade_wasm_heap_used, 'the wasm exports uade_wasm_heap_used').toBeTypeOf('function');
    // Per-load live-bytes drift after warm-up: allow a few KB of allocator noise.
    const drift = (used[LOADS - 1] - used[WARM_UP]) / (LOADS - 1 - WARM_UP);
    expect(drift).toBeLessThan(16 * 1024);
  });
});
