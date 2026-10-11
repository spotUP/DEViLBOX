/**
 * Levels, style palettes, genre hints and BPM suitability (owner plan
 * sections 31, 32, 33, 34; ledger SCR-P1.6 - P1.9). Data and pure functions;
 * nothing here is wired into the Auto DJ (section 32: configurable, not
 * hard-coded into Auto DJ).
 *
 * Numbers and their sources:
 * - levels: section 31 (`GESTURE_LEVELS` in the catalogue);
 * - palettes: section 32 (preferred gestures, "low / medium / higher / high"
 *   density) with the reference `PROFILES[...].scale` ladder for the
 *   density numbers (old_school 0.6, boombap 0.8, electro 1.1, battle 1.4,
 *   lofi 0.35) mapped through one ladder to 0.5 / 0.6 / 0.75 / 1.0 / 0.35;
 *   fx amount from the reference FX presets (boom bap dry 0.1, electro 0.5,
 *   battle 0.25, lo-fi 0.05, old school 0);
 * - genre hints: section 33 lists the dimensions a genre may move
 *   (vocabulary, density, duration, FX, difficulty, phrase length, rests)
 *   and says it never dictates alone; the multipliers below are this
 *   implementation's defaults (the owner plan gives none);
 * - BPM suitability: section 34 (soft factors, no prohibition).
 */

import type { GenreAnalysis, DJStyleName } from '../autodj/types';
import type { ScratchDJStyle, ScratchGesture, ScratchGestureId, ScratchLevel } from './scratchTypes';
import { GESTURE_LEVELS, SCRATCH_GESTURES, getGesture } from './scratchGestureCatalog';

export { GESTURE_LEVELS };

/** Section 62 Auto Scratch modes; the level each may reach. */
export type ScratchMode = 'OFF' | 'SAFE' | 'MUSICAL' | 'PERFORMER' | 'BATTLE';

export const MODE_MAX_LEVEL: Readonly<Record<ScratchMode, ScratchLevel | 0>> = {
  OFF: 0, SAFE: 1, MUSICAL: 2, PERFORMER: 3, BATTLE: 4,
};

export interface ScratchStylePalette {
  id: ScratchDJStyle;
  name: string;
  maxLevel: ScratchLevel;
  /** Multiplier on the density state rate (section 22). */
  densityScale: number;
  /** Preferred gestures; empty = no bias (battle). */
  bias: readonly ScratchGestureId[];
  /** 0..1 FX amount (delay / reverb ambience, section 43). */
  fxAmount: number;
  /** Multiplier on the rest probability (section 23). */
  restScale: number;
}

export const SCRATCH_STYLES: Readonly<Record<ScratchDJStyle, ScratchStylePalette>> = {
  oldSchool: {
    id: 'oldSchool', name: 'Old School', maxLevel: 2, densityScale: 0.5,
    bias: ['baby', 'forwardStab', 'drag', 'chirp'], fxAmount: 0, restScale: 1.2,
  },
  boomBap: {
    id: 'boomBap', name: 'Boom Bap', maxLevel: 3, densityScale: 0.6,
    bias: ['forwardStab', 'baby', 'chirp', 'tearForward'], fxAmount: 0.1, restScale: 1.0,
  },
  electro: {
    id: 'electro', name: 'Electro', maxLevel: 4, densityScale: 0.75,
    bias: ['transformer8', 'flare1', 'chirp'], fxAmount: 0.5, restScale: 0.9,
  },
  battle: {
    id: 'battle', name: 'Battle', maxLevel: 4, densityScale: 1.0,
    bias: [], fxAmount: 0.25, restScale: 0.7,
  },
  loFi: {
    id: 'loFi', name: 'Lo-Fi', maxLevel: 2, densityScale: 0.35,
    bias: ['drag', 'babySlow', 'chirp'], fxAmount: 0.05, restScale: 1.4,
  },
};

/** Section 31/62: the level a mode and a style together allow. */
export function maxLevelFor(mode: ScratchMode, style: ScratchDJStyle): ScratchLevel | 0 {
  return Math.min(MODE_MAX_LEVEL[mode], SCRATCH_STYLES[style].maxLevel) as ScratchLevel | 0;
}

/** Gestures a style may play: within its level, biased ones first (ranked
 *  by the palette), the rest in catalogue order. */
export function styleVocabulary(style: ScratchDJStyle, mode: ScratchMode = 'BATTLE'): ScratchGestureId[] {
  const cap = maxLevelFor(mode, style);
  const palette = SCRATCH_STYLES[style];
  const allowed = SCRATCH_GESTURES.filter((g) => g.difficulty <= cap).map((g) => g.id);
  const biased = palette.bias.filter((id) => allowed.includes(id));
  return [...biased, ...allowed.filter((id) => !biased.includes(id))];
}

// ── Section 33 genre hints ─────────────────────────────────────────────────

export type ScratchGenreHint =
  | 'hipHop' | 'breakbeat' | 'electro' | 'house' | 'techno' | 'drumAndBass' | 'jungle'
  | 'downtempo' | 'experimental';

export interface ScratchGenreModifiers {
  densityScale: number;
  /** Phrase length in bars the planner works in. */
  phraseBars: number;
  fxScale: number;
  restScale: number;
  /** Difficulty cap (section 33 "allowed difficulty"); 4 = no cap. */
  levelCap: ScratchLevel;
  /** Longest gesture in 16th steps; undefined = no cap. */
  durationCapSteps?: number;
  /** Extra vocabulary bias on top of the palette's. */
  bias: readonly ScratchGestureId[];
}

export interface ScratchStyleChoice {
  style: ScratchDJStyle;
  genre: ScratchGenreHint | 'unknown';
  modifiers: ScratchGenreModifiers;
}

const NEUTRAL: ScratchGenreModifiers = { densityScale: 1, phraseBars: 4, fxScale: 1, restScale: 1, levelCap: 4, bias: [] };

const GENRE_TABLE: Readonly<Record<ScratchGenreHint, { style: ScratchDJStyle; modifiers: Partial<ScratchGenreModifiers> }>> = {
  hipHop:      { style: 'boomBap', modifiers: {} },
  breakbeat:   { style: 'boomBap', modifiers: { densityScale: 1.1, levelCap: 3 } },
  electro:     { style: 'electro', modifiers: {} },
  // four-on-the-floor: half the density, rhythmic cuts on the grid
  house:       { style: 'electro', modifiers: { densityScale: 0.5, phraseBars: 8, bias: ['transformer4', 'transformer8'] } },
  techno:      { style: 'electro', modifiers: { densityScale: 0.4, phraseBars: 8, restScale: 1.3, levelCap: 3, durationCapSteps: 2 } },
  // very high BPM (section 34): short gestures only, fewer of them
  drumAndBass: { style: 'electro', modifiers: { densityScale: 0.6, fxScale: 0.8, levelCap: 3, durationCapSteps: 2 } },
  jungle:      { style: 'boomBap', modifiers: { densityScale: 0.8, levelCap: 3, durationCapSteps: 2 } },
  downtempo:   { style: 'loFi', modifiers: { phraseBars: 8 } },
  experimental:{ style: 'battle', modifiers: { densityScale: 0.5, restScale: 1.2 } },
};

/** Auto DJ style names (styleProfiles) -> palette, when no genre is known. */
const DJ_STYLE_TABLE: Readonly<Record<DJStyleName, ScratchDJStyle>> = {
  Smooth: 'loFi', Club: 'boomBap', Aggressive: 'battle', Dub: 'oldSchool', Progressive: 'electro',
  Classic: 'oldSchool', Experimental: 'battle', Minimal: 'loFi', Festival: 'electro', Radio: 'boomBap',
};

const GENRE_KEYWORDS: ReadonlyArray<readonly [RegExp, ScratchGenreHint]> = [
  [/drum\s*(and|&|n)?\s*bass|\bdnb\b|neurofunk|liquid/i, 'drumAndBass'],
  [/jungle|ragga/i, 'jungle'],
  [/break\s*beat|breaks|big\s*beat|nu\s*skool/i, 'breakbeat'],
  [/hip\s*hop|boom\s*bap|\brap\b|trap|g[- ]?funk/i, 'hipHop'],
  [/electro(?!nic)|miami\s*bass|freestyle/i, 'electro'],
  [/techno|minimal|industrial|hardcore|gabber/i, 'techno'],
  [/house|garage|disco/i, 'house'],
  [/down\s*tempo|trip\s*hop|chill|ambient|lo[- ]?fi|dub\b/i, 'downtempo'],
  [/experimental|idm|glitch|abstract|noise/i, 'experimental'],
  [/electronic|edm|dance/i, 'electro'],
];

export function genreHintFrom(text: string): ScratchGenreHint | undefined {
  for (const [re, hint] of GENRE_KEYWORDS) if (re.test(text)) return hint;
  return undefined;
}

/**
 * Section 33: the palette and the modifiers a genre suggests. Accepts a
 * genre hint id, a `GenreAnalysis` (subgenre first, then primary), or an
 * Auto DJ style name. Unknown input = Boom Bap, unchanged.
 */
export function genreToScratchStyle(genre: GenreAnalysis | DJStyleName | ScratchGenreHint | string | undefined): ScratchStyleChoice {
  let hint: ScratchGenreHint | undefined;
  if (genre && typeof genre === 'object') {
    hint = genreHintFrom(genre.subgenre ?? '') ?? genreHintFrom(genre.primary ?? '');
  } else if (typeof genre === 'string') {
    if (genre in GENRE_TABLE) hint = genre as ScratchGenreHint;
    else if (genre in DJ_STYLE_TABLE) return { style: DJ_STYLE_TABLE[genre as DJStyleName], genre: 'unknown', modifiers: { ...NEUTRAL } };
    else hint = genreHintFrom(genre);
  }
  if (!hint) return { style: 'boomBap', genre: 'unknown', modifiers: { ...NEUTRAL } };
  const row = GENRE_TABLE[hint];
  return { style: row.style, genre: hint, modifiers: { ...NEUTRAL, ...row.modifiers } };
}

// ── Section 34 BPM-aware suitability ───────────────────────────────────────

/** `longGestureSteps`: longer than one beat (a gesture's steps are its real stroke length since SA-B2;
 *  most strokes are one beat, so "long" is what does not fit a beat at speed: drag, tweak). */
export const BPM_SUITABILITY = {
  fastBpm: 160, slowBpm: 85,
  longGestureAtFast: 0.3, longGestureSteps: 5, busyHandAtFast: 0.6, slowFavouriteAtSlow: 1.2,
} as const;

const BUSY_HAND: ReadonlySet<ScratchGestureId> = new Set(['crab', 'scribble', 'eightFingerCrab', 'uzi']);
const SLOW_FAVOURITES: ReadonlySet<ScratchGestureId> = new Set(['baby', 'babySlow', 'drag', 'chirp']);

/**
 * 0..1.2 technique suitability at a tempo (section 34): a soft factor the
 * planner multiplies into its pick, never a prohibition. Only a
 * `recommendedBpm` violation returns 0.
 */
export function gestureSuitability(gesture: ScratchGesture | ScratchGestureId, bpm: number): number {
  const g = typeof gesture === 'string' ? getGesture(gesture) : gesture;
  if (g.recommendedBpm) {
    if (g.recommendedBpm.min !== undefined && bpm < g.recommendedBpm.min) return 0;
    if (g.recommendedBpm.max !== undefined && bpm > g.recommendedBpm.max) return 0;
  }
  let s = 1;
  if (bpm >= BPM_SUITABILITY.fastBpm) {
    if (g.durationSteps >= BPM_SUITABILITY.longGestureSteps) s *= BPM_SUITABILITY.longGestureAtFast;
    if (BUSY_HAND.has(g.id)) s *= BPM_SUITABILITY.busyHandAtFast;
  } else if (bpm <= BPM_SUITABILITY.slowBpm) {
    if (SLOW_FAVOURITES.has(g.id)) s *= BPM_SUITABILITY.slowFavouriteAtSlow;
  }
  return s;
}

/** Section 34 "slow BPM: longer phrases": the phrase length the tempo allows. */
export function phraseBarsFor(bpm: number, base = 4): number {
  return bpm <= BPM_SUITABILITY.slowBpm ? base * 2 : base;
}
