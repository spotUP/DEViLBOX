// @ts-expect-error -- SamJs is a JavaScript library without types
import SamJs from '@engine/sam/samjs';

/**
 * A single phoneme token parsed from SAM's reciter output.
 */
export interface PhonemeToken {
  code: string;   // 2-char SAM code ("IY", "EH", "S*", etc.) or space for pause
  stress: number; // 0-8 (0=no stress, 4-5=primary, 8=max emphasis)
}

/**
 * Convert English text to a SAM phoneme string.
 * Wraps SamJs.convert() which is the Reciter from the original SAM speech synth.
 *
 * @returns Phoneme string (e.g., "HEHLOW WERLD") or false if conversion failed
 */
export function textToPhonemes(text: string): string | false {
  try {
    return SamJs.convert(text);
  } catch {
    return false;
  }
}

/**
 * Parse a SAM phoneme string into individual tokens.
 *
 * SAM's reciter output format:
 * - 2-letter phoneme codes separated by spaces (e.g., "HEHLOW")
 * - Stress markers are digits 0-8 following a phoneme
 * - Spaces between words produce pause tokens
 *
 * The output string from SAM's convert() is a flat string of phoneme codes
 * concatenated together, with stress digits embedded.
 */
export function parsePhonemeString(str: string): PhonemeToken[] {
  if (!str) return [];

  const tokens: PhonemeToken[] = [];
  let i = 0;

  while (i < str.length) {
    // Skip whitespace → emit pause tokens
    if (str[i] === ' ') {
      tokens.push({ code: ' ', stress: 0 });
      i++;
      continue;
    }

    // Check for stress digit
    if (str[i] >= '0' && str[i] <= '8') {
      // Apply stress to previous token
      if (tokens.length > 0) {
        tokens[tokens.length - 1].stress = parseInt(str[i]);
      }
      i++;
      continue;
    }

    // Try to match a 2-char phoneme code
    if (i + 1 < str.length) {
      const twoChar = str[i] + str[i + 1];
      // Check if this is a known SAM phoneme
      if (isKnownPhoneme(twoChar)) {
        tokens.push({ code: twoChar, stress: 0 });
        i += 2;
        continue;
      }
    }

    // Try single-char consonant with implicit * suffix (SAM outputs L, D, W etc.)
    const withStar = str[i] + '*';
    if (isKnownPhoneme(withStar)) {
      tokens.push({ code: withStar, stress: 0 });
      i++;
      continue;
    }

    // Single character - skip unknown
    i++;
  }

  return tokens;
}

/** Set of all known SAM 2-char phoneme codes */
const KNOWN_PHONEMES = new Set<string>([
  'IY', 'IH', 'EH', 'AE', 'AA', 'AH', 'AO', 'UH', 'AX', 'IX',
  'ER', 'UX', 'OH', 'RX', 'LX', 'WX', 'YX', 'WH',
  'R*', 'L*', 'W*', 'Y*', 'M*', 'N*', 'NX', 'DX', 'Q*',
  'S*', 'SH', 'F*', 'TH', '/H', '/X', 'Z*', 'ZH', 'V*', 'DH',
  'CH', 'J*',
  'EY', 'AY', 'OY', 'AW', 'OW', 'UW',
  'B*', 'D*', 'G*', 'GX', 'P*', 'T*', 'K*', 'KX',
]);

function isKnownPhoneme(code: string): boolean {
  return KNOWN_PHONEMES.has(code);
}
