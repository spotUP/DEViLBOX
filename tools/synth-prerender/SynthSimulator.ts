/**
 * Core synth pre-rendering framework.
 *
 * Shared interface, audio renderer, and loop detector used by all
 * format-specific tick simulators.
 */

// ── Amiga period table (3 octaves, C-1 to B-3) ─────────────────────────────

export const AMIGA_PERIODS = [
  // Octave 1 (C-1 to B-1)
  856, 808, 762, 720, 678, 640, 604, 570, 538, 508, 480, 453,
  // Octave 2 (C-2 to B-2)
  428, 404, 381, 360, 339, 320, 302, 285, 269, 254, 240, 226,
  // Octave 3 (C-3 to B-3)
  214, 202, 190, 180, 170, 160, 151, 143, 135, 127, 120, 113,
];

/** Convert a semitone offset (0 = C-1) to an Amiga period. */
export function semitoneToAmigaPeriod(semitone: number): number {
  const idx = Math.max(0, Math.min(AMIGA_PERIODS.length - 1, semitone));
  return AMIGA_PERIODS[idx];
}

// ── Types ───────────────────────────────────────────────────────────────────

/** Per-tick state produced by a format simulator. */
export interface SynthTickState {
  volume: number;        // 0-64 (Amiga scale)
  period: number;        // Amiga period (determines pitch; 0 = silent)
  waveform: Int8Array;   // Current single-cycle PCM (-128..127)
}

/** Result of pre-rendering a synth instrument. */
export interface PrerenderedSample {
  pcm: Int8Array;        // Full rendered sample (signed 8-bit)
  sampleRate: number;    // Output sample rate (typically 16574)
  loopStart: number;     // Sustain loop start (sample offset)
  loopEnd: number;       // Sustain loop end (sample offset)
}

/**
 * A format-specific tick simulator.
 *
 * Implementations produce one SynthTickState per Amiga VBlank tick (50 Hz PAL).
 * The shared renderer fills PCM between ticks using the current waveform/period.
 */
export interface ISynthSimulator {
  /**
   * Reset state and start a new note.
   * @param config  Format-specific instrument config (FCConfig, SoundMonConfig, etc.)
   * @param baseNote  Base note as semitone index (0 = C-1, 12 = C-2, 24 = C-3)
   */
  init(config: unknown, baseNote: number): void;

  /**
   * Advance one tick and return the new state.
   * Called at 50 Hz (PAL VBlank rate).
   */
  tick(): SynthTickState;
}

// ── Constants ───────────────────────────────────────────────────────────────

/** PAL clock rate (Hz). Used for period-to-frequency conversion. */
const PAL_CLOCK = 3546895;

/** Default output sample rate: 2× Amiga (~16574 Hz). */
export const DEFAULT_SAMPLE_RATE = 16574;

/** Max pre-render duration in ticks (50 Hz → ~4 seconds). */
const MAX_TICKS = 200;

/** Min ticks to render before checking for loops. */
const MIN_TICKS_BEFORE_LOOP = 4;

// ── Audio Renderer ──────────────────────────────────────────────────────────

/**
 * Render a synth instrument by running the tick simulator and filling PCM
 * between ticks at the output sample rate.
 */
export function renderSynthInstrument(
  sim: ISynthSimulator,
  config: unknown,
  baseNote: number = 24,   // C-3 by default
  sampleRate: number = DEFAULT_SAMPLE_RATE,
  maxTicks: number = MAX_TICKS,
): PrerenderedSample {
  sim.init(config, baseNote);

  const samplesPerTick = Math.round(sampleRate / 50); // 50 Hz PAL
  const maxSamples = maxTicks * samplesPerTick;
  const buf = new Int8Array(maxSamples);

  // Track states for loop detection
  const stateHashes: number[] = [];
  let loopStart = -1;
  let loopEnd = -1;
  let totalSamples = 0;
  let silentTicks = 0;

  let phase = 0; // Waveform phase accumulator (fractional)

  for (let t = 0; t < maxTicks; t++) {
    const state = sim.tick();

    // Loop detection: hash of {volume, period, waveform CRC}
    if (t >= MIN_TICKS_BEFORE_LOOP && loopStart < 0) {
      const hash = hashTickState(state);
      const prevIdx = stateHashes.indexOf(hash);
      if (prevIdx >= 0 && prevIdx >= MIN_TICKS_BEFORE_LOOP) {
        loopStart = prevIdx * samplesPerTick;
        loopEnd = t * samplesPerTick;
      }
      stateHashes.push(hash);
    } else {
      stateHashes.push(0);
    }

    // Silence detection
    if (state.volume === 0) {
      silentTicks++;
      if (silentTicks > 20) break; // ~0.4s of silence → done
    } else {
      silentTicks = 0;
    }

    // Fill PCM for this tick
    const waveLen = state.waveform.length;
    if (waveLen === 0 || state.period <= 0 || state.volume <= 0) {
      // Silent tick — write zeros
      for (let s = 0; s < samplesPerTick && totalSamples < maxSamples; s++) {
        buf[totalSamples++] = 0;
      }
    } else {
      // phaseInc = waveLen × PAL_CLOCK / (2 × period × sampleRate)
      const phaseInc = (waveLen * PAL_CLOCK) / (2 * state.period * sampleRate);
      const vol = state.volume / 64;

      for (let s = 0; s < samplesPerTick && totalSamples < maxSamples; s++) {
        const idx = Math.floor(phase) % waveLen;
        const sample = state.waveform[idx] * vol;
        buf[totalSamples++] = Math.max(-128, Math.min(127, Math.round(sample)));
        phase += phaseInc;
        // Keep phase from growing unbounded
        if (phase >= waveLen * 1024) {
          phase -= Math.floor(phase / waveLen) * waveLen;
        }
      }
    }
  }

  // Trim to actual length
  const pcm = new Int8Array(buf.buffer, 0, totalSamples);

  // Fallback loop: if no loop detected, loop from 60% to end
  if (loopStart < 0 && totalSamples > 0) {
    loopStart = Math.floor(totalSamples * 0.6);
    loopEnd = totalSamples;
  }

  return { pcm, sampleRate, loopStart, loopEnd };
}

// ── Loop Detection Helpers ──────────────────────────────────────────────────

/** Simple hash of a tick state for loop detection. */
function hashTickState(state: SynthTickState): number {
  let h = state.volume * 65537 + state.period * 31;
  // Quick waveform hash (sample a few points)
  const wl = state.waveform.length;
  if (wl > 0) {
    h ^= state.waveform[0] * 17;
    h ^= state.waveform[Math.floor(wl / 4)] * 37;
    h ^= state.waveform[Math.floor(wl / 2)] * 53;
    h ^= state.waveform[Math.floor(wl * 3 / 4)] * 71;
    h ^= state.waveform[wl - 1] * 97;
    h ^= wl * 113;
  }
  return h | 0;
}

// ── WAV Builder ─────────────────────────────────────────────────────────────

/** Build a looping WAV buffer from signed 8-bit PCM data. */
export function buildLoopingWAV(
  pcm: Int8Array,
  loopStart: number,
  loopEnd: number,
  sampleRate: number,
): ArrayBuffer {
  const len = pcm.length;
  const dataSize = len;
  const bufSize = 44 + dataSize;
  const ab = new ArrayBuffer(bufSize);
  const dv = new DataView(ab);
  const u8 = new Uint8Array(ab);

  // RIFF header
  u8.set([0x52, 0x49, 0x46, 0x46]); // "RIFF"
  dv.setUint32(4, bufSize - 8, true);
  u8.set([0x57, 0x41, 0x56, 0x45], 8); // "WAVE"

  // fmt chunk
  u8.set([0x66, 0x6D, 0x74, 0x20], 12); // "fmt "
  dv.setUint32(16, 16, true);
  dv.setUint16(20, 1, true); // PCM
  dv.setUint16(22, 1, true); // mono
  dv.setUint32(24, sampleRate, true);
  dv.setUint32(28, sampleRate, true); // byte rate (8-bit mono)
  dv.setUint16(32, 1, true); // block align
  dv.setUint16(34, 8, true); // bits per sample

  // data chunk
  u8.set([0x64, 0x61, 0x74, 0x61], 36); // "data"
  dv.setUint32(40, dataSize, true);

  // Write unsigned 8-bit PCM
  for (let i = 0; i < len; i++) {
    u8[44 + i] = (pcm[i] + 128) & 0xFF;
  }

  return ab;
}
