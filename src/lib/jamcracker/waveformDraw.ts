// Shared byte-write + linear-interpolation helper for the JamCracker AM
// waveform editor. Used by BOTH the DOM editor (JamCrackerControls.tsx) and
// the Pixi/GL editor (PixiEditInstrumentModal.tsx::JamCrackerPanel) so the
// two renderers stay 1:1 forever.
//
// Maps a local pointer position (relative to the waveform display) to a byte
// index in the waveform buffer and a signed 8-bit sample value (-127..127,
// stored as two's complement). When the user drags fast, gaps between samples
// are filled by linear interpolation between the previous and current index.

export interface WriteWaveformResult {
  next: Uint8Array;
  idx: number;
}

/**
 * Write a single sample (and any interpolated infill samples) into a copy of
 * the AM waveform data based on a local pointer position.
 *
 * @param waveformData The current waveform buffer (caller-owned, not mutated).
 * @param localX       Pointer X relative to the waveform display, 0..width.
 * @param localY       Pointer Y relative to the waveform display, 0..height.
 * @param width        Display width in pixels.
 * @param height       Display height in pixels.
 * @param prevIdx      Index of the last write in the current drag, or -1.
 * @returns A new Uint8Array with the write applied, plus the index that was
 *          written (caller stores this as the next prevIdx).
 */
export function writeWaveformByte(
  waveformData: Uint8Array,
  localX: number,
  localY: number,
  width: number,
  height: number,
  prevIdx: number,
): WriteWaveformResult {
  const x = Math.max(0, Math.min(width, localX));
  const y = Math.max(0, Math.min(height, localY));
  const WAVE_SIZE = Math.max(1, waveformData.length);
  const idx = Math.min(WAVE_SIZE - 1, Math.floor((x / width) * WAVE_SIZE));
  const mid = height / 2;
  const signed = Math.round(((mid - y) / (mid - 4)) * 127);
  const clamped = Math.max(-127, Math.min(127, signed));
  const byte = clamped < 0 ? clamped + 256 : clamped;

  const next = new Uint8Array(waveformData);
  // Linear interpolate between this idx and the previous one to avoid
  // gaps on fast drags.
  if (prevIdx >= 0 && Math.abs(idx - prevIdx) > 1) {
    const prevVal = next[prevIdx];
    const lo = Math.min(prevIdx, idx);
    const hi = Math.max(prevIdx, idx);
    for (let i = lo; i <= hi; i++) {
      const t = (i - lo) / (hi - lo);
      const interp = idx > prevIdx
        ? Math.round(prevVal + (byte - prevVal) * t)
        : Math.round(byte + (prevVal - byte) * t);
      next[i] = interp & 0xFF;
    }
  } else {
    next[idx] = byte;
  }

  return { next, idx };
}
