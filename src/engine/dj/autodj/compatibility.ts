/**
 * Pairwise musical compatibility (plan sections 9, 13, 47-50): the one place
 * harmonic, tempo, drum, bass, vocal, spectral, phrase, section, intro/outro,
 * genre and texture compatibility are computed. Both planners read it.
 *
 * Every function is pure, returns 0..1 (1 = fits) and says why.
 */
import { keyCompatibility, toCamelot } from '../DJKeyUtils';
import type { DJTrackSummary, KeyConfidenceClass } from './types';

export interface Scored { score: number; reason: string }

// ── Harmonic (plan section 13) ──────────────────────────────────────────────

export type HarmonicRelation =
  | 'same' | 'relative' | 'fifth-up' | 'fifth-down' | 'diagonal' | 'energy-jump' | 'semitone-boost'
  | 'two-steps' | 'tritone' | 'clash' | 'unknown';

/** Extended Camelot relations: what DJs use beyond +-1 and the relative. */
export function harmonicRelation(keyA: string | null, keyB: string | null): HarmonicRelation {
  const a = toCamelot(keyA);
  const b = toCamelot(keyB);
  if (!a || !b) return 'unknown';
  const basic = keyCompatibility(keyA, keyB);
  if (basic === 'perfect') return 'same';
  if (basic === 'mood-change') return 'relative';
  if (basic === 'energy-boost') return 'fifth-up';
  if (basic === 'energy-drop') return 'fifth-down';
  const diff = ((b.number - a.number) % 12 + 12) % 12;
  const sameLetter = a.letter === b.letter;
  if (!sameLetter && (diff === 1 || diff === 11)) return 'diagonal';
  if (sameLetter && diff === 2) return 'energy-jump';
  if (sameLetter && diff === 7) return 'semitone-boost';
  if (sameLetter && diff === 10) return 'two-steps';
  if (sameLetter && diff === 6) return 'tritone';
  return 'clash';
}

const RELATION_FIT: Record<HarmonicRelation, number> = {
  same: 1, relative: 0.9, 'fifth-up': 0.85, 'fifth-down': 0.85, diagonal: 0.65, 'energy-jump': 0.55,
  'semitone-boost': 0.5, 'two-steps': 0.4, tritone: 0.15, clash: 0.1, unknown: 0.5,
};

export function keyConfidenceClass(confidence: number, key: string | null): KeyConfidenceClass {
  if (!key) return 'unknown';
  return confidence >= 0.6 ? 'known-high' : 'known-low';
}

/**
 * Clash risk above which a pairing is rejected as strongly incompatible keys:
 * the set planner rejects the candidate and the juggle gate refuses to juggle.
 */
export const HARMONIC_CLASH_REJECT = 0.5;

export interface HarmonicResult extends Scored {
  relation: HarmonicRelation;
  /** 0..1 risk the clash is heard, after confidence weighting and the length rule. */
  clashRisk: number;
  classA: KeyConfidenceClass;
  classB: KeyConfidenceClass;
}

/**
 * Confidence-aware: unknown means "we don't know" (neutral), a low-confidence
 * reading pulls toward neutral, a high-confidence clash matters most. A short
 * overlap makes a clash matter less (plan section 13).
 */
export function harmonicCompatibility(
  keyA: string | null, confA: number, keyB: string | null, confB: number,
  opts: { strictness?: number; overlapBars?: number } = {},
): HarmonicResult {
  const relation = harmonicRelation(keyA, keyB);
  const classA = keyConfidenceClass(confA, keyA);
  const classB = keyConfidenceClass(confB, keyB);
  const fit = RELATION_FIT[relation];
  const joint = relation === 'unknown' ? 0 : Math.min(1, Math.max(0, confA)) * Math.min(1, Math.max(0, confB));
  // Blend toward neutral by how little we know.
  const weighted = 0.5 + (fit - 0.5) * Math.sqrt(joint);
  const lengthFactor = opts.overlapBars !== undefined ? Math.min(1, Math.max(0.3, opts.overlapBars / 16)) : 1;
  const clashRisk = Math.max(0, (0.6 - fit)) / 0.6 * Math.sqrt(joint) * lengthFactor;
  const strictness = opts.strictness ?? 0.6;
  const score = Math.max(0, Math.min(1, weighted - clashRisk * strictness * 0.5));
  const reason = relation === 'unknown'
    ? `key unknown on ${!keyA ? 'the outgoing' : 'the incoming'} track: neutral`
    : `${relation} (${keyA} -> ${keyB}, confidence ${(joint).toFixed(2)})`;
  return { score, reason, relation, clashRisk, classA, classB };
}

// ── Tempo (plan section 12) ─────────────────────────────────────────────────

export interface TempoResult extends Scored {
  /** Signed percent change applied to B to meet A, after half/double. */
  percent: number;
  relationship: 'direct' | 'half' | 'double';
}

export function tempoCompatibility(bpmA: number, bpmB: number, tolerancePercent = 6): TempoResult {
  if (bpmA <= 0 || bpmB <= 0) return { score: 0.5, reason: 'tempo unknown', percent: 0, relationship: 'direct' };
  const candidates: Array<{ ratio: number; relationship: TempoResult['relationship'] }> = [
    { ratio: bpmA / bpmB, relationship: 'direct' },
    { ratio: bpmA / (bpmB * 2), relationship: 'half' },
    { ratio: (bpmA * 2) / bpmB, relationship: 'double' },
  ];
  const best = candidates.reduce((x, y) => (Math.abs(Math.log2(y.ratio)) < Math.abs(Math.log2(x.ratio)) ? y : x));
  const percent = (best.ratio - 1) * 100;
  const abs = Math.abs(percent);
  const score = abs <= tolerancePercent ? 1 - (abs / tolerancePercent) * 0.3 : Math.max(0, 0.7 - (abs - tolerancePercent) / 12);
  return { score, reason: `${bpmB} -> ${bpmA} BPM: ${percent.toFixed(1)} % (${best.relationship})`, percent, relationship: best.relationship };
}

// ── Drums (plan section 48) ─────────────────────────────────────────────────

export function drumCompatibility(a: DJTrackSummary, b: DJTrackSummary): Scored {
  const pa = a.drumPattern, pb = b.drumPattern;
  if (pa === 'unknown' || pb === 'unknown') return { score: 0.6, reason: 'drum pattern unknown' };
  if (pa === pb) return { score: pa === 'four-on-floor' ? 1 : 0.85, reason: `${pa} with ${pb}` };
  const pair = new Set([pa, pb]);
  if (pair.has('four-on-floor') && pair.has('breakbeat')) return { score: 0.35, reason: 'breakbeat against four-on-floor: shorten the overlap or swap percussion' };
  if (pair.has('half-time')) return { score: 0.55, reason: 'half-time feel against straight drums' };
  if (pair.has('sparse')) return { score: 0.7, reason: 'sparse drums coexist' };
  return { score: 0.6, reason: `${pa} with ${pb}` };
}

// ── Bass (plan section 49) ──────────────────────────────────────────────────

export function bassCompatibility(a: DJTrackSummary, b: DJTrackSummary): Scored & { bothHeavy: boolean } {
  const bothHeavy = a.bassHeaviness > 0.7 && b.bassHeaviness > 0.7;
  if (bothHeavy) return { score: 0.3, reason: 'both tracks carry huge sub bass: no direct overlap', bothHeavy };
  const diff = Math.abs(a.bassLevel - b.bassLevel);
  return { score: Math.max(0.4, 1 - diff), reason: `bass levels ${a.bassLevel.toFixed(2)} / ${b.bassLevel.toFixed(2)}`, bothHeavy };
}

// ── Vocals (plan section 47) ────────────────────────────────────────────────

/** Risk that A's ending vocals meet B's opening vocals. */
export function vocalCompatibility(a: DJTrackSummary, b: DJTrackSummary): Scored & { overlapRisk: number } {
  const tailA = a.vocalProfile.slice(5).reduce((x, y) => x + y, 0) / 3;
  const headB = b.vocalProfile.slice(0, 3).reduce((x, y) => x + y, 0) / 3;
  const overlapRisk = Math.min(1, tailA * headB * 4);
  if (a.vocalPresence < 0.1 && b.vocalPresence < 0.1) return { score: 1, reason: 'no vocals', overlapRisk: 0 };
  return { score: 1 - overlapRisk * 0.8, reason: overlapRisk > 0.4 ? 'vocal against vocal at the join' : 'vocals clear at the join', overlapRisk };
}

// ── Spectral and texture (plan section 50) ──────────────────────────────────

export function spectralCompatibility(a: DJTrackSummary, b: DJTrackSummary): Scored {
  const brightDiff = Math.abs(a.brightness - b.brightness);
  const mud = (a.energy.harmonicDensity > 0.7 && b.energy.harmonicDensity > 0.7) ? 0.2 : 0;
  const lowDensity = (a.bassLevel > 0.6 && b.bassLevel > 0.6) ? 0.15 : 0;
  const highDensity = (a.brightness > 0.7 && b.brightness > 0.7) ? 0.1 : 0;
  const score = Math.max(0, 1 - brightDiff - mud - lowDensity - highDensity);
  return { score, reason: brightDiff > 0.3 ? 'brightness mismatch' : mud ? 'muddy overlap risk' : 'spectral balance compatible' };
}

export function textureCompatibility(a: DJTrackSummary, b: DJTrackSummary): Scored {
  const d = Math.abs(a.energy.arrangementDensity - b.energy.arrangementDensity);
  return { score: 1 - d, reason: `arrangement density ${a.energy.arrangementDensity.toFixed(2)} / ${b.energy.arrangementDensity.toFixed(2)}` };
}

export function genreCompatibility(a: DJTrackSummary, b: DJTrackSummary): Scored {
  if (!a.genre || !b.genre) return { score: 0.6, reason: 'genre unknown' };
  if (a.genre === b.genre) return { score: 1, reason: `same genre (${a.genre})` };
  return { score: 0.6, reason: `${a.genre} into ${b.genre}` };
}

// ── Structure (plan sections 7, 16) ─────────────────────────────────────────

export function phraseCompatibility(a: DJTrackSummary, b: DJTrackSummary): Scored {
  if (a.phraseLengthBars === b.phraseLengthBars) return { score: 1, reason: `${a.phraseLengthBars}-bar phrases on both` };
  const ratio = Math.max(a.phraseLengthBars, b.phraseLengthBars) / Math.min(a.phraseLengthBars, b.phraseLengthBars);
  return { score: ratio === 2 ? 0.8 : 0.6, reason: `${a.phraseLengthBars}-bar into ${b.phraseLengthBars}-bar phrases` };
}

export function introOutroCompatibility(a: DJTrackSummary, b: DJTrackSummary): Scored {
  const outro = a.outroLengthSec;
  const intro = b.introLengthSec;
  if (outro >= 15 && intro >= 15) return { score: 1, reason: `${Math.round(outro)} s outro into ${Math.round(intro)} s intro` };
  if (outro >= 15 || intro >= 15) return { score: 0.8, reason: outro >= 15 ? 'usable outro' : 'usable intro' };
  return { score: 0.5, reason: 'short intro and outro' };
}

export function sectionCompatibility(a: DJTrackSummary, b: DJTrackSummary): Scored {
  const tail = a.sectionKinds[a.sectionKinds.length - 1];
  const head = b.sectionKinds[0];
  if (!tail || !head) return { score: 0.6, reason: 'sections unknown' };
  if (tail === 'outro' && head === 'intro') return { score: 1, reason: 'outro into intro' };
  if (head === 'intro' || tail === 'outro') return { score: 0.85, reason: `${tail} into ${head}` };
  if (tail === 'drop' && head === 'drop') return { score: 0.5, reason: 'drop against drop' };
  return { score: 0.7, reason: `${tail} into ${head}` };
}
