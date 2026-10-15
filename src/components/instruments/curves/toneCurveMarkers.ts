/**
 * Where the playing Tone voice sits on each editor curve: a voice report (toneVoiceProbe) in, an x position in the
 * curve's own units out. Pure, so the mapping is tested without a canvas, a clock or an engine.
 *
 *  - Amp envelope: the curve is drawn as A, D, a sustain hold, then R on a 0..1 timeline (msEnvelopeLayout). The
 *    marker is the time inside the reported stage, placed on that stage's segment of the timeline.
 *  - Filter response: the voice's effective cutoff (after its filter envelope, or the static filter's frequency) as
 *    the corner frequency on the log Hz axis.
 *  - LFO shape: the free-running LFO's phase mapped to the first cycle of the drawn window.
 *  - Cutoff envelope (WavetableSynth): time since the attack on the attack + decay + hold timeline.
 */
import type { ToneVoiceReport } from '@/engine/tone/toneVoiceProbe';
import { msEnvelopeLayout, type EnvelopeShape } from './commonCurveModels';

type StageReport = Pick<ToneVoiceReport, 'stage' | 'stageElapsedMs'>;

/** x (0..1 of the drawn timeline) of the voice on an amp envelope curve; null when no voice sounds. */
export function toneEnvelopeMarkerX(
  attackMs: number, decayMs: number, sustainPercent: number, releaseMs: number,
  report: StageReport | null, shape: EnvelopeShape = 'tone',
): number | null {
  if (!report || report.stage === 'off') return null;
  const e = msEnvelopeLayout(attackMs, decayMs, sustainPercent, releaseMs);
  const gateEnd = e.atkMs + e.decMs + e.holdMs;
  // adsrPoints draws a decay segment only when there is one to draw (tone shape); the timeline keeps its length.
  const hasDecaySegment = shape === 'linear' || (e.decMs > 0 && e.sus < 1);
  const t = report.stageElapsedMs;
  let ms: number;
  switch (report.stage) {
    case 'attack': ms = Math.min(t, e.atkMs); break;
    case 'decay': ms = e.atkMs + Math.min(t, e.decMs); break;
    case 'sustain': {
      const start = hasDecaySegment ? e.atkMs + e.decMs : e.atkMs;
      ms = start + Math.min(t, gateEnd - start);
      break;
    }
    default: ms = gateEnd + Math.min(t, e.relMs); break;
  }
  return ms / e.totalMs;
}

/** x (Hz, on the 20..20000 log axis) of the voice on a filter response curve; null when the voice has no filter reading. */
export function filterMarkerHz(report: Pick<ToneVoiceReport, 'cutoffHz'> | null): number | null {
  if (!report || report.cutoffHz === undefined || !Number.isFinite(report.cutoffHz)) return null;
  return Math.min(20000, Math.max(20, report.cutoffHz));
}

/**
 * x (seconds) of the voice on an LFO curve drawn over `windowSec` at `rateHz`: the phase within the first cycle.
 * Null without a voice or a phase, or when the first cycle is longer than the drawn window.
 */
export function lfoMarkerSeconds(rateHz: number, windowSec: number, report: Pick<ToneVoiceReport, 'lfoPhase'> | null): number | null {
  if (!report || report.lfoPhase === undefined || !(rateHz > 0)) return null;
  const x = report.lfoPhase / rateHz;
  return x <= windowSec ? x : null;
}

/** x (0..1) of the voice on a filter-cutoff-envelope curve (attack, decay, hold; no release stage); null when the envelope amount is 0. */
export function cutoffEnvelopeMarkerX(
  attackMs: number, decayMs: number, amountPercent: number, report: Pick<ToneVoiceReport, 'elapsedMs'> | null,
): number | null {
  if (!report || amountPercent === 0) return null;
  const a = Math.max(0, attackMs);
  const d = Math.max(0, decayMs);
  const total = a + d + Math.max((a + d) * 0.25, 50); // cutoffEnvelopeCurve's timeline
  return Math.min(1, report.elapsedMs / total);
}

/**
 * x (0..1 of the drawn timeline) of the voice on a pitch envelope curve: attack, decay, a hold, then the release.
 * The pitch envelope starts with the note and releases with it, so the time since the attack places the voice up to
 * the hold, and the time since the release places it inside the release segment. Null without a voice.
 */
export function pitchEnvelopeMarkerX(
  attackMs: number, decayMs: number, releaseMs: number, report: Pick<ToneVoiceReport, 'stage' | 'elapsedMs' | 'stageElapsedMs'> | null,
): number | null {
  if (!report || report.stage === 'off') return null;
  const e = msEnvelopeLayout(attackMs, decayMs, 50, releaseMs);
  const gateEnd = e.atkMs + e.decMs + e.holdMs;
  const ms = report.stage === 'release' ? gateEnd + Math.min(report.stageElapsedMs, e.relMs) : Math.min(report.elapsedMs, gateEnd);
  return ms / e.totalMs;
}
