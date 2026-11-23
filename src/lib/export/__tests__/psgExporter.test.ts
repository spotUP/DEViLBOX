import { describe, it, expect } from 'vitest';
import { encodePsg, encodeTaym } from '../PSGExporter';
import { isZxtuneFormat } from '../../import/formats/ZxtuneParser';
import type { AyFrame } from '../zx/zxAyStream';

/** Reference decoder per Bulba PSG: header 16, FF end of frame, FD end, FE n = n*4 empty frames, 0..13 reg/value. */
function decodePsg(d: Uint8Array): Uint8Array[] {
  const frames: Uint8Array[] = [];
  const regs = new Uint8Array(14);
  const wrote13: boolean[] = [];
  let i = 16;
  let touched13 = false;
  while (i < d.length) {
    const b = d[i++];
    if (b === 0xFD) break;
    if (b === 0xFF) { frames.push(regs.slice()); wrote13.push(touched13); touched13 = false; continue; }
    if (b === 0xFE) { const n = d[i++] * 4; for (let k = 0; k < n; k++) { frames.push(regs.slice()); wrote13.push(false); } continue; }
    regs[b] = d[i++];
    if (b === 13) touched13 = true;
  }
  (frames as unknown as { wrote13: boolean[] }).wrote13 = wrote13;
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
    expect((out as unknown as { wrote13: boolean[] }).wrote13[6]).toBe(true); // retrigger with same shape kept
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
});
