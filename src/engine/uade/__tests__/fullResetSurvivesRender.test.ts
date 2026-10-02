/**
 * `_uade_wasm_full_reset()` after a rendered song must not trap.
 *
 * It did, on every load after a render, since the soft reset was written
 * (04-13): `uade_cleanup_state` ran libuade's IPC teardown while the shim was
 * mid-stream ("receiving in S state is forbidden" → "Expected score name" →
 * unguarded exit(1) → `unreachable`). The worklet hid it with a full WASM
 * reinit per load; the owner's tab froze testing formats (2026-10-02). Then
 * the re-spawned core lost its stereo config ("Only stereo supported.").
 *
 * Runs the real bundle in node (public/uade/UADE.js + .wasm), the way the
 * corpus sweep does. Fails on the bundle before 2026-10-03.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadUADEModule, PROJECT_ROOT, type UADEModule } from '../../../../tools/uade-audit/uadeRenderCore';

type ResetModule = UADEModule & { _uade_wasm_full_reset(): number };

function loadSong(mod: UADEModule, rel: string): number {
  const data = new Uint8Array(readFileSync(join(PROJECT_ROOT, rel)));
  const name = rel.split('/').pop()!;
  const ptr = mod._malloc(data.byteLength);
  mod.HEAPU8.set(data, ptr);
  const hintLen = name.length * 4 + 1;
  const hintPtr = mod._malloc(hintLen);
  mod.stringToUTF8(name, hintPtr, hintLen);
  mod._uade_wasm_stop();
  mod._uade_wasm_set_looping(1);
  mod._uade_wasm_set_one_subsong(1);
  const ret = mod._uade_wasm_load(ptr, data.byteLength, hintPtr);
  mod._free(ptr); mod._free(hintPtr);
  return ret;
}

function render(mod: UADEModule, chunks: number): number {
  const n = 4096; const l = mod._malloc(n * 4); const r = mod._malloc(n * 4);
  let e = 0, frames = 0;
  for (let c = 0; c < chunks; c++) {
    if (mod._uade_wasm_render(l, r, n) <= 0) break;
    const f = new Float32Array(mod.HEAPU8.buffer, l, n);
    for (let i = 0; i < n; i++) e += f[i] * f[i];
    frames += n;
  }
  mod._free(l); mod._free(r);
  return frames ? Math.sqrt(e / frames) : 0;
}

describe('UADE full reset after a rendered song', () => {
  it('survives, and the next song loads and plays', async () => {
    const said: string[] = [];
    const mod = (await loadUADEModule(false, (line) => { said.push(line); })) as ResetModule;
    expect(mod._uade_wasm_init(48000)).toBe(0);
    expect(loadSong(mod, 'public/data/songs/formats/wicked.wb')).toBe(0);
    expect(render(mod, 8)).toBeGreaterThan(0.005);

    expect(mod._uade_wasm_full_reset(), 'full_reset returned an error').toBe(0);

    expect(loadSong(mod, 'public/data/songs/formats/eco.gray'), said.join(' / ')).toBe(0);
    expect(render(mod, 4), 'the song after the reset is silent').toBeGreaterThan(0.005);
    expect(said.filter((s) => /forbidden|Expected score name|unguarded exit|Only stereo/.test(s))).toEqual([]);
  }, 120_000);
});
