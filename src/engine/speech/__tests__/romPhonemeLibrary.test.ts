/**
 * romPhonemeLibrary.test.ts — the ROM-mined phoneme library must be real, and
 * measurably better than the hand-authored table it replaces.
 *
 * Four oracles, no listening required:
 *
 * 1. Coverage: every SAM code speaks from ROM data or a derivation of ROM data.
 * 2. Letter oracle: word-mined exemplars must agree with the hand-verified
 *    letter extraction (B = /biː/, F = /ɛf/, O = /oʊ/ are unambiguous).
 * 3. Reconstruction: rebuilding each vocabulary word from the mined library
 *    must match the recording far better than rebuilding it from the static
 *    table — the baseline comparison is baked in, so this cannot pass on the
 *    old code.
 * 4. Reachability: with this library loaded, the synthesis path never calls
 *    the static fallback for a covered code.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { parseVSMDirectory, type VSMWord } from '../VSMROMParser';
import { textToPhonemes, parsePhonemeString, KNOWN_PHONEMES } from '../Reciter';
import { samToTMS5220, type TMS5220Frame } from '../tms5220PhonemeMap';
import {
  buildCompletePhonemeLibrary,
  extractWordPhonemeLibrary,
  extractPhonemeLibrary,
  buildFramesFromROMLibrary,
  runDistance,
} from '../ROMPhonemeExtractor';
import { resolveRepeatFrames, trimSilence, kIndexDistance, dtwFrameDistance } from '../ROMWordAligner';

const ROMS = join(process.cwd(), 'public/roms/snspell');
const present = [join(ROMS, 'tmc0351n2l.vsm'), join(ROMS, 'tmc0352n2l.vsm')].every(existsSync);

function loadWords(): VSMWord[] {
  const rom = new Uint8Array(Buffer.concat([
    readFileSync(join(ROMS, 'tmc0351n2l.vsm')),
    readFileSync(join(ROMS, 'tmc0352n2l.vsm')),
  ]));
  return parseVSMDirectory(rom);
}

/** Mean frame-level distance between a static-table entry and an exemplar run. */
function staticVsExemplar(code: string, exemplar: TMS5220Frame[]): number {
  const staticFrame = samToTMS5220(code);
  if (!staticFrame || exemplar.length === 0) return Infinity;
  let sum = 0;
  for (const f of exemplar) {
    sum += kIndexDistance(staticFrame.k, f.k)
      + 0.5 * Math.abs(staticFrame.energy - f.energy) / 14
      + (staticFrame.unvoiced !== f.unvoiced ? 0.5 : 0);
  }
  return sum / exemplar.length;
}

/** Expand a phoneme sequence into frames using the static table only. */
function staticReconstruction(tokens: Array<{ code: string }>): TMS5220Frame[] {
  const out: TMS5220Frame[] = [];
  for (const t of tokens) {
    if (t.code === ' ') continue;
    const f = samToTMS5220(t.code);
    if (!f) continue;
    const count = Math.max(1, Math.round(f.durationMs / 25));
    for (let i = 0; i < count; i++) out.push({ ...f, durationMs: 25 });
  }
  return out;
}

/** Expand a phoneme sequence into frames by plain library concatenation. */
function libraryReconstruction(
  tokens: Array<{ code: string }>,
  library: Map<string, TMS5220Frame[]>,
): TMS5220Frame[] {
  const out: TMS5220Frame[] = [];
  for (const t of tokens) {
    if (t.code === ' ') continue;
    const run = library.get(t.code);
    if (!run) continue;
    out.push(...run);
  }
  return out;
}

describe.skipIf(!present)('ROM phoneme library', () => {
  const words = loadWords();
  const result = buildCompletePhonemeLibrary(words);
  const { library, provenance, droppedWords } = result;

  it('mines the expected recordings and rejects few', () => {
    const minedCount = [...provenance.values()].filter(p => p.source !== 'derived').length;
    console.log(`[library] ${library.size} codes total, ${minedCount} mined (letter/word/phrase)`);
    console.log(`[library] dropped ${droppedWords.length}: ${droppedWords.join(', ')}`);
    expect(minedCount).toBeGreaterThanOrEqual(35); // measured 38
    expect(droppedWords.length).toBeLessThanOrEqual(10); // measured 1
  });

  it('covers every SAM code after derivations', () => {
    const missing = [...KNOWN_PHONEMES].filter(c => !library.has(c));
    console.log(`[library] missing after completion: ${missing.join(', ') || '(none)'}`);
    expect(missing).toEqual([]);
  });

  it('mines the consonants the letters cannot provide, from the right words', () => {
    const expectMined = (code: string, anyOfWords: string[]) => {
      const prov = provenance.get(code);
      expect(prov, `${code} provenance`).toBeDefined();
      expect(prov!.source === 'word' || prov!.source === 'phrase',
        `${code} source (${prov!.source}) from [${prov!.words.join(', ')}]`).toBe(true);
      expect(
        prov!.words.some(w => anyOfWords.some(x => w.includes(x))),
        `${code} mined from [${prov!.words.join(', ')}]`,
      ).toBe(true);
    };
    expectMined('ZH', ['MEASURE', 'PLEASURE']);
    expectMined('TH', ['THREE', 'EARTH', 'HEALTHY', 'ANYTHING']);
    expectMined('NX', ['TONGUE', 'SPONGE', 'FINGER', 'COMING']);
    expectMined('DH', ['MOTHER', 'SMOTHER']);
    expectMined('AW', ['OUTDOOR', 'COUNTRY']);
    expectMined('SH', ['PUSH', 'SURE', 'SHOVEL', 'MACHINE']);
    expect(provenance.get('OY')!.source).toBe('derived');
  });

  it('passes the letter oracle: word-mined exemplars agree with the letter extraction', () => {
    const letterLib = extractPhonemeLibrary(words.slice(0, 26));
    const { candidates } = extractWordPhonemeLibrary(words);

    const rows: Array<{ code: string; oracle: number; static: number }> = [];
    for (const [code, letterFrames] of letterLib) {
      // Candidates from non-letter recordings only (exclude single-letter texts).
      const wordCands = (candidates.get(code) ?? []).filter(c => c.word.length > 1);
      if (wordCands.length === 0) continue;
      const dists = wordCands.map(c => runDistance(c.frames, letterFrames)).sort((a, b) => a - b);
      const median = dists[Math.floor(dists.length / 2)];
      rows.push({ code, oracle: median, static: staticVsExemplar(code, letterFrames) });
    }
    for (const r of rows) {
      console.log(`[oracle] ${r.code}: word-mined ${r.oracle.toFixed(3)} vs static ${r.static.toFixed(3)}`);
    }
    expect(rows.length).toBeGreaterThanOrEqual(10);

    // The mined exemplars must sit closer to the letter recordings than the
    // hand-authored table does, for the overwhelming majority of codes.
    const closer = rows.filter(r => r.oracle <= r.static).length;
    console.log(`[oracle] mined closer than static: ${closer}/${rows.length}`);
    expect(closer / rows.length).toBeGreaterThanOrEqual(0.75); // measured 13/16

    const farOut = rows.filter(r => r.oracle > 0.45); // measured worst B* 0.360
    expect(farOut.map(r => `${r.code}@${r.oracle.toFixed(2)}`)).toEqual([]);
  });

  it('reconstructs vocabulary words far better than the static table', () => {
    const vocab = words.filter(w => /^[A-Z']{2,}$/.test(w.name) && !droppedWords.includes(w.name));
    let libSum = 0;
    let staticSum = 0;
    let counted = 0;
    const perWord: string[] = [];
    for (const word of vocab) {
      const phonemeStr = textToPhonemes(word.name);
      if (!phonemeStr) continue;
      const tokens = parsePhonemeString(phonemeStr);
      const actual = trimSilence(resolveRepeatFrames(word.frames));
      if (actual.length < 4) continue;

      const libCost = dtwFrameDistance(libraryReconstruction(tokens, library), actual);
      const staticCost = dtwFrameDistance(staticReconstruction(tokens), actual);
      if (!isFinite(libCost) || !isFinite(staticCost)) continue;
      libSum += libCost;
      staticSum += staticCost;
      counted++;
      perWord.push(`${word.name}: lib ${libCost.toFixed(3)} vs static ${staticCost.toFixed(3)}`);
    }
    console.log(perWord.slice(0, 25).join('\n'));
    console.log(`[reconstruction] ${counted} words: lib mean ${(libSum / counted).toFixed(4)} vs static mean ${(staticSum / counted).toFixed(4)} (ratio ${(libSum / staticSum).toFixed(3)})`);
    expect(counted).toBeGreaterThanOrEqual(100); // measured 127
    expect(libSum).toBeLessThan(staticSum);            // direction, non-negotiable
    expect(libSum / staticSum).toBeLessThanOrEqual(0.75); // measured 0.708
  });

  it('is reachable: the synthesis path never falls back to static for covered text', () => {
    const spyCalls: string[] = [];
    const staticSpy = (code: string) => {
      spyCalls.push(code);
      return samToTMS5220(code);
    };
    for (const text of ['HELLO WORLD', 'ZEBRA QUICK VEX BOY JUDGE', 'THE LAZY DOG']) {
      const phonemeStr = textToPhonemes(text);
      expect(phonemeStr).not.toBe(false);
      const tokens = parsePhonemeString(phonemeStr as string);
      const frames = buildFramesFromROMLibrary(tokens, library, staticSpy);
      expect(frames.length).toBeGreaterThan(0);
    }
    console.log(`[reachability] static fallback called for: ${spyCalls.join(', ') || '(nothing)'}`);
    expect(spyCalls).toEqual([]);
  });
});
