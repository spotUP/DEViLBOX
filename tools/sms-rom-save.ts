// Save the Banjo SMS/GG ROM for one .fur. Usage: npx tsx --tsconfig tsconfig.app.json tools/sms-rom-save.ts <path under public/data/songs/furnace> <out.sms|out.gg>
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseFurnaceSong } from '../src/lib/import/formats/FurnaceSongParser';
import { furnaceToBanjo, type BanjoLayout } from '../src/lib/export/sms/banjoSong';
import { buildSmsRom } from '../src/lib/export/sms/smsRom';

const ROOT = path.resolve(import.meta.dirname, '..');
const [rel, out] = process.argv.slice(2);
if (!rel || !out) throw new Error('usage: sms-rom-save.ts <song.fur> <out.sms|out.gg>');
const fur = readFileSync(path.join(ROOT, 'public/data/songs/furnace', rel));
const m = await parseFurnaceSong(fur.buffer.slice(fur.byteOffset, fur.byteOffset + fur.length));
const layout = JSON.parse(readFileSync(path.join(ROOT, 'public/sms/player.json'), 'utf8')) as BanjoLayout;
const song = furnaceToBanjo(m, 0, layout);
writeFileSync(out, buildSmsRom(readFileSync(path.join(ROOT, 'public/sms/player.sms')), layout, song, out.endsWith('.gg'), m.name, { author: m.author, comments: m.comment }));
console.log(`wrote ${out}`);
