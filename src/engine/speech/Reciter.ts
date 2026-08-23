// @ts-expect-error -- SamJs is a JavaScript library without types
import SamJs from '@engine/sam/samjs';
import { espeakTextToIPA, parseEspeakIPA, isEspeakAvailable } from './EspeakNG';

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
 * Convert text to PhonemeTokens using eSpeak-NG (async, better quality).
 * Falls back to SAM if eSpeak-NG is not loaded yet.
 *
 * This is the preferred entry point for TTS pipelines that can await.
 */
export async function textToTokens(text: string): Promise<PhonemeToken[]> {
  // Try eSpeak-NG first (much better pronunciation)
  if (isEspeakAvailable()) {
    const ipa = await espeakTextToIPA(preprocessText(text));
    if (ipa) {
      return parseEspeakIPA(ipa);
    }
  }

  // Fallback to SAM
  const phonemeStr = textToPhonemes(text);
  if (!phonemeStr) return [];
  return parsePhonemeString(phonemeStr);
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
export const KNOWN_PHONEMES = new Set<string>([
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

/**
 * Phoneme notation is marked, never guessed: [SIHKS] is phonemes, SIX is a word.
 *
 * The speak path must not run SAM text→phoneme conversion on input that is
 * already phonemes ("DH* AH N*" converts to garbage like " D AE4STERIHSK AE
 * EH4N AE4STERIHSK"), so it has to know which it holds. It cannot tell by
 * looking: an English word tiles into phoneme codes just as well as a phoneme
 * string does. Measured on the first 4000 lexicon words, spelling-shaped
 * detection claims WAX (as W* AX, a schwa — plainly wrong), SIX, MIX, NIX, SAY
 * and OH, and a converted word carries no distinguishing mark to key off either:
 * 2858 of those 4000 SAM outputs contain no '*' and no stress digit at all
 * (SIX -> SIHKS), so requiring a mark would instead double-convert most
 * already-converted text.
 *
 * The brackets are written by the phoneme toggle, are visible in the text field
 * and persist with the instrument, so the string states its own type wherever it
 * travels — no parallel mode flag to fall out of sync with the text.
 */
export const PHONEME_OPEN = '[';
export const PHONEME_CLOSE = ']';

/** True for one bracketed token, or for legacy notation carrying a '*' code. */
export function isPhonemeNotation(token: string): boolean {
  const t = token.trim();
  if (t.length === 0) return false;
  if (t.startsWith(PHONEME_OPEN) && t.endsWith(PHONEME_CLOSE) && t.length > 2) return true;
  // No English word contains '*', so DH* AH N* stays unambiguous unbracketed.
  return t.includes('*') && stripPhonemeMarks(t).split(/\s+/).every(isPhonemeRun);
}

/** Remove the notation brackets from a token, if present. */
export function stripPhonemeMarks(token: string): string {
  const t = token.trim();
  return t.startsWith(PHONEME_OPEN) && t.endsWith(PHONEME_CLOSE) && t.length > 2
    ? t.slice(1, -1)
    : t;
}

/** Wrap a converted phoneme string in the notation brackets. */
export function markPhonemes(phonemes: string): string {
  return `${PHONEME_OPEN}${phonemes.trim()}${PHONEME_CLOSE}`;
}

/** True when every character of the run parses as a phoneme code or stress digit. */
function isPhonemeRun(token: string): boolean {
  let i = 0;
  while (i < token.length) {
    // Stress digits and manual stars (users write DH*, the parser emits DH).
    if ((token[i] >= '0' && token[i] <= '8') || token[i] === '*') { i++; continue; }
    if (i + 1 < token.length && isKnownPhoneme(token[i] + token[i + 1])) { i += 2; continue; }
    if (isKnownPhoneme(token[i] + '*')) { i++; continue; }
    return false;
  }
  return token.length > 0;
}

/**
 * Split speech input into the units the speak path renders one at a time: a
 * bracketed phoneme span counts as ONE unit even though it contains spaces
 * ("[DH* AH N*]"), everything else splits on whitespace as usual.
 *
 * Every caller that walks the text word by word must split with this, or a
 * multi-word span is torn into "[DH*", "AH", "N*]" and each piece is judged
 * separately — the closing bracket lands on a different piece than the opening
 * one, so neither reads as notation.
 */
export function splitSpeechSegments(text: string): string[] {
  return text.match(/\[[^\]]*\]|\S+/g) ?? [];
}

/**
 * Parse text into phoneme tokens, tolerating input that mixes plain words with
 * bracketed phoneme notation (the mixed form the phoneme toggle produces when a
 * word is a known ROM/recording word and stays literal). Word pauses separate
 * the tokens. Returns null when nothing parses.
 */
export function textToTokensSmart(text: string): PhonemeToken[] | null {
  const words = splitSpeechSegments(text);
  if (words.length === 0) return null;

  const tokens: PhonemeToken[] = [];
  for (const word of words) {
    let parsed: PhonemeToken[];
    if (isPhonemeNotation(word)) {
      parsed = parsePhonemeString(stripPhonemeMarks(word));
    } else {
      const phonemeStr = textToPhonemes(word);
      if (!phonemeStr) continue;
      parsed = parsePhonemeString(phonemeStr);
    }
    if (tokens.length > 0 && parsed.length > 0) tokens.push({ code: ' ', stress: 0 });
    tokens.push(...parsed);
  }
  return tokens.length > 0 ? tokens : null;
}
