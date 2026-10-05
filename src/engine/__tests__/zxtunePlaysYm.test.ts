/**
 * Atari ST YM register dumps play on the ZXTune engine's YM player.
 *
 * YMParser rebuilt notes from the register frames onto Furnace instruments
 * (approximate); zxtune-wasm already replays YM2-YM6 frames, LHA-packed or
 * raw, on ayumi's YM2149 (2026-10-05). Drives the real bundle
 * (public/zxtune/Zxtune.js + .wasm) on the corpus songs from modland.
 * gameMusicPlaysOnGme.test.ts proves the import selects the engine.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadWebBundle, type WebBundle } from '@/test/wasm/webBundle';

const ROOT = process.cwd();
const DIR = join(ROOT, 'public/zxtune');
const SR = 48000;

interface ZxtuneModule {
  _malloc(n: number): number;
  _free(p: number): void;
  _zxtune_init(p: number, n: number): number;
  _zxtune_render(out: number, frames: number): number;
  _player_set_sample_rate(rate: number): void;
}

let b: WebBundle<ZxtuneModule>;
beforeAll(async () => {
  b = await loadWebBundle<ZxtuneModule>(join(DIR, 'Zxtune.js'), join(DIR, 'Zxtune.wasm'), 'createZxtune');
  b.module._player_set_sample_rate(SR);
}, 60_000);

describe('the ZXTune wasm plays YM', () => {
  for (const rel of ['ym/17th.ym', 'ym/drooling.ym']) {
    it(`${rel} (LHA-packed YM) renders audio in its first four seconds`, () => {
      const data = new Uint8Array(readFileSync(join(ROOT, 'public/data/songs', rel)));
      const m = b.module;
      const p = m._malloc(data.length);
      b.heap().set(data, p);
      expect(m._zxtune_init(p, data.length)).toBe(0);
      m._free(p);
      const frames = 1024;
      const out = m._malloc(frames * 8);
      let peak = 0, e = 0, n = 0;
      for (let done = 0; done < SR * 4; done += frames) {
        m._zxtune_render(out, frames);
        for (const v of new Float32Array(b.heap().buffer, out, frames * 2)) { peak = Math.max(peak, Math.abs(v)); e += v * v; n++; }
      }
      m._free(out);
      const rms = Math.sqrt(e / n);
      console.log(`[zxtune] ${rel}: peak ${peak.toFixed(3)} rms ${rms.toFixed(4)}`);
      expect(peak).toBeGreaterThan(0.02);
      expect(peak).toBeLessThanOrEqual(1);
      expect(rms).toBeGreaterThan(0.003);
    }, 60_000);
  }
});
