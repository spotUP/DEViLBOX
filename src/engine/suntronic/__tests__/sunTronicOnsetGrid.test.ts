/**
 * Regression: SunTronic native notes latch on the PAL vblank grid, NOT the 1024
 * bucket.
 *
 * Bug (2026-07-17, song "ready"): the audio renderer latched note/period/volume
 * on the 1024-sample bucket clock (player.tick(), double-position schedule) while
 * synth timbre regenerated on the ~882.76-sample vblank. That quantized every
 * note ONSET to a bucket boundary — measured mean 10.5 ms / max 21.6 ms onset
 * jitter (tools/suntronic-re/onset-schedule-diff.ts), audible as "some notes are
 * off" rhythmically. The voiceFidelity xcorr metric re-aligns each window, so it
 * was blind to this — which is why an earlier Gate-E pass wrongly judged the
 * vblank grid inert.
 *
 * The fix drives one player step per vblank (player.stepVblankOnce) so onsets land
 * at their true sub-bucket sample offset. 29 vblank steps over 25 buckets == the
 * same 29 stepAlls the bucket clock bundles via 4 doubles, so period VALUES stay
 * byte-exact vs the golden.
 *
 * Fails on revert: latch notes on the 1024 bucket again and the latch positions
 * become multiples of 1024 (25 latches / 25600 samples) instead of the 29 vblank
 * offsets this pins.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseSunTronicV13Score } from '@/lib/import/formats/SunTronicV13';
import { SunTronicNativeRenderer } from '../SunTronicNativeRender';

const CORPUS = join(process.cwd(), 'public/data/songs/formats/SUNTronicTunes');
const VBLANK = (1024 * 25) / 29; // 882.7586… samples per PAL vblank

function loadSampleData(names: string[]): (Int8Array | null)[] {
  return names.map((n) => {
    try { return new Int8Array(readFileSync(join(CORPUS, 'instr', n))); } catch { return null; }
  });
}

describe('SunTronic native onset grid', () => {
  const buf = new Uint8Array(readFileSync(join(CORPUS, 'analgestic2.src')));
  const score = parseSunTronicV13Score(buf);
  const slotPcm = loadSampleData(score.instrumentNames);

  it('latches notes on the 882.76 vblank grid, not the 1024 bucket', () => {
    const N = 25600; // exactly 25 buckets == 29 vblanks
    const renderer = new SunTronicNativeRenderer(score, slotPcm);
    const latchPos: number[] = [];
    const ch: [Float32Array, Float32Array, Float32Array, Float32Array] = [
      new Float32Array(N), new Float32Array(N), new Float32Array(N), new Float32Array(N),
    ];
    renderer.renderInto(new Float32Array(N), new Float32Array(N), { ch, latchPos });

    // 29 vblanks span 25 buckets — NOT 25 (the reverted bucket-clock count).
    expect(latchPos.length).toBe(29);
    expect(latchPos.length).not.toBe(25);

    // Every latch lands within 1 sample of round(k*VBLANK) — the true UADE fire
    // grid — and is NOT a multiple of 1024 (except the shared k=0 priming latch).
    let nonBucketAligned = 0;
    let nextVblank = 0; // mirrors the renderer: latch at first pos >= nextVblank
    for (let k = 0; k < latchPos.length; k++) {
      const expected = Math.ceil(nextVblank); // first integer sample at/after k*VBLANK
      expect(latchPos[k]).toBe(expected);
      if (k > 0 && latchPos[k] % 1024 !== 0) nonBucketAligned++;
      nextVblank += VBLANK;
    }
    // The whole point: onsets are OFF the 1024 grid. The bucket clock would put
    // every one on a multiple of 1024; the vblank grid puts almost none there.
    expect(nonBucketAligned).toBeGreaterThan(20);
  });
});
