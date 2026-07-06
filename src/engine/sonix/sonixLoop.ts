/**
 * Sustain-loop point finder for the Sonix synth audition.
 *
 * The editor auditions a note by rendering a fixed-length buffer through the WASM synth,
 * then looping a region so a held key sustains. Looping an arbitrary region (e.g. from a
 * fixed 0.18s to the buffer end) breaks for instruments whose amplitude evolves over the
 * render: a swelling voice jumps loud→quiet at the wrap (a hard "cut to 0"), and any voice
 * clicks when the loop endpoints sit at different waveform phases.
 *
 * This finds a short loop window at the SETTLED tail of the render, with both endpoints on
 * a falling zero-crossing one base-wave period apart. Amplitude is stable there (no swell
 * jump) and the phases match (no click), giving a clean indefinite sustain.
 *
 * Returns null when no usable loop can be found (e.g. a silent or too-short buffer) — the
 * caller should then play the buffer once without looping.
 */
export interface SustainLoop {
  loopStartSec: number;
  loopEndSec: number;
}

/** Index of the last falling zero-crossing (v[i-1] >= 0 && v[i] < 0) in [lo, hi). */
function lastFallingCrossing(pcm: Float32Array, lo: number, hi: number): number {
  for (let i = hi - 1; i > lo; i--) {
    if (pcm[i - 1] >= 0 && pcm[i] < 0) return i;
  }
  return -1;
}

export function findSustainLoop(
  pcm: Float32Array,
  sampleRate: number,
  freqHz: number,
): SustainLoop | null {
  const n = pcm.length;
  if (n < 256 || sampleRate <= 0 || freqHz <= 0) return null;

  // One base-wave period; loop this much so the window is short (stable amplitude) but
  // still a whole cycle (seamless phase). Clamp so it can't exceed the search region.
  const period = Math.max(2, Math.round(sampleRate / freqHz));

  // Search the settled tail only (second half of the render).
  const searchLo = Math.floor(n / 2);

  const loopEnd = lastFallingCrossing(pcm, searchLo, n);
  if (loopEnd < 0) return null;

  // Aim one period before loopEnd, then snap to the nearest falling crossing at/after it.
  const targetStart = loopEnd - period;
  if (targetStart <= searchLo) return null;
  const loopStart = lastFallingCrossing(pcm, searchLo, targetStart + 1);
  if (loopStart < 0 || loopStart >= loopEnd) return null;

  return { loopStartSec: loopStart / sampleRate, loopEndSec: loopEnd / sampleRate };
}
