/**
 * Which low note is the music actually playing?
 *
 * Sub Harmonic used to fire a fixed 55 Hz sine at every transient. Fixed
 * means foreign: a bassline sitting on F1 (43.65 Hz) had an A1 punched under
 * it, and the two beat against each other instead of reinforcing. To make the
 * pulse land on the note the song is playing, the trigger has to read the
 * pitch out of the low end rather than assume one.
 *
 * Read from a lowpassed copy of the bus input so that only kick and bass can
 * trigger it — the reason a snare no longer gets a sine bolted underneath it.
 *
 * Pure, and taking the spectrum rather than an Analyser, so the pitch rule is
 * testable without an AudioContext.
 */

/** Below this the pulse is subsonic rather than musical. */
export const SUB_MIN_HZ = 35;
/** Above this it stops being sub and starts being a bass note doubling. */
export const SUB_MAX_HZ = 100;

/** dB floor under which a band counts as silent rather than quiet. */
const SILENCE_DB = -85;

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/**
 * The dominant frequency inside a band, from an Analyser's dB spectrum.
 *
 * Peak-picking the strongest bin, then refining it by fitting a parabola
 * through that bin and its two neighbours in dB. Without the refinement the
 * answer snaps to whole bins — at fftSize 8192 on a 48 kHz context that is
 * 5.9 Hz of quantisation, which on a 44 Hz note is a semitone of wobble,
 * audible as the pulse sliding between pitches on held notes.
 *
 * Returns null when the band is silent, so a caller can fall back rather than
 * fire a pulse at a pitch it invented.
 */
export function detectLowFundamental(
  spectrumDb: ArrayLike<number>,
  sampleRate: number,
  fftSize: number,
  minHz = SUB_MIN_HZ,
  maxHz = SUB_MAX_HZ,
): number | null {
  const bins = spectrumDb.length;
  const binHz = sampleRate / fftSize;
  if (!Number.isFinite(binHz) || binHz <= 0) return null;

  // Bin 0 is DC. Starting at 1 keeps a DC-blocking wobble from being read as
  // the fundamental.
  const first = Math.max(1, Math.ceil(minHz / binHz));
  const last = Math.min(bins - 1, Math.floor(maxHz / binHz));
  if (last < first) return null;

  let peak = -1;
  let peakDb = -Infinity;
  for (let i = first; i <= last; i++) {
    const db = spectrumDb[i];
    if (!Number.isFinite(db)) continue;
    if (db > peakDb) {
      peakDb = db;
      peak = i;
    }
  }
  if (peak < 0 || peakDb < SILENCE_DB) return null;

  // Parabolic vertex through the peak and its neighbours, in bin units.
  let refined = peak;
  const left = peak > first ? spectrumDb[peak - 1] : NaN;
  const right = peak < last ? spectrumDb[peak + 1] : NaN;
  if (Number.isFinite(left) && Number.isFinite(right)) {
    const denom = left - 2 * peakDb + right;
    if (Math.abs(denom) > 1e-9) {
      refined = peak + (0.5 * (left - right)) / denom;
    }
  }

  return clamp(refined * binHz, minHz, maxHz);
}

/**
 * Hold a detected pitch steady across the gaps between notes.
 *
 * Detection runs on a lowpassed copy of a live mix, so between bass notes the
 * band is empty and a fresh reading would be noise. Without this the pulse
 * slides toward whatever the last partial happened to be. Slower to adopt a
 * new note than to keep the current one, which is what a bassist's ear expects
 * a sub layer to do.
 */
export class SubPitchTracker {
  private current: number | null = null;
  private readonly holdSeconds: number;
  private lastSeenAt = -Infinity;
  private now = 0;

  constructor(holdSeconds = 0.6) {
    this.holdSeconds = holdSeconds;
  }

  /** Advance time and get the pitch to use, or null if nothing is held. */
  read(nowSeconds: number): number | null {
    this.now = nowSeconds;
    if (this.current === null) return null;
    if (nowSeconds - this.lastSeenAt > this.holdSeconds) {
      this.current = null;
      return null;
    }
    return this.current;
  }

  /** Offer a fresh detection. Adopts it only if it is a real jump in pitch. */
  offer(hz: number | null): void {
    if (hz == null) return;
    this.lastSeenAt = this.now;
    // Within a third of an octave of what we are holding, treat it as the
    // same note wobbling rather than a new note.
    if (this.current === null || Math.abs(12 * Math.log2(hz / this.current)) > 4) {
      this.current = hz;
    }
  }
}
