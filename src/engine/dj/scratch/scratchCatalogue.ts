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
  /** The demo bank's own file name (`aaaaah.wav`): its load order (`scratch_bank.load_bank`) is the crate's. */
  sourceFile: string;
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
  /** The demo's cue source (`entry["source"]`), in samples at 22,050 Hz: the vowel anchor and the safe range. */
  demoCue: { anchor: number; safe: readonly [number, number] };
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
    sourceFile: raw.filename,
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
    demoCue: { anchor: raw.anchor_vowel, safe: [raw.safe[0] ?? 0, raw.safe[1] ?? 0] },
  };
}

/** The 51 records, in the metadata's order (AH_LONG last, SCR-PG-A1). */
export const SCRATCH_RECORDS: readonly ScratchRecord[] = Object.values(metadata as unknown as Record<string, RawRecord>).map(convert);

/**
 * The crate in the demo bank's load order (`scratch_bank.load_bank`: sorted file names) - the order
 * the demo's record pools and record sets list records in (SCR-PHRASING-PARITY).
 */
export const CRATE_LOAD_ORDER: readonly ScratchRecord[] = [...SCRATCH_RECORDS].sort((a, b) => (a.sourceFile < b.sourceFile ? -1 : a.sourceFile > b.sourceFile ? 1 : 0));

/** scratch.py `_SOURCE_NAMES`: the seven synthesized sources (their audio is R6, `build_sources`). */
export const SYNTH_SOURCE_NAMES: readonly string[] = ['vocal_ah', 'vocal_fresh', 'vocal_yeah', 'robot', 'horn', 'snare', 'noise'];

/** The bank's canonical names, sorted (`sorted(bank_index())`). */
const BANK_NAMES: readonly string[] = SCRATCH_RECORDS.map((r) => r.id).sort();

/** scratch.py `all_source_names`: every selectable record - the synthesized sources first, then the bank. */
export const ALL_SOURCE_NAMES: readonly string[] = [...SYNTH_SOURCE_NAMES, ...BANK_NAMES];

/**
 * scratch.py `record_set(sel)` (R8): the "Records" bulk selector as a list of source names - 'style' (or none)
 * null (the profile's own pool), 'all', 'synth', 'bank', 'clean', 'pre_scratched', 'cat:<category>', 'off' [].
 * An unknown selector is null, as in the demo.
 */
export function recordSet(sel: string | null | undefined): string[] | null {
  if (!sel || sel === 'style') return null;
  if (sel === 'off') return [];
  if (sel === 'all') return [...ALL_SOURCE_NAMES];
  if (sel === 'synth') return [...SYNTH_SOURCE_NAMES];
  if (sel === 'bank') return [...BANK_NAMES];
  if (sel === 'clean' || sel === 'pre_scratched') {
    const wantPre = sel === 'pre_scratched';
    return SCRATCH_RECORDS.filter((r) => (r.category === 'PRE_RENDERED_SCRATCH') === wantPre).map((r) => r.id).sort();
  }
  if (sel.startsWith('cat:')) {
    const cat = sel.slice(4).toUpperCase();
    return SCRATCH_RECORDS.filter((r) => r.category.toUpperCase() === cat).map((r) => r.id).sort();
  }
  return null;
}

/** scratch.py `record_set_choices`: the selector's choices, one per bank category. */
export function recordSetChoices(): string[] {
  const cats = [...new Set(SCRATCH_RECORDS.map((r) => r.category.toLowerCase()))].sort();
  return ['style', 'all', 'synth', 'bank', 'clean', 'pre_scratched', ...cats.map((c) => `cat:${c}`), 'off'];
}

/** `pick_source`'s pool for a checked record set: `all_source_names()` order, the checked ones only. */
export function sourcePool(allowed: readonly string[]): string[] {
  const want = new Set(allowed);
  return ALL_SOURCE_NAMES.filter((n) => want.has(n));
}

/** The demo's `record_set('clean')`: the canonical names of every record that is not pre-scratched, sorted. */
export const CLEAN_CRATE_POOL: readonly string[] = recordSet('clean')!;

/**
 * The Auto Scratch "Records" setting (R8) as the checked records: a list (the per-record boxes, which override
 * the bulk control in the demo) or a `record_set` selector; null = 'style' (the demo's default: the overlay's
 * profile pool of synthesized sources - the clean crate stands in until R6 - and three_deck's whole bank).
 */
export function scratchRecordsFor(setting: string | readonly string[] | null | undefined): readonly string[] | null {
  if (Array.isArray(setting)) return setting as readonly string[];
  return recordSet(setting as string | null | undefined);
}

/** The demo routine's four cue roles (scratch_dj.py s.22). */
export type CueRole = 'HOME' | 'SECONDARY' | 'ACCENT' | 'FX';

/** `scratch_dj._ROLE_CATEGORIES`: each cue role draws from a family of bank categories. */
export const CUE_ROLE_CATEGORIES: Readonly<Record<CueRole, readonly ScratchRecordCategory[]>> = {
  HOME: ['AH_VOWEL', 'LONG_VOWEL_OR_HYPE'],
  SECONDARY: ['FRESH', 'DJ_COMMAND'],
  ACCENT: ['YEAH_RESPONSE', 'SHORT_EXCLAMATION', 'HIP_HOP_TAG'],
  FX: ['FX', 'COUNT', 'INTRO_ANNOUNCEMENT', 'PRE_RENDERED_SCRATCH', 'LONG_SPECIALTY_PHRASE'],
};

/** `scratch_dj.cue_pools_from_bank`: per cue role, every record of its categories, in the bank's load order. */
export const CUE_ROLE_POOLS: Readonly<Record<CueRole, readonly string[]>> = {
  HOME: rolePool('HOME'), SECONDARY: rolePool('SECONDARY'), ACCENT: rolePool('ACCENT'), FX: rolePool('FX'),
};

function rolePool(role: CueRole): string[] {
  return CRATE_LOAD_ORDER.filter((r) => CUE_ROLE_CATEGORIES[role].includes(r.category)).map((r) => r.id);
}

/**
 * `scratch_dj.cue_pools_from_bank` over a narrowed crate (three_deck's `allowed_records`, R8): per cue role the
 * checked records of its categories in the bank's load order; a role none of them fills takes the role's single
 * cue (`cues_from_bank`: its mapped record if checked, else the first checked record).
 */
export function cuePoolsFor(ids: readonly string[]): Record<CueRole, readonly string[]> {
  const want = new Set(ids);
  const bank = CRATE_LOAD_ORDER.filter((r) => want.has(r.id));
  const out = {} as Record<CueRole, readonly string[]>;
  for (const role of ['HOME', 'SECONDARY', 'ACCENT', 'FX'] as const) {
    const pool = bank.filter((r) => CUE_ROLE_CATEGORIES[role].includes(r.category)).map((r) => r.id);
    const single = want.has(CUE_ROLE_RECORD[role]) ? CUE_ROLE_RECORD[role] : bank[0]?.id;
    out[role] = pool.length ? pool : single ? [single] : [];
  }
  return out;
}

/**
 * `scratch_bank.word_source` (the last word: the one a turntablist chops) in the demo bank's samples: the slice's
 * start and end and its vowel re-based onto the slice and clamped; null without slices or under two samples.
 */
export function lastWordSlice(record: ScratchRecord, rate = 22050): { start: number; end: number; vowel: number } | null {
  const w = record.wordSlices[record.wordSlices.length - 1];
  if (!w) return null;
  const start = Math.round(w.start * rate), end = Math.round(w.end * rate);
  if (end - start < 2) return null;
  return { start, end, vowel: Math.min(Math.max(Math.round(w.vowel * rate) - start, 0), end - start - 1) };
}

/** `scratch_dj.cues_with_word_emphasis`: a crate narrowed to ONE record with word slices plays statement and chop. */
export function wordEmphasisRecord(ids: readonly string[]): string | null {
  if (ids.length !== 1) return null;
  const r = getScratchRecord(ids[0]!);
  return r && lastWordSlice(r) ? r.id : null;
}

/** `scratch_dj.cues_from_bank`: the single record per cue role the 32-bar showcase scratches. */
export const CUE_ROLE_RECORD: Readonly<Record<CueRole, string>> = { HOME: 'AH_STANDARD', SECONDARY: 'FRESH_STANDARD', ACCENT: 'YEAH_STANDARD', FX: 'LASER_FX' };

const BY_ID: ReadonlyMap<string, ScratchRecord> = new Map(SCRATCH_RECORDS.map((r) => [r.id, r]));

/** Records that are not in the crate (a tracker deck's samples, a phrase dropped on Deck C), registered by the pool. */
const EXTRA = new Map<string, ScratchRecord>();

/** A crate record, or a registered extra one: the one lookup every reader of a record id uses. */
export function getScratchRecord(id: string): ScratchRecord | undefined {
  return BY_ID.get(id) ?? EXTRA.get(id);
}

/** Make a record outside the crate known by its id (`ScratchVoicePool.registerTransientRecord`). */
export function registerExtraRecord(record: ScratchRecord): void {
  if (!BY_ID.has(record.id)) EXTRA.set(record.id, record);
}

/** Forget the extra records whose id starts with `prefix`. */
export function forgetExtraRecords(prefix: string): void {
  for (const id of [...EXTRA.keys()]) if (id.startsWith(prefix)) EXTRA.delete(id);
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
