/**
 * QuadTone 128K song data (public/zx/quadtone.asm). The record bytes and the T-state timeline are checked here,
 * the audio by MAME against the Furnace WASM render (see thoughts/spot/2026-11-16-zx-native-tap-research.md).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  encodeQuadTone, quadToneVoiceMode, renderQuadToneDrum,
  QUADTONE_CLOCK, QUADTONE_ITER_T, QUADTONE_DRUM_BYTE_T, type QuadToneFrame,
} from '../zxQuadToneData';

const DRUMS = 0x8000 + 0x400;

/** 17 registers: per voice freq lo, freq hi, duty, volume; then drum rate. */
function regs(voices: Array<[number, number, number]>, rate = 11): number[] {
  const r = new Array(17).fill(0);
  voices.forEach(([f, d, v], i) => { r[i * 4] = f & 0xFF; r[i * 4 + 1] = f >> 8; r[i * 4 + 2] = d; r[i * 4 + 3] = v; });
  r[16] = rate;
  return r;
}
const frame = (r: number[], sample = -1, pos = 0, hz = 50): QuadToneFrame => ({ regs: r, sample, pos, hz });

describe('QuadTone song data', () => {
  it('matches the player loop timings in quadtone.json', () => {
    const meta = JSON.parse(readFileSync('public/zx/quadtone.json', 'utf8'));
    expect([meta.iterT, meta.drumByteT, meta.clock]).toEqual([QUADTONE_ITER_T, QUADTONE_DRUM_BYTE_T, QUADTONE_CLOCK]);
    expect(meta.dataOffset).toBe(meta.size);
  });

  it('maps volume 31 to "high while phase >= duty" and volume 7 to "high while phase < duty"', () => {
    expect(quadToneVoiceMode(31, 64)).toEqual({ op: 0xC6, operand: 192, slot0: 0x79 });
    expect(quadToneVoiceMode(7, 64)).toEqual({ op: 0xD6, operand: 64, slot0: 0x71 });
    expect(quadToneVoiceMode(0, 64)).toEqual({ op: 0xD6, operand: 0, slot0: 0x71 });
    // Negative check: the two audible volumes must not share an encoding.
    expect(quadToneVoiceMode(31, 128)).not.toEqual(quadToneVoiceMode(7, 128));
  });

  it('writes changed voices once, scales frequency to the Z80 clock and ends each tick on time', () => {
    const a = regs([[1000, 128, 31], [0, 128, 0], [0, 128, 0], [0, 128, 0]]);
    const b = regs([[1000, 128, 31], [2000, 128, 7], [0, 128, 0], [0, 128, 0]]);
    const d = encodeQuadTone({ frames: [frame(a), frame(a), frame(b)], samples: [] }, DRUMS);
    const bank = d.banks[0];
    expect(d.banks).toHaveLength(1);
    expect(bank[0]).toBe(0x01); // voice 1 changed
    const word = bank[1] | (bank[2] << 8);
    // NTSC chip clock / Z80 clock, plus the small pause share.
    expect(word / 1000).toBeGreaterThan(3579545 / 3546900);
    expect(word / 1000).toBeLessThan(3579545 / 3546900 * 1.01);
    expect([...bank.subarray(3, 6)]).toEqual([0xC6, 128, 0x79]);
    const rounds1 = bank[6];
    expect(rounds1).toBeGreaterThan(200);
    expect(bank[7]).toBe(0x00); // tick 2: nothing changed
    expect(bank[9]).toBe(0x02); // tick 3: voice 2
    expect(bank[bank.length - 1]).toBe(0x81);
    expect(d.maxTickErrorT).toBeLessThanOrEqual(QUADTONE_ITER_T / 2);
    expect(d.seconds).toBeCloseTo(3 / 50, 6);
  });

  it('plays a drum hit from its pre-rendered bytes and keeps the tick length', () => {
    const r = regs([[1000, 128, 31], [0, 128, 0], [0, 128, 0], [0, 128, 0]]);
    const bits = Array.from({ length: 400 }, (_, i) => (i >> 2) & 1);
    const d = encodeQuadTone({ frames: [frame(r, 0, 0), frame(r, 0, 100), frame(r)], samples: [bits] }, DRUMS);
    expect(d.drumHits).toBe(1);
    expect(d.drums.length).toBe(renderQuadToneDrum(bits, 13 * 13, 3579545).length);
    const bank = d.banks[0];
    expect(bank[0]).toBe(0x11);
    // The drum loop starts ~217 T after the tick, so the bytes Furnace already played are skipped.
    const skipped = (bank[6] | (bank[7] << 8)) - DRUMS;
    expect(skipped).toBe(1);
    expect(bank[8]).toBe(d.drums.length - skipped); // short hit: the rest of it in the first tick
    expect(d.maxTickErrorT).toBeLessThanOrEqual(QUADTONE_ITER_T / 2);
  });

  it('refuses a drum sample the capture does not contain', () => {
    const r = regs([[0, 128, 0], [0, 128, 0], [0, 128, 0], [0, 128, 0]]);
    expect(() => encodeQuadTone({ frames: [frame(r, 3, 0)], samples: [] }, DRUMS)).toThrow(/sample 3/);
  });
});
