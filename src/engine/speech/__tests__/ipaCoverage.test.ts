/**
 * ipaCoverage.test.ts — every IPA symbol eSpeak-NG emits must map to a SAM code.
 *
 * parseEspeakIPA drops symbols it cannot map. A dropped symbol is a dropped
 * PHONEME, and a dropped vowel destroys the word: en-US writes the NURSE vowel
 * as r-colored ɝ/ɜ˞, which the table lacked, so "WORLD" was spoken without its
 * nucleus and every preset sounded equally broken on it. Nothing failed, no
 * error appeared — the word just came out wrong.
 *
 * This sweeps real vocabulary through the real engine and fails on ANY symbol
 * the table cannot consume, so the next gap is caught here instead of by ear.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const ROOT = process.cwd();
const LEXICON = join(ROOT, 'public/data/tms5220-lexicon.tsv');
const ESPEAK = join(ROOT, 'node_modules/@echogarden/espeak-ng-emscripten/espeak-ng.js');

/** The live mapping table, parsed from source so the test cannot drift from it. */
function mappedSymbols(): Set<string> {
  const src = readFileSync(join(ROOT, 'src/engine/speech/EspeakNG.ts'), 'utf8');
  const start = src.indexOf('const IPA_TO_SAM');
  const end = src.indexOf('};', start);
  expect(start, 'IPA_TO_SAM table not found').toBeGreaterThan(-1);
  return new Set(
    [...src.slice(start, end).matchAll(/'([^']+)':\s*'[^']+'/g)].map((m) => m[1]),
  );
}

/**
 * Length markers carry no phoneme of their own; parseEspeakIPA skips them.
 * The RHOTICITY hook U+02DE is deliberately NOT ignored: an r-colored vowel
 * whose combination is unmapped would otherwise degrade silently to its plain
 * form (BETTER losing its r), which is the same silent-drop class of bug that
 * cost WORLD its vowel. Every r-colored combination must be mapped explicitly.
 */
const IGNORED = new Set(['ː', 'ˑ']);

const canRun = existsSync(ESPEAK) && existsSync(LEXICON);

describe.skipIf(!canRun)('eSpeak-NG IPA coverage', () => {
  it('maps every symbol produced for a broad vocabulary sample', async () => {
    const { default: EspeakModule } = await import(/* @vite-ignore */ ESPEAK);
    const mod = await EspeakModule();
    const worker = new mod.eSpeakNGWorker();
    worker.set_voice('en-us');

    const readResult = (result: unknown): string => {
      const ptr = (result && typeof result === 'object' && 'ptr' in result)
        ? (result as { ptr: number }).ptr : (result as number);
      const heap: Uint8Array = mod.HEAPU8;
      let end = ptr;
      while (end < heap.length && heap[end] !== 0) end++;
      return new TextDecoder().decode(heap.slice(ptr, end));
    };

    const mapped = mappedSymbols();
    const words = readFileSync(LEXICON, 'utf8')
      .split('\n').map((l) => l.split('\t')[0]).filter(Boolean);
    // Stride across the whole (sorted) file so the sample spans the alphabet
    // and every tier, not just the ROM words at the top.
    const stride = Math.max(1, Math.floor(words.length / 2000));
    const sample = words.filter((_, i) => i % stride === 0).slice(0, 2000);
    expect(sample.length).toBeGreaterThan(500);

    const unmapped = new Map<string, string[]>();
    for (const word of sample) {
      const ipa = readResult(worker.convert_to_phonemes(word.toLowerCase(), true));
      for (const token of ipa.split(/[\s_]+/)) {
        const t = token.replace(/^[ˈˌ]/, '');
        let i = 0;
        while (i < t.length) {
          let matched = false;
          // Longest match first — exactly what parseEspeakIPA does.
          for (let len = Math.min(t.length - i, 3); len >= 1; len--) {
            if (mapped.has(t.slice(i, i + len))) { i += len; matched = true; break; }
          }
          if (matched) continue;
          const sym = t[i];
          i++;
          if (IGNORED.has(sym)) continue;
          const examples = unmapped.get(sym) ?? [];
          if (examples.length < 3) examples.push(word);
          unmapped.set(sym, examples);
        }
      }
    }

    const report = [...unmapped.entries()].map(
      ([sym, ex]) => `${sym} (U+${sym.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')}) in ${ex.join(', ')}`,
    );
    expect(report, 'unmapped IPA symbols would be silently dropped').toEqual([]);
  }, 120000);
});
