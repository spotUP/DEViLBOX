/**
 * eSpeak-NG WebAssembly text-to-phoneme engine.
 *
 * Loads eSpeak-NG directly from public/ via dynamic import, bypassing
 * Vite's dep optimizer which breaks Emscripten's import.meta.url resolution.
 *
 * Only uses the phoneme analysis pipeline — no audio synthesis.
 */

import type { PhonemeToken } from './Reciter';

let espeakModule: any = null;
let espeakWorker: any = null;
let initPromise: Promise<void> | null = null;
let initFailed = false;

/**
 * Initialize eSpeak-NG WASM module.
 * Excluded from Vite's dep optimizer (vite.config.ts optimizeDeps.exclude)
 * so import.meta.url inside the module resolves correctly to node_modules.
 */
async function ensureInitialized(): Promise<void> {
  if (espeakWorker) return;
  if (initFailed) return;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      const t0 = performance.now();

      // Race against a timeout — WASM compilation can block the main thread
      const timeoutMs = 5000;
      // @ts-expect-error -- no type declarations for this WASM package
      const moduleImport = import('@echogarden/espeak-ng-emscripten')
        .then(({ default: EspeakModule }: { default: () => Promise<any> }) => EspeakModule());

      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('eSpeak-NG init timed out')), timeoutMs)
      );

      espeakModule = await Promise.race([moduleImport, timeoutPromise]);

      // Self-test in its own try/catch — Emscripten abort() can be hard to catch
      try {
        const worker = new espeakModule.eSpeakNGWorker();
        worker.set_voice('en');
        worker.convert_to_phonemes('hi', true);
        espeakWorker = worker;
        console.log(`[eSpeak-NG] Initialized in ${(performance.now() - t0).toFixed(0)}ms`);
      } catch (selfTestErr) {
        console.warn('[eSpeak-NG] Self-test failed, disabling:', selfTestErr);
        espeakModule = null;
        initFailed = true;
        initPromise = null;
        return;
      }
    } catch (e) {
      console.warn('[eSpeak-NG] Failed to initialize:', e);
      espeakModule = null;
      espeakWorker = null;
      initFailed = true;
      initPromise = null;
    }
  })();

  return initPromise;
}

/** Read a C string from WASM heap (with safety limit to prevent infinite loops) */
function readCString(ptr: number): string {
  if (!espeakModule || typeof ptr !== 'number' || ptr <= 0 || !isFinite(ptr)) return '';
  const heap = espeakModule.HEAPU8 as Uint8Array;
  let end = ptr;
  const maxLen = Math.min(ptr + 10000, heap.length); // safety limit
  while (end < maxLen && heap[end] !== 0) end++;
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
    espeakWorker.set_voice(voice);
    const result = espeakWorker.convert_to_phonemes(text, true); // true = IPA

    // Result may be { ptr: number } (Embind object) or a raw number
    let ptrVal: number;
    if (result && typeof result === 'object' && 'ptr' in result) {
      ptrVal = result.ptr;
    } else if (typeof result === 'number') {
      ptrVal = result;
    } else {
      console.warn('[eSpeak-NG] Unexpected return type from convert_to_phonemes:', typeof result, result);
      return null;
    }

    const ipa = readCString(ptrVal);
    console.log(`[eSpeak-NG] "${text}" → IPA: "${ipa}"`);
    return ipa || null;
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
