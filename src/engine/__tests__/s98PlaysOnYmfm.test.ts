/**
 * S98 register logs play on ymfm chips.
 *
 * S98Parser rebuilt approximate notes from the logged register writes onto
 * Furnace instruments (and gave v1 files a YM2149 where the format's default
 * is a YM2608, 2026-10-05). s98-wasm replays the log itself, one ymfm chip
 * per device. Drives the real bundle (public/s98/S98.js + .wasm) on a v1
 * file (default YM2608), a v3 YM2203 file and a v3 X1 file (YM2149 + YM2151).
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadWebBundle, type WebBundle } from '@/test/wasm/webBundle';

const ROOT = process.cwd();
const DIR = join(ROOT, 'public/s98');
const SONGS = join(ROOT, 'public/data/songs/s98');
const SR = 48000;

interface S98Module {
  _malloc(n: number): number;
  _free(p: number): void;
  _s98_wasm_load(p: number, n: number, sampleRate: number): number;
  _s98_wasm_render(out: number, frames: number): number;
  _s98_wasm_render_channels(out: number, ch: number, frames: number, stride: number): number;
  _s98_wasm_set_mute_mask(mask: number): void;
  _s98_wasm_free(): void;
  _s98_wasm_device_type(i: number): number;
  _s98_wasm_device_plays(i: number): number;
}

let b: WebBundle<S98Module>;
beforeAll(async () => {
  b = await loadWebBundle<S98Module>(join(DIR, 'S98.js'), join(DIR, 'S98.wasm'), 'createS98');
}, 60_000);

function load(name: string, mask = 0xffffffff): number {
  const data = new Uint8Array(readFileSync(join(SONGS, name)));
  const m = b.module;
  m._s98_wasm_set_mute_mask(mask >>> 0);
  const p = m._malloc(data.length);
  b.heap().set(data, p);
  const n = m._s98_wasm_load(p, data.length, SR);
  m._free(p);
  return n;
}

function measure(seconds: number, devices = 0): { peak: number; rms: number; ch: number[] } {
  const m = b.module;
  const frames = 1024;
  const out = m._malloc(frames * 8);
  const chp = m._malloc(frames * 4 * Math.max(1, devices));
  let peak = 0, e = 0, n = 0;
  const che = new Array(devices).fill(0);
  for (let done = 0; done < SR * seconds; done += frames) {
    const got = devices ? m._s98_wasm_render_channels(out, chp, frames, frames) : m._s98_wasm_render(out, frames);
    if (got <= 0) break;
    for (const v of new Float32Array(b.heap().buffer, out, got * 2)) { peak = Math.max(peak, Math.abs(v)); e += v * v; n++; }
    for (let d = 0; d < devices; d++) for (const v of new Float32Array(b.heap().buffer, chp + d * frames * 4, got)) che[d] += v * v;
  }
  m._free(out); m._free(chp);
  return { peak, rms: Math.sqrt(e / Math.max(1, n)), ch: che.map((v) => Math.sqrt(v / Math.max(1, n / 2))) };
}

describe('the S98 wasm plays S98 register logs on ymfm', () => {
  for (const [name, types] of [
    ['carat-01.s98', [4]],       // v1: the format's default YM2608 at 7.9872 MHz
    ['hiouden 10.s98', [2]],     // v3 YM2203 (PC-88)
    ['ys2x105.s98', [1, 5]],     // v3 Sharp X1: YM2149 + YM2151
  ] as const) {
    it(`${name} (${types.join(' + ')}) renders audio in its first six seconds`, () => {
      expect(load(name)).toBe(types.length);
      for (let i = 0; i < types.length; i++) {
        expect(b.module._s98_wasm_device_type(i)).toBe(types[i]);
        expect(b.module._s98_wasm_device_plays(i)).toBe(1);
      }
      const { peak, rms } = measure(6);
      console.log(`[s98] ${name}: peak ${peak.toFixed(3)} rms ${rms.toFixed(4)}`);
      expect(peak).toBeGreaterThan(0.02);
      expect(peak).toBeLessThanOrEqual(1.5);
      expect(rms).toBeGreaterThan(0.003);
    }, 60_000);
  }

  it('each device has its own tap and its own mute bit', () => {
    expect(load('ys2x105.s98')).toBe(2);
    const both = measure(6, 2);
    console.log('[s98] ys2x105 device taps', both.ch.map((v) => v.toFixed(4)).join(' '));
    expect(Math.min(...both.ch)).toBeGreaterThan(0.001);
    expect(load('ys2x105.s98', 0)).toBe(2);
    expect(measure(6).rms).toBeLessThan(both.rms / 100);
    expect(load('ys2x105.s98', 0b10)).toBe(2); // the YM2151 alone
    const opm = measure(6, 2);
    expect(opm.ch[0]).toBe(0);
    expect(opm.ch[1]).toBeGreaterThan(0.001);
    b.module._s98_wasm_free();
  }, 60_000);

  it('a PSG tone sounds at the pitch libvgm plays it (clock / 2 for both PSG types)', () => {
    // v3, one device; tone A only, volume 15, period 252; then 129 ticks.
    for (const type of [1, 15]) {
      const f = new Uint8Array(0x30 + 15);
      const dv = new DataView(f.buffer);
      f.set([0x53, 0x39, 0x38, 0x33]);
      dv.setUint32(0x04, 10, true); dv.setUint32(0x08, 1000, true);
      dv.setUint32(0x14, 0x30, true); dv.setUint32(0x1C, 1, true);
      dv.setUint32(0x20, type, true); dv.setUint32(0x24, 4_000_000, true);
      f.set([0, 7, 0x3e, 0, 8, 15, 0, 0, 252, 0, 1, 0, 0xfe, 0x7f, 0xfd], 0x30);
      const m = b.module;
      m._s98_wasm_set_mute_mask(0xffffffff);
      const p = m._malloc(f.length);
      b.heap().set(f, p);
      expect(m._s98_wasm_load(p, f.length, SR)).toBe(1);
      m._free(p);
      const out = m._malloc(SR * 8);
      expect(m._s98_wasm_render(out, SR)).toBe(SR);
      const a = new Float32Array(b.heap().buffer, out, SR * 2).filter((_, i) => i % 2 === 0);
      const mean = a.reduce((s, v) => s + v, 0) / a.length;
      let rises = 0;
      for (let i = SR / 10 + 1; i < SR; i++) if (a[i - 1] - mean <= 0 && a[i] - mean > 0) rises++;
      m._free(out);
      // 2 MHz / (16 * 252) = 496 Hz; the double ymfm divider gave 124 Hz.
      expect(rises / 0.9).toBeGreaterThan(490);
      expect(rises / 0.9).toBeLessThan(503);
    }
  });

  it('refuses a file that is not S98', () => {
    const m = b.module;
    const junk = new Uint8Array(64).fill(0x41);
    const p = m._malloc(junk.length);
    b.heap().set(junk, p);
    expect(m._s98_wasm_load(p, junk.length, SR)).toBe(-1);
    m._free(p);
  });
});
