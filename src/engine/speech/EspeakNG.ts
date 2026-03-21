/**
 * eSpeak-NG WebAssembly text-to-phoneme engine.
 *
 * Replaces SAM's 1982 reciter with modern eSpeak-NG (100+ languages,
 * proper stress, correct pronunciation for irregular English words).
 *
 * Only uses the phoneme analysis pipeline — no audio synthesis.
 * The phoneme output feeds into our existing LPC/formant chip engines.
 */

import type { PhonemeToken } from './Reciter';

let espeakModule: any = null;
let espeakWorker: any = null;
let initPromise: Promise<void> | null = null;

/**
 * Lazy-initialize eSpeak-NG WASM module.
 * First call loads ~24MB of language data; subsequent calls are instant.
 */
async function ensureInitialized(): Promise<void> {
  if (espeakWorker) return;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      // @ts-expect-error -- no type declarations for this WASM package
      const { default: EspeakModule } = await import('@echogarden/espeak-ng-emscripten');
      // Override locateFile to serve stripped espeak-ng.data from public/ (1.1MB, 6 langs)
      espeakModule = await EspeakModule({
        locateFile: (path: string) => {
          if (path === 'espeak-ng.data') return '/espeak-ng.data';
          return path;
        },
      });
      espeakWorker = new espeakModule.eSpeakNGWorker();
      espeakWorker.set_voice('en');
      console.log('[eSpeak-NG] Initialized successfully');
    } catch (e) {
      console.warn('[eSpeak-NG] Failed to initialize, falling back to SAM:', e);
      espeakModule = null;
      espeakWorker = null;
    }
  })();

  return initPromise;
}

/** Read a C string from WASM heap */
function readCString(ptr: number): string {
  if (!espeakModule || !ptr) return '';
  const heap = espeakModule.HEAPU8 as Uint8Array;
  let end = ptr;
  while (heap[end] !== 0) end++;
  return new TextDecoder().decode(heap.slice(ptr, end));
}

/**
 * Convert text to IPA phonemes using eSpeak-NG.
 * Returns underscore-separated IPA with stress markers (ˈ ˌ).
 * Returns null if eSpeak-NG is not available.
 */
export async function espeakTextToIPA(text: string, voice = 'en'): Promise<string | null> {
  await ensureInitialized();
  if (!espeakWorker) return null;

  try {
    // Set voice if different
    espeakWorker.set_voice(voice);
    const ptr = espeakWorker.convert_to_phonemes(text, true); // true = IPA
    return readCString(ptr.ptr);
  } catch (e) {
    console.warn('[eSpeak-NG] Phoneme conversion failed:', e);
    return null;
  }
}

/**
 * IPA to SAM phoneme code mapping.
 * Maps eSpeak-NG IPA output to SAM-compatible codes that our existing
 * phoneme maps (VLM5030, TMS5220, SP0250, etc.) understand.
 */
const IPA_TO_SAM: Record<string, string> = {
  // Vowels
  'iː': 'IY', 'i': 'IY', 'ɪ': 'IH', 'e': 'EH', 'ɛ': 'EH',
  'æ': 'AE', 'ɑː': 'AA', 'ɑ': 'AA', 'ʌ': 'AH', 'ɐ': 'AH',
  'ɒ': 'AO', 'ɔː': 'AO', 'ɔ': 'AO',
  'ʊ': 'UH', 'uː': 'UX', 'u': 'UX',
  'ə': 'AX', 'ɜː': 'ER', 'ɜ': 'ER',

  // Diphthongs
  'eɪ': 'EY', 'aɪ': 'AY', 'ɔɪ': 'OY',
  'aʊ': 'AW', 'əʊ': 'OW', 'oʊ': 'OW',

  // Consonants - stops
  'p': 'P*', 'b': 'B*', 't': 'T*', 'd': 'D*',
  'k': 'K*', 'ɡ': 'G*', 'g': 'G*',
  'ʔ': 'Q*',

  // Consonants - fricatives
  'f': 'F*', 'v': 'V*', 'θ': 'TH', 'ð': 'DH',
  's': 'S*', 'z': 'Z*', 'ʃ': 'SH', 'ʒ': 'ZH',
  'h': '/H',

  // Consonants - affricates
  'tʃ': 'CH', 'dʒ': 'J*',

  // Consonants - nasals
  'm': 'M*', 'n': 'N*', 'ŋ': 'NX',

  // Consonants - liquids/glides
  'l': 'L*', 'ɫ': 'L*', // dark L
  'ɹ': 'R*', 'r': 'R*',
  'w': 'W*', 'j': 'Y*',

  // Flap
  'ɾ': 'DX',
};

/**
 * Parse eSpeak-NG IPA output into PhonemeTokens compatible with our chip maps.
 *
 * eSpeak format: underscore-separated IPA symbols with stress markers:
 * "h_ə_l_ˈəʊ w_ˈɜː_l_d"
 *
 * ˈ = primary stress (SAM stress 5)
 * ˌ = secondary stress (SAM stress 3)
 * no marker = unstressed (SAM stress 1 for vowels, 0 for consonants)
 */
export function parseEspeakIPA(ipa: string): PhonemeToken[] {
  const tokens: PhonemeToken[] = [];
  const words = ipa.split(' ');

  for (const word of words) {
    if (!word) continue;

    // Add word boundary pause
    if (tokens.length > 0) {
      tokens.push({ code: ' ', stress: 0 });
    }

    const phonemes = word.split('_');
    let nextStress = 1; // default unstressed

    for (const ph of phonemes) {
      if (!ph) continue;

      let remaining = ph;
      let stress = nextStress;

      // Check for stress markers at start
      if (remaining.startsWith('ˈ')) {
        stress = 5; // primary
        remaining = remaining.slice(1);
      } else if (remaining.startsWith('ˌ')) {
        stress = 3; // secondary
        remaining = remaining.slice(1);
      }

      if (!remaining) {
        nextStress = stress; // stress applies to next phoneme
        continue;
      }

      // Try longest match first (diphthongs, affricates: 2+ chars)
      let matched = false;
      for (let len = Math.min(remaining.length, 3); len >= 1; len--) {
        const candidate = remaining.slice(0, len);
        const samCode = IPA_TO_SAM[candidate];
        if (samCode) {
          tokens.push({ code: samCode, stress });
          // Handle remaining characters after the match (rare)
          const rest = remaining.slice(len);
          if (rest && rest !== 'ː') { // ignore length markers
            const restCode = IPA_TO_SAM[rest];
            if (restCode) tokens.push({ code: restCode, stress: 0 });
          }
          matched = true;
          break;
        }
      }

      if (!matched && remaining !== 'ː' && remaining !== 'ˑ') {
        // Unknown IPA symbol — skip silently
        // console.warn(`[eSpeak-NG] Unknown IPA: "${remaining}" (${remaining.codePointAt(0)})`);
      }

      nextStress = 1; // reset for next phoneme
    }
  }

  return tokens;
}

/** Check if eSpeak-NG is available (loaded) */
export function isEspeakAvailable(): boolean {
  return espeakWorker !== null;
}

/** Pre-load eSpeak-NG in the background (call early to avoid delay on first speech) */
export function preloadEspeak(): void {
  ensureInitialized().catch(() => {});
}
