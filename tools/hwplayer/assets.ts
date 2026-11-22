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
// NES glyphs come from the design's shared 5x7 font (thoughts/shared/design/player-ui/player-screens.html FONT_HEX, ASCII $20-$5F):
// 5 column bytes per glyph, bit 0 = top, drawn at x offset 1 so the NES screen matches the design pixel for pixel.
const DESIGN_FONT_HEX = [
  '0000000000','00005F0000','0007000700','147F147F14','242A7F2A12','2313086462','3649552250','0005030000',
  '001C224100','0041221C00','14083E0814','08083E0808','0050300000','0808080808','0060600000','2010080402',
  '3E5149453E','00427F4000','4261514946','2141454B31','1814127F10','2745454539','3C4A494930','0171090503',
  '3649494936','064949291E','0036360000','0056360000','0814224100','1414141414','0041221408','0201510906',
  '324979413E','7E1111117E','7F49494936','3E41414122','7F4141221C','7F49494941','7F09090901','3E4149497A',
  '7F0808087F','00417F4100','2040413F01','7F08142241','7F40404040','7F020C027F','7F0408107F','3E4141413E',
  '7F09090906','3E4151215E','7F09192946','4649494931','01017F0101','3F4040403F','1F2040201F','3F4038403F',
  '6314081463','0708700807','6151494543','007F414100','0204081020','0041417F00','0402010204','4040404040',
];
const glyph5 = (cols: number[]) => Array.from({ length: 8 }, (_, y) => cols.reduce((m, c, x) => m | (((c >> y) & 1) << (6 - x)), 0));
const nesGlyphs = DESIGN_FONT_HEX.map((h) => glyph5(Array.from({ length: 5 }, (_, i) => parseInt(h.slice(2 * i, 2 * i + 2), 16))));
for (const g of nesGlyphs) plane(g);
for (const t of font.logo) plane(t);
out.push(...new Array(16).fill(0xff));

// NES FamiStudio player (public/nes/famistudio/player.s), tiles 73+: palette colours are baked in because one
// BG pattern table of 256 tiles must hold every colour (colour 1 = plane 0, 2 = plane 1, 3 = both). The glyphs in
// tiles 0-63 are colour 1 (dim text). 73 rule, 74 play, 75 pause, 76-79 logo, 80-143 white glyphs (colour 2),
// 144-191 glyphs $30-$5F in the bar colour (colour 3), 192-216 bar body tiles, 217-241 bar edge tiles.
const tile = (p0: number[], p1: number[]) => out.push(...p0, ...p1);
const zero = (): number[] => new Array(8).fill(0);
tile(zero(), [0, 0, 0, 0xff, 0, 0, 0, 0]); // 73 rule: one line at tile pixel row 3, colour 2 (design rule grey, palette 0)
const FONT = { play: [0x7f, 0x3e, 0x1c, 0x08, 0x00], pause: [0x7f, 0x7f, 0x00, 0x7f, 0x7f] }; // 5x7 column bytes, bit 0 = top (player-mock.html)
tile(glyph5(FONT.play), glyph5(FONT.play)); // 74: colour 3 (design 'time' cyan, palette 3)
tile(glyph5(FONT.pause), glyph5(FONT.pause)); // 75
const LOGO16 = [0xc00c, 0x6018, 0x7ff8, 0x7ffc, 0x783e, 0x781e, 0x780f, 0x780f, 0x780f, 0x780f, 0x781e, 0x783e, 0x7ffc, 0x7ff8, 0, 0]; // rows 0-1 are the horns
for (const [tx, ty] of [[0, 0], [1, 0], [0, 1], [1, 1]]) { // 76-79: body colour 1, horns colour 2
  const col = (y: number) => (LOGO16[ty * 8 + y] >> (tx ? 0 : 8)) & 0xff;
  const rows = Array.from({ length: 8 }, (_, y) => col(y));
  const horn = (y: number) => ty * 8 + y < 2;
  tile(rows.map((b, y) => (horn(y) ? 0 : b)), rows.map((b, y) => (horn(y) ? b : 0)));
}
for (const g of nesGlyphs) tile(zero(), g); // 80-143
for (const g of nesGlyphs.slice(16)) tile(g, g); // 144-191: chars $30-$5F
// Bar tiles. Slot s: 0-8 filled s pixel rows; 9-16 cap only, cap rows h,h+1 (h = 0-7); 17-23 cap on top of a fill of h rows (h = 1-7);
// 24 = cap row 0 only (a cap at h=7 spills into the tile above). Edge tile: pixel 6 is the shaded edge (colour 1), pixel 7 the gap.
for (const edge of [false, true]) {
  for (let slot = 0; slot < 25; slot++) {
    const fill = slot <= 8 ? slot : slot >= 17 && slot <= 23 ? slot - 16 : 0;
    const capLo = slot >= 9 && slot <= 16 ? slot - 9 : slot >= 17 && slot <= 23 ? slot - 16 : slot === 24 ? -1 : -9;
    const p0 = zero(); const p1 = zero();
    for (let hb = 0; hb < 8; hb++) { // hb = pixel height from the tile bottom
      const y = 7 - hb;
      if (capLo !== -9 && (hb === capLo || hb === capLo + 1)) { p0[y] = edge ? 0xfe : 0xff; p1[y] = p0[y]; }
      else if (hb < fill) { p1[y] = edge ? 0xfc : 0xff; p0[y] = edge ? 0x02 : 0; }
    }
    tile(p0, p1);
  }
}
if (out.length !== 242 * 16) throw new Error(`screen.chr: expected 242 tiles, got ${out.length / 16}`);
writeFileSync(join(here, '../../public/nes/screen.chr'), Buffer.from(out));
console.log(`screen.chr ${out.length} bytes`);

// ZX Spectrum: 1 bit per pixel, MSB left, 8 bytes per tile for public/zx/screen.inc: the design glyphs (as NES), logo, solid block,
// then play and pause (tiles 73, 74) for the PT3 player's design screen.
const zx: number[][] = [...nesGlyphs, ...font.logo, new Array(8).fill(0xff), glyph5(FONT.play), glyph5(FONT.pause)];
const lines = zx.map((t, i) => `\tdefb ${t.map((b) => `#${b.toString(16).padStart(2, '0')}`).join(',')}\t; tile ${i}`);
writeFileSync(join(here, '../../public/zx/screen_font.inc'), `; Generated by tools/hwplayer/assets.ts (design font from player-screens.html). Do not edit.\n${lines.join('\n')}\n`);
console.log(`zx screen_font.inc ${zx.length} tiles`);

// Amiga ADF player (third-party/amiga-adf/amiga/screen.s): the design glyphs 1 bpp MSB left, then play, pause and the
// solid block ('{' '|' '}' in the design's charIdx = 64-66), plus the design TOK palette as OCS colour words.
const html = readFileSync(join(here, '../../thoughts/shared/design/player-ui/player-screens.html'), 'utf8');
const tokSrc = /const TOK = (\{[^}]*\})/.exec(html)?.[1];
if (!tokSrc) throw new Error('player-screens.html: no TOK palette');
const tok = JSON.parse(tokSrc.replace(/(\w+):/g, '"$1":').replace(/'/g, '"')) as Record<string, string>;
const ocs = (hex: string) => [1, 3, 5].reduce((w, i) => (w << 4) | Math.round((parseInt(hex.slice(i, i + 2), 16) / 255) * 15), 0);
const amigaPal = ['bg', 'text', 'dim', 'bar', 'barlo', 'cap', 'logo', 'rule'].map((k) => ocs(tok[k]));
const amigaGlyphs = [...nesGlyphs, glyph5(FONT.play), glyph5(FONT.pause), glyph5([0x7f, 0x7f, 0x7f, 0x7f, 0x7f])];
const hx = (v: number, n: number) => `$${v.toString(16).padStart(n, '0')}`;
writeFileSync(join(here, '../../third-party/amiga-adf/amiga/screen_font.i'), `; Generated by tools/hwplayer/assets.ts from player-screens.html (font + TOK). Do not edit.\nscreen_font:\n${
  amigaGlyphs.map((g, i) => `\tdc.b\t${g.map((b) => hx(b, 2)).join(',')}\t; ${i}`).join('\n')}\nscreen_pal:\t; bg text dim bar barlo cap logo rule\n\tdc.w\t${amigaPal.map((w) => hx(w, 3)).join(',')}\n`);
console.log(`amiga screen_font.i ${amigaGlyphs.length} glyphs`);

// Game Boy hUGEDriver player (public/gb/huge-player.asm): 2bpp tiles, colour index = DMG shade of the design's dmgPal()
// (0 bg, 1 logo, 2 dim/bar/time, 3 text). 0-63 text glyphs, 64-127 dim glyphs, 128-191 logo glyphs, 192-200 bar body
// with 0-8 filled rows, 201-209 bar edge (pixel 6 barlo, pixel 7 gap), 210 play. Then the CGB palette 0 (bg logo bar text).
const gb: number[][] = [];
const gbTile = (lo: number[], hi: number[]) => gb.push(lo.flatMap((b, y) => [b, hi[y]]));
for (const g of nesGlyphs) gbTile(g, g);
for (const g of nesGlyphs) gbTile(zero(), g);
for (const g of nesGlyphs) gbTile(g, zero());
for (const edge of [false, true]) for (let f = 0; f <= 8; f++) {
  const on = (y: number) => y >= 8 - f;
  gbTile(Array.from({ length: 8 }, (_, y) => (on(y) && edge ? 0x02 : 0)), Array.from({ length: 8 }, (_, y) => (on(y) ? (edge ? 0xfc : 0xff) : 0)));
}
gbTile(zero(), glyph5(FONT.play));
const rgb555 = (hex: string) => [1, 3, 5].reduce((w, i, k) => w | (Math.round((parseInt(hex.slice(i, i + 2), 16) / 255) * 31) << (5 * k)), 0);
const gbPal = ['bg', 'logo', 'bar', 'text'].map((k) => rgb555(tok[k]));
writeFileSync(join(here, '../../public/gb/screen_font.inc'), `; Generated by tools/hwplayer/assets.ts from player-screens.html (font + TOK). Do not edit.\nscreen_tiles:\n${
  gb.map((t, i) => `\tdb ${t.map((b) => hx(b, 2)).join(',')}\t; ${i}`).join('\n')}\nscreen_tiles_end:\nscreen_cgb_pal:\t; bg logo bar text (RGB555)\n\tdw ${gbPal.map((w) => hx(w, 4)).join(',')}\n`);
console.log(`gb screen_font.inc ${gb.length} tiles`);
