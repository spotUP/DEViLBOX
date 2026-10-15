/**
 * fmCurveMarkers.ts - where the playing voice sits on each DX7 / OPL3 curve: a live voice report in, an x position in
 * the curve's own units out. Pure, so the mapping is tested without a canvas or an engine.
 *
 *  - Envelope: the engine reports the segment and the level; the x is the point of that segment on the modelled
 *    curve where the level is reached (interpolated between the recorded points).
 *  - Pitch EG: the pitch EG runs on elapsed time, so the x is the time since the note began (and, after the key
 *    goes up, the time since release added to where the held part of the curve ends).
 *  - LFO: the firmware's LFO modulation register is read as a normalised value and its slope, which fixes the phase
 *    on the waveform; the OPL3 chip's tremolo and vibrato counters are read directly.
 */
import { lfoWaveform, type Dx7EnvelopeRun, type PitchEgPoint } from './dx7CurveModels';
import type { OplEnvelopeCurve } from './opl3CurveModels';
import type { Dx7OpStatus, Dx7VoiceReport } from '@/engine/dx7/dx7VoiceStatus';

interface LeveledPoint { x: number; stage: number; level: number }

/**
 * x of the point on `points` (at or after `fromX`) that has `stage` and `level`: interpolated between the two recorded points of that stage
 * that bracket the level, else the nearest one. Null when the curve has no point of that stage.
 */
export function levelToX(points: readonly LeveledPoint[], stage: number, level: number, fromX = -Infinity): number | null {
  const inStage = points.filter((p) => p.stage === stage && p.x >= fromX);
  if (inStage.length === 0) return null;
  let best = inStage[0]; let bestErr = Infinity;
  for (const p of inStage) { const err = Math.abs(p.level - level); if (err < bestErr) { best = p; bestErr = err; } }
  for (let i = 1; i < inStage.length; i++) {
    const a = inStage[i - 1]; const b = inStage[i];
    if ((a.level - level) * (b.level - level) <= 0 && a.level !== b.level) {
      return a.x + ((level - a.level) / (b.level - a.level)) * (b.x - a.x);
    }
  }
  return best.x;
}

// ---------------------------------------------------------------------------------------------------------
// DX7
// ---------------------------------------------------------------------------------------------------------

const DX7_SILENT_MARGIN = 64;
const EG_SILENT = 0xff0;

/** An operator's marker on its envelope curve; null when the operator is silent and released. */
export function dx7EnvelopeMarkerX(run: Dx7EnvelopeRun, op: Dx7OpStatus): number | null {
  if (op.released && op.level >= EG_SILENT - DX7_SILENT_MARGIN) return null;
  const x = levelToX(run.points, op.stage, op.level, op.stage === 3 ? run.releaseAtSeconds - 1e-9 : -Infinity);
  if (x === null) return null;
  // Held at the segment-3 level: the curve is flat from where the level was reached to the key-up, so sit in the middle.
  if (op.stage === 2 && !op.released) {
    const reached = run.points.find((p) => p.stage === 2 && p.x >= run.sustainReachedSeconds - 1e-9);
    if (reached && Math.abs(reached.level - op.level) <= 4 && run.releaseAtSeconds > run.sustainReachedSeconds) {
      return (run.sustainReachedSeconds + run.releaseAtSeconds) / 2;
    }
  }
  return x;
}

/** The carrier that is loudest right now (lowest attenuation), among `carriers` (OP numbers): the all-operators marker follows it. */
export function loudestCarrier(voice: Dx7VoiceReport, carriers: readonly number[]): { opNum: number; status: Dx7OpStatus } | null {
  let best: { opNum: number; status: Dx7OpStatus } | null = null;
  for (const opNum of carriers) {
    const status = voice.ops[6 - opNum];
    if (status && (best === null || status.level < best.status.level)) best = { opNum, status };
  }
  return best;
}

/**
 * The pitch EG marker: seconds since the note began while the key is down (the curve draws segments 1..3, then a hold
 * of fixed length, then segment 4); after key-up, the time since release added to the end of the hold.
 * `curve` is pitchEgRun's six points: start, end of segments 1, 2 and 3, end of the hold, end of segment 4.
 */
export function dx7PitchEgMarkerX(curve: readonly PitchEgPoint[], voice: Dx7VoiceReport): number | null {
  if (curve.length < 6) return null;
  const holdEnd = curve[4].x;
  if (voice.releasedSeconds === null) return Math.min(voice.elapsedSeconds, holdEnd);
  return Math.min(curve[5].x, holdEnd + voice.releasedSeconds);
}

/**
 * LFO phase in cycles (0..2 for the two-cycle plot) from the modulation register: the normalised value picks the phase
 * (its slope picks between the two phases a smooth wave passes through). Null when the LFO does not move the pitch.
 */
export function dx7LfoMarkerX(wave: number, pitchMod: number, previousPitchMod: number | null, peakRegister: number): number | null {
  if (peakRegister <= 0) return null;
  const value = Math.max(-1, Math.min(1, pitchMod / peakRegister));
  const rising = previousPitchMod === null ? true : pitchMod >= previousPitchMod;
  let best = 0; let bestErr = Infinity;
  const steps = 512;
  for (let i = 0; i < steps; i++) {
    const p = i / steps;
    const here = 2 * lfoWaveform(wave, p) - 1;
    const next = 2 * lfoWaveform(wave, p + 1 / steps) - 1;
    const slopeRising = next >= here;
    let err = Math.abs(here - value);
    if (Math.round(wave) !== 3 && Math.round(wave) !== 5 && slopeRising !== rising && Math.abs(next - here) > 1e-9) err += 1;
    if (err < bestErr) { best = p; bestErr = err; }
  }
  return best;
}

/** The scaling curve marker: the MIDI note of the voice (null when the worklet could not match one). */
export const dx7ScalingMarkerX = (voice: Dx7VoiceReport): number | null => (voice.note >= 0 ? voice.note : null);

// ---------------------------------------------------------------------------------------------------------
// OPL3
// ---------------------------------------------------------------------------------------------------------

/** A slot's marker on its envelope curve: the chip stage and eg_rout. Null once the slot is silent in release. */
export function oplEnvelopeMarkerX(curve: OplEnvelopeCurve, stage: number, rout: number): number | null {
  if (stage === 3 && (rout & 0x1f8) === 0x1f8) return null;
  // the release stage is only the part after the key went up (the chip also sits in release before the first key-on)
  const x = levelToX(curve.points.map((p) => ({ x: p.x, stage: p.stage, level: p.rout })), stage, rout, stage === 3 ? curve.releaseAtSeconds - 1e-9 : -Infinity);
  if (x === null) return null;
  // At a held sustain level the curve is flat until the key goes up: sit in the middle of the hold.
  if (stage === 2) {
    const held = curve.points.filter((p) => p.stage === 2 && p.x <= curve.releaseAtSeconds);
    if (held.length > 1 && Math.max(...held.map((p) => p.rout)) - Math.min(...held.map((p) => p.rout)) <= 2 && curve.releaseAtSeconds > held[0].x) {
      return (held[0].x + curve.releaseAtSeconds) / 2;
    }
  }
  return x;
}

/** Tremolo marker: the chip's position 0..209 as a fraction of its period (the plot's 0..1 axis). */
export const oplTremoloMarkerX = (position: number): number => position / 210;
/** Vibrato marker: 8 positions plus the sample counter inside the current step, as a fraction of the period. */
export const oplVibratoMarkerX = (position: number, timer: number): number => (position + timer / 1024) / 8;
