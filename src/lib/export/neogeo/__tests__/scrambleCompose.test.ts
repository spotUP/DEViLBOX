/**
 * The BossGame compose path: a ScrambleSongBuilder song exports as two AY-3-8910 systems at the
 * Scramble contract (58.3 Hz, format 228) and its AY volumes land as written.
 */
import { describe, it, expect } from 'vitest';
import { exportFurnaceAyScramble, FUR_AY_SCRAMBLE_VERSION } from '../../FurnaceExporter';
import { parseFurnaceSong } from '@/lib/import/formats/FurnaceSongParser';
import { xmVolumeFor } from '../neoGeoCompose';
import { AY, AY_MACRO, ScrambleSongBuilder, ayInstrument, ayMacro, ayVol } from '../scrambleCompose';

function song(channels: 3 | 6) {
  const s = new ScrambleSongBuilder('t', 6, 16, channels);
  const lead = s.addInstrument('lead', ayInstrument([ayMacro(AY_MACRO.VOL, [15, 13, 12], 2)]));
  const p = s.pattern();
  p.put(AY.LEAD, 0, { note: 'C-5', ins: lead, vol: ayVol(13) });
  if (channels === 6) p.put(AY.AY1_C, 4, { note: 'G-3', ins: lead, fx: [[0xec, 2]] });
  s.order.push(0);
  return s;
}

describe('scrambleCompose', () => {
  it('builds two AY systems, six channels, 58.3 Hz, format 228', async () => {
    const s = song(6);
    const { bytes } = exportFurnaceAyScramble(s.build());
    const mod = await parseFurnaceSong(bytes.slice().buffer);
    expect(s.problems).toEqual([]);
    expect(mod.version).toBe(FUR_AY_SCRAMBLE_VERSION);
    expect(mod.systems).toEqual([0x80, 0x80]);
    expect(mod.chans).toBe(6);
    expect(mod.subsongs[0].hz).toBeCloseTo(58.3, 3);
    expect(mod.instruments.map((i) => i.name)).toEqual(['lead']);
  });

  it('keeps a 3-channel sketch on one system', async () => {
    const mod = await parseFurnaceSong(exportFurnaceAyScramble(song(3).build()).bytes.slice().buffer);
    expect(mod.systems).toEqual([0x80]);
  });

  it('gives every AY volume 0-15 an exact editor column value', () => {
    for (let v = 0; v <= 15; v++) expect(xmVolumeFor(ayVol(v))).toBeGreaterThanOrEqual(0x10);
    expect(() => ayVol(16)).toThrow();
  });
});
