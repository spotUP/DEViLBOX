/**
 * DJKeyUtils — Musical key utilities for DJ mixing
 *
 * Converts between standard key names (e.g. "C major") and Camelot wheel
 * notation (e.g. "8B"), and computes key compatibility for harmonic mixing.
 *
 * Camelot Wheel:
 *   Inner ring (A) = minor keys
 *   Outer ring (B) = major keys
 *   Adjacent numbers = compatible (perfect 5th)
 *   Same number A↔B = relative major/minor (compatible)
 *
 * Compatible transitions:
 *   Same key (8B → 8B)
 *   +1 semitone on wheel (8B → 9B)  — energy boost
 *   -1 semitone on wheel (8B → 7B)  — energy drop
 *   Relative major/minor (8B → 8A)  — mood change
 */

export interface CamelotKey {
  number: number;   // 1-12
  letter: 'A' | 'B';  // A = minor, B = major
  display: string;  // e.g. "8B"
}

// ── Mapping tables ───────────────────────────────────────────────────────────

// Standard key name → Camelot notation
const KEY_TO_CAMELOT: Record<string, CamelotKey> = {
  // Minor keys (A ring)
  'A minor':       { number: 8,  letter: 'A', display: '8A' },
  'E minor':       { number: 9,  letter: 'A', display: '9A' },
  'B minor':       { number: 10, letter: 'A', display: '10A' },
  'F# minor':      { number: 11, letter: 'A', display: '11A' },
  'Db minor':      { number: 12, letter: 'A', display: '12A' },
  'C# minor':      { number: 12, letter: 'A', display: '12A' },
  'Ab minor':      { number: 1,  letter: 'A', display: '1A' },
  'G# minor':      { number: 1,  letter: 'A', display: '1A' },
  'Eb minor':      { number: 2,  letter: 'A', display: '2A' },
  'D# minor':      { number: 2,  letter: 'A', display: '2A' },
  'Bb minor':      { number: 3,  letter: 'A', display: '3A' },
  'A# minor':      { number: 3,  letter: 'A', display: '3A' },
  'F minor':       { number: 4,  letter: 'A', display: '4A' },
  'C minor':       { number: 5,  letter: 'A', display: '5A' },
  'G minor':       { number: 6,  letter: 'A', display: '6A' },
  'D minor':       { number: 7,  letter: 'A', display: '7A' },

  // Major keys (B ring)
  'C major':       { number: 8,  letter: 'B', display: '8B' },
  'G major':       { number: 9,  letter: 'B', display: '9B' },
  'D major':       { number: 10, letter: 'B', display: '10B' },
  'A major':       { number: 11, letter: 'B', display: '11B' },
  'E major':       { number: 12, letter: 'B', display: '12B' },
  'B major':       { number: 1,  letter: 'B', display: '1B' },
  'Cb major':      { number: 1,  letter: 'B', display: '1B' },
  'F# major':      { number: 2,  letter: 'B', display: '2B' },
  'Gb major':      { number: 2,  letter: 'B', display: '2B' },
  'Db major':      { number: 3,  letter: 'B', display: '3B' },
  'C# major':      { number: 3,  letter: 'B', display: '3B' },
  'Ab major':      { number: 4,  letter: 'B', display: '4B' },
  'G# major':      { number: 4,  letter: 'B', display: '4B' },
  'Eb major':      { number: 5,  letter: 'B', display: '5B' },
  'D# major':      { number: 5,  letter: 'B', display: '5B' },
  'Bb major':      { number: 6,  letter: 'B', display: '6B' },
  'A# major':      { number: 6,  letter: 'B', display: '6B' },
  'F major':       { number: 7,  letter: 'B', display: '7B' },
};

// Reverse lookup: Camelot display → standard key name (canonical)
const CAMELOT_TO_KEY: Record<string, string> = {
  '1A': 'Ab minor', '2A': 'Eb minor', '3A': 'Bb minor', '4A': 'F minor',
  '5A': 'C minor',  '6A': 'G minor',  '7A': 'D minor',  '8A': 'A minor',
  '9A': 'E minor', '10A': 'B minor', '11A': 'F# minor', '12A': 'Db minor',
  '1B': 'B major',  '2B': 'F# major', '3B': 'Db major',  '4B': 'Ab major',
  '5B': 'Eb major', '6B': 'Bb major', '7B': 'F major',   '8B': 'C major',
  '9B': 'G major', '10B': 'D major', '11B': 'A major', '12B': 'E major',
};

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Convert a key string (e.g. "C major", "Am", "Cmaj") to Camelot notation.
 * Returns null if the key can't be parsed.
 */
export function toCamelot(keyStr: string | null | undefined): CamelotKey | null {
  if (!keyStr) return null;

  // Try direct lookup first
  const direct = KEY_TO_CAMELOT[keyStr];
  if (direct) return direct;

  // Normalize: "Am" → "A minor", "Cmaj" → "C major", "C#m" → "C# minor"
  const normalized = normalizeKeyName(keyStr);
  if (normalized) {
    const found = KEY_TO_CAMELOT[normalized];
    if (found) return found;
  }

  // Try parsing as Camelot notation directly (e.g. "8B", "11A")
  const camelotMatch = keyStr.match(/^(\d{1,2})([ABab])$/);
  if (camelotMatch) {
    const num = parseInt(camelotMatch[1]);
    const letter = camelotMatch[2].toUpperCase() as 'A' | 'B';
    if (num >= 1 && num <= 12) {
      return { number: num, letter, display: `${num}${letter}` };
    }
  }

  return null;
}

/**
 * Get the Camelot wheel display string for a key.
 * Returns '—' if the key can't be parsed.
 */
export function camelotDisplay(keyStr: string | null | undefined): string {
  const c = toCamelot(keyStr);
  return c ? c.display : '—';
}

/**
 * Check if two keys are compatible for harmonic mixing.
 * Returns a compatibility rating:
 *   'perfect'    — same key
 *   'compatible' — adjacent on Camelot wheel (±1 or relative maj/min)
 *   'clash'      — not harmonically compatible
 */
export function keyCompatibility(
  key1: string | null | undefined,
  key2: string | null | undefined,
): 'perfect' | 'compatible' | 'energy-boost' | 'energy-drop' | 'mood-change' | 'clash' {
  const c1 = toCamelot(key1);
  const c2 = toCamelot(key2);
  if (!c1 || !c2) return 'clash';

  // Same key
  if (c1.number === c2.number && c1.letter === c2.letter) return 'perfect';

  // Relative major/minor (same number, different letter)
  if (c1.number === c2.number && c1.letter !== c2.letter) return 'mood-change';

  // Adjacent numbers, same letter (energy transitions)
  if (c1.letter === c2.letter) {
    const diff = ((c2.number - c1.number + 12) % 12);
    if (diff === 1) return 'energy-boost';
    if (diff === 11) return 'energy-drop';    // -1 mod 12
  }

  return 'clash';
}

/**
 * Get the color to display for a key compatibility result.
 */
export function keyCompatibilityColor(compat: ReturnType<typeof keyCompatibility>): string {
  switch (compat) {
    case 'perfect':      return '#22c55e'; // green-500
    case 'compatible':   return '#22c55e'; // green-500
    case 'energy-boost': return '#3b82f6'; // blue-500
    case 'energy-drop':  return '#a855f7'; // purple-500
    case 'mood-change':  return '#f59e0b'; // amber-500
    case 'clash':        return '#ef4444'; // red-500
  }
}

/**
 * Get a color for the Camelot key display itself.
 * Uses the Camelot wheel color scheme: warm colors on one side, cool on the other.
 */
export function camelotColor(keyStr: string | null | undefined): string {
  const c = toCamelot(keyStr);
  if (!c) return '#6b7280'; // gray

  // Hue mapped to Camelot number (1-12 → 0-330°)
  const hue = ((c.number - 1) * 30) % 360;
  const sat = c.letter === 'B' ? 70 : 55; // Major = more saturated
  const lit = c.letter === 'B' ? 65 : 55;
  return `hsl(${hue}, ${sat}%, ${lit}%)`;
}

// ── Internal helpers ─────────────────────────────────────────────────────────

function normalizeKeyName(raw: string): string | null {
  // Try patterns: "Am", "A#m", "Cmaj", "C#maj", "Amin", "Cmajor"
  const m = raw.match(/^([A-Ga-g][#b♯♭]?)\s*(min(?:or)?|maj(?:or)?|m)$/i);
  if (!m) return null;

  let root = m[1].charAt(0).toUpperCase() + m[1].slice(1).toLowerCase();
  // Normalize flats/sharps
  root = root.replace('♯', '#').replace('♭', 'b');

  const quality = m[2].toLowerCase();
  const isMinor = quality === 'm' || quality.startsWith('min');

  return `${root} ${isMinor ? 'minor' : 'major'}`;
}

/**
 * Get a standard key name from Camelot notation.
 */
export function camelotToKeyName(display: string): string | null {
  return CAMELOT_TO_KEY[display] ?? null;
}
