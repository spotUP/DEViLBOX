/**
 * The per-channel capture (the scopes, dub sends, isolation slots and the row preview's voices) starts from nothing on a
 * load: it is a FIFO in audio.c that a load or a reset used to leave as it was, so a second song's channels began with the
 * first song's last samples and trailed the mix by that much (found by the row preview: a reload's voices differed from a
 * fresh instance's, and the first song's probe renders left their tail in the next song's capture).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadUADEModule, refreshHeap } from '../../../../tools/uade-audit/uadeRenderCore';

const ROOT = resolve(__dirname, '../../../..');

describe('UADE channel capture', () => {
  it('is empty after a load, whatever the render before left in it', async () => {
    const bytes = new Uint8Array(readFileSync(resolve(ROOT, 'public/data/songs/rob-hubbard/skateordie.rh')));
    const w = await loadUADEModule(false) as unknown as Record<string, (...a: number[]) => number> & { HEAPU8: Uint8Array; stringToUTF8(s: string, p: number, n: number): void };
    w._uade_wasm_init(48000);
    const load = () => {
      refreshHeap(w as never);
      const p = w._malloc!(bytes.length), h = w._malloc!(64);
      w.HEAPU8.set(bytes, p);
      w.stringToUTF8('skateordie.rh', h, 64);
      const r = w._uade_wasm_load!(p, bytes.length, h);
      w._free!(p); w._free!(h);
      return r;
    };
    const L = w._malloc!(4096 * 4), R = w._malloc!(4096 * 4), C = [0, 1, 2, 3].map(() => w._malloc!(4096 * 4));
    const captured = (max = 4096) => w._uade_wasm_read_channel_samples!(C[0]!, C[1]!, C[2]!, C[3]!, max);

    expect(load()).toBe(0);
    // What a load itself leaves is the audio it produced starting the player; the pipe holds the same samples (the mix).
    const fresh = captured();
    expect(load()).toBe(0); // (a second load on the same state, to read nothing stale: the fresh count is the reference)
    expect(captured(), 'a load on a drained capture leaves what its own start produced').toBe(fresh);
    for (let i = 0; i < 400; i++) w._uade_wasm_render!(L, R, 128); // 1 s rendered, the capture never read
    // The worklet reloads after a stop (a replay, the first-audible-subsong probe) and, after a render, through a reset.
    w._uade_wasm_stop!();
    expect(load()).toBe(0);
    expect(captured(), 'after stop and load, nothing of the render before is left in the capture: only what the load itself produced').toBe(fresh);
    for (let i = 0; i < 400; i++) w._uade_wasm_render!(L, R, 128);
    w._uade_wasm_stop!();
    expect(w._uade_wasm_full_reset!()).toBe(0);
    expect(load()).toBe(0);
    expect(captured(), 'after a reset and load, likewise').toBe(fresh);

    // And it fills again as the song renders: the worklet's read of one quantum gets the quantum.
    w._uade_wasm_render!(L, R, 128);
    expect(captured(128)).toBe(128);
  }, 60_000);
});
