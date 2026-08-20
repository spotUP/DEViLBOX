import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parseVSMDirectory } from '@engine/speech/VSMROMParser';
import { textToPhonemes, parsePhonemeString } from '@engine/speech/Reciter';
import { buildCompletePhonemeLibrary } from '@engine/speech/ROMPhonemeExtractor';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '../..');

// 1. Load ROM vocab words
const rom = readFileSync(join(ROOT, 'public/roms/snspell/tmc0351n2l.vsm'));
const rom2 = readFileSync(join(ROOT, 'public/roms/snspell/tmc0352n2l.vsm'));
const dir = parseVSMDirectory(Buffer.concat([rom, rom2]));
const words = dir.filter((w) => /^[A-Z]+$/.test(w.name)).map((w) => w.name);

// 2. Build reverse index: SAM phoneme string -> dictionary word
const dictPath = '/usr/share/dict/words';
const dictWords = readFileSync(dictPath, 'utf8').split('\n').map((w) => w.toUpperCase()).filter((w) => /^[A-Z]+$/.test(w));
const phToWord = new Map<string, string>();
let phonemized = 0, failed = 0;
for (const w of dictWords) {
  const ph = textToPhonemes(w);
  if (ph) {
    const tokens = parsePhonemeString(ph).map((t) => t.code).filter((c) => c !== ' ');
    const key = tokens.join(' ');
    if (!phToWord.has(key)) phToWord.set(key, w);
    phonemized++;
  } else failed++;
}
console.log(`dictionary phonemized: ${phonemized} ok, ${failed} failed (of ${dictWords.length})`);

// 3. Library codes
const { library } = buildCompletePhonemeLibrary(dir);
const codes = [...library.keys()].filter((c) => c !== ' ');
console.log(`library codes: ${codes.length}`);

// 4. For each ROM word, try single-phoneme substitutions
const seen = new Set<string>();
const found: { target: string; source: string; idx: number; sub: string; kept: string[] }[] = [];
for (const w of words) {
  const ph = textToPhonemes(w);
  if (!ph) { console.log('  (no phonemes for', w, ')'); continue; }
  const tokens = parsePhonemeString(ph).map((t) => t.code).filter((c) => c !== ' ');
  for (let i = 0; i < tokens.length; i++) {
    const orig = tokens[i];
    for (const code of codes) {
      if (code === orig) continue;
      const swapped = tokens.slice();
      swapped[i] = code;
      const key = swapped.join(' ');
      const target = phToWord.get(key);
      if (target && !seen.has(target)) {
        seen.add(target);
        found.push({ target, source: w, idx: i, sub: `${orig}->${code}`, kept: tokens });
      }
    }
  }
}

found.sort((a, b) => a.target.localeCompare(b.target));
console.log(`\n=== ${found.length} words constructible by ONE phoneme substitution ===`);
for (const f of found) {
  const show = f.kept.map((c, i) => (i === f.idx ? `[${c}->${f.sub.split('->')[1]}]` : c)).join(' ');
  console.log(`  ${f.target.padEnd(16)} from ${f.source.padEnd(16)} at pos ${f.idx}  ${show}`);
}

// 5. Focus on the user's example: TOUGH -> ROUGH
const tough = textToPhonemes('TOUGH')!;
const rough = textToPhonemes('ROUGH')!;
console.log(`\nTOUGH = "${tough}"  ROUGH = "${rough}"`);
const tTok = parsePhonemeString(tough).map((t) => t.code).filter((c) => c !== ' ');
const rTok = parsePhonemeString(rough).map((t) => t.code).filter((c) => c !== ' ');
console.log(`TOUGH tokens: [${tTok.join(',')}]  ROUGH tokens: [${rTok.join(',')}]`);
const diffs = tTok.filter((c, i) => c !== rTok[i]);
console.log(`phoneme diffs: ${diffs.length} (${diffs.join(',')})`);