// Save the MDSDRV ROM for one genesis .fur. Usage: npx tsx --tsconfig tsconfig.app.json tools/md-rom-save.ts <song> <out.bin>
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseFurnaceSong } from '../src/lib/import/formats/FurnaceSongParser';
import { furnaceToMds } from '../src/lib/export/md/mdsSong';
import { buildMdRom } from '../src/lib/export/md/mdRom';

const ROOT = path.resolve(import.meta.dirname, '..');
const [name, out] = process.argv.slice(2);
if (!name || !out) throw new Error('usage: md-rom-save.ts <song> <out.bin>');
const fur = readFileSync(path.join(ROOT, 'public/data/songs/furnace/genesis', `${name}.fur`));
const m = await parseFurnaceSong(fur.buffer.slice(fur.byteOffset, fur.byteOffset + fur.length));
const song = furnaceToMds(m);
writeFileSync(out, buildMdRom(readFileSync(path.join(ROOT, 'public/md/player.bin')), song.seq, song.pcm));
console.log(`wrote ${out}`);
