import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { encodePsg, encodeTaym } from '../PSGExporter';
import { isZxtuneFormat } from '../../import/formats/ZxtuneParser';
import type { AyFrame } from '../zx/zxAyStream';

/**
 * Reference decoder per real PSG dumps: header 16, FF opens a frame, FE n opens n*4 frames, FD end, 0..13 reg/value.
 * Data belongs to the most recently opened frame. Returns per-frame register state; `writes` holds each frame's
 * written registers (an AyFrame, in file order) so the encoder can be fed exactly what the file wrote.
 */
function decodePsg(d: Uint8Array): Uint8Array[] & { wrote13: boolean[]; writes: AyFrame[] } {
  const frames = [] as unknown as Uint8Array[] & { wrote13: boolean[]; writes: AyFrame[] };
  frames.wrote13 = []; frames.writes = [];
  const regs = new Uint8Array(14);
  let open = false;
  let w: AyFrame = [];
  const close = () => { if (open) { frames.push(regs.slice()); frames.wrote13.push(w[13] !== undefined); frames.writes.push(w); } w = []; open = true; };
  let i = 16;
  while (i < d.length) {
    const b = d[i++];
    if (b === 0xFD) break;
    if (b === 0xFF) { close(); continue; }
    if (b === 0xFE) { for (let k = d[i++] * 4; k > 0; k--) close(); continue; }
    regs[b] = d[i]; w[b] = d[i++];
  }
  if (open) close();
  return frames;
}

describe('PSG export', () => {
  const f = (o: Record<number, number>): AyFrame => { const a: AyFrame = []; for (const k in o) a[+k] = o[k]; return a; };
  const frames: AyFrame[] = [f({ 0: 10, 8: 15, 13: 8 }), f({}), f({}), f({}), f({}), f({}), f({ 0: 12, 13: 8 })];

  it('round-trips and writes a Bulba header', () => {
    const d = encodePsg(frames);
    expect([...d.slice(0, 4)]).toEqual([0x50, 0x53, 0x47, 0x1A]);
    expect(isZxtuneFormat(d.buffer.slice(d.byteOffset, d.byteOffset + d.length) as ArrayBuffer)).toBe(true);
    const out = decodePsg(d);
    expect(out.length).toBe(frames.length);
    expect(out[0][0]).toBe(10);
    expect(out[5][8]).toBe(15);
    expect(out[6][0]).toBe(12);
    expect(out.wrote13[6]).toBe(true); // retrigger with same shape kept
    expect(d.includes(0xFE)).toBe(true); // 4 empty frames compressed
  });

  it('wraps in TAYM with TRAK, CHIP, PSG0', () => {
    const psg = encodePsg(frames);
    const t = encodeTaym(psg, 'x');
    expect(String.fromCharCode(...t.slice(0, 4))).toBe('TAYM');
    const dv = new DataView(t.buffer);
    expect(dv.getUint32(12, true)).toBe(t.length - 16);
    const tags: string[] = [];
    for (let o = 16; o < t.length; o += 8 + dv.getUint32(o + 4, true)) tags.push(String.fromCharCode(...t.slice(o, o + 4)));
    expect(tags[0]).toBe('TRAK'); expect(tags[1]).toBe('CHIP'); expect(tags.at(-1)).toBe('PSG0');
  });

  // Owner-supplied third-party dump. FF opens a frame: the file has "07 FF FE 0C 00 00", data right after FE.
  // Byte-exact is impossible by design: the dump re-writes unchanged registers (65066 of 79145 writes), our delta
  // encoder drops them. So: every frame's register state must match, and bytes must match up to that first rewrite.
  // test-data/ is git-ignored: skip on checkouts without the owner's dump.
  const uranusPath = resolve(__dirname, '../../../../test-data/psg/uranus.psg');
  it.skipIf(!existsSync(uranusPath))('re-encodes uranus.psg: same state every frame, same bytes up to the first unchanged-register rewrite', () => {
    const src = new Uint8Array(readFileSync(uranusPath));
    const dec = decodePsg(src);
    const out = encodePsg(dec.writes);
    const back = decodePsg(out);
    expect(back.length).toBe(6734);
    expect(back.map((f) => [...f])).toEqual(dec.map((f) => [...f]));
    let diff = 0;
    while (diff < src.length && src[diff] === out[diff]) diff++;
    expect(diff).toBe(23); // src "00 00" (reg 0 = 0, unchanged from reset); was 18 when FF closed a frame
    expect([...src.slice(16, 25)]).toEqual([0xFE, 0x95, 0xFF, 0x07, 0xFF, 0xFE, 0x0C, 0x00, 0x00]);
  });
});
