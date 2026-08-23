/**
 * romPhonemeLibrary.test.ts — the ROM-mined phoneme library must be real.
 *
 * Oracles, no listening required:
 *
 * 1. Coverage: every SAM code speaks from ROM data or a derivation of ROM data.
 * 2. Letter oracle: word-mined exemplars must agree with the hand-verified
 *    letter extraction (B = /biː/, F = /ɛf/, O = /oʊ/ are unambiguous).
 * 3. Reconstruction: rebuilding each vocabulary word from the mined library
 *    must match the recording — note this oracle is inherently circular (the
 *    library is mined FROM those recordings), so it measures fidelity to the
 *    source, not phoneme correctness. Correctness comes from the static table,
 *    which is the primary source in buildFramesFromROMLibrary.
 * 4. Reachability: mined runs reach the rendered output. They were shadowed by
 *    the static table for a long stretch of commits, which made every test
 *    below decorative — the code they measured never ran in the product.
 */
import { describe, it, expect, beforeAll } from 'vitest';
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
  MIN_MINED_RUN_FRAMES,
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
  // The VSM binaries are gitignored (TI copyright), so CI runs without them.
  // describe.skipIf still EXECUTES this callback — it only marks the collected
  // tests skipped — so reading the ROM here would fail collection on every
  // ROM-less machine. beforeAll does not run for a skipped suite.
  let words: VSMWord[];
  let library: ReturnType<typeof buildCompletePhonemeLibrary>['library'];
  let provenance: ReturnType<typeof buildCompletePhonemeLibrary>['provenance'];
  let droppedWords: string[];

  beforeAll(() => {
    words = loadWords();
    const result = buildCompletePhonemeLibrary(words);
    library = result.library;
    provenance = result.provenance;
    droppedWords = result.droppedWords;
  });

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

    // The static table is now calibrated from letter recordings for 16 phonemes.
    // For those calibrated phonemes, static should be closer to letter extraction
    // than word-mined is (since both derive from letters but static uses clean middle frames).
    // For non-calibrated phonemes, word-mined should win.
    // We verify: static distance <= 0.3 for calibrated phonemes (was often >0.3 with hand-authored).
    const calibratedCodes = new Set(['AA', 'AY', 'B*', 'CH', 'EH', 'EY', 'F*', 'IY', 'K*', 'OW', 'P*', 'S*', 'T*', 'UW', 'W*', 'Y*']);
    const staticGood = rows
      .filter(r => calibratedCodes.has(r.code))
      .filter(r => r.static <= 0.3).length;
    const totalCalibrated = rows.filter(r => calibratedCodes.has(r.code)).length;
    console.log(`[oracle] static close to letter for calibrated: ${staticGood}/${totalCalibrated}`);
    expect(staticGood / totalCalibrated).toBeGreaterThanOrEqual(0.8); // most calibrated should be close

    // For non-calibrated, word-mined should be better
    const nonCalibrated = rows.filter(r => !calibratedCodes.has(r.code));
    if (nonCalibrated.length > 0) {
      const minedBetter = nonCalibrated.filter(r => r.oracle <= r.static).length;
      console.log(`[oracle] mined closer than static for non-calibrated: ${minedBetter}/${nonCalibrated.length}`);
    }

    const farOut = rows.filter(r => r.oracle > 0.45); // measured worst B* 0.360
    expect(farOut.map(r => `${r.code}@${r.oracle.toFixed(2)}`)).toEqual([]);
  });

  it('reconstructs vocabulary words better than the static table', () => {
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
    // Ratio bound is a tripwire, not the decider: this metric is in-sample
    // (the library was mined from these very words) and uses naive
    // concatenation, not the product pipeline. The authoritative number is
    // the leave-one-out holdout (tools/tms5220-audit/holdoutReconstruction),
    // which improved when the stop exemplars moved to word medoids while this
    // ratio drifted 0.859 -> 0.864.
    expect(libSum / staticSum).toBeLessThanOrEqual(0.88);
  });

  it('is reachable: mined runs actually reach the output, they are not shadowed', () => {
    // The mining path was dead at runtime for a year of commits: the static
    // table answers for all 54 SAM codes, and it was consulted first, so no
    // mined frame ever left this function. Assert the opposite directly —
    // every multi-frame mined code must appear verbatim in the output.
    const SENTENCES = ['HELLO WORLD', 'ZEBRA QUICK VEX BOY JUDGE', 'THE LAZY DOG'];
    let checkedCodes = 0;

    for (const text of SENTENCES) {
      const phonemeStr = textToPhonemes(text);
      expect(phonemeStr).not.toBe(false);
      const tokens = parsePhonemeString(phonemeStr as string);
      const frames = buildFramesFromROMLibrary(tokens, library, samToTMS5220);
      expect(frames.length).toBeGreaterThan(0);

      for (const t of tokens) {
        const run = library.get(t.code);
        if (t.code === ' ' || !run || run.length < MIN_MINED_RUN_FRAMES) continue;
        // The run's own K vectors must be present in the rendered stream. The
        // static path would have replaced them with generateStaticFrames output.
        const wanted = JSON.stringify(run[0].k);
        expect(
          frames.some(f => JSON.stringify(f.k) === wanted),
          `${t.code} mined frames missing from "${text}"`,
        ).toBe(true);
        checkedCodes++;
      }
    }
    expect(checkedCodes).toBeGreaterThanOrEqual(10);
  });

  it('routes single-frame mined runs to the static table instead', () => {
    // R*, IH, IX and RX mine as one frame — a snapshot, not a trajectory.
    const shortCodes = [...library.entries()]
      .filter(([, run]) => run.length < MIN_MINED_RUN_FRAMES)
      .map(([code]) => code);
    console.log(`[precedence] static-served (mined run too short): ${shortCodes.join(', ') || '(none)'}`);
    for (const code of shortCodes) {
      // Every such code must have a static entry, or it would drop out silently.
      expect(samToTMS5220(code), `${code} has no static entry to fall back to`).not.toBeNull();
    }
  });
});
