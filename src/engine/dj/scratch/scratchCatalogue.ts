/**
 * Scratch record catalogue (owner plan `thoughts/shared/plans/2026-10-08-dj-view-scratch-plan.md`
 * sections 11, 14, 38, 39; Gate C; ledger SCR-P2.1, SCR-P2.2).
 *
 * The Up Rough crate metadata (`scratch_bank_metadata.json`, written by the
 * reference `tools/scratch_bank.py write_metadata`) keyed by canonical name,
 * converted once at module load:
 *   - anchors, safe ranges and word slices from SAMPLES at 22,050 Hz
 *     (SCR-P0.5 probe: the reference analyses at 22,050 Hz, not the file's
 *     44.1 kHz) to SECONDS, so every consumer is sample-rate free;
 *   - `packFile` to the pack URL the voice fetches;
 *   - reference gesture / role / style vocabularies to the section 9 / 83 /
 *     32 ids (gestures through `compatibleGestures`, section 38/39: a
 *     pre-scratched record carries only `drop`).
 *
 * The JSON is a static import (same mechanism as the pack `manifest.json` in
 * `samplePacks.ts`): one source, bundler-checked, synchronous for the planner.
 * The audio is NOT duplicated (section 14): the catalogue points at the pack
 * WAVs the FX pads already use.
 */

import metadata from '../../../../public/data/samples/packs/scratch-originals/scratch_bank_metadata.json';
import { normalizeUrl } from '@utils/urlUtils';
import { SCRATCH_BASE_PATH } from '@/constants/samplePacks';
import type { ScratchAnchor, ScratchDJStyle, ScratchGestureId, ScratchLevel, ScratchRole } from './scratchTypes';
import { compatibleGestures, GESTURE_LEVELS } from './scratchGestureCatalog';

/** The metadata's sample rate (SCR-P0.5: every anchor / range is in samples at this rate). */
export const SCRATCH_METADATA_RATE = 22050;

/** Pack directory under `public/` (the FX pack and the catalogue share it). */
export const SCRATCH_PACK_DIR = SCRATCH_BASE_PATH;

export type ScratchRecordCategory =
  | 'COUNT' | 'YEAH_RESPONSE' | 'AH_VOWEL' | 'FRESH' | 'DJ_COMMAND' | 'SHORT_EXCLAMATION'
  | 'INTRO_ANNOUNCEMENT' | 'LONG_SPECIALTY_PHRASE' | 'HIP_HOP_TAG' | 'FX' | 'LONG_VOWEL_OR_HYPE'
  | 'PRE_RENDERED_SCRATCH';

/** A word inside a phrase record (section 40), seconds into the record. */
export interface ScratchWordSlice {
  name: string;
  start: number;
  end: number;
  vowel: number;
}

/** One crate record (section 14 mapping), every time in seconds. */
export interface ScratchRecord {
  /** Canonical name (`ONE`, `AH_STANDARD`); the `recordId` of a CRATE source. */
  id: string;
  canonicalName: string;
  literalPhrase: string;
  /** Pack file name (`scratch_024.wav`). */
  file: string;
  /** URL the voice fetches. */
  url: string;
  category: ScratchRecordCategory;
  /** Reference role words as written (`intro`, `hook`, `phrase_end`, ...). */
  referenceRoles: readonly string[];
  roles: readonly ScratchRole[];
  styles: readonly ScratchDJStyle[];
  /** Reference gesture ids as written (`forward_stab`, `tear_fwd`, ...). */
  recommendedGestures: readonly string[];
  /** Section 38/39 compatible gesture ids (`drop` only when pre-scratched). */
  gestures: readonly ScratchGestureId[];
  anchors: { attack: number; vowel: number; tail: number };
  safe: readonly [number, number];
  safeForward: readonly [number, number];
  safeReverse: readonly [number, number];
  wordSlices: readonly ScratchWordSlice[];
  /** `source_is_clean`: unscratched vinyl the engine may stroke. */
  clean: boolean;
  /** `source_is_pre_scratched`: a rendered scratch, a one-shot (`drop`) only. */
  preScratched: boolean;
  durationSec: number;
  voicedAmount: number;
  noiseAmount: number;
  onsetRate: number;
  transientCount: number;
  centroidHz: number;
  /** Section 11 anchor the planner hands the executor: home = the vowel centre. */
  anchor: ScratchAnchor;
}

interface RawRecord {
  filename: string;
  canonical_name: string;
  literal_phrase: string;
  category: string;
  source_is_clean: boolean;
  source_is_pre_scratched: boolean;
  recommended_gestures: string[];
  recommended_roles: string[];
  recommended_styles: string[];
  duration_ms: number;
  centroid: number;
  voiced_amount: number;
  noise_amount: number;
  transient_count: number;
  onset_rate: number;
  anchor_attack: number;
  anchor_vowel: number;
  anchor_tail: number;
  safe: number[];
  safe_forward: number[];
  safe_reverse: number[];
  word_slices: Array<{ name: string; start: number; end: number; vowel: number }>;
  packFile: string;
}

/** Reference role word -> section 83 roles (the reference's `scratch_dj` cadence:
 *  a count opens, a hook is the theme, a phrase end fills or closes, a showcase
 *  is the feature, a drop cue / breakdown moves between sections). */
const ROLE_MAP: Readonly<Record<string, readonly ScratchRole[]>> = {
  intro: ['INTRO'],
  count: ['INTRO', 'ACCENT'],
  reconstruction: ['THEME', 'FEATURE'],
  answer: ['ANSWER'],
  hook: ['THEME'],
  phrase_end: ['FILL', 'OUTRO'],
  showcase: ['FEATURE'],
  transition: ['TRANSITION'],
  accent: ['ACCENT'],
  drop_cue: ['INTRO', 'TRANSITION'],
  specialty: ['FEATURE'],
  breakdown: ['TRANSITION', 'INTRO'],
  unknown: [],
};

const STYLE_MAP: Readonly<Record<string, ScratchDJStyle>> = {
  old_school: 'oldSchool', boombap: 'boomBap', electro: 'electro', battle: 'battle', lofi: 'loFi',
};

export function referenceRoleToScratchRoles(role: string): ScratchRole[] {
  return [...(ROLE_MAP[role] ?? [])];
}

export function referenceStyleToScratchStyle(style: string): ScratchDJStyle | undefined {
  return STYLE_MAP[style];
}

const sec = (samples: number): number => samples / SCRATCH_METADATA_RATE;
const range = (r: number[]): readonly [number, number] => [sec(r[0] ?? 0), sec(r[1] ?? 0)];

function convert(raw: RawRecord): ScratchRecord {
  const roles: ScratchRole[] = [];
  for (const ref of raw.recommended_roles) for (const r of referenceRoleToScratchRoles(ref)) if (!roles.includes(r)) roles.push(r);
  const styles: ScratchDJStyle[] = [];
  for (const ref of raw.recommended_styles) { const s = referenceStyleToScratchStyle(ref); if (s && !styles.includes(s)) styles.push(s); }
  const safe = range(raw.safe);
  const safeForward = range(raw.safe_forward);
  const safeReverse = range(raw.safe_reverse);
  const anchors = { attack: sec(raw.anchor_attack), vowel: sec(raw.anchor_vowel), tail: sec(raw.anchor_tail) };
  return {
    id: raw.canonical_name,
    canonicalName: raw.canonical_name,
    literalPhrase: raw.literal_phrase,
    file: raw.packFile,
    url: normalizeUrl(`${SCRATCH_BASE_PATH}/${raw.packFile}`),
    category: raw.category as ScratchRecordCategory,
    referenceRoles: raw.recommended_roles,
    roles,
    styles,
    recommendedGestures: raw.recommended_gestures,
    gestures: compatibleGestures({ recommendedGestures: raw.recommended_gestures, preScratched: raw.source_is_pre_scratched }),
    anchors,
    safe,
    safeForward,
    safeReverse,
    wordSlices: raw.word_slices.map((w) => ({ name: w.name, start: sec(w.start), end: sec(w.end), vowel: sec(w.vowel) })),
    clean: raw.source_is_clean,
    preScratched: raw.source_is_pre_scratched,
    durationSec: raw.duration_ms / 1000,
    voicedAmount: raw.voiced_amount,
    noiseAmount: raw.noise_amount,
    onsetRate: raw.onset_rate,
    transientCount: raw.transient_count,
    centroidHz: raw.centroid,
    anchor: { position: anchors.vowel, safe, safeForward, safeReverse },
  };
}

/** The 50 records, in the metadata's order. */
export const SCRATCH_RECORDS: readonly ScratchRecord[] = Object.values(metadata as unknown as Record<string, RawRecord>).map(convert);

const BY_ID: ReadonlyMap<string, ScratchRecord> = new Map(SCRATCH_RECORDS.map((r) => [r.id, r]));

export function getScratchRecord(id: string): ScratchRecord | undefined {
  return BY_ID.get(id);
}

export const SCRATCH_RECORD_CATEGORIES: readonly ScratchRecordCategory[] = [...new Set(SCRATCH_RECORDS.map((r) => r.category))];

/** Categories that are a voice saying something (a vocal source). */
export const VOCAL_CATEGORIES: readonly ScratchRecordCategory[] = SCRATCH_RECORD_CATEGORIES.filter(
  (c) => c !== 'FX' && c !== 'PRE_RENDERED_SCRATCH',
);

/** Pack files on disk that no record references: FX pack only, never a performer source. */
export function fxOnlyPackFiles(packFilesOnDisk: readonly string[]): string[] {
  const referenced = new Set(SCRATCH_RECORDS.map((r) => r.file));
  return packFilesOnDisk.filter((f) => !referenced.has(f)).sort();
}

// ---------------------------------------------------------------------------
// Query (Gate C: "give me a vocal source suitable for chirp at level 2")
// ---------------------------------------------------------------------------

export interface ScratchRecordQuery {
  role?: ScratchRole;
  category?: ScratchRecordCategory;
  gesture?: ScratchGestureId;
  style?: ScratchDJStyle;
  /** Level cap (section 31): the gesture asked for must sit at or below it. */
  level?: ScratchLevel;
  clean?: boolean;
  /** Only vocal categories (`VOCAL_CATEGORIES`). */
  vocal?: boolean;
  /** Recently used record ids (section 25/26 rotation): each appearance costs 0.5. */
  recent?: readonly string[];
}

/** Repetition cost per appearance in `recent`. */
export const REPETITION_PENALTY = 0.5;

/** roleFit + styleFit + gestureFit + anchorQuality (voiced amount) - repetition. */
export function scoreRecord(record: ScratchRecord, q: ScratchRecordQuery): number {
  const roleFit = q.role ? (record.roles.includes(q.role) ? 1 : 0) : 0;
  const styleFit = q.style ? (record.styles.includes(q.style) ? 1 : 0) : 0;
  const gestureFit = q.gesture ? (record.gestures.includes(q.gesture) ? 1 : 0) : 0;
  const anchorQuality = record.voicedAmount;
  const repetition = (q.recent ?? []).filter((id) => id === record.id).length * REPETITION_PENALTY;
  return roleFit + styleFit + gestureFit + anchorQuality - repetition;
}

/** Hard filters, then the score, then voiced amount, then id (deterministic). */
export function findRecords(q: ScratchRecordQuery = {}): ScratchRecord[] {
  if (q.gesture && q.level !== undefined && GESTURE_LEVELS[q.gesture] > q.level) return [];
  const hits = SCRATCH_RECORDS.filter((r) => {
    if (q.category && r.category !== q.category) return false;
    if (q.clean !== undefined && r.clean !== q.clean) return false;
    if (q.vocal && !VOCAL_CATEGORIES.includes(r.category)) return false;
    if (q.gesture && !r.gestures.includes(q.gesture)) return false;
    return true;
  });
  return hits
    .map((r) => ({ r, s: scoreRecord(r, q) }))
    .sort((a, b) => b.s - a.s || b.r.voicedAmount - a.r.voicedAmount || (a.r.id < b.r.id ? -1 : a.r.id > b.r.id ? 1 : 0))
    .map((x) => x.r);
}
