/**
 * A pinned tune that ends loops on itself; it does not play the next subsong.
 *
 * Medley's combat.mso holds several tunes (UADE subsongs). DEViLBOX plays one at a
 * time (tunes are switched live), but UADE ran with one_subsong off: when tune 1 ended
 * (tick 384, ~7.7 s) the core advanced to the next subsong (uadestate.c
 * WAIT_SUBSONG_CHANGE -> uade_next_subsong), and the restart_for_loop path replayed the
 * DEFAULT subsong (-1), not the pinned one. The channels then sounded another tune's
 * notes (ch0 period 571 / vol 46, ch1 571 / 16, ch3 339 / 24 at 7.75 s).
 *
 * Runs the real bundle in node (public/uade/UADE.js + .wasm) the way the worklet does:
 * load, loop on, set_subsong(1) -- and no uade_wasm_set_one_subsong call.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadUADEModule, refreshHeap, PROJECT_ROOT, type UADEModule } from '../../../../tools/uade-audit/uadeRenderCore';

type SubsongModule = UADEModule & { _uade_wasm_set_subsong(index: number): void };

describe('UADE pinned tune at its end', { timeout: 120_000 }, () => {
  it('pinned tune loops instead of playing the next subsong', async () => {
    const mod = (await loadUADEModule(false)) as SubsongModule;
    expect(mod._uade_wasm_init(48000)).toBe(0);
    const data = new Uint8Array(readFileSync(join(PROJECT_ROOT, 'public/data/songs/medley/combat.mso')));
    const ptr = mod._malloc(data.byteLength);
    refreshHeap(mod);
    mod.HEAPU8.set(data, ptr);
    const hp = mod._malloc(64);
    mod.stringToUTF8('combat.mso', hp, 64);
    mod._uade_wasm_stop();
    mod._uade_wasm_set_looping(1);
    expect(mod._uade_wasm_load(ptr, data.byteLength, hp)).toBe(0);
    mod._uade_wasm_set_subsong(1);

    const CH = 960; // one 50 Hz tick at 48 kHz
    const pL = mod._malloc(CH * 4), pR = mod._malloc(CH * 4), snapPtr = mod._malloc(64);
    const ticks: string[] = [];
    for (let t = 0; t < 520; t++) { // 10.4 s
      if (mod._uade_wasm_render(pL, pR, CH) <= 0) break;
      mod._uade_wasm_get_channel_snapshot(snapPtr);
      refreshHeap(mod);
      const s = new Uint32Array(mod.HEAPU8.buffer, snapPtr, 16);
      ticks.push([0, 1, 2, 3].map((c) => `${s[c * 4]}/${s[c * 4 + 1]}`).join(' '));
    }
    try { mod._uade_wasm_cleanup(); } catch { /* ignore */ }
    expect(ticks.length).toBe(520);

    // The restart replays tune 1 from its first tick: find the offset where the tune's
    // opening (12 ticks) comes back, near the end tick 384.
    const LEN = 12;
    let restart = -1;
    for (let k = 360; k <= 420 && restart < 0; k++) {
      let same = true;
      for (let i = 0; i < LEN && same; i++) same = ticks[k + i] === ticks[i];
      if (same) restart = k;
    }
    expect(restart, `tune 1 did not restart near tick 384; ticks 384..390: ${ticks.slice(384, 390).join(' | ')}`).toBeGreaterThan(0);
  });
});
