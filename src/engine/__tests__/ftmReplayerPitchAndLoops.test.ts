/**
 * The Face The Music replayer plays notes at Paula pitch and pattern loops
 * as many times as PlayFTM does.
 *
 * Two porting bugs, both measured against libopenmpt 0.9 on rock.ftm and
 * staticoscillations.ftm and checked in the original player (PlayFTM):
 *  - ftm_period_to_freq divided the 3546895 Hz clock by 2 * period, so every
 *    note sounded an octave low (and one-shot samples rang twice as long).
 *    Period 428 is 8287 Hz.
 *  - A loop point of N stored N as its counter and repeated until it went
 *    negative: N + 1 plays. PlayFTM stores N - 1 ($f7a: lsr #6, subq #1), so
 *    a loop of N plays N times (staticoscillations.ftm changed section 4 s
 *    late).
 *
 * Each case is a minimal FTM module built here and rendered by the real WASM.
 */
import { describe, it, expect } from 'vitest';
import { startWorklet } from './workletHarness';

type FtmModule = {
  _malloc(n: number): number;
  _free(p: number): void;
  _ftm_create(p: number, n: number, rate: number): number;
  _ftm_destroy(h: number): void;
  _ftm_render(h: number, out: number, frames: number): number;
  HEAPU8: Uint8Array;
  HEAPF32: Float32Array;
};

const RATE = 48000;

/** A one-sample, 2-measure FTM module (6 ticks/row, 16 rows/measure) with `events` on track 0. */
function ftm(events: number[], sample: { oneshotWords: number; loopWords: number; data: Int8Array }): Uint8Array {
  const out: number[] = [];
  const u16 = (v: number) => out.push((v >> 8) & 0xff, v & 0xff);
  const u32 = (v: number) => out.push((v >>> 24) & 0xff, (v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff);
  out.push(0x46, 0x54, 0x4d, 0x4e, 3, 1); // "FTMN", version 3, 1 sample
  u16(2);        // measures
  u16(14209);    // CIA tempo
  out.push(0, 0xff, 63, 0x01, 6, 16); // tonality, all channels on, global volume, embedded samples, speed, rows/measure
  for (let i = 0; i < 64; i++) out.push(0); // title + artist
  out.push(0, 0); // no SEL scripts, padding
  const name = 'test';
  for (let i = 0; i < 32; i++) out.push(i < name.length ? name.charCodeAt(i) : 0);
  for (let ch = 0; ch < 8; ch++) {
    const ev = ch === 0 ? events : [];
    u16(0); u32(ev.length); out.push(...ev);
  }
  u16(sample.oneshotWords); u16(sample.loopWords);
  for (const b of sample.data) out.push(b & 0xff);
  return new Uint8Array(out);
}

async function render(file: Uint8Array, seconds: number): Promise<Float32Array> {
  const { proc } = await startWorklet('facethemusic', 'FaceTheMusic');
  const m = proc.module as FtmModule;
  const p = m._malloc(file.length);
  m.HEAPU8.set(file, p);
  const h = m._ftm_create(p, file.length, RATE);
  m._free(p);
  expect(h, 'module loads').not.toBe(0);
  const frames = RATE * seconds;
  const buf = m._malloc(4800 * 8);
  const left = new Float32Array(frames);
  for (let f = 0; f < frames; f += 4800) {
    m._ftm_render(h, buf, 4800);
    const block = m.HEAPF32.subarray(buf >> 2, (buf >> 2) + 9600);
    for (let i = 0; i < 4800 && f + i < frames; i++) left[f + i] = block[i * 2];
  }
  m._free(buf);
  m._ftm_destroy(h);
  return left;
}

describe('Face The Music replayer', () => {
  it('plays note 13 (period 428) at 8287 Hz, not an octave low', async () => {
    // Row 0: volume step 9, instrument 1, note 13. A looped 32-byte square wave.
    const square = Int8Array.from({ length: 32 }, (_, i) => (i < 16 ? 100 : -100));
    const left = await render(ftm([0xa0, 0x40 | 13], { oneshotWords: 0, loopWords: 16, data: square }), 1);
    let crossings = 0;
    for (let i = RATE * 0.2 + 1; i < RATE; i++) if ((left[i] > 0) !== (left[i - 1] > 0)) crossings++;
    const hz = crossings / 2 / 0.8;
    expect(hz).toBeGreaterThan((8287 / 32) * 0.97);
    expect(hz).toBeLessThan((8287 / 32) * 1.03);
  });

  it('plays a loop of 2 twice in all', async () => {
    // Row 0: loop start (count 2). Row 1: note 13 on a short one-shot burst.
    // Spacing 13, row 15: loop end. Measure 1 is empty.
    const burst = Int8Array.from({ length: 128 }, (_, i) => (i % 8 < 4 ? 100 : -100));
    const left = await render(ftm([0xe0, 0x80, 0xa0, 0x40 | 13, 0xf0, 13, 0xe0, 0x00], { oneshotWords: 64, loopWords: 0, data: burst }), 5.5);
    const win = RATE / 100;
    let onsets = 0, sounding = false;
    for (let w = 0; w + win <= left.length; w += win) {
      let peak = 0;
      for (let i = w; i < w + win; i++) peak = Math.max(peak, Math.abs(left[i]));
      if (peak > 0.05 && !sounding) onsets++;
      sounding = peak > 0.05;
    }
    expect(onsets).toBe(2);
  });
});
