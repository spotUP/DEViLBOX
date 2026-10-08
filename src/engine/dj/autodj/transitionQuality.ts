/**
 * Offline transition quality evaluator (plan section 41) and the automated
 * invariants (plan section 43). Scores a DJTransitionPlan against the two
 * analyses and, when present, the execution trace. Objective numbers for
 * regression tests and for the session memory's adaptation.
 *
 * Pure.
 */
import { harmonicCompatibility, vocalCompatibility } from './compatibility';
import { summarizeTrack } from './trackAnalysis';
import { timelineAt } from './beatGrid';
import type { DJTrackAnalysis, DJTransitionPlan, TransitionQuality, TransitionStyle } from './types';

export interface ExecutionTraceSample {
  beat: number;
  crossfader: number;
  outgoingLow: number;
  incomingLow: number;
  outgoingFilter: number;
  incomingFilter: number;
  outgoingVolume: number;
}

export interface ExecutionTrace {
  samples: ExecutionTraceSample[];
  events: string[];
  /** Measured start offset from the planned grid position, ms. */
  startOffsetMs: number;
  /** Peak low-frequency exposure: both decks' low bands open while both audible (0..1). */
  completed: boolean;
  fellBack: 'none' | 'fallback' | 'emergency';
}

const CREATIVE_STYLES: TransitionStyle[] = ['dropMix', 'breakdownMix', 'drumIntroMix', 'vocalSwap', 'echoOut', 'reverbOut', 'delayThrow', 'loopExit', 'tempoBridge', 'hardCut', 'doubleTimeJump', 'halfTimeJump', 'percussionSwap'];

function clamp01(v: number): number { return Math.max(0, Math.min(1, v)); }

function activity(tl: { values: number[]; hopSec: number }, from: number, to: number): number {
  const v: number[] = [];
  for (let t = from; t < to; t += tl.hopSec) v.push(timelineAt(tl.values, tl.hopSec, t));
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0;
}

/** Bass exposure from the plan's low-EQ curves: the fraction of the transition where both lows are above -6 dB while the crossfader is mid. */
export function bassExposure(plan: DJTransitionPlan, trace?: ExecutionTrace): number {
  if (trace && trace.samples.length > 0) {
    const bad = trace.samples.filter((s) => s.crossfader > 0.25 && s.crossfader < 0.75 && s.outgoingLow > -6 && s.incomingLow > -6).length;
    return bad / trace.samples.length;
  }
  const outLow = plan.bassPlan.curves.find((c) => c.target === 'outgoing.eqLow');
  const inLow = plan.bassPlan.curves.find((c) => c.target === 'incoming.eqLow');
  if (!outLow || !inLow) return plan.style === 'hardCut' ? 0 : 1;
  let bad = 0, n = 0;
  for (let beat = 0; beat <= plan.durationBeats; beat += 0.5) {
    const o = sampleCurve(outLow.keyframes, beat), i = sampleCurve(inLow.keyframes, beat);
    const x = sampleCurve(plan.crossfadePlan.curve.keyframes, beat);
    const mid = plan.incomingDeck === 'B' ? x > 0.25 && x < 0.75 : x > 0.25 && x < 0.75;
    n++;
    if (mid && o > -6 && i > -6) bad++;
  }
  return n ? bad / n : 0;
}

/** Linear/ease/exp keyframe interpolation (the executor uses the same function). */
export function sampleCurve(keyframes: Array<{ beat: number; value: number; curve?: 'linear' | 'ease' | 'exp' }>, beat: number): number {
  if (keyframes.length === 0) return 0;
  if (beat <= keyframes[0].beat) return keyframes[0].value;
  for (let i = 1; i < keyframes.length; i++) {
    const a = keyframes[i - 1], b = keyframes[i];
    if (beat <= b.beat) {
      const span = b.beat - a.beat;
      let t = span > 0 ? (beat - a.beat) / span : 1;
      if (b.curve === 'ease') t = t * t * (3 - 2 * t);
      else if (b.curve === 'exp') t = t * t;
      return a.value + (b.value - a.value) * t;
    }
  }
  return keyframes[keyframes.length - 1].value;
}

export function evaluateTransition(plan: DJTransitionPlan, outgoing: DJTrackAnalysis, incoming: DJTrackAnalysis, trace?: ExecutionTrace): TransitionQuality {
  const outS = summarizeTrack(outgoing);
  const inS = summarizeTrack(incoming);
  const bpm = outgoing.bpm > 0 ? outgoing.bpm : 125;
  const beatSec = 60 / bpm;

  // Beat alignment: the plan starts on a beat of the outgoing grid and the incoming position sits on its grid; a measured start offset counts.
  const outBeat = outgoing.beatGrid.beats[plan.startBeat];
  const onGrid = outBeat ? Math.abs(outBeat.time - plan.startTimeSec) < 0.03 : plan.quantize !== 'none';
  const inBeats = incoming.beatGrid.beats;
  let inOffset = 0;
  if (inBeats.length) {
    let best = Infinity;
    for (const b of inBeats) best = Math.min(best, Math.abs(b.time - plan.incomingPosition));
    inOffset = best;
  }
  const measured = trace ? Math.min(1, Math.abs(trace.startOffsetMs) / 60) : 0;
  const beatAlignment = clamp01((onGrid ? 0.5 : 0.1) + (inOffset < 0.03 ? 0.5 : inOffset < 0.1 ? 0.3 : 0) - measured * 0.3) * Math.min(1, 0.5 + 0.5 * outgoing.analysisConfidence.beatGrid);

  // Phrase alignment: start on a phrase boundary of the outgoing, incoming at a phrase start, length a multiple of the phrase.
  const outPhrase = outgoing.phrases.some((p) => Math.abs(p.start - plan.startTimeSec) < 0.05);
  const inPhrase = incoming.phrases.some((p) => Math.abs(p.start - plan.incomingPosition) < 0.05) || plan.style === 'dropMix';
  const multiple = plan.durationBars % outgoing.phraseLengthBars === 0 || outgoing.phraseLengthBars % plan.durationBars === 0;
  const phraseAlignment = clamp01((outPhrase ? 0.45 : 0) + (inPhrase ? 0.35 : 0.1) + (multiple ? 0.2 : 0));

  // Harmonic compatibility at the join, after the key plan.
  const h = harmonicCompatibility(plan.keyPlan.outgoingKey, outgoing.keyConfidence, plan.keyPlan.keyLock ? plan.keyPlan.incomingKey : (plan.keyPlan.shiftedKey ?? plan.keyPlan.incomingKey), incoming.keyConfidence, { overlapBars: plan.durationBars });
  const harmonicCompatibility_ = h.score;

  // Tempo stability: no shift or a normal shift beatmatched; avoid or extreme lowers it.
  const tempoStability = plan.tempoPlan.method === 'avoid' ? 0.3 : plan.tempoPlan.band === 'extreme' ? 0.4 : plan.tempoPlan.band === 'creative' ? 0.7 : 1 - Math.abs(plan.tempoPlan.percent) / 20;

  // Bass handover: no double exposure, a hand-over bar on a phrase boundary, heavy basses never shared.
  const exposure = bassExposure(plan, trace);
  const heavyShared = plan.bassPlan.outgoingHeavy && plan.bassPlan.incomingHeavy && plan.bassPlan.coexist;
  const onPhrase = plan.bassPlan.handoverBar % outgoing.phraseLengthBars === 0 || plan.bassPlan.handoverBar === plan.durationBars;
  const bassHandover = clamp01(1 - exposure - (heavyShared ? 0.4 : 0) + (onPhrase ? 0.1 : 0));

  // Loudness consistency: predicted true peak under the ceiling, trims close, overlap compensated.
  const peakOk = plan.gainPlan.monitor.truePeakDb <= plan.gainPlan.masterCeilingDb;
  const trimGap = Math.abs(plan.gainPlan.incomingTrimDb - plan.gainPlan.outgoingTrimDb);
  const loudnessConsistency = clamp01((peakOk ? 0.6 : 0.2) + (trimGap < 3 ? 0.3 : trimGap < 6 ? 0.15 : 0) + (plan.gainPlan.overlapCompensationDb <= 0 ? 0.1 : 0));

  // Structural fit: the sections at the join suit the style; mix out before the final beat; mix in where the track is useful.
  const outSec = outgoing.sections.find((s) => s.start <= plan.startTimeSec && plan.startTimeSec < s.end);
  const inSec = incoming.sections.find((s) => s.start <= plan.incomingPosition && plan.incomingPosition < s.end);
  let structuralFit = 0.5;
  if (outSec?.kind === 'outro' || outSec?.kind === 'groove' || outSec?.kind === 'breakdown' || outSec?.kind === 'instrumental') structuralFit += 0.2;
  if (outSec?.kind === 'drop' || outSec?.kind === 'chorus' || outSec?.kind === 'vocal-heavy') structuralFit -= 0.2;
  if (inSec?.kind === 'intro' || inSec?.kind === 'groove' || inSec?.kind === 'drum-only' || inSec?.kind === 'instrumental') structuralFit += 0.2;
  if (plan.style === 'dropMix' && incoming.cuePoints.firstDrop !== undefined) structuralFit += 0.1;
  if (plan.startTimeSec + plan.durationBars * plan.beatsPerBar * beatSec > (outgoing.cuePoints.finalBeat ?? outgoing.durationSec) + 0.5) structuralFit -= 0.3;
  const vocalsAtJoin = activity(outgoing.vocalActivity, plan.startTimeSec, plan.startTimeSec + plan.durationBeats * beatSec) * activity(incoming.vocalActivity, plan.incomingPosition, plan.incomingPosition + plan.durationBeats * beatSec);
  structuralFit -= vocalsAtJoin;
  structuralFit = clamp01(structuralFit);

  // Creativity and surprise: a creative style with a musical trigger; surprise is a creative move the memory did not see recently.
  const creative = CREATIVE_STYLES.includes(plan.style);
  const creativity = clamp01((creative ? 0.6 : 0.25) + plan.effects.length * 0.1 + (plan.loop ? 0.1 : 0) + (plan.cueJump ? 0.1 : 0));
  const surprise = clamp01((creative ? 0.5 : 0.1) + (plan.risk.overall > 0.3 && plan.confidence > 0.6 ? 0.2 : 0));

  // Smoothness: continuous curves, no cut, low risk, drums compatible, vocals clear.
  const v = vocalCompatibility(outS, inS);
  const smoothness = clamp01((plan.style === 'hardCut' ? 0.2 : 0.6) + (1 - plan.risk.overall) * 0.3 + v.score * 0.1 - (trace && trace.fellBack !== 'none' ? 0.3 : 0));

  const overall = clamp01(
    0.15 * beatAlignment + 0.15 * phraseAlignment + 0.12 * harmonicCompatibility_ + 0.1 * tempoStability + 0.13 * bassHandover +
    0.1 * loudnessConsistency + 0.12 * structuralFit + 0.05 * creativity + 0.06 * smoothness + 0.02 * surprise,
  );
  return {
    beatAlignment, phraseAlignment, harmonicCompatibility: harmonicCompatibility_, tempoStability, bassHandover,
    loudnessConsistency, structuralFit, creativity, smoothness, surprise, overall,
  };
}

// ── Invariants (plan section 43) ────────────────────────────────────────────

export interface InvariantResult { name: string; ok: boolean; detail: string }

export function checkInvariants(plan: DJTransitionPlan, outgoing: DJTrackAnalysis, incoming: DJTrackAnalysis, opts: { userPlaylistBefore?: string[]; userPlaylistAfter?: string[]; trace?: ExecutionTrace } = {}): InvariantResult[] {
  const out: InvariantResult[] = [];
  // Beat: a beatmatched plan pitches the incoming within the limit and both tempos meet.
  const effectiveIn = incoming.bpm * plan.tempoPlan.ratio;
  const matched = plan.tempoPlan.method === 'beatmatch' || plan.tempoPlan.method === 'half-time' || plan.tempoPlan.method === 'double-time' || plan.tempoPlan.method === 'creative-jump' || plan.tempoPlan.method === 'pitch';
  const ratioToOut = matched ? Math.min(Math.abs(effectiveIn / outgoing.bpm - 1), Math.abs(effectiveIn / (outgoing.bpm * 2) - 1), Math.abs((effectiveIn * 2) / outgoing.bpm - 1)) : 0;
  out.push({ name: 'beat', ok: !matched || ratioToOut < 0.005 || Math.abs(plan.tempoPlan.incomingSemitones) >= 4 - 1e-6, detail: matched ? `effective ${effectiveIn.toFixed(2)} BPM against ${outgoing.bpm} (${(ratioToOut * 100).toFixed(2)} % off)` : `no beatmatch (${plan.tempoPlan.method})` });
  // Phrase: start on a phrase or bar boundary when the grid is trusted.
  const onPhrase = outgoing.phrases.some((p) => Math.abs(p.start - plan.startTimeSec) < 0.05);
  const onBar = outgoing.downbeats.bars.some((b) => Math.abs(b.start - plan.startTimeSec) < 0.05);
  out.push({ name: 'phrase', ok: plan.quantize === 'none' || onPhrase || onBar, detail: onPhrase ? 'phrase boundary' : onBar ? 'bar boundary' : `start ${plan.startTimeSec.toFixed(2)} s is off the grid` });
  // Bass: two bass-heavy tracks never fully exposed together.
  const exposure = bassExposure(plan, opts.trace);
  const bothHeavy = plan.bassPlan.outgoingHeavy && plan.bassPlan.incomingHeavy;
  out.push({ name: 'bass', ok: !bothHeavy || exposure < 0.15, detail: `both heavy: ${bothHeavy}, exposure ${exposure.toFixed(2)}` });
  // Loudness: predicted true peak under the ceiling (+1 dB tolerance for the predictor).
  out.push({ name: 'loudness', ok: plan.gainPlan.monitor.truePeakDb <= plan.gainPlan.masterCeilingDb + 1, detail: `predicted true peak ${plan.gainPlan.monitor.truePeakDb.toFixed(1)} dB, ceiling ${plan.gainPlan.masterCeilingDb} dB` });
  // Failure: a plan always carries a fallback and an emergency style.
  out.push({ name: 'failure', ok: !!plan.fallbackStyle && !!plan.emergencyStyle && (!opts.trace || opts.trace.completed), detail: opts.trace ? `completed ${opts.trace.completed}, fell back ${opts.trace.fellBack}` : `fallback ${plan.fallbackStyle}, emergency ${plan.emergencyStyle}` });
  // Playlist: the user's order is untouched.
  if (opts.userPlaylistBefore && opts.userPlaylistAfter) {
    const same = opts.userPlaylistBefore.length === opts.userPlaylistAfter.length && opts.userPlaylistBefore.every((id, i) => id === opts.userPlaylistAfter![i]);
    out.push({ name: 'playlist', ok: same, detail: same ? 'user playlist order unchanged' : 'user playlist order changed' });
  }
  // Confidence: low confidence never gets a high-risk style.
  const risky = CREATIVE_STYLES.includes(plan.style) || !!plan.cueJump || !!plan.loop || plan.tempoPlan.band === 'creative' || plan.tempoPlan.band === 'extreme';
  out.push({ name: 'confidence', ok: plan.confidence >= 0.5 || !risky, detail: `confidence ${plan.confidence.toFixed(2)}, style ${plan.style}${plan.cueJump ? ' + cue jump' : ''}${plan.loop ? ' + loop' : ''}` });
  return out;
}
