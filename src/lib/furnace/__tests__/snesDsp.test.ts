import { describe, it, expect } from 'vitest';
import {
  SNES_FIR_PRESETS, SNES_GAIN_MODE, readSnesChipFlags, snesAdsrCurve, snesEchoBufferBytes,
  snesFirResponseDb, snesFirSum, snesGainCurve, writeSnesChipFlags,
} from '../snesDsp';

describe('SNES envelope curves', () => {
  it('attack 15 reaches full level in two samples, attack 0 in 4.1 seconds', () => {
    // 0x400 per step at rate 31 (1 sample); 64 steps of 0x20 at rate 1 (2048 samples).
    expect(snesAdsrCurve({ a: 15, d: 7, s: 7, r: 0, d2: 0, sus: 0 }).attackTime).toBeCloseTo(2 / 32000, 6);
    expect(snesAdsrCurve({ a: 0, d: 7, s: 7, r: 0, d2: 0, sus: 0 }).attackTime).toBeCloseTo((64 * 2048) / 32000, 3);
  });

  it('decay stops at the sustain level and a zero sustain rate holds it', () => {
    const c = snesAdsrCurve({ a: 15, d: 7, s: 3, r: 0, d2: 0, sus: 0 });
    const atKeyOff = c.points.filter((p) => p.t <= c.keyOff!).pop()!;
    expect(Math.floor(atKeyOff.level * 0x7ff) >> 8).toBe(3);
    // sus 0 key-off is the fixed fast release: 8 per sample from under 0x400.
    expect(c.releaseTime).toBeLessThan(0.008);
    expect(c.points[c.points.length - 1].level).toBe(0);
  });

  it('sustain mode 1 releases linearly at rate R, mode 0 ignores R for the release', () => {
    const slow = snesAdsrCurve({ a: 15, d: 7, s: 7, r: 20, d2: 0, sus: 1 });
    expect(slow.releaseTime).toBeGreaterThan(0.03);
    expect(snesAdsrCurve({ a: 15, d: 7, s: 7, r: 0, d2: 0, sus: 1 }).releaseTime).toBe(Infinity);
  });

  it('gain: direct is flat, bent increase is slower than linear, rate 0 never moves', () => {
    expect(snesGainCurve(SNES_GAIN_MODE.DIRECT, 64).points.every((p) => Math.abs(p.level - 64 / 127) < 1e-9)).toBe(true);
    const lin = snesGainCurve(SNES_GAIN_MODE.INC_LINEAR, 20).attackTime;
    const bent = snesGainCurve(SNES_GAIN_MODE.INC_INVLOG, 20).attackTime;
    expect(lin).toBeCloseTo((64 * 24) / 32000, 4);
    expect(bent).toBeGreaterThan(lin);
    expect(snesGainCurve(SNES_GAIN_MODE.DEC_LINEAR, 0).decayTime).toBe(Infinity);
  });
});

describe('SNES echo', () => {
  it('flat filter is flat; low, high and band pass favour their band', () => {
    const [flat, low, high, band] = SNES_FIR_PRESETS.map((p) => snesFirResponseDb(p.taps, 33));
    expect(Math.max(...flat) - Math.min(...flat)).toBeLessThan(0.01);
    expect(low[0] - low[32]).toBeGreaterThan(20);
    expect(high[32] - high[0]).toBeGreaterThan(20);
    expect(band[16] - Math.max(band[0], band[32])).toBeGreaterThan(20);
    for (const p of SNES_FIR_PRESETS) {
      expect(p.taps.reduce((a, b) => a + Math.abs(b), 0)).toBeLessThanOrEqual(127);
      expect(snesFirSum(p.taps).overflow).toBe(false);
    }
  });

  it('flags the tap sum outside -128..127 and sizes the buffer', () => {
    expect(snesFirSum([127, 1, 0, 0, 0, 0, 0, 0])).toEqual({ sum: 128, overflow: true });
    expect(snesFirSum([-128, 0, 0, 0, 0, 0, 0, 0]).overflow).toBe(false);
    expect(snesEchoBufferBytes(5)).toBe(10240);
  });

  it('chip flags round-trip, keep unknown keys and default like Furnace', () => {
    const d = readSnesChipFlags(undefined);
    expect(d).toMatchObject({ echo: false, echoDelay: 0, echoVolL: 127, dryVolL: 127, antiClick: true });
    expect(d.echoFilter).toEqual([127, 0, 0, 0, 0, 0, 0, 0]);
    const s = writeSnesChipFlags('clockSel=1\necho=false\n', { echo: true, echoDelay: 4, dryVolL: 100, echoFilter: [1, -2, 3, 4, 5, 6, 7, 8] });
    expect(s).toContain('clockSel=1\n');
    expect(s).toContain('volScaleL=27\n');
    expect(readSnesChipFlags(s)).toMatchObject({ echo: true, echoDelay: 4, dryVolL: 100, echoFilter: [1, -2, 3, 4, 5, 6, 7, 8] });
  });
});
