/**
 * DJTempoKeySolver (plan sections 12-14): decides how two tempos meet
 * (beatmatch, half/double, slight pitch, tempo bridge, avoid, creative jump)
 * and whether the key is locked, from the tracks' confidences, the local key
 * at the mix points and the style's tolerances.
 *
 * Pure. The pitch itself is applied later through the one pitch path.
 */
import { harmonicCompatibility, keyConfidenceClass, tempoCompatibility } from './compatibility';
import type { DJStyleProfile, KeyPlan, TempoPlan } from './types';
import { keyName, parseMusicalKey } from './trackAnalysis';

export interface TempoKeyLimits {
  /** Up to here a shift is "normal" (plan: about 4-8 %). */
  normalPercent: number;
  /** Up to here a shift is "creative" (plan: about 8-12 %). */
  creativePercent: number;
  /** Beyond this nothing is pitched; the transition is avoided or bridged. */
  extremePercent: number;
}

export const DEFAULT_TEMPO_LIMITS: TempoKeyLimits = { normalPercent: 6, creativePercent: 12, extremePercent: 16 };

export interface TempoKeyInput {
  outgoingBpm: number;
  outgoingBpmConfidence: number;
  incomingBpm: number;
  incomingBpmConfidence: number;
  outgoingKey: string | null;
  outgoingKeyConfidence: number;
  incomingKey: string | null;
  incomingKeyConfidence: number;
  /** Mean harmonic density of both tracks at the join, 0..1. */
  harmonicDensity: number;
  overlapBars: number;
  style: DJStyleProfile;
  creativeRisk: number;
  limits?: TempoKeyLimits;
  /** A bridge track exists that could carry the BPM gap (set planner lookahead). */
  bridgeAvailable?: boolean;
}

export function solveTempo(input: TempoKeyInput): TempoPlan {
  const limits = input.limits ?? DEFAULT_TEMPO_LIMITS;
  const { outgoingBpm, incomingBpm } = input;
  if (outgoingBpm <= 0 || incomingBpm <= 0) {
    return { method: 'none', outgoingBpm, incomingBpm, incomingSemitones: 0, ratio: 1, percent: 0, band: 'none', keyLock: false, reason: 'a tempo is unknown: no tempo change' };
  }
  const t = tempoCompatibility(outgoingBpm, incomingBpm, input.style.tempoTolerancePercent);
  const abs = Math.abs(t.percent);
  const ratio = 1 + t.percent / 100;
  const semitones = 12 * Math.log2(ratio);
  const normal = Math.min(limits.normalPercent, Math.max(3, input.style.tempoTolerancePercent));
  const creative = Math.max(normal, Math.min(limits.creativePercent, normal + 6 * input.creativeRisk + 2));
  const lowConfidence = Math.min(input.outgoingBpmConfidence, input.incomingBpmConfidence) < 0.4;

  let method: TempoPlan['method'];
  let band: TempoPlan['band'];
  let reason: string;
  if (abs < 0.3) {
    method = t.relationship === 'direct' ? 'beatmatch' : t.relationship === 'half' ? 'half-time' : 'double-time';
    band = 'none';
    reason = `tempos already match (${t.relationship})`;
  } else if (abs <= normal) {
    method = t.relationship === 'direct' ? 'beatmatch' : t.relationship === 'half' ? 'half-time' : 'double-time';
    band = 'normal';
    reason = `${abs.toFixed(1)} % shift is within the normal range (${normal} %)`;
  } else if (abs <= creative && input.creativeRisk >= 0.35) {
    method = 'creative-jump';
    band = 'creative';
    reason = `${abs.toFixed(1)} % shift is a creative move (risk budget ${input.creativeRisk.toFixed(2)})`;
  } else if (abs <= creative) {
    method = 'pitch';
    band = 'creative';
    reason = `${abs.toFixed(1)} % shift pitched slowly (risk budget too low for a jump)`;
  } else if (input.bridgeAvailable) {
    method = 'tempo-bridge';
    band = 'extreme';
    reason = `${abs.toFixed(1)} % is too far: a bridge track carries the gap`;
  } else {
    method = 'avoid';
    band = 'extreme';
    reason = `${abs.toFixed(1)} % is beyond the creative range: no beatmatch, short transition only`;
  }
  // Low tempo confidence: never pitch far on a guess (plan section 35).
  if (lowConfidence && abs > normal) {
    method = 'avoid';
    reason = `tempo confidence too low to pitch ${abs.toFixed(1)} %`;
  }
  const apply = method !== 'avoid' && method !== 'tempo-bridge';
  const clampedSemitones = apply ? Math.max(-4, Math.min(4, semitones)) : 0;
  // Key lock when the shift would move the key audibly (more than a quarter
  // tone) and the material is harmonic; varispeed otherwise (plan section 13).
  const keyLock = apply && Math.abs(clampedSemitones) > 0.5 && input.harmonicDensity > 0.3;
  return {
    method,
    outgoingBpm,
    incomingBpm,
    incomingSemitones: clampedSemitones,
    ratio: apply ? Math.pow(2, clampedSemitones / 12) : 1,
    percent: apply ? (Math.pow(2, clampedSemitones / 12) - 1) * 100 : 0,
    band,
    keyLock,
    reason,
  };
}

/** The key the incoming track sounds in after a varispeed shift. */
export function shiftedKeyName(key: string | null, semitones: number): string | null {
  const parsed = parseMusicalKey(key);
  if (parsed.root === null || parsed.mode === 'unknown') return null;
  const shift = Math.round(semitones);
  if (shift === 0) return parsed.name;
  return keyName(parsed.root + shift, parsed.mode);
}

export function solveKey(input: TempoKeyInput, tempo: TempoPlan): KeyPlan {
  const classOut = keyConfidenceClass(input.outgoingKeyConfidence, input.outgoingKey);
  const classIn = keyConfidenceClass(input.incomingKeyConfidence, input.incomingKey);
  const effectiveIncoming = tempo.keyLock ? input.incomingKey : shiftedKeyName(input.incomingKey, tempo.incomingSemitones) ?? input.incomingKey;
  const h = harmonicCompatibility(input.outgoingKey, input.outgoingKeyConfidence, effectiveIncoming, input.incomingKeyConfidence, {
    strictness: input.style.keyStrictness, overlapBars: input.overlapBars,
  });
  // When varispeed would create a clash that key lock avoids, lock the key.
  let keyLock = tempo.keyLock;
  let reason = h.reason;
  if (!keyLock && Math.abs(tempo.incomingSemitones) > 0.5) {
    const locked = harmonicCompatibility(input.outgoingKey, input.outgoingKeyConfidence, input.incomingKey, input.incomingKeyConfidence, {
      strictness: input.style.keyStrictness, overlapBars: input.overlapBars,
    });
    if (locked.clashRisk + 0.15 < h.clashRisk) { keyLock = true; reason = `key lock: ${locked.reason} instead of ${h.relation} after the shift`; }
  }
  const confidenceClass: KeyPlan['confidenceClass'] = classOut === 'unknown' || classIn === 'unknown' ? 'unknown'
    : classOut === 'known-high' && classIn === 'known-high' ? 'known-high' : 'known-low';
  return {
    outgoingKey: input.outgoingKey,
    incomingKey: input.incomingKey,
    relation: keyLock ? harmonicCompatibility(input.outgoingKey, input.outgoingKeyConfidence, input.incomingKey, input.incomingKeyConfidence).relation : h.relation,
    confidenceClass,
    clashRisk: keyLock ? harmonicCompatibility(input.outgoingKey, input.outgoingKeyConfidence, input.incomingKey, input.incomingKeyConfidence, { overlapBars: input.overlapBars }).clashRisk : h.clashRisk,
    keyLock,
    shiftedKey: tempo.keyLock ? null : shiftedKeyName(input.incomingKey, tempo.incomingSemitones),
    reason,
  };
}
