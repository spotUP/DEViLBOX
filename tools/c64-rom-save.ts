// Save a runnable C64 .prg for one SID .fur: furnaceToGoatTracker -> GTUltra WASM relocator (GoatTracker 2 playroutine at $1000)
// -> buildC64Prg boot stub. Usage: npx tsx --tsconfig tsconfig.app.json tools/c64-rom-save.ts <path under public/data/songs/furnace> <out.prg>
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseFurnaceSong } from '../src/lib/import/formats/FurnaceSongParser';
import { writeGoatTrackerSng } from '../src/lib/import/formats/GoatTrackerSid';
import { furnaceToGoatTracker } from '../src/lib/export/c64/goatSong';
import { buildC64Prg } from '../src/lib/export/c64/c64Prg';
import { loadWebBundle } from '../src/test/wasm/webBundle';

const ROOT = path.resolve(import.meta.dirname, '..');
const [rel, out] = process.argv.slice(2);
if (!rel || !out) throw new Error('usage: c64-rom-save.ts <song.fur> <out.prg>');
const fur = readFileSync(path.join(ROOT, 'public/data/songs/furnace', rel));
const m = await parseFurnaceSong(fur.buffer.slice(fur.byteOffset, fur.byteOffset + fur.length));
const g = furnaceToGoatTracker(m, 0);
const sng = writeGoatTrackerSng(g.song, g.settings);

interface GTModule { cwrap: (n: string, r: string | null, a: string[]) => (...a: number[]) => number; _malloc: (n: number) => number; _free: (p: number) => void }
const dir = path.join(ROOT, 'public/gtultra');
const b = await loadWebBundle<GTModule>(path.join(dir, 'GTUltra.js'), path.join(dir, 'GTUltra.wasm'), 'createGTUltra');
const w = b.module;
w.cwrap('gt_init', null, ['number', 'number'])(44100, 0);
const p = w._malloc(sng.length);
b.heap().set(sng, p);
if (!w.cwrap('gt_load_sng', 'number', ['number', 'number'])(p, sng.length)) throw new Error('gt_load_sng refused the converted song');
const MAX = 65536, o = w._malloc(MAX);
const n = w.cwrap('gt_export_prg', 'number', ['number', 'number'])(o, MAX);
if (!n) throw new Error('GT relocator failed');
const prg = buildC64Prg(b.heap().slice(o, o + n), m.name, m.author);
writeFileSync(out, prg);
console.log(`wrote ${out} ${prg.length} B (player ${n} B, ${g.song.patterns.length} patterns); lossy: ${g.lossy.join('; ') || 'none'}`);
