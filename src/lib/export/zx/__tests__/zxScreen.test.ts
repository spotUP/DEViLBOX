/**
 * Runs screen_static (public/zx/screen.inc) of every ZX player in a minimal Z80 interpreter and checks the
 * screen memory as text: logo, chip name, title/author, attributes. No ZX ROM exists for an emulator here.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { FurnaceChipType } from '../../../../engine/chips/FurnaceChipEngine';
import type { RegisterWrite } from '../../VGMExporter';
import { buildZxTap, loadZxPlayerFrom } from '../zxTap';

type Mem = Uint8Array;

/** Just the opcodes screen.inc uses; any other opcode throws. */
function runCall(mem: Mem, start: number): void {
  const r = new Uint8Array(8); // B C D E H L (hl) A
  const [B, C, D, E, H, L, , A] = [0, 1, 2, 3, 4, 5, 6, 7];
  let pc = start, sp = 0x8000, zf = false, cf = false;
  mem[--sp] = 0; mem[--sp] = 0; // return to 0
  const trail: number[] = [];
  const hl = () => r[H] << 8 | r[L];
  const get = (i: number) => i === 6 ? mem[hl()] : r[i];
  const set = (i: number, v: number) => { if (i === 6) mem[hl()] = v & 255; else r[i] = v & 255; };
  const rd16 = (p: number) => mem[p] | mem[p + 1] << 8;
  const pair = (h: number, l: number) => r[h] << 8 | r[l];
  const setPair = (h: number, l: number, v: number) => { r[h] = v >> 8 & 255; r[l] = v & 255; };
  const push = (v: number) => { mem[--sp] = v >> 8 & 255; mem[--sp] = v & 255; };
  const pop = () => { const v = rd16(sp); sp += 2; return v; };
  for (let n = 0; n < 5_000_000; n++) {
    trail.push(pc); if (trail.length > 12) trail.shift();
    const op = mem[pc++];
    if (op >= 0x40 && op < 0x80) { set(op >> 3 & 7, get(op & 7)); continue; }
    if ((op & 0xC7) === 0x04) { set(op >> 3 & 7, get(op >> 3 & 7) + 1); continue; }
    if ((op & 0xC7) === 0x05) { const v = get(op >> 3 & 7) - 1 & 255; set(op >> 3 & 7, v); zf = v === 0; continue; }
    switch (op) {
      case 0x01: setPair(B, C, rd16(pc)); pc += 2; break;
      case 0x11: setPair(D, E, rd16(pc)); pc += 2; break;
      case 0x21: setPair(H, L, rd16(pc)); pc += 2; break;
      case 0x06: case 0x0E: case 0x16: case 0x1E: case 0x26: case 0x2E: case 0x36: case 0x3E:
        set(op >> 3 & 7, mem[pc++]); break;
      case 0x1A: r[A] = mem[pair(D, E)]; break;
      case 0x3A: r[A] = mem[rd16(pc)]; pc += 2; break;
      case 0x32: mem[rd16(pc)] = r[A]; pc += 2; break;
      case 0x2A: setPair(H, L, rd16(rd16(pc))); pc += 2; break;
      case 0x22: { const t = rd16(pc); mem[t] = r[L]; mem[t + 1] = r[H]; pc += 2; break; }
      case 0x13: setPair(D, E, pair(D, E) + 1); break;
      case 0x23: setPair(H, L, hl() + 1); break;
      case 0x09: setPair(H, L, hl() + pair(B, C)); break;
      case 0x29: setPair(H, L, hl() * 2); break;
      case 0xEB: { const d = pair(D, E); setPair(D, E, hl()); setPair(H, L, d); break; }
      case 0x0F: r[A] = (r[A] >> 1 | r[A] << 7) & 255; break;
      case 0xE6: r[A] &= mem[pc++]; break;
      case 0xF6: r[A] |= mem[pc++]; break;
      case 0xB3: r[A] |= r[E]; break;
      case 0xD6: r[A] = r[A] - mem[pc++]; break;
      case 0xFE: zf = r[A] === mem[pc++]; cf = false; break;
      case 0x10: { const o = (mem[pc++] ^ 128) - 128; r[B] = r[B] - 1; if (r[B]) pc += o; break; }
      case 0x18: { const o = (mem[pc++] ^ 128) - 128; pc += o; break; }
      case 0x20: { const o = (mem[pc++] ^ 128) - 128; if (!zf) pc += o; break; }
      case 0x28: { const o = (mem[pc++] ^ 128) - 128; if (zf) pc += o; break; }
      case 0xC5: push(pair(B, C)); break;
      case 0xD5: push(pair(D, E)); break;
      case 0xE5: push(hl()); break;
      case 0xF5: push(r[A] << 8); break;
      case 0xC1: setPair(B, C, pop()); break;
      case 0xD1: setPair(D, E, pop()); break;
      case 0xE1: setPair(H, L, pop()); break;
      case 0xF1: r[A] = pop() >> 8; break;
      case 0xCD: { const t = rd16(pc); push(pc + 2); pc = t; break; }
      case 0xC3: pc = rd16(pc); break;
      case 0xC9: pc = pop(); if (pc === 0) return; break;
      case 0xC8: if (zf) { pc = pop(); if (pc === 0) return; } break;
      case 0xED: {
        if (mem[pc++] !== 0xB0) throw new Error('ED op');
        do { mem[pair(D, E)] = mem[hl()]; setPair(D, E, pair(D, E) + 1); setPair(H, L, hl() + 1); setPair(B, C, pair(B, C) - 1); } while (pair(B, C));
        break;
      }
      default: throw new Error(`opcode ${op.toString(16)} at ${(pc - 1).toString(16)} trail ${trail.map((t) => t.toString(16)).join(' ')}`);
    }
    for (let i = 0; i < 8; i++) r[i] &= 255;
    void C; void cf;
  }
  throw new Error('no return');
}

/** Screen as 24 rows of 32 tile indices of the font (-1 when the cell is not a font tile). */
function tileAt(mem: Mem, font: number, row: number, col: number): number {
  const base = 0x4000 | (row & 0x18) << 8 | (row & 7) << 5 | col;
  const cell = Array.from({ length: 8 }, (_, i) => mem[base + i * 256]);
  for (let t = 0; t < 73; t++) {
    if (cell.every((b, i) => b === mem[font + t * 8 + i])) return t;
  }
  return -1;
}
const textAt = (mem: Mem, font: number, row: number, col: number, len: number) =>
  Array.from({ length: len }, (_, i) => String.fromCharCode(0x20 + tileAt(mem, font, row, col + i))).join('');

describe('ZX player screens (screen_static run in a Z80 interpreter)', () => {
  for (const name of ['player', 'beeper', 'quadtone'] as const) {
    it(`${name}: logo, chip name, title and author are drawn`, () => {
      const meta = JSON.parse(readFileSync(`public/zx/${name}.json`, 'utf8'));
      const bin = readFileSync(`public/zx/${name}.bin`);
      const mem = new Uint8Array(65536);
      mem.set(bin, meta.loadAddress);
      // Patch a title and author the way the exporter does (space padded, upper case).
      const put = (off: number, s: string) => mem.set(Buffer.from(s.padEnd(32, ' ')), meta.loadAddress + off);
      put(meta.titleOffset, 'TEST TITLE');
      put(meta.authorOffset, 'TEST AUTHOR');
      runCall(mem, meta.screenStatic);
      // font location: tile 0 is the space; find the tile table by locating the logo tiles via the title text.
      const fontStart = findFont(mem, meta);
      const logo = [1, 2].map((row) => [1, 2, 3, 4].map((c) => tileAt(mem, fontStart, row, c)));
      expect(logo).toEqual([[64, 65, 66, 67], [68, 69, 70, 71]]);
      expect(textAt(mem, fontStart, 1, 6, 20)).toMatch(/^[A-Z0-9 ]+$/);
      expect(textAt(mem, fontStart, 4, 0, 32).trim()).toBe('TEST TITLE');
      expect(textAt(mem, fontStart, 5, 0, 32).trim()).toBe('TEST AUTHOR');
      expect(mem[0x5800 + 4 * 32]).toBe(0x47);
      expect(mem[0x5800 + 5 * 32]).toBe(0x44);
      expect(textAt(mem, fontStart, 7, 0, 26)).toBe('SONG 01/01  00:00  PLAYING');
      expect(textAt(mem, fontStart, 18, 2, 3)).toMatch(/^[A1] [B2]$/);
      if (name === 'player') {
        // bar_static draws solid blocks at columns 2,4,6,8 rows 10-17, attribute 0 until lit
          runCall(mem, meta.barStatic);
        expect(tileAt(mem, fontStart, 10, 2)).toBe(72);
        expect(tileAt(mem, fontStart, 17, 8)).toBe(72);
        expect(mem[0x5800 + 10 * 32 + 2]).toBe(0);
      }
    });
  }
});

describe('ZX AY player subsongs', () => {
  it('packs every song, fills the song table and shows the count as SONG 01/nn', () => {
    const meta = JSON.parse(readFileSync('public/zx/player.json', 'utf8'));
    const player = loadZxPlayerFrom(new Uint8Array(readFileSync('public/zx/player.bin')), meta);
    const RATE = 48000;
    const song = (frames: number, pitch: number): RegisterWrite[] => Array.from({ length: frames }, (_, f) =>
      ({ timestamp: f * RATE / 50, chipType: FurnaceChipType.AY, port: f % 2, data: (pitch + f) & 0xFF }));
    const r = buildZxTap([song(100, 1), song(9000, 50), song(30, 9)], RATE, player, 'three');
    expect(r.songs).toBe(3);
    // The player code is the 4th tap block (loader header, loader, code header, code): 2 length bytes, flag, data, checksum.
    let o = 0;
    for (let i = 0; i < 3; i++) o += 2 + (r.tap[o] | r.tap[o + 1] << 8);
    const code = r.tap.slice(o + 3, o + 3 + player.bytes.length);
    expect(code[meta.songCountOffset]).toBe(3);
    const tab = Array.from({ length: 3 }, (_, i) => code.slice(meta.songTableOffset + i * 3, meta.songTableOffset + i * 3 + 3));
    expect(tab[0]).toEqual(Uint8Array.from([0, 0x00, 0xC0]));
    expect(tab[1][2]).toBeGreaterThanOrEqual(0xC0);
    expect(tab[2][0]).toBeGreaterThanOrEqual(1); // song 2 is 9000 frames: song 3 starts in a later bank
    const mem = new Uint8Array(65536);
    mem.set(code, meta.loadAddress);
    runCall(mem, meta.screenStatic);
    expect(textAt(mem, findFont(mem, meta), 7, 0, 10)).toBe('SONG 01/03');
  });
});

/** The font follows the last code label; tile 0 is eight zero bytes, tile 72 is eight 0xFF: find 73 tiles ending in a solid block. */
function findFont(mem: Mem, meta: { loadAddress: number; size: number }): number {
  for (let a = meta.loadAddress; a <= meta.loadAddress + meta.size - 73 * 8; a++) {
    if (mem.slice(a + 72 * 8, a + 73 * 8).every((b) => b === 0xFF) && mem.slice(a, a + 8).every((b) => b === 0)) return a;
  }
  throw new Error('font not found');
}
