/**
 * Cinter4 sequencer period-slide regression (ASR.W sign-extension).
 *
 * The transpiled CinterPlay2 slide computed `ASR.W #7,D0` without sign-extending
 * the 16-bit register (`(int32_t)W(d0)` zero-extends: 0xFFFF>>7 = 511 instead of
 * -1). A downward period slide (period−1) became period+511 — a large wrong pitch
 * drop on every slide. Found by the song-level lock-test (tools/cinter-audit): the
 * real Amiga Cinter4.S (Moira) plays channel 2 at period 427 on tick 6 of
 * CurtCool-BackInSpace; the buggy transpile played 939 (= 427 | 0x200).
 *
 * This runs the DEViLBOX Cinter4 WASM (the fixed cinter4.c) and asserts it now
 * matches the Amiga reference — no emulator needed in CI.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { createRequire } from 'module';
import { tmpdir } from 'os';

const require = createRequire(import.meta.url);
const CINTER_DIR = resolve(__dirname, '../../../../public/cinter4');
const SONG = resolve(__dirname, '../../../lib/export/__tests__/fixtures/cinter4/CurtCool-BackInSpace.golden.cinter4');

describe('Cinter4 sequencer — period slide sign-extension (ASR.W)', () => {
  it('plays channel 2 at period 427 (Amiga reference), not the buggy 939, at tick 6', async () => {
    // Load the Emscripten glue as CJS (copy so `require` resolves it standalone).
    const tmpGlue = resolve(tmpdir(), `cinter4_regr_${process.pid}.cjs`);
    const fs = require('fs');
    fs.copyFileSync(resolve(CINTER_DIR, 'Cinter4.js'), tmpGlue);
    const createCinter4 = require(tmpGlue);
    const Module = await createCinter4({ locateFile: (p: string) => resolve(CINTER_DIR, p) });

    const song = new Uint8Array(readFileSync(SONG));
    Module._player_init(48000);
    const ptr = Module._malloc(song.length);
    Module.HEAPU8.set(song, ptr);
    expect(Module._player_load(ptr, song.length)).toBe(1); // CinterInit + primes tick 0
    Module._free(ptr);

    for (let t = 1; t <= 6; t++) Module._player_tick(); // advance to tick 6
    const period = Module._player_paula_period(2);
    fs.unlinkSync(tmpGlue);

    expect(period).toBe(427);   // Amiga reference (was 939 before the ASR.W fix)
    expect(period & 0x200).toBe(0); // the zero-extend bug set bit 9
  });
});
