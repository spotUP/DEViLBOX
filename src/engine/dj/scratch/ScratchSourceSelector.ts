/**
 * Scratch source selection (owner plan `thoughts/shared/plans/2026-10-08-dj-view-scratch-plan.md`
 * sections 12, 13, 84-88; ledger SCR-P5.2-P5.7).
 *
 * Three source classes (section 88): the dedicated crate (CRATE), extracted song material and
 * the live deck (both DECK sources on the playing track, an extracted one anchored at the
 * song's own hit), plus the tracker-native ones (TRACKER_CHANNEL: a channel's current segment;
 * TRACKER_SAMPLE: an instrument of the deck's song). Every candidate is scored with the
 * section 13 formula, each term 0..1, weighted by one table:
 *
 *   musicalRoleFit + sectionFit + styleFit + gestureCompatibility + anchorQuality + energyFit
 *   + novelty + phraseFit - vocalCollision - bassConflict - repetition - confidenceRisk
 *
 * The best candidate wins, with its terms and reasons (the decision log carries them).
 * Pure: no engine, no store.
 */

import { classifyWindow } from '../autodj/juggle/juggleMaterial';
import type { MaterialClass } from '../autodj/juggle/juggleTypes';
import { barStartBeat, timeAtBeat } from '../autodj/beatGrid';
import type { DJTrackAnalysis } from '../autodj/types';
import { anchorFor, deckAnchor, pickDeckAnchor, DECK_ANCHOR_BY_ROLE } from './scratchAnchor';
import { SCRATCH_RECORDS, VOCAL_CATEGORIES, type ScratchRecord, type ScratchRecordCategory } from './scratchCatalogue';
import { extractedAnchors, trackerScratchMaterial, type ExtractedAnchor } from './scratchMaterial';
import type { ScratchPerformanceContext } from './scratchContext';
import type { ScratchGenreHint } from './scratchStyles';
import { MIN_VOCABULARY, VOCAL_BUSY } from './scratchPlacement';
import type { DeckAnchorKind, DeckScratchAnchor, ScratchAnchor, ScratchGestureId, ScratchRole, ScratchSource } from './scratchTypes';

type AB = 'A' | 'B';

/** What a source sounds like (the section 13 examples' vocabulary). */
export type SourceMaterial =
  | 'voice' | 'phrase' | 'count' | 'command' | 'fx' | 'stab' | 'drums' | 'snare' | 'kick' | 'bass' | 'lead' | 'vocalHit';

export type SourceOrigin = 'crate' | 'extracted' | 'deck' | 'trackerChannel' | 'trackerSample';

/** The musical situation the selector reads (section 13 examples, section 88). */
export type SourceContextKind = 'breakdown' | 'drumBreak' | 'drop' | 'lowTransition' | 'transition' | 'vocalCall' | 'trackerDemo' | 'groove';

export interface SourceCandidate {
  key: string;
  origin: SourceOrigin;
  material: SourceMaterial;
  source: ScratchSource;
  anchor: ScratchAnchor | DeckScratchAnchor;
  /** What the anchor marks (a deck anchor's own kind, or a tracker sample's). */
  anchorKind?: DeckAnchorKind;
  record?: ScratchRecord;
  /** Gestures the source takes; undefined = every gesture (a deck, a tracker sample). */
  gestures?: readonly ScratchGestureId[];
  anchorQuality: number;
  /** How sure the analysis is that the material is there (1 for a crate record). */
  confidence: number;
  durationSec?: number;
}

/** An instrument of a tracker deck's song that can be scratched (P5.6). */
export interface TrackerSampleInfo {
  deck: AB;
  sampleId: string;
  name: string;
  kind: 'kick' | 'snare' | 'percussion' | 'voice' | 'stab';
}

export interface SourceRequest {
  ctx: ScratchPerformanceContext;
  /** The master deck's analysis (the context was built from it). */
  track: DJTrackAnalysis;
  deck: AB;
  /** Roles of the planned events, leading role first. */
  roles: readonly ScratchRole[];
  /** Gestures of the planned events. */
  gestures: readonly ScratchGestureId[];
  /** The bar the plan starts on. */
  bar: number;
  genre?: ScratchGenreHint | 'unknown';
  trackerSamples?: readonly TrackerSampleInfo[];
  /** Keys of recently used sources, most recent last. */
  recent?: readonly string[];
  /** A source cooling down (section 54) is not a candidate. */
  blocked?(key: string): boolean;
  /** Memory's preference for a candidate (section 90: +0.1 / -0.2 / -1), added to its score. */
  preference?(candidate: SourceCandidate): number;
}

export const SOURCE_TERMS = [
  'musicalRoleFit', 'sectionFit', 'styleFit', 'gestureCompatibility', 'anchorQuality', 'energyFit', 'novelty', 'phraseFit',
  'vocalCollision', 'bassConflict', 'repetition', 'confidenceRisk',
] as const;
export type SourceTerm = typeof SOURCE_TERMS[number];

/** The one weight ladder (section 13): positive terms add, the last four subtract. */
export const SOURCE_WEIGHTS: Readonly<Record<SourceTerm, number>> = {
  musicalRoleFit: 1, sectionFit: 2, styleFit: 1, gestureCompatibility: 1.5, anchorQuality: 0.5, energyFit: 0.5, novelty: 0.5, phraseFit: 0.5,
  vocalCollision: 1.5, bassConflict: 2, repetition: 1, confidenceRisk: 1,
};
const NEGATIVE: ReadonlySet<SourceTerm> = new Set(['vocalCollision', 'bassConflict', 'repetition', 'confidenceRisk']);

/** Section 13 / 88 preferences: how well a material, or an origin, fits the situation (0..1). */
export const CONTEXT_PREFERENCE: Readonly<Record<SourceContextKind, Partial<Record<SourceMaterial | SourceOrigin, number>>>> = {
  breakdown: { voice: 1, phrase: 1, vocalHit: 0.6, command: 0.6, count: 0.3, drums: 0.2, snare: 0.2, kick: 0.2, stab: 0.3, fx: 0.3 },
  drumBreak: { count: 1, snare: 1, kick: 1, drums: 1, stab: 0.5, voice: 0.3, command: 0.4 },
  drop: { stab: 1, fx: 0.8, count: 0.7, command: 0.6, voice: 0.5, snare: 0.6, kick: 0.5, vocalHit: 0.5 },
  lowTransition: { voice: 0.8, phrase: 0.7, vocalHit: 0.5, drums: 0.4, snare: 0.4, command: 0.4, count: 0.3 },
  transition: { deck: 1, drums: 1, snare: 0.9, kick: 0.9, stab: 0.5, voice: 0.3, count: 0.4 },
  vocalCall: { vocalHit: 1, extracted: 1, voice: 0.6, command: 0.4 },
  trackerDemo: { trackerSample: 1, trackerChannel: 0.8, drums: 0.4, voice: 0.4 },
  groove: { voice: 0.7, command: 0.6, count: 0.5, drums: 0.6, snare: 0.6, stab: 0.5, vocalHit: 0.5 },
};

/** Typical energy of a material (section 13 energyFit). */
const MATERIAL_ENERGY: Readonly<Record<SourceMaterial, number>> = {
  voice: 0.5, phrase: 0.35, count: 0.55, command: 0.6, fx: 0.8, stab: 0.85, drums: 0.7, snare: 0.75, kick: 0.7, bass: 0.6, lead: 0.6, vocalHit: 0.55,
};

const VOICE_MATERIALS: ReadonlySet<SourceMaterial> = new Set(['voice', 'phrase', 'command', 'vocalHit', 'count']);

const CATEGORY_MATERIAL: Readonly<Record<ScratchRecordCategory, SourceMaterial>> = {
  COUNT: 'count', YEAH_RESPONSE: 'voice', AH_VOWEL: 'voice', FRESH: 'voice', DJ_COMMAND: 'command', SHORT_EXCLAMATION: 'voice',
  INTRO_ANNOUNCEMENT: 'command', LONG_SPECIALTY_PHRASE: 'phrase', HIP_HOP_TAG: 'command', FX: 'fx', LONG_VOWEL_OR_HYPE: 'voice',
  PRE_RENDERED_SCRATCH: 'fx',
};

const SAMPLE_ANCHOR_KIND: Readonly<Record<TrackerSampleInfo['kind'], DeckAnchorKind>> = {
  kick: 'kick', snare: 'snare', percussion: 'hit', voice: 'vocalOnset', stab: 'hit',
};

/** Reachability sentinel (SCR-P5.R5). */
export const scratchSourceStats = { select: 0 };

/** Seconds of a bar at the context's tempo. */
const barSecOf = (ctx: ScratchPerformanceContext): number => (60 / Math.max(1, ctx.bpm)) * Math.max(1, ctx.meter);

/** The material classes of the deck at the bar (the juggling classifier, reused). */
function materialAt(track: DJTrackAnalysis, deck: AB, bar: number): MaterialClass[] {
  const start = timeAtBeat(track.beatGrid, barStartBeat(track.downbeats, bar));
  return classifyWindow(track, deck, start, 1).classes;
}

/** Section 13 / 88: which situation the plan is in. */
export function sourceContext(req: Pick<SourceRequest, 'ctx' | 'track' | 'deck' | 'roles' | 'bar' | 'genre' | 'trackerSamples'>, classes = materialAt(req.track, req.deck, req.bar)): SourceContextKind {
  const { ctx, track } = req;
  const kind = ctx.section?.kind;
  const prevVocal = barVocal(track, req.bar - 1);
  if (req.roles[0] === 'ANSWER' && (prevVocal > VOCAL_BUSY || classes.includes('VOCAL_HIT'))) return 'vocalCall';
  if (track.tracker && track.tracker.confidence >= 0.5 && (req.trackerSamples?.length ?? 0) > 0) return 'trackerDemo';
  if (ctx.transitionType || ctx.activeDeck === 'BOTH') return ctx.energy < 0.4 ? 'lowTransition' : 'transition';
  if (kind === 'breakdown' || classes.includes('BREAK')) return 'breakdown';
  if (kind === 'drop' || classes.includes('DROP') || ctx.energy >= 0.75) return 'drop';
  // drums with nothing tonal or sung over them: a drum break, whatever the section labeller called it
  if (kind === 'drum-only' || (ctx.drumActivity >= 0.5 && ctx.melodicActivity < 0.2 && ctx.vocalActivity < 0.2)) return 'drumBreak';
  if ((req.genre === 'house' || req.genre === 'techno') && classes.includes('FULL_GROOVE') && !classes.includes('VOCAL_HIT')) return 'transition';
  return 'groove';
}

function barVocal(track: DJTrackAnalysis, bar: number): number {
  if (bar < 0) return 0;
  const t0 = timeAtBeat(track.beatGrid, barStartBeat(track.downbeats, bar));
  const t1 = timeAtBeat(track.beatGrid, barStartBeat(track.downbeats, bar + 1));
  const v = track.vocalActivity;
  if (!v.values.length) return 0;
  let sum = 0, n = 0;
  for (let i = Math.floor(t0 / v.hopSec); i < Math.ceil(t1 / v.hopSec) && i < v.values.length; i++) { sum += v.values[i]!; n++; }
  return n ? sum / n : 0;
}

/** Every source the situation offers (section 88's three classes + the tracker-native two). */
export function sourceCandidates(req: SourceRequest, classes = materialAt(req.track, req.deck, req.bar)): SourceCandidate[] {
  const { ctx, track, deck } = req;
  const out: SourceCandidate[] = [];
  const role = req.roles[0] ?? 'THEME';

  // A: the crate - every clean record (a pre-scratched one is a throw, not a source)
  for (const record of SCRATCH_RECORDS) {
    if (!record.clean) continue;
    const source: ScratchSource = { type: 'CRATE', recordId: record.id, anchor: { position: record.anchors.vowel, safe: record.safe, safeForward: record.safeForward, safeReverse: record.safeReverse } };
    const anchor = anchorFor(source, role);
    if (!anchor) continue;
    out.push({
      key: `crate:${record.id}`, origin: 'crate', material: CATEGORY_MATERIAL[record.category], source, anchor, record,
      gestures: record.gestures, anchorQuality: record.voicedAmount, confidence: 1, durationSec: record.durationSec,
    });
  }

  // B: extracted song material - the track's own hits near the bar, scratched on the deck
  const extracted = extractedAnchors(track, req.bar);
  for (const a of extracted) {
    const material: SourceMaterial = a.kind === 'vocalOnset' ? 'vocalHit' : a.kind === 'snare' ? 'snare' : a.kind === 'kick' ? 'kick' : a.kind === 'stab' || a.kind === 'phraseHit' ? 'stab' : 'drums';
    if (material !== 'vocalHit' && material !== 'stab') continue; // drum hits are the live deck's (C)
    out.push({ key: `extracted:${deck}:${a.kind}@${a.position.toFixed(2)}`, origin: 'extracted', material, source: { type: 'DECK', deck, anchor: a }, anchor: a, anchorQuality: a.strength, confidence: a.confidence });
  }

  // C: the live deck - when its material at the bar is drums / percussion and carries no vocal (section 88, P5.3)
  const percussive = classes.some((c) => c === 'PERCUSSION_HIT' || c === 'FULL_GROOVE' || c === 'DRUM_FILL') && !classes.includes('VOCAL_HIT');
  if (percussive) {
    const hits = extracted.filter((a) => a.kind === 'snare' || a.kind === 'kick');
    const downbeat = deckAnchor(timeAtBeat(track.beatGrid, barStartBeat(track.downbeats, req.bar)), barStartBeat(track.downbeats, req.bar), 'downbeat', track.bpm);
    const anchor = pickDeckAnchor([...hits.filter((h) => h.position >= downbeat.position - 1e-6), downbeat], role) ?? downbeat;
    const material: SourceMaterial = anchor.kind === 'snare' ? 'snare' : anchor.kind === 'kick' ? 'kick' : 'drums';
    out.push({ key: `deck:${deck}`, origin: 'deck', material, source: { type: 'DECK', deck, anchor }, anchor, anchorQuality: ctx.beatConfidence, confidence: ctx.beatConfidence });
  }

  // tracker channel segments: what each channel does now (section 86)
  for (const m of trackerScratchMaterial(track, req.bar, deck)) {
    const material: SourceMaterial = m.kind === 'percussion' ? 'drums' : m.kind === 'texture' ? 'lead' : m.kind;
    const anchor = deckAnchor(m.anchor, 0, m.kind === 'kick' || m.kind === 'snare' ? m.kind : 'hit', track.bpm);
    out.push({
      key: `channel:${deck}:${m.segmentId}`, origin: 'trackerChannel', material,
      source: { type: 'TRACKER_CHANNEL', deck, channelId: m.channel, segmentId: m.segmentId, anchor: m.anchor },
      anchor, anchorQuality: m.segment.importance, confidence: Math.min(m.segment.confidence, track.tracker?.confidence ?? 0),
    });
  }

  // tracker samples: the deck song's own instruments (section 85, P5.6)
  for (const s of req.trackerSamples ?? []) {
    if (s.deck !== deck) continue;
    const material: SourceMaterial = s.kind === 'percussion' ? 'drums' : s.kind;
    const anchor: ScratchAnchor = { position: 0, safe: [0, 1], safeForward: [0, 1], safeReverse: [0, 0] };
    out.push({
      key: `sample:${deck}:${s.sampleId}`, origin: 'trackerSample', material,
      source: { type: 'TRACKER_SAMPLE', deck, sampleId: s.sampleId, anchor: 0 }, anchor, anchorKind: SAMPLE_ANCHOR_KIND[s.kind],
      anchorQuality: 0.8, confidence: track.tracker?.confidence ?? 0.5,
    });
  }
  return out;
}

export interface SourceScore { candidate: SourceCandidate; score: number; terms: Record<SourceTerm, number>; memoryPreference?: number }

/** Section 13 terms of one candidate, each 0..1. */
export function scoreSource(c: SourceCandidate, req: SourceRequest, context: SourceContextKind): SourceScore {
  const { ctx } = req;
  const role = req.roles[0] ?? 'THEME';
  const pref = CONTEXT_PREFERENCE[context];
  const recent = req.recent ?? [];
  const wanted = [...new Set(req.gestures.filter((g) => g !== 'drop' && g !== 'dropPhrase'))];
  const terms: Record<SourceTerm, number> = {
    musicalRoleFit: c.record
      ? (c.record.roles.includes(role) ? 1 : 0.3)
      : DECK_ANCHOR_BY_ROLE[role].includes(c.anchorKind ?? (c.anchor as DeckScratchAnchor).kind ?? 'hit') ? 1 : 0.5,
    sectionFit: Math.max(pref[c.material] ?? 0, pref[c.origin] ?? 0),
    styleFit: c.record
      ? (c.record.styles.includes(ctx.style) ? 1 : 0.4)
      // the song's own material always fits the song
      : c.origin === 'extracted' ? 1
      : c.origin === 'trackerSample' || c.origin === 'trackerChannel'
        ? ((req.track.tracker?.confidence ?? 0) >= 0.5 ? 1 : 0.3)
        : (req.genre === 'house' || req.genre === 'techno' || ctx.style === 'electro' ? 0.8 : 0.5),
    gestureCompatibility: !c.gestures || wanted.length === 0 ? 1 : wanted.filter((g) => c.gestures!.includes(g)).length / wanted.length,
    anchorQuality: Math.max(0, Math.min(1, c.anchorQuality)),
    energyFit: 1 - Math.min(1, Math.abs(MATERIAL_ENERGY[c.material] - ctx.energy)),
    novelty: recent.includes(c.key) ? 0 : 1,
    phraseFit: c.durationSec === undefined ? 1 : Math.min(1, barSecOf(ctx) / Math.max(barSecOf(ctx), c.durationSec)),
    vocalCollision: VOICE_MATERIALS.has(c.material) ? ctx.vocalActivity * (role === 'ANSWER' ? 0.3 : 1) : 0,
    bassConflict: c.material === 'bass' && ctx.bassActivity > 0.6 ? 1 : 0,
    repetition: recent.length && recent[recent.length - 1] === c.key ? 1 : 0,
    confidenceRisk: c.origin === 'crate' ? 0 : 1 - Math.max(0, Math.min(1, c.confidence)),
  };
  let score = 0;
  for (const t of SOURCE_TERMS) score += (NEGATIVE.has(t) ? -1 : 1) * SOURCE_WEIGHTS[t] * terms[t];
  return { candidate: c, score, terms };
}

export interface SourceDecision extends SourceScore {
  context: SourceContextKind;
  reasons: string[];
  /** Runner-up (for the decision log). */
  alternative?: SourceScore;
}

/** The best source for the plan, with its terms and reasons; null when nothing qualifies. */
export function selectScratchSource(req: SourceRequest): SourceDecision | null {
  scratchSourceStats.select++;
  const classes = materialAt(req.track, req.deck, req.bar);
  const context = sourceContext(req, classes);
  // a source must be able to perform the phrase (sections 38/39): a record that plays fewer of the
  // planned gestures than the phrase's variety needs would turn it into one gesture (owner report
  // 2026-10-12, "only baby scratches")
  const wanted = new Set(req.gestures.filter((g) => g !== 'drop' && g !== 'dropPhrase'));
  const need = Math.min(MIN_VOCABULARY - 1, wanted.size);
  const all = sourceCandidates(req, classes).filter((c) => !req.blocked?.(c.key));
  const performs = all.filter((c) => !c.gestures || [...wanted].filter((g) => c.gestures!.includes(g)).length >= need);
  const scored = (performs.length ? performs : all)
    .map((c) => {
      const sc = scoreSource(c, req, context);
      const pref = req.preference?.(c) ?? 0;
      return pref ? { ...sc, score: sc.score + pref, memoryPreference: pref } : sc;
    })
    .filter((s) => s.terms.bassConflict === 0)
    .sort((a, b) => b.score - a.score || (a.candidate.key < b.candidate.key ? -1 : 1));
  const best = scored[0];
  if (!best) return null;
  const top = SOURCE_TERMS.filter((t) => !NEGATIVE.has(t)).sort((a, b) => SOURCE_WEIGHTS[b] * best.terms[b] - SOURCE_WEIGHTS[a] * best.terms[a]).slice(0, 3);
  const reasons = [
    `${context}: ${best.candidate.origin} ${best.candidate.material} (${best.candidate.key})`,
    `score ${best.score.toFixed(2)}; strongest ${top.map((t) => `${t} ${best.terms[t].toFixed(2)}`).join(', ')}`,
    ...SOURCE_TERMS.filter((t) => NEGATIVE.has(t) && best.terms[t] > 0).map((t) => `minus ${t} ${best.terms[t].toFixed(2)}`),
    ...(best.memoryPreference ? [`memory ${best.memoryPreference > 0 ? '+' : ''}${best.memoryPreference.toFixed(2)}`] : []),
  ];
  return { ...best, context, reasons, alternative: scored[1] };
}

/** Voice categories, re-exported for tests and the debug view. */
export { VOCAL_CATEGORIES };
export type { ExtractedAnchor };
