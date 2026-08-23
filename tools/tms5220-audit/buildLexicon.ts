/**
 * buildLexicon.ts — generate the TMS5220 full lexicon from the system dictionary.
 *
 * Every English word whose SAM phonemes can be reconstructed from the ROM-mined
 * phoneme library is a candidate. Each word is tiered by how authentic its
 * construction is:
 *
 *   tier 0  all phonemes mined from ROM recordings (letter/word/phrase sources)
 *   tier 1  uses allophone aliases (IX, UX, RX, ...) — acoustically near-identical
 *   tier 2  uses crafted derivations (G*, J*, WH, OY, DX, Q*) — voiced/unvoiced
 *           twins and glides that no recording exercises directly
 *   tier 3  some phoneme missing from the library entirely — falls back to the
 *           static table for that segment (worst)
 *
 * Output: public/data/tms5220-lexicon.tsv — lazy-fetched word database:
 *   WORD\tPHONEMES\tTIER\tROM_BUILTIN  (one line per word)
 * Kept as a static asset, NOT a TS module: an 8 MB string literal stalls the
 * Rollup production build and bloats the JS bundle. Fetch + split at runtime.
 *
 * Usage:
 *   npx tsx --tsconfig tsconfig.app.json tools/tms5220-audit/buildLexicon.ts
 */
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parseVSMDirectory } from '@engine/speech/VSMROMParser';
import { textToPhonemes, parsePhonemeString } from '@engine/speech/Reciter';
import { buildCompletePhonemeLibrary } from '@engine/speech/ROMPhonemeExtractor';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '../..');
const ROMS = join(ROOT, 'public/roms/snspell');

const ALIAS_CODES = new Set(['IX', 'UX', 'RX', 'LX', 'WX', 'YX', 'KX', '/X']);
const CRAFTED_CODES = new Set(['G*', 'GX', 'J*', 'WH', 'OY', 'DX', 'Q*']);

interface LexiconEntry {
  word: string;
  phonemes: string;
  tier: number;
  rom: boolean;
}

function loadWords() {
  const rom = Buffer.concat([
    readFileSync(join(ROMS, 'tmc0351n2l.vsm')),
    readFileSync(join(ROMS, 'tmc0352n2l.vsm')),
  ]);
  return parseVSMDirectory(new Uint8Array(rom));
}

const words = loadWords();
const { library, provenance } = buildCompletePhonemeLibrary(words);

const romBuiltIn = new Set(
  words.filter((w) => /^[A-Z]+$/.test(w.name)).map((w) => w.name),
);

// Which codes are in the library but not mined (derived)?
const derivedCodes = new Set(
  [...provenance.entries()]
    .filter(([, p]) => p.source === 'derived')
    .map(([code]) => code),
);

const dictPath = '/usr/share/dict/words';
const dictWords = readFileSync(dictPath, 'utf8')
  .split('\n')
  .map((w) => w.trim().toUpperCase())
  .filter((w) => /^[A-Z]{2,14}$/.test(w));

// The most common English words, curated: the system dictionary is dated and
// drops short words (A) and common forms (HAS). Sentences only sound good if
// the small words are guaranteed present, so they merge in regardless.
const COMMON_WORDS = (
  'THE AND A OF TO IN IS YOU THAT IT HE WAS FOR ON ARE AS WITH HIS THEY AT BE THIS HAVE ' +
  'FROM OR ONE HAD BY WORD BUT NOT WHAT ALL WERE WE WHEN YOUR CAN SAID THERE USE AN EACH ' +
  'WHICH SHE DO HOW THEIR IF WILL UP OTHER ABOUT OUT MANY THEN THEM THESE SO SOME HER ' +
  'WOULD MAKE LIKE HIM INTO TIME HAS LOOK TWO MORE WRITE GO SEE NUMBER NO WAY COULD ' +
  'PEOPLE MY THAN FIRST WATER BEEN CALL WHO OIL ITS NOW FIND LONG DOWN DAY DID GET COME ' +
  'MADE MAY PART'
).split(' ');

const entries: LexiconEntry[] = [];
const seen = new Set<string>();
let noPhonemes = 0;
let emptyAfterSpace = 0;
const tierCounts = [0, 0, 0, 0];
const romCount = new Set<string>();

for (const word of new Set([...COMMON_WORDS, ...dictWords])) {
  const phonemeStr = textToPhonemes(word);
  if (!phonemeStr) { noPhonemes++; continue; }
  const codes = parsePhonemeString(phonemeStr).map((t) => t.code).filter((c) => c !== ' ');
  if (codes.length === 0) { emptyAfterSpace++; continue; }

  let tier = 0;
  let missing = false;
  for (const code of codes) {
    if (!library.has(code)) { missing = true; continue; }
    if (derivedCodes.has(code)) {
      if (ALIAS_CODES.has(code)) tier = Math.max(tier, 1);
      else if (CRAFTED_CODES.has(code)) tier = Math.max(tier, 2);
    }
  }
  if (missing) tier = 3;

  const isRom = romBuiltIn.has(word);
  if (isRom) romCount.add(word);
  if (!seen.has(word)) {
    seen.add(word);
    tierCounts[tier]++;
    entries.push({ word, phonemes: codes.join(' '), tier, rom: isRom });
  }
}

// ROM built-ins first (native quality), then by tier, then by length.
entries.sort((a, b) => {
  if (a.rom !== b.rom) return a.rom ? -1 : 1;
  if (a.tier !== b.tier) return a.tier - b.tier;
  if (a.word.length !== b.word.length) return a.word.length - b.word.length;
  return a.word.localeCompare(b.word);
});

const now = new Date().toISOString();
const tsvLines = entries.map((e) => `${e.word}\t${e.phonemes}\t${e.tier}\t${e.rom ? 1 : 0}`);
const tsv = tsvLines.join('\n') + '\n';

const outPath = join(ROOT, 'public/data/tms5220-lexicon.tsv');
writeFileSync(outPath, tsv);

console.log(`dictionary words scanned: ${dictWords.length}`);
console.log(`no phoneme mapping: ${noPhonemes}`);
console.log(`entries emitted: ${entries.length}`);
console.log(`tier counts (0/1/2/3): ${tierCounts.join('/')}`);
console.log(`ROM built-ins included: ${romCount.size}`);
console.log(`output: ${outPath} (${(Buffer.byteLength(tsv) / 1024).toFixed(0)} KB, generated ${now})`);