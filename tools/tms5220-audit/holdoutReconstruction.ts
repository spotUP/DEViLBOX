/**
 * holdoutReconstruction.ts — decides which phoneme source buildFramesFromROMLibrary
 * should treat as primary: the hand-calibrated static table or the ROM-mined runs.
 *
 * Both oracles that exist today are circular. The reconstruction test mines the
 * library from the same recordings it then rebuilds, so the library cannot lose.
 * The letter oracle compares against the letter recordings the static table was
 * itself calibrated from (4d501b6db), so the static table cannot lose. Neither
 * number says anything about a word the system has not already seen.
 *
 * This removes the circularity: for every vocabulary word W, mine the library
 * from every recording EXCEPT W, rebuild W from its G2P phonemes under both
 * precedences, and measure each against W's real ROM frames by DTW. A source
 * that reconstructs unseen words closer is the one that should be primary.
 *
 * Usage: npx tsx tools/tms5220-audit/holdoutReconstruction.ts [limit]
 */
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parseVSMDirectory, type VSMWord } from '../../src/engine/speech/VSMROMParser';
import { textToPhonemes, parsePhonemeString } from '../../src/engine/speech/Reciter';
import { samToTMS5220, type TMS5220Frame } from '../../src/engine/speech/tms5220PhonemeMap';
import {
  buildCompletePhonemeLibrary,
  buildFramesFromROMLibrary,
  lpcToTMS5220Frames,
} from '../../src/engine/speech/ROMPhonemeExtractor';
import {
  dtwFrameDistance,
  resolveRepeatFrames,
  trimSilence,
} from '../../src/engine/speech/ROMWordAligner';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '../..');
const ROMS = join(ROOT, 'public/roms/snspell');

/** Forces the static path: no code resolves out of an empty library. */
const EMPTY_LIBRARY = new Map<string, TMS5220Frame[]>();

function loadWords(): VSMWord[] {
  const rom = new Uint8Array(Buffer.concat([
    readFileSync(join(ROMS, 'tmc0351n2l.vsm')),
    readFileSync(join(ROMS, 'tmc0352n2l.vsm')),
  ]));
  return parseVSMDirectory(rom);
}

/** The recording itself, prepared the same way the miner prepares its input. */
function targetFrames(word: VSMWord): TMS5220Frame[] {
  return lpcToTMS5220Frames(trimSilence(resolveRepeatFrames(word.frames)));
}

function tokensFor(name: string) {
  const phonemes = textToPhonemes(name);
  return phonemes ? parsePhonemeString(phonemes) : null;
}

function main(): void {
  const limit = Number(process.argv[2] ?? 0) || Infinity;
  const words = loadWords();

  // Vocabulary words only: single letters are the miner's own calibration source
  // and the phrases carry multiple words with pauses.
  const vocab = words
    .map((w, index) => ({ w, index }))
    .filter(({ w }) => /^[A-Z']{2,}$/.test(w.name) && w.frames.length >= 6)
    .slice(0, limit);

  let libSum = 0;
  let staticSum = 0;
  let libWins = 0;
  let counted = 0;
  const rows: Array<{ word: string; lib: number; stat: number }> = [];

  for (const { w, index } of vocab) {
    const tokens = tokensFor(w.name);
    if (!tokens || tokens.length === 0) continue;

    const target = targetFrames(w);
    if (target.length < 4) continue;

    // Mine from everything except this word.
    const heldOut = words.filter((_, i) => i !== index);
    const { library } = buildCompletePhonemeLibrary(heldOut);

    // The two arms are controlled through the library, never through the
    // fallback: an empty library forces every code down the static path, which
    // is what static-first produced, whatever the internal branch order is.
    // (Steering with a null-returning fallback silently collapses both arms into
    // one as soon as the precedence changes.)
    const staticFirst = buildFramesFromROMLibrary(tokens, EMPTY_LIBRARY, samToTMS5220);
    const libraryFirst = buildFramesFromROMLibrary(tokens, library, samToTMS5220);

    const libD = dtwFrameDistance(libraryFirst, target);
    const statD = dtwFrameDistance(staticFirst, target);
    if (!isFinite(libD) || !isFinite(statD)) continue;

    libSum += libD;
    staticSum += statD;
    if (libD < statD) libWins++;
    counted++;
    rows.push({ word: w.name, lib: libD, stat: statD });
    console.log(
      `${w.name.padEnd(12)} library ${libD.toFixed(4)}  static ${statD.toFixed(4)}  ` +
      `${libD < statD ? 'library' : 'static'}`
    );
  }

  if (counted === 0) {
    console.log('no words measured');
    return;
  }

  rows.sort((a, b) => (b.stat - b.lib) - (a.stat - a.lib));
  console.log('\nbiggest library wins:', rows.slice(0, 5).map(r => r.word).join(', '));
  console.log('biggest static wins :', rows.slice(-5).map(r => r.word).join(', '));
  console.log(
    `\n${counted} held-out words: library mean ${(libSum / counted).toFixed(4)}, ` +
    `static mean ${(staticSum / counted).toFixed(4)}, ` +
    `library closer on ${libWins}/${counted} (${((libWins / counted) * 100).toFixed(0)}%)`
  );
}

main();
