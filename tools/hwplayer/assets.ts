// Generates public/nes/screen.chr (NES CHR RAM tiles for the player screen) from tools/hwplayer/font8x8.json.
// font8x8.json comes from tools/hwplayer/rasterize-font.swift (macOS CoreText over a TTF); rerun that only to change the font.
// Tile map: 0-63 = ASCII 0x20-0x5F, 64-71 = logo (4 wide, 2 tall, row-major), 72 = solid bar block. Glyphs use colour 1, the bar block colour 3.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const font = JSON.parse(readFileSync(join(here, 'font8x8.json'), 'utf8')) as { glyphs: number[][]; logo: number[][] };
const out: number[] = [];
const plane = (rows: number[]) => { out.push(...rows, ...new Array(8).fill(0)); };
if (font.glyphs.length !== 64 || font.logo.length !== 8) throw new Error('font8x8.json: expected 64 glyphs and 8 logo tiles');
for (const g of font.glyphs) plane(g);
for (const t of font.logo) plane(t);
out.push(...new Array(16).fill(0xff));
writeFileSync(join(here, '../../public/nes/screen.chr'), Buffer.from(out));
console.log(`screen.chr ${out.length} bytes`);
