// @vitest-environment node
// Regression: furnace_dispatch_mute / read_osc / get_osc_needle took a channel
// straight from JS and indexed the platform's per-channel arrays with it. The
// mixer's mute-all looped the song's channel count over a chip with fewer
// channels, writing past the arrays (DefleMask songs played corrupted/silent).
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const dir = path.resolve(__dirname, '../../../public/furnace-dispatch');

interface Mod {
  _furnace_init(): void;
  _furnace_dispatch_create(platform: number, rate: number): number;
  _furnace_dispatch_get_num_channels(h: number): number;
  _furnace_dispatch_mute(h: number, c: number, m: number): void;
  _furnace_dispatch_get_osc_needle(h: number, c: number): number;
  _furnace_dispatch_read_osc(h: number, c: number, end: number, out: number, n: number): void;
  _malloc(n: number): number;
}

async function load(): Promise<Mod> {
  const src = readFileSync(path.join(dir, 'FurnaceDispatch.js'), 'utf8');
  // The glue is a plain script defining createFurnaceDispatch; hide module/exports/define so it does not export.
  const factory = new Function('module', 'exports', 'define', 'require', '__dirname', '__filename', `${src}\nreturn createFurnaceDispatch;`)(
    undefined, undefined, undefined, createRequire(import.meta.url), dir, path.join(dir, 'FurnaceDispatch.js')) as (o: object) => Promise<Mod>;
  return factory({ wasmBinary: readFileSync(path.join(dir, 'FurnaceDispatch.wasm')) });
}

describe('furnace dispatch per-channel entry points', () => {
  it('ignores a channel outside the chip instead of writing past its arrays', async () => {
    const m = await load();
    m._furnace_init();
    let h = 0;
    for (let p = 1; p < 80 && !h; p++) {
      const c = m._furnace_dispatch_create(p, 44100);
      if (c > 0 && m._furnace_dispatch_get_num_channels(c) > 0) h = c;
    }
    expect(h).toBeGreaterThan(0);
    const n = m._furnace_dispatch_get_num_channels(h);
    const out = m._malloc(512);
    for (const bad of [n, n + 1, 4096, 1 << 20, -1, -4096]) {
      expect(() => m._furnace_dispatch_mute(h, bad, 1)).not.toThrow();
      expect(() => m._furnace_dispatch_get_osc_needle(h, bad)).not.toThrow();
      expect(() => m._furnace_dispatch_read_osc(h, bad, 0, out, 64)).not.toThrow();
    }
    // in-range mute still accepted
    expect(() => m._furnace_dispatch_mute(h, n - 1, 1)).not.toThrow();
  });
});
