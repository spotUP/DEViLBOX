/**
 * IPA phoneme → Pink Trombone vocal tract parameter mapping.
 *
 * Values are in 0-1 normalized space (matching PinkTromboneConfig).
 * Derived from articulatory phonetics: tongue position/height maps to
 * the IPA vowel quadrilateral, consonants use constriction point + diameter.
 */

export interface TractShape {
  tongueIndex: number;       // 0-1: back → front
  tongueDiameter: number;    // 0-1: open (low) → closed (high)
  lipDiameter: number;       // 0-1: closed → open
  velum: number;             // 0-1: closed → nasal
  constrictionIndex: number; // 0-1: back → front
  constrictionDiameter: number; // 0-1: tight → open
  tenseness: number;         // 0-1: breathy → tense
  durationMs: number;        // how long this phoneme lasts
  isVoiced: boolean;         // whether glottis should vibrate
}

// Default open tract (schwa-like neutral position)
const NEUTRAL: TractShape = {
  tongueIndex: 0.29, tongueDiameter: 0.38,
  lipDiameter: 0.5, velum: 0,
  constrictionIndex: 0.5, constrictionDiameter: 1,
  tenseness: 0.6, durationMs: 80, isVoiced: true,
};

function vowel(tongueIndex: number, tongueDiameter: number, lipDiameter: number, durationMs = 100): TractShape {
  return { ...NEUTRAL, tongueIndex, tongueDiameter, lipDiameter, durationMs, constrictionDiameter: 1 };
}

function consonant(constrictionIndex: number, constrictionDiameter: number, voiced: boolean, durationMs = 60, overrides?: Partial<TractShape>): TractShape {
  return { ...NEUTRAL, constrictionIndex, constrictionDiameter, tenseness: voiced ? 0.6 : 0.4, durationMs, isVoiced: voiced, ...overrides };
}

function nasal(constrictionIndex: number, durationMs = 70): TractShape {
  return { ...NEUTRAL, constrictionIndex, constrictionDiameter: 0, velum: 0.8, durationMs, isVoiced: true };
}

/**
 * SAM phoneme code → tract shape.
 * Uses SAM codes (from EspeakNG.ts IPA_TO_SAM mapping) as the key
 * since that's what parseEspeakIPA() outputs.
 */
export const PHONEME_TRACT_MAP: Record<string, TractShape> = {
  // ── Vowels ──────────────────────────────────────────────
  // IPA vowel quadrilateral mapped to tongue position (front-back) and height (open-close)
  'IY': vowel(0.71, 0.10, 0.47, 100),  // iː — high front (beet)
  'IH': vowel(0.64, 0.17, 0.50, 80),   // ɪ — near-high front (bit)
  'EH': vowel(0.57, 0.38, 0.55, 90),   // ɛ — mid front (bet)
  'AE': vowel(0.43, 0.72, 0.65, 100),  // æ — near-low front (bat)
  'AA': vowel(0.14, 0.76, 0.60, 110),  // ɑ — low back (father)
  'AH': vowel(0.29, 0.55, 0.55, 90),   // ʌ — mid central (but)
  'AO': vowel(0.11, 0.62, 0.35, 100),  // ɔ — mid-low back rounded (bought)
  'UH': vowel(0.18, 0.17, 0.30, 80),   // ʊ — near-high back (book)
  'UX': vowel(0.07, 0.10, 0.20, 100),  // uː — high back rounded (boot)
  'AX': vowel(0.29, 0.38, 0.50, 70),   // ə — schwa (about)
  'ER': vowel(0.32, 0.35, 0.40, 100),  // ɜ — r-colored mid (bird)

  // ── Diphthongs (use midpoint, sequencer will interpolate) ──
  'EY': vowel(0.57, 0.30, 0.52, 130),  // eɪ — (bay)
  'AY': vowel(0.36, 0.55, 0.58, 140),  // aɪ — (buy)
  'OY': vowel(0.21, 0.45, 0.30, 140),  // ɔɪ — (boy)
  'AW': vowel(0.21, 0.55, 0.40, 140),  // aʊ — (how)
  'OW': vowel(0.14, 0.38, 0.30, 130),  // oʊ — (go)

  // ── Stops ───────────────────────────────────────────────
  'P*': consonant(0.90, 0, false, 50),    // p — bilabial stop
  'B*': consonant(0.90, 0, true, 50),     // b — voiced bilabial
  'T*': consonant(0.74, 0, false, 50),    // t — alveolar stop
  'D*': consonant(0.74, 0, true, 50),     // d — voiced alveolar
  'K*': consonant(0.36, 0, false, 50),    // k — velar stop
  'G*': consonant(0.36, 0, true, 50),     // g — voiced velar
  'Q*': consonant(0.05, 0, false, 30),    // ʔ — glottal stop

  // ── Fricatives ──────────────────────────────────────────
  'F*': consonant(0.90, 0.15, false, 70),  // f — labiodental
  'V*': consonant(0.90, 0.15, true, 60),   // v — voiced labiodental
  'TH': consonant(0.81, 0.15, false, 80),  // θ — dental
  'DH': consonant(0.81, 0.15, true, 50),   // ð — voiced dental
  'S*': consonant(0.74, 0.12, false, 80),  // s — alveolar
  'Z*': consonant(0.74, 0.12, true, 70),   // z — voiced alveolar
  'SH': consonant(0.67, 0.15, false, 80),  // ʃ — post-alveolar
  'ZH': consonant(0.67, 0.15, true, 70),   // ʒ — voiced post-alveolar
  '/H': consonant(0.10, 0.6, false, 60, { tenseness: 0.15 }),  // h — glottal fricative (breathy)

  // ── Affricates ──────────────────────────────────────────
  'CH': consonant(0.67, 0.08, false, 90),  // tʃ
  'J*': consonant(0.67, 0.08, true, 80),   // dʒ

  // ── Nasals ──────────────────────────────────────────────
  'M*': nasal(0.90, 70),   // m — bilabial nasal
  'N*': nasal(0.74, 60),   // n — alveolar nasal
  'NX': nasal(0.36, 70),   // ŋ — velar nasal

  // ── Liquids / Glides ────────────────────────────────────
  'L*': consonant(0.74, 0.25, true, 60, { tongueIndex: 0.60, tongueDiameter: 0.20 }),
  'R*': consonant(0.67, 0.30, true, 60, { tongueIndex: 0.50, tongueDiameter: 0.25 }),
  'W*': consonant(0.07, 0.35, true, 50, { lipDiameter: 0.15 }),  // rounded glide
  'Y*': consonant(0.71, 0.30, true, 50),  // palatal glide
  'DX': consonant(0.74, 0.10, true, 30),  // flap

  // ── Silence / Pause ─────────────────────────────────────
  ' ':  { ...NEUTRAL, tenseness: 0, durationMs: 120, isVoiced: false, constrictionDiameter: 1 },
};

/**
 * Get tract shape for a SAM phoneme code.
 * Falls back to schwa for unknown codes.
 */
export function getTractShape(samCode: string): TractShape {
  return PHONEME_TRACT_MAP[samCode] || NEUTRAL;
}
