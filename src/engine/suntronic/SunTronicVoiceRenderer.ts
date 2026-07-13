/**
 * SunTronicVoiceRenderer.ts — Paula wavetable voice: composes the two Phase-2
 * halves (MEGAEFFECTS timbre generator + EFFECTS pitch/volume) into an audible
 * PCM buffer.
 *
 * On the Amiga the replayer runs one "frame" ~50×/s. Each frame it regenerates
 * the voice's play buffer (`renderSynthTick`, waveWordLen*2 signed bytes) and
 * updates the Paula period + volume (`stepEffects`). Paula then streams that
 * buffer on a loop at rate = clock / period until the next frame replaces it.
 *
 * This module reproduces that as a resampling oscillator: a floating phase walks
 * the current frame's buffer at `clock/period` buffer-samples per second,
 * modulo the buffer length; at each frame boundary the buffer, period and volume
 * are recomputed. Output is Float32 in [-1, 1] at the caller's sample rate.
 *
 * It is a PURE function (no audio nodes) so it is unit-testable and reusable by
 * both the instrument-audition path (short looped preview) and the offline grid
 * renderer (Phase 4). Note→pitch mapping is the caller's job: the renderer takes
 * a `periodIndex` (integer semitone into SUN_PERIODS) directly, keeping it
 * decoupled from tracker/MIDI note conventions.
 *
 * FIDELITY: timbre types 0/2 and the pitch/volume math are exact ports; types
 * 1/3/else remain oracle-pending (see SunTronicSynthVoice.ts). The voice this
 * produces is the correct single instrument — never whole-song UADE playback.
 */

import type { SunSynthInstrument } from '@/lib/import/formats/SunTronicV13';
import type { SunTronicConfig } from '@typedefs/sunTronicInstrument';
import {
  renderSynthTick,
  createVoiceState,
  createPrng,
} from './SunTronicSynthVoice';
import { stepEffects, createPitchState } from './SunTronicEffects';

/** PAL Paula clock (Hz). Period → sample rate = clock / period. */
export const PAULA_CLOCK_PAL = 3546895;

/**
 * Serialize a runtime `SunSynthInstrument` to the plain, JSON-safe
 * `SunTronicConfig` the editor persists. Drops the h1-relative pointer offsets
 * (irrelevant once the tables are sliced) and mirrors the Int8Arrays as number[].
 */
export function sunSynthToConfig(inst: SunSynthInstrument): SunTronicConfig {
  return {
    sunTronic: 1,
    synthType: inst.synthType,
    waveWordLen: inst.waveWordLen,
    arpLen: inst.arpLen,
    arpLoop: inst.arpLoop,
    volEnvLen: inst.volEnvLen,
    volEnvLoop: inst.volEnvLoop,
    freqEnvLen: inst.freqEnvLen,
    freqEnvLoop: inst.freqEnvLoop,
    freqEnvSpeed: inst.freqEnvSpeed,
    wave1: Array.from(inst.wave1),
    wave2: Array.from(inst.wave2),
    arpTable: Array.from(inst.arpTable),
    volEnv: Array.from(inst.volEnv),
    vibDepth: Array.from(inst.vibDepth),
  };
}

/**
 * Reconstruct a render-ready `SunSynthInstrument` from a persisted config. The
 * renderer only reads the tables + lengths + types, so the pointer-offset fields
 * are filled with 0 (unused at render time).
 */
export function sunConfigToInstrument(cfg: SunTronicConfig): SunSynthInstrument {
  return {
    recordOff: 0,
    volEnvOff: 0, volEnvLen: cfg.volEnvLen, volEnvLoop: cfg.volEnvLoop,
    freqEnvOff: 0, freqEnvLen: cfg.freqEnvLen, freqEnvLoop: cfg.freqEnvLoop,
    freqEnvSpeed: cfg.freqEnvSpeed,
    arpTableOff: 0, arpLen: cfg.arpLen, arpLoop: cfg.arpLoop,
    wave1Off: 0, wave2Off: 0, waveWordLen: cfg.waveWordLen, synthType: cfg.synthType,
    wave1: Int8Array.from(cfg.wave1),
    wave2: Int8Array.from(cfg.wave2),
    arpTable: Int8Array.from(cfg.arpTable),
    volEnv: Int8Array.from(cfg.volEnv),
    vibDepth: Int8Array.from(cfg.vibDepth),
  };
}

/** Replayer frame rate (default; command 0x98 can retune it per song). */
export const DEFAULT_TICKS_PER_SECOND = 50;

/** Max Amiga channel volume the replayer produces (EFFECTS clamps to 0x40). */
const MAX_VOLUME = 0x40;

export interface SunPreviewOptions {
  /** Integer semitone index into SUN_PERIODS (note 0 = index 12). */
  periodIndex: number;
  /** Voice volume 0..0x80 fed to EFFECTS (default full). */
  voiceVolume?: number;
  /** Output length in seconds. */
  seconds?: number;
  /** Output sample rate (default 44100). */
  sampleRate?: number;
  /** Replayer frame rate (default 50). */
  ticksPerSecond?: number;
  /** Per-song arpeggio note-offset table (empty → no arpeggio). */
  drin?: Int8Array;
}

/**
 * Render `seconds` of a single SunTronic synth voice at a fixed pitch to a
 * Float32 PCM buffer. Steps the native engine one frame at a time, resampling
 * each frame's wavetable at its Paula period.
 */
export function renderSunSynthPreview(
  inst: SunSynthInstrument,
  opts: SunPreviewOptions,
): Float32Array {
  const sampleRate = opts.sampleRate ?? 44100;
  const seconds = opts.seconds ?? 1;
  const ticksPerSecond = opts.ticksPerSecond ?? DEFAULT_TICKS_PER_SECOND;
  const drin = opts.drin ?? new Int8Array(0);
  const totalSamples = Math.max(0, Math.floor(seconds * sampleRate));
  const out = new Float32Array(totalSamples);
  if (totalSamples === 0) return out;

  const voiceState = createVoiceState();
  const prng = createPrng();
  const pitchState = createPitchState(opts.periodIndex << 8, opts.voiceVolume ?? 0x80);

  const samplesPerTick = sampleRate / ticksPerSecond;
  let phase = 0; // float index into the current frame buffer
  let buf: Int8Array<ArrayBufferLike> = new Int8Array(0);
  let byteLen = 0;
  let phaseInc = 0; // buffer-samples advanced per output sample
  let gain = 0;
  let nextTickAt = 0; // output-sample index of the next frame boundary

  for (let n = 0; n < totalSamples; n++) {
    if (n >= nextTickAt) {
      // Frame boundary: regenerate buffer + recompute period/volume.
      buf = renderSynthTick(inst, voiceState, prng);
      byteLen = buf.length;
      const eff = stepEffects(inst, pitchState, drin);
      phaseInc = eff.period > 0 ? PAULA_CLOCK_PAL / eff.period / sampleRate : 0;
      gain = Math.min(1, eff.volume / MAX_VOLUME);
      nextTickAt += samplesPerTick;
    }
    if (byteLen > 0 && phaseInc > 0) {
      const idx = Math.floor(phase) % byteLen;
      out[n] = (buf[idx] / 128) * gain;
      phase += phaseInc;
      if (phase >= byteLen) phase -= byteLen * Math.floor(phase / byteLen);
    } else {
      out[n] = 0;
    }
  }
  return out;
}
