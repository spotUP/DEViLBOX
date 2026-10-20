/**
 * The R2a Peaks and Env summaries (spec thoughts/shared/research/2026-10-20_r2a-event-protocol.md section 1.1).
 * One implementation per language; the shared fixture __tests__/fixtures/r2_peaks.json pins both.
 */
import { roundHalfEven } from '@/engine/dj/scratch/scratchGrit';

export interface Peaks { n: number; scale: number; min: number[]; max: number[]; len: number }
export interface Env { n: number; values: number[] }

export const PEAKS_N = 256;
export const ENV_N = 64;

/** Bucket i covers [floor(i*len/n), floor((i+1)*len/n)); n = len below 256 samples; min/max are v/scale quantised to int8. */
export function peaks(buf: ArrayLike<number>): Peaks {
  const len = buf.length;
  const n = len < PEAKS_N ? len : PEAKS_N;
  let scale = 0;
  for (let i = 0; i < len; i++) { const a = Math.abs(buf[i]!); if (a > scale) scale = a; }
  const min = new Array<number>(n).fill(0);
  const max = new Array<number>(n).fill(0);
  if (scale > 0) {
    for (let i = 0; i < n; i++) {
      const lo = Math.floor(i * len / n), hi = Math.floor((i + 1) * len / n);
      let mn = Infinity, mx = -Infinity;
      for (let k = lo; k < hi; k++) { const v = buf[k]!; if (v < mn) mn = v; if (v > mx) mx = v; }
      min[i] = roundHalfEven(mn / scale * 127) + 0; // + 0 turns -0 into 0
      max[i] = roundHalfEven(mx / scale * 127) + 0;
    }
  }
  return { n, scale, min, max, len };
}

/** 64 values, the one at sample floor(i*len/64). */
export function envOf(arr: ArrayLike<number>): Env {
  const len = arr.length;
  const values: number[] = [];
  for (let i = 0; i < ENV_N; i++) values.push(len ? arr[Math.floor(i * len / ENV_N)]! : 0);
  return { n: ENV_N, values };
}
