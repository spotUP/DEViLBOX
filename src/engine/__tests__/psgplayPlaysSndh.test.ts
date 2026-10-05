/**
 * Atari ST SNDH plays through the psgplay wasm.
 *
 * SNDH went to the old sc68 core, which took the raw files and rendered
 * silence (`mad_max/jochen.snd`: peak 0 headless; the owner heard nothing in
 * the app, 2026-10-05). PSG play (third-party/psgplay, built in psgplay-wasm/)
 * runs the tune's own 68000 code with YM2149, MFP timers and STE DMA sound.
 *
 * Drives the real bundle (public/psgplay/Psgplay.js + .wasm) on songs of the
 * owner's SNDH set: YM-only players, a timer-driven Mad Max tune and an STE
 * DMA song.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadWebBundle, type WebBundle } from '@/test/wasm/webBundle';

const ROOT = process.cwd();
const DIR = join(ROOT, 'public/psgplay');
const SNDH = join(ROOT, 'public/data/songs/sndh');
const SR = 48000;

interface PsgplayModule {
  _malloc(n: number): number;
  _free(p: number): void;
  _psgplay_wasm_load(p: number, n: number, track: number, sampleRate: number): number;
  _psgplay_wasm_render(out: number, frames: number): number;
  _psgplay_wasm_render_channels(out: number, ch: number, frames: number, stride: number): number;
  _psgplay_wasm_set_mute_mask(mask: number): void;
  _psgplay_wasm_free(): void;
  _psgplay_wasm_step_frame(): number;
  _psgplay_wasm_get_regs(): number;
  _psgplay_wasm_subtune_count(): number;
}

let b: WebBundle<PsgplayModule>;
beforeAll(async () => {
  b = await loadWebBundle<PsgplayModule>(join(DIR, 'Psgplay.js'), join(DIR, 'Psgplay.wasm'), 'createPsgplay');
}, 60_000);

function load(rel: string, sampleRate = SR, track = 1): number {
  const data = new Uint8Array(readFileSync(join(SNDH, rel)));
  const m = b.module;
  const p = m._malloc(data.length);
  b.heap().set(data, p);
  const started = m._psgplay_wasm_load(p, data.length, track, sampleRate);
  m._free(p);
  return started;
}

/** Peak and RMS of `seconds` of the mix; `taps` renders with the per-channel buffers. */
function measure(seconds: number, mask = 0x7, taps = false): { peak: number; rms: number; mix: Float32Array; ch: Float32Array[] } {
  const m = b.module;
  m._psgplay_wasm_set_mute_mask(mask);
  const frames = 1024;
  const out = m._malloc(frames * 8);
  const chp = m._malloc(frames * 12);
  const total = Math.floor(SR * seconds / frames) * frames;
  const mix = new Float32Array(total * 2);
  const ch = [0, 1, 2].map(() => new Float32Array(total));
  let peak = 0, e = 0;
  for (let done = 0; done < total;) {
    const got = taps ? m._psgplay_wasm_render_channels(out, chp, frames, frames) : m._psgplay_wasm_render(out, frames);
    if (got <= 0) break;
    const f = new Float32Array(b.heap().buffer, out, got * 2);
    mix.set(f, done * 2);
    for (const v of f) { const a = Math.abs(v); if (a > peak) peak = a; e += v * v; }
    if (taps) for (let c = 0; c < 3; c++) ch[c].set(new Float32Array(b.heap().buffer, chp + c * frames * 4, got), done);
    done += got;
  }
  m._free(out); m._free(chp);
  m._psgplay_wasm_set_mute_mask(0x7);
  return { peak, rms: Math.sqrt(e / mix.length), mix, ch };
}

const SONGS = [
  'mad_max/jochen.snd',
  'whittake.dav/glider.snd',
  '2spaces/1flight.snd',
  'tao/modulato.snd',
  'dubmood/radix.snd',
  '505/dma/lastrans.snd',
];

describe('the psgplay wasm plays SNDH', () => {
  for (const rel of SONGS) {
    it(`${rel} renders audio in its first four seconds`, () => {
      expect(load(rel)).toBe(1);
      const { peak, rms } = measure(4);
      console.log(`[psgplay] ${rel}: peak ${peak.toFixed(3)} rms ${rms.toFixed(4)}`);
      expect(peak).toBeGreaterThan(0.05);
      expect(peak).toBeLessThanOrEqual(1);
      expect(rms).toBeGreaterThan(0.005);
    }, 60_000);
  }

  it('the mute mask silences the three YM channels and each bit reaches its channel', () => {
    const rmsWith = (mask: number): number => { expect(load('mad_max/jochen.snd')).toBe(1); return measure(3, mask).rms; };
    const all = rmsWith(0x7);
    const none = rmsWith(0);
    const without = [0x6, 0x5, 0x3].map(rmsWith);
    console.log('[psgplay] jochen all / none / without A,B,C:', all.toFixed(4), none.toFixed(6), without.map((v) => v.toFixed(4)).join(' '));
    expect(none).toBeLessThan(all / 100);
    expect(Math.min(...without)).toBeLessThan(all * 0.95);
  }, 60_000);

  it('the per-channel taps leave the mix bit-identical and carry the channels', () => {
    expect(load('mad_max/jochen.snd')).toBe(1);
    const plain = measure(2).mix;
    expect(load('mad_max/jochen.snd')).toBe(1);
    const tapped = measure(2, 0x7, true);
    expect(tapped.mix).toEqual(plain);
    // jochen opens on channel B alone (muting B silences the mix above).
    const rmsOf = (a: Float32Array): number => Math.sqrt(a.reduce((e, v) => e + v * v, 0) / a.length);
    const late = (c: Float32Array): Float32Array => c.subarray(c.length / 2);
    expect(rmsOf(late(tapped.ch[1]))).toBeGreaterThan(0.05);
    expect(rmsOf(late(tapped.ch[0]))).toBeLessThan(0.01);
  }, 60_000);

  it("honours the '##' subtune count: a chosen subtune starts, one past the count falls back to the default", () => {
    expect(load('whittake.dav/glider.snd', SR, 2)).toBe(2);
    expect(b.module._psgplay_wasm_subtune_count()).toBe(3);
    expect(measure(2).peak).toBeGreaterThan(0.05);
    expect(load('whittake.dav/glider.snd', SR, 4)).toBe(1);
    expect(load('whittake.dav/glider.snd', SR, 0)).toBe(1);
    b.module._psgplay_wasm_free();
  }, 60_000);

  it('the grid run reads tone periods from the YM registers', () => {
    expect(load('mad_max/jochen.snd', 0)).toBe(1);
    const m = b.module;
    const periods = new Set<number>();
    for (let f = 0; f < 250; f++) {
      expect(m._psgplay_wasm_step_frame()).toBe(1);
      const r = m._psgplay_wasm_get_regs();
      const regs = b.heap().slice(r, r + 16);
      for (let c = 0; c < 3; c++) periods.add(((regs[c * 2 + 1] & 15) << 8) | regs[c * 2]);
    }
    m._psgplay_wasm_free();
    expect(periods.size).toBeGreaterThan(5);
  }, 60_000);
});
