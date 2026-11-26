/**
 * PT3 grid = what plays. The C++ decoder's grid notes are checked against the AY tone period the real S.V. Bulba
 * player (public/zx/pt3player.asm, AY build) writes inside the aylet engine, on real songs. Unedited export is the
 * untouched file.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(__dirname, '../../..');
const createPt3 = async () => (await import('../../../public/pt3/Pt3Edit.js')).default({ locateFile: (f: string) => resolve(ROOT, 'public/pt3', f) });
import { parseZxtuneFile } from '@/lib/import/formats/ZxtuneParser';

interface Aylet {
  HEAPU8: Uint8Array; _malloc(n: number): number; _free(p: number): void;
  _aylet_wasm_init(rate: number): void; _aylet_wasm_load(p: number, n: number, t: number): number;
  _aylet_wasm_step_frame(): number; _aylet_wasm_get_regs(): number; _aylet_wasm_stop(): void;
}
async function aylet(): Promise<Aylet> {
  const js = readFileSync(resolve(ROOT, 'public/aylet/Aylet.js'), 'utf8');
  const factory = new Function(js + '; return createAylet;')() as (o: object) => Promise<Aylet>;
  return factory({ wasmBinary: readFileSync(resolve(ROOT, 'public/aylet/Aylet.wasm')), print() {}, printErr() {} });
}
const song = (name: string) => { const b = readFileSync(resolve(ROOT, 'public/data/songs/pt3', name)); return b.buffer.slice(b.byteOffset, b.byteOffset + b.length); };
const periodToXm = (p: number) => Math.round(12 * Math.log2(1773400 / (16 * p) / 440)) + 58;

describe('PT3 grid matches the Bulba player in aylet', () => {
  it.each([
    ['D-Juice_-_Plaintive__1999_.pt3', 0.9],                                             // table 1, PT3.4
    ['brightentayle_-_Penguin_Adventure_Forest_Path__2014___3BM_OpenAir_2014__7_.pt3', 0.6],  // table 2, ornaments
  ])('%s', async (name, share) => {
    const data = song(name);
    const s = await parseZxtuneFile(name, data, createPt3);
    expect(new Uint8Array(s.zxtuneFileData!)).toEqual(new Uint8Array(data));  // unedited export = the file
    const ay = new Uint8Array(s.ayFileData!);
    const tail = ay.subarray(ay.length - data.byteLength);
    expect(tail).toEqual(new Uint8Array(data));  // aylet plays the untouched module
    // Note events over the first positions on the 50 Hz frame timeline (one tick per frame, Fxx = speed).
    const events: Array<{ frame: number; ch: number; note: number }> = [];
    let speed = s.initialSpeed, frame = 0;
    for (const pi of s.songPositions.slice(0, 4)) {
      const pat = s.patterns[pi];
      for (let r = 0; r < pat.length; r++) {
        for (const c of pat.channels) if (c.rows[r].effTyp === 0x0F) speed = c.rows[r].eff;
        pat.channels.forEach((c, ch) => { const n = c.rows[r].note; if (n > 0 && n < 97) events.push({ frame, ch, note: n }); });
        frame += speed;
      }
    }
    const A = await aylet();
    A._aylet_wasm_init(44100);
    const p = A._malloc(ay.length); A.HEAPU8.set(ay, p);
    expect(A._aylet_wasm_load(p, ay.length, 0)).toBe(0);
    const periods: number[][] = [];
    for (let i = 0; i <= frame && A._aylet_wasm_step_frame(); i++) {
      const g = A._aylet_wasm_get_regs(), h = A.HEAPU8;
      periods.push([0, 1, 2].map((ch) => h[g + ch * 2] | ((h[g + ch * 2 + 1] & 15) << 8)));
    }
    A._aylet_wasm_stop(); A._free(p);
    // Frame 0 is the INIT call; the row's first interrupt is frame + 1. Misses are ornament / tone-slide ticks.
    const hits = events.filter((e) => periodToXm(periods[e.frame + 1][e.ch]) === e.note).length;
    expect(events.length).toBeGreaterThan(100);
    expect(hits / events.length).toBeGreaterThan(share);
  });
});
