/**
 * espeak-repack.mjs — build the stripped eSpeak-NG bundle in public/ from the
 * pristine @echogarden/espeak-ng-emscripten package.
 *
 * The pristine data bundle is 24 MB, nearly all of it language dictionaries.
 * We keep: the core phoneme tables (phontab/phonindex/phondata/intonations),
 * six dictionaries (en, de, sv, fr, es, ja), the ENTIRE lang/ tree (tiny text
 * files that define every voice — the 2026-03 strip dropped this directory,
 * which made set_voice('en') a silent no-op and text_to_phonemes abort), and
 * voices/ minus the !v novelty voices. Result: ~1.1 MB.
 *
 * Usage:
 *   npm pack @echogarden/espeak-ng-emscripten@0.3.5 && tar xzf echogarden-*.tgz
 *   node tools/espeak-repack.mjs <path-to-extracted-package>
 * Then commit public/espeak-ng.js + public/espeak-ng.data; postinstall's
 * scripts/patch-espeak.sh copies them over node_modules.
 */
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkgDir = process.argv[2];
if (!pkgDir) {
  console.error('usage: node tools/espeak-repack.mjs <pristine-package-dir>');
  process.exit(1);
}

const js = readFileSync(join(pkgDir, 'espeak-ng.js'), 'utf8');
const data = readFileSync(join(pkgDir, 'espeak-ng.data'));

// The emscripten file manifest is embedded in the JS as loadPackage({files:[...]}).
const start = js.indexOf('loadPackage({files:[');
if (start < 0) throw new Error('manifest not found in espeak-ng.js');
const arrStart = js.indexOf('[', start);
let depth = 0;
let arrEnd = arrStart;
for (let k = arrStart; k < js.length; k++) {
  if (js[k] === '[') depth++;
  if (js[k] === ']') depth--;
  if (depth === 0) { arrEnd = k; break; }
}
const files = JSON.parse(
  js.slice(arrStart, arrEnd + 1)
    .replace(/filename:/g, '"filename":')
    .replace(/start:/g, '"start":')
    .replace(/end:/g, '"end":'),
);

const KEEP_DICTS = new Set(['en_dict', 'de_dict', 'sv_dict', 'fr_dict', 'es_dict', 'ja_dict']);
const keep = files.filter((f) => {
  const p = f.filename.replace('/usr/share/espeak-ng-data/', '');
  if (['phontab', 'phonindex', 'phondata', 'intonations'].includes(p)) return true;
  if (/^[a-z-]+_dict$/.test(p)) return KEEP_DICTS.has(p);
  if (p.startsWith('lang/')) return true; // voice definitions — REQUIRED
  if (p.startsWith('voices/')) return !p.startsWith('voices/!v/');
  return false;
});

const chunks = [];
let off = 0;
const manifest = keep.map((f) => {
  const buf = data.subarray(f.start, f.end);
  chunks.push(buf);
  const entry = `{filename:${JSON.stringify(f.filename)},start:${off},end:${off + buf.length}}`;
  off += buf.length;
  return entry;
});
const newData = Buffer.concat(chunks);

let out = js.slice(0, arrStart) + '[' + manifest.join(',') + ']' + js.slice(arrEnd + 1);
out = out.replace(/remote_package_size:\d+/, `remote_package_size:${newData.length}`);

writeFileSync(join(ROOT, 'public/espeak-ng.data'), newData);
writeFileSync(join(ROOT, 'public/espeak-ng.js'), out);
console.log(`kept ${keep.length}/${files.length} files, ${newData.length} bytes`);
