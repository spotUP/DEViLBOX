/**
 * Cinter4 per-channel mute/solo (isolation UI) — WASM gain path.
 *
 * The mixer forwards per-channel mute/solo to the active WASM engine via
 * setChannelGain → the worklet → player_set_channel_gain → paula_soft's per-channel
 * user gain. This pins that path end-to-end at the WASM level: muting all four Paula
 * channels silences the render; unmuting restores it.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { createRequire } from 'module';
import { tmpdir } from 'os';

const require = createRequire(import.meta.url);
const CINTER_DIR = resolve(__dirname, '../../../../public/cinter4');
const SONG = resolve(__dirname, '../../../lib/export/__tests__/fixtures/cinter4/CurtCool-BackInSpace.golden.cinter4');

describe('Cinter4 per-channel mute (isolation)', () => {
  it('silences the render when all channels are muted, restores when unmuted', async () => {
    const tmpGlue = resolve(tmpdir(), `cinter4_mute_${process.pid}.cjs`);
    const fs = require('fs');
    fs.copyFileSync(resolve(CINTER_DIR, 'Cinter4.js'), tmpGlue);
    const createCinter4 = require(tmpGlue);
    const Module = await createCinter4({ locateFile: (p: string) => resolve(CINTER_DIR, p) });

    const song = new Uint8Array(readFileSync(SONG));
    Module._player_init(48000);
    const sp = Module._malloc(song.length);
    Module.HEAPU8.set(song, sp);
    expect(Module._player_load(sp, song.length)).toBe(1);
    Module._free(sp);

    const FRAMES = 4096;
    const buf = Module._malloc(FRAMES * 2 * 4); // stereo f32
    const peak = () => {
      Module._player_render(buf, FRAMES);
      const f32 = new Float32Array(Module.HEAPF32.buffer, buf, FRAMES * 2);
      let p = 0;
      for (let i = 0; i < f32.length; i++) { const a = Math.abs(f32[i]); if (a > p) p = a; }
      return p;
    };

    const before = peak();
    for (let ch = 0; ch < 4; ch++) Module._player_set_channel_gain(ch, 0); // mute all
    // render a few chunks so the muted state fully flushes any in-flight sample
    peak(); peak();
    const muted = peak();
    for (let ch = 0; ch < 4; ch++) Module._player_set_channel_gain(ch, 1); // unmute
    peak();
    const after = peak();

    Module._free(buf);
    fs.unlinkSync(tmpGlue);

    expect(before).toBeGreaterThan(0.02);      // song is audible
    expect(muted).toBeLessThan(before * 0.02); // all-muted ≈ silent
    expect(after).toBeGreaterThan(0.02);       // unmute restores audio
  });
});
