// @ts-expect-error -- SamJs is a JavaScript library without types
import SamJs from '@engine/sam/samjs';

/**
 * A single phoneme token parsed from SAM's reciter output.
 */
export interface PhonemeToken {
  code: string;   // 2-char SAM code ("IY", "EH", "S*", etc.) or space for pause
  stress: number; // 0-8 (0=no stress, 4-5=primary, 8=max emphasis)
}

/** Detect if text is a question (for rising intonation) */
export function isQuestion(text: string): boolean {
  return text.trim().endsWith('?');
}

/**
 * Pre-process text to handle punctuation pauses.
 * Inserts markers that become pause tokens in the phoneme stream.
 * Strips punctuation that SAM can't handle.
 */
export function preprocessText(text: string): string {
  return text
    .replace(/[.!?]+\s*/g, ' . ')  // periods/exclamation/question → pause marker
    .replace(/[,;:]+\s*/g, ' , ')  // commas/semicolons → short pause
    .replace(/[—–]+/g, ' . ')      // dashes → pause
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Convert English text to a SAM phoneme string.
 * Wraps SamJs.convert() which is the Reciter from the original SAM speech synth.
 *
 * @returns Phoneme string (e.g., "HEHLOW WERLD") or false if conversion failed
 */
/**
 * Exception dictionary for words SAM's 1982 reciter gets wrong.
 * Maps uppercase words to their correct SAM phoneme sequences.
 */
const PHONEME_EXCEPTIONS: Record<string, string> = {
  // Common mispronunciations
  'THE': '/DHAX',
  'OF': 'AHV',
  'ARE': 'AAR',
  'WERE': 'WER',
  'SAID': 'SEHD',
  'HAVE': 'HHAEAV',
  'DOES': 'DAHZ',
  'DONE': 'DAHN',
  'GONE': 'GAON',
  'ONE': 'WAHN',
  'TWO': 'TUW',
  'THEIR': '/DHEHR',
  'THERE': '/DHEHR',
  'THEY': '/DHEY',
  'WHAT': 'WAHT',
  'WHERE': 'WEHR',
  'WHO': 'HHUW',
  'COULD': 'KUHD',
  'WOULD': 'WUHD',
  'SHOULD': 'SHUHD',
  'THROUGH': '/THRUW',
  'THOUGH': '/DHOW',
  'ENOUGH': 'IYNAHF',
  'TONGUE': 'TAHNG',
  'QUEUE': 'KYUW',
  'CORPS': 'KOHR',
  'COLONEL': 'KERNUL',
  // Silent letters and unusual spellings
  'KNOW': 'NOW',
  'KNIFE': 'NAYF',
  'KNEE': 'NIY',
  'WRITE': 'RAYT',
  'WRONG': 'RAWNG',
  'ISLAND': 'AYLAHND',
  'LISTEN': 'LIHSAHN',
  'OFTEN': 'AOFAHN',
  'WHOLE': 'HOWL',
  'EIGHT': 'EYT',
  'WEIGHT': 'WEYT',
  'HEIGHT': 'HAYT',
  'PEOPLE': 'PIYPAHL',
  'BECAUSE': 'BIHKAHZ',
  'MACHINE': 'MAHSHIYN',
  'SURE': 'SHUHR',
  'SUGAR': 'SHUHGER',
  'WOMEN': 'WIHMAHN',
  'BUSY': 'BIHZIY',
  'BUILD': 'BIHLD',
  'BUILT': 'BIHLT',
  'TROUBLE': 'TRAHBAHL',
  'DOUBLE': 'DAHBAHL',
  'TOUCH': 'TAHCH',
  'YOUNG': 'YAHNG',
  'COUNTRY': 'KAHNTRIHY',
  'NOTHING': 'NAHTHING',
  'ANOTHER': 'AHNAH/DHER',
  'EVERY': 'EHVRIY',
  'BEAUTIFUL': 'BYUWTIHFAHL',
  'ANSWER': 'AENSER',
  'SCIENCE': 'SAYAHNS',
  'SPECIAL': 'SPEHSHAHL',
  'OCEAN': 'OWSHAHN',
  'ANCIENT': 'EYNSHAHNT',
  'RECEIVE': 'RIHSIYV',
  'BELIEVE': 'BIHLIYV',
  'FRIEND': 'FREHND',
  'WEIRD': 'WIYRD',
  'HEART': 'HAART',
  'BLOOD': 'BLAHD',
  'FLOOD': 'FLAHD',
  'STEAK': 'STEYK',
  'BREAK': 'BREYK',
  'GREAT': 'GREYT',
  'CREATE': 'KRIYEYT',
  'ZOMBIE': 'ZAAMBIY',
  'ALIEN': 'EYLIYAHN',
  'GALAXY': 'GAELAHKSIY',
  'MISSILE': 'MIHSAHL',
  'VEHICLE': 'VIYHIHKAHL',
  'CIRCUIT': 'SERKIHT',
  'SYSTEM': 'SIHSTAHM',
  'ENGINE': 'EHNJAHN',
  'DANGER': 'DEYNJER',
  'WARRIOR': 'WOHRIYOHR',
  'TREASURE': 'TREHZHER',
  'ADVENTURE': 'AEDVEHNCHER',
  // Game/arcade terms
  'INTRUDER': 'IHNTRUWDER',
  'HUMANOID': 'HYUWMAHNOYD',
  'DESTROY': 'DIHSTROY',
  'ESCAPE': 'EHSKEYP',
  'SINISTAR': 'SIHNIHSTAAR',
  'BEWARE': 'BIHWEHR',
  'COWARD': 'KAWERD',
  'HUNGER': 'HAHNGGER',
  // Tech/game terms
  'ROBOT': 'ROWBAHT',
  'LASER': 'LEYZER',
  'CYBER': 'SAYBER',
  'SYNTH': 'SIHNTH',
  'AUDIO': 'AODIYOW',
  'COMPUTER': 'KAHMPYUWTER',
  'TRACKER': 'TRAEKER',
  'WAVEFORM': 'WEYVFAORM',
  'SPECTRUM': 'SPEHKTRUHM',
  'FREQUENCY': 'FRIYKWEHNSIY',
};

export function textToPhonemes(text: string): string | false {
  try {
    // Pre-process: replace exception words with phoneme overrides
    const words = text.toUpperCase().split(/\s+/);
    const processed: string[] = [];
    const overrides: Map<number, string> = new Map();

    for (let i = 0; i < words.length; i++) {
      const phonemes = PHONEME_EXCEPTIONS[words[i]];
      if (phonemes) {
        overrides.set(i, phonemes);
        processed.push(words[i]); // Keep original for SAM spacing
      } else {
        processed.push(words[i]);
      }
    }

    // If no overrides, just use SAM directly
    if (overrides.size === 0) {
      return SamJs.convert(text);
    }

    // Process each word individually, replacing exceptions
    const phonemeParts: string[] = [];
    for (let i = 0; i < words.length; i++) {
      if (overrides.has(i)) {
        phonemeParts.push(overrides.get(i)!);
      } else {
        const wordPhonemes = SamJs.convert(words[i]);
        if (wordPhonemes) {
          phonemeParts.push(wordPhonemes.trim());
        }
      }
    }

    return phonemeParts.join(' ') || false;
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
