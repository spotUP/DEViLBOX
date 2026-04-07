// Shared pointer-to-value helpers for interactive Pixi bar-chart editors.
//
// Used by the HippelCoSo fseq/vseq editors and the SonicArranger ADSR editor
// (both live in src/pixi/views/instruments/). The math mirrors the DOM
// SequenceEditor in src/components/instruments/SequenceEditor.tsx so drag
// behaviour feels identical across DOM and GL.
//
// Two variants:
//   - writeBipolarBar: signed values centered on mid-height (used by fseq).
//   - writeUnipolarBar: unsigned values with 0 at bottom (used by vseq, ADSR).
//
// Both skip terminator/sentinel positions so end-of-sequence markers are
// preserved during a drag. Gaps from fast drags are filled via linear
// interpolation between prevIdx and the current idx, matching the
// writeWaveformByte helper in src/lib/jamcracker/waveformDraw.ts.

export interface BarDragResult {
  next: number[];
  idx: number;
}

/**
 * Returns true if the given value is a HippelCoSo-style terminator sentinel.
 * fseq uses -31 as FSEQ_END, vseq uses -31..-25 as end markers, and -128 is
 * a loop marker. None of these should be overwritten by a drag edit.
 */
function isSentinel(v: number): boolean {
  return v === -128 || (v >= -31 && v <= -25);
}

/**
 * Clamps localX to the width and returns the visible-bar index the pointer is
 * over. If a sentinel filter is in effect the returned index is into the
 * filtered (visible) array — the caller then remaps it to the original array.
 */
function pointerToVisibleIdx(localX: number, width: number, visibleLen: number): number {
  if (visibleLen <= 0) return 0;
  const x = Math.max(0, Math.min(width, localX));
  return Math.min(visibleLen - 1, Math.max(0, Math.floor((x / width) * visibleLen)));
}

/**
 * Interpolate and write values into `next` between prevIdx and idx along the
 * original array, skipping any sentinel positions so end markers remain intact.
 */
function fillBetween(
  next: number[],
  prevIdx: number,
  idx: number,
  prevVal: number,
  newVal: number,
): void {
  if (prevIdx < 0 || prevIdx === idx) {
    if (!isSentinel(next[idx])) next[idx] = newVal;
    return;
  }
  const lo = Math.min(prevIdx, idx);
  const hi = Math.max(prevIdx, idx);
  const span = hi - lo;
  for (let i = lo; i <= hi; i++) {
    if (isSentinel(next[i])) continue;
    const t = span === 0 ? 1 : (i - lo) / span;
    const interp = idx > prevIdx
      ? Math.round(prevVal + (newVal - prevVal) * t)
      : Math.round(newVal + (prevVal - newVal) * t);
    next[i] = interp;
  }
}

/**
 * Handle a pointer write on a bipolar (signed) bar chart like the HC fseq or
 * the SA AMF table. `visibleMaxMag` is the bar magnitude the existing draw
 * code uses to compute bar height — it must match the renderer's maxMag so
 * the drag feels 1:1 with what is shown on screen.
 *
 * The returned `next` is a fresh array with the edit applied; sentinels at
 * the edit position (or along an interpolated run) are preserved.
 */
export function writeBipolarBar(
  values: number[],
  localX: number,
  localY: number,
  width: number,
  height: number,
  visibleMaxMag: number,
  valueMin: number,
  valueMax: number,
  prevIdx: number,
): BarDragResult {
  const visible: number[] = [];
  const visibleToOrig: number[] = [];
  for (let i = 0; i < values.length; i++) {
    if (isSentinel(values[i])) continue;
    visible.push(values[i]);
    visibleToOrig.push(i);
  }
  if (visible.length === 0) {
    return { next: values.slice(), idx: -1 };
  }

  const vIdx = pointerToVisibleIdx(localX, width, visible.length);
  const origIdx = visibleToOrig[vIdx];

  const mid = height / 2;
  const y = Math.max(0, Math.min(height, localY));
  const rawScaled = -((y - mid) / (mid - 2)) * visibleMaxMag;
  const clamped = Math.max(valueMin, Math.min(valueMax, Math.round(rawScaled)));

  const next = values.slice();
  const prevOrigIdx = prevIdx;
  const prevVal = prevOrigIdx >= 0 && prevOrigIdx < next.length ? next[prevOrigIdx] : clamped;
  fillBetween(next, prevOrigIdx, origIdx, prevVal, clamped);

  return { next, idx: origIdx };
}

/**
 * Handle a pointer write on a unipolar (0..max) bar chart like the HC vseq
 * (max 63, volume) or the SA ADSR table (max 64, volume).
 *
 * Values are clamped to [0, max]. Sentinels (e.g. the HC vseq -128 loop
 * marker) are preserved. Interpolated infill keeps fast drags smooth.
 */
export function writeUnipolarBar(
  values: number[],
  localX: number,
  localY: number,
  width: number,
  height: number,
  max: number,
  prevIdx: number,
): BarDragResult {
  // Build visible list by skipping sentinels — matches the renderer which
  // displays max(0, v) but we want the drag columns to align with the
  // non-sentinel bars the user actually sees.
  const visible: number[] = [];
  const visibleToOrig: number[] = [];
  for (let i = 0; i < values.length; i++) {
    if (isSentinel(values[i])) continue;
    visible.push(values[i]);
    visibleToOrig.push(i);
  }
  if (visible.length === 0) {
    return { next: values.slice(), idx: -1 };
  }

  const vIdx = pointerToVisibleIdx(localX, width, visible.length);
  const origIdx = visibleToOrig[vIdx];

  const y = Math.max(0, Math.min(height, localY));
  // y=0 is top (max), y=height is bottom (0)
  const raw = ((height - y) / (height - 2)) * max;
  const clamped = Math.max(0, Math.min(max, Math.round(raw)));

  const next = values.slice();
  const prevOrigIdx = prevIdx;
  const prevVal = prevOrigIdx >= 0 && prevOrigIdx < next.length
    ? Math.max(0, next[prevOrigIdx])
    : clamped;
  fillBetween(next, prevOrigIdx, origIdx, prevVal, clamped);

  return { next, idx: origIdx };
}
