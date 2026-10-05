/**
 * The game-music-emu wasm plays the game-music formats.
 *
 * NSF, GBS, HES, KSS, SPC, VGM/VGZ and GYM had no emulator in DEViLBOX: NSF,
 * VGM and GYM rebuilt approximate notes from register writes on Furnace
 * instruments, GBS/HES/KSS/SPC opened as empty stubs (2026-10-05).
 * game-music-emu (third-party/game-music-emu, built in game-music-emu-wasm/)
 * runs each file's own sound program on the console's CPU and sound chips.
 *
 * Drives the real bundle (public/gme/Gme.js + .wasm) on one song per format.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadWebBundle, type WebBundle } from '@/test/wasm/webBundle';

const ROOT = process.cwd();
const DIR = join(ROOT, 'public/gme');
const SONGS = join(ROOT, 'public/data/songs');
const SR = 48000;

interface GmeModule {
  _malloc(n: number): number;
  _free(p: number): void;
  _gme_wasm_load(p: number, n: number, track: number, sampleRate: number): number;
  _gme_wasm_render(out: number, frames: number): number;
  _gme_wasm_render_channels(out: number, ch: number, frames: number, stride: number): number;
  _gme_wasm_set_mute_mask(mask: number): void;
  _gme_wasm_free(): void;
  _gme_wasm_track_count(): number;
  _gme_wasm_loaded_track(): number;
  _gme_wasm_voice_count(): number;
  _gme_wasm_scope_count(): number;
}

let b: WebBundle<GmeModule>;
beforeAll(async () => {
  b = await loadWebBundle<GmeModule>(join(DIR, 'Gme.js'), join(DIR, 'Gme.wasm'), 'createGme');
}, 60_000);

/** Load and start `track`; the mute mask is set first, as the engine keeps it across loads. */
function load(rel: string, track = 0, mask = 0xffffffff): number {
  const data = new Uint8Array(readFileSync(join(SONGS, rel)));
  const m = b.module;
  m._gme_wasm_set_mute_mask(mask >>> 0);
  const p = m._malloc(data.length);
  b.heap().set(data, p);
  const tracks = m._gme_wasm_load(p, data.length, track, SR);
  m._free(p);
  return tracks;
}

/** Peak and RMS of `seconds` of the mix; `taps` also returns each voice. */
function measure(seconds: number, taps = false): { peak: number; rms: number; mix: Float32Array; ch: Float32Array[] } {
  const m = b.module;
  const frames = 1024;
  const out = m._malloc(frames * 8);
  const chp = m._malloc(frames * 8 * 4);
  const total = Math.floor(SR * seconds / frames) * frames;
  const mix = new Float32Array(total * 2);
  const ch = Array.from({ length: 8 }, () => new Float32Array(total));
  let peak = 0, e = 0;
  for (let done = 0; done < total;) {
    const got = taps ? m._gme_wasm_render_channels(out, chp, frames, frames) : m._gme_wasm_render(out, frames);
    if (got <= 0) break;
    const f = new Float32Array(b.heap().buffer, out, got * 2);
    mix.set(f, done * 2);
    for (const v of f) { const a = Math.abs(v); if (a > peak) peak = a; e += v * v; }
    if (taps) for (let c = 0; c < 8; c++) ch[c].set(new Float32Array(b.heap().buffer, chp + c * frames * 4, got), done);
    done += got;
  }
  m._free(out); m._free(chp);
  return { peak, rms: Math.sqrt(e / mix.length), mix, ch };
}

const rmsOf = (a: Float32Array): number => Math.sqrt(a.reduce((s, v) => s + v * v, 0) / a.length);

// [file, track, per-voice taps expected]. game-music-emu renders voices
// apart only on its "classic" emulators; SPC, VGM and GYM give the mix.
const CORPUS: Array<[string, number, boolean]> = [
  ['nsf/dr mario.nsf', 0, true],
  ['gbs/airforce delta.gbs', 0, true],
  ['hes/impossamole.hes', 0, true],
  ['kss/gradius 2.kss', 40, true], // KSS has no track list; 0-39 are effects or empty
  ['spc/01 - main theme.spc', 0, false],
  ['vgm/03 title screen.vgz', 0, false], // Master System SN76489, gzipped
  ['vgm/sparkster - continue.vgz', 0, false], // Mega Drive YM2612 + SN76489
  ['gym/level1.gym', 0, false], // GYMX with a zlib-packed stream: the bridge inflates it
];

describe('the game-music-emu wasm plays game music', () => {
  for (const [rel, track, taps] of CORPUS) {
    it(`${rel} renders audio in its first four seconds`, () => {
      expect(load(rel, track)).toBeGreaterThan(0);
      const { peak, rms } = measure(4);
      console.log(`[gme] ${rel}: tracks ${b.module._gme_wasm_track_count()} voices ${b.module._gme_wasm_voice_count()} scopes ${b.module._gme_wasm_scope_count()} peak ${peak.toFixed(3)} rms ${rms.toFixed(4)}`);
      expect(peak).toBeGreaterThan(0.02);
      expect(peak).toBeLessThanOrEqual(1.5);
      expect(rms).toBeGreaterThan(0.003);
      expect(b.module._gme_wasm_scope_count() > 0).toBe(taps);
    }, 60_000);
  }

  it('the mute mask silences every voice and the voice taps sum to the mix', () => {
    expect(load('nsf/dr mario.nsf')).toBeGreaterThan(0);
    const all = measure(3).rms;
    expect(load('nsf/dr mario.nsf', 0, 0)).toBeGreaterThan(0);
    const none = measure(3).rms;
    expect(none).toBeLessThan(all / 100);
    // One bit reaches one voice: square 2 alone is quieter than the mix but sounds.
    expect(load('nsf/dr mario.nsf', 0, 1 << 1)).toBeGreaterThan(0);
    const one = measure(3).rms;
    expect(one).toBeGreaterThan(all / 20);
    expect(one).toBeLessThan(all * 0.95);

    expect(load('nsf/dr mario.nsf')).toBeGreaterThan(0);
    const tapped = measure(2, true);
    const voices = b.module._gme_wasm_scope_count();
    expect(voices).toBeGreaterThanOrEqual(5); // 2A03: square 1, square 2, triangle, noise, DMC
    expect(tapped.ch.slice(0, voices).filter((c) => rmsOf(c) > 0.001).length).toBeGreaterThanOrEqual(2);
    // Each tap is its voice's (L+R)/2, so the taps add up to the mid of the mix.
    const mid = new Float32Array(tapped.mix.length / 2).map((_, i) => (tapped.mix[i * 2] + tapped.mix[i * 2 + 1]) / 2);
    const sum = new Float32Array(mid.length).map((_, i) => tapped.ch.slice(0, voices).reduce((s, c) => s + c[i], 0));
    let worst = 0;
    for (let i = 0; i < mid.length; i++) worst = Math.max(worst, Math.abs(mid[i] - sum[i]));
    expect(worst).toBeLessThan(1e-4);
    b.module._gme_wasm_free();
  }, 60_000);

  it('a chosen track starts and an unknown file is refused', () => {
    const tracks = load('nsf/dr mario.nsf', 1);
    expect(tracks).toBeGreaterThan(1);
    expect(measure(2).peak).toBeGreaterThan(0.02);
    const m = b.module;
    const junk = new Uint8Array(256).fill(0x55);
    const p = m._malloc(junk.length);
    b.heap().set(junk, p);
    expect(m._gme_wasm_load(p, junk.length, 0, SR)).toBe(-1);
    m._free(p);
  }, 60_000);

  it('a file whose first tracks are silent starts on its first audible track', () => {
    // KSS has no track list; gradius 2's tracks 0-39 are effects or empty and
    // the song opened silent on track 0 (owner rule: first audible subsong).
    load('kss/gradius 2.kss', 0);
    expect(b.module._gme_wasm_loaded_track()).toBeGreaterThan(0);
    expect(measure(2).peak).toBeGreaterThan(0.02);
    // A track that is already audible stays the track that plays.
    load('nsf/dr mario.nsf', 0);
    expect(b.module._gme_wasm_loaded_track()).toBe(0);
  }, 60_000);
});
