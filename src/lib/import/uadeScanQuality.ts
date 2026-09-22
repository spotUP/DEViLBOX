/**
 * Is what the enhanced scan reconstructed actually a song?
 *
 * The enhanced scan rebuilds an editable grid by watching Paula: every DMA
 * pointer it sees becomes a sample, read straight out of Amiga memory. When
 * that memory is not the sample it expected — the player keeps its waveforms
 * somewhere else, or they were never loaded — the "sample" comes back as a
 * constant. A constant is DC: the grid then fires a full-scale step on every
 * row and the tune is nothing but clicks.
 *
 * Measured 2026-09-22 on SynthDream `sdr.nobuddiesland end 2`: all four
 * extracted samples were the byte 0x7F repeated, 534 bytes each, loop 0..10.
 * Reported as "it does produce audio but only clicks".
 *
 * A scan that recovered no usable waveform is not a better editor than the
 * one that plays: the caller falls back to classic UADE streaming, which
 * keeps the grid for display and lets UADE render the audio 1:1.
 *
 * Pure. PCM in, a verdict out.
 */

/** Amiga PCM is 8-bit signed; this is peak-to-peak in those units. */
export const MIN_SAMPLE_SWING = 4;

/** Shortest run of bytes worth judging — below this, silence and signal look alike. */
export const MIN_SAMPLE_BYTES = 8;

/**
 * True when a reconstructed sample carries no waveform: too short to judge,
 * or flat enough to be DC.
 */
export function isDegenerateSample(pcm: Uint8Array | null | undefined): boolean {
  if (!pcm || pcm.length < MIN_SAMPLE_BYTES) return true;
  let min = 255;
  let max = 0;
  for (let i = 0; i < pcm.length; i++) {
    const v = pcm[i];
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return max - min < MIN_SAMPLE_SWING;
}

/**
 * True when NOT ONE reconstructed sample carries a waveform.
 *
 * All of them, not most: a player may legitimately hold one silent or
 * one-shot-DC slot, and a single good sample still makes an editable song.
 * Only a scan that recovered nothing is a failed scan.
 */
export function enhancedSamplesAreUnusable(
  samples: Record<number, { pcm?: Uint8Array | ArrayBuffer | null; length?: number } | null | undefined> | null | undefined,
): boolean {
  if (!samples) return true;
  const entries = Object.values(samples).filter(Boolean);
  if (entries.length === 0) return true;
  for (const s of entries) {
    const pcm = s!.pcm instanceof Uint8Array
      ? s!.pcm
      : s!.pcm
        ? new Uint8Array(s!.pcm as ArrayBuffer)
        : null;
    if (!isDegenerateSample(pcm)) return false;
  }
  return true;
}
