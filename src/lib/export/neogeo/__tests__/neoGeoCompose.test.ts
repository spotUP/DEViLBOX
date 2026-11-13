/**
 * The Neo Geo compose helpers: note names, the editor volume column, cell writes, the furtool lint
 * and the ADPCM-B V ROM count. The lint guards what furtool crashes on or drops; a song that passes
 * it must not lose a feature on the way into nullsound.
 */
import { describe, it, expect } from 'vitest';
import { DEFAULT_FURNACE } from '@/types/instrument/defaults';
import type { FurnaceConfig, FurnaceMacro } from '@/types/instrument';
import { xmVolToFurnace } from '@/lib/import/furnaceEditorCells';
import {
  NEO, INS_SSG, INS_ADPCM_A, INS_ADPCM_B, noteNumber, xmVolumeFor, NeoGeoSongBuilder, lintNeoGeoSong, adpcmBSampleBytes,
} from '../neoGeoCompose';

const seq = (code: number, data: number[], loop = -1): FurnaceMacro => ({ code, type: 0, data, loop, release: -1, mode: 0 });
const ssg = (macros: FurnaceMacro[]) =>
  ({ ...DEFAULT_FURNACE, divInsType: INS_SSG, operators: [], macros, opMacros: [] }) as FurnaceConfig;

/** One-pattern song with a loop jump, SSG lead on SSG 1. */
function song(macros: FurnaceMacro[] = [seq(0, [15, 12, 9], 2)]) {
  const s = new NeoGeoSongBuilder('t', 7, 16);
  const lead = s.addInstrument('lead', ssg(macros));
  const p = s.pattern();
  p.put(NEO.SSG1, 0, { note: 'F-4', ins: lead, vol: 12 }).put(NEO.FM1, 15, { fx: [[0x0b, 0]] });
  s.order.push(0);
  return { s, p, lead };
}

describe('neoGeoCompose', () => {
  it('names notes the editor way (C-4 = 49, OFF = 97)', () => {
    expect(noteNumber('C-4')).toBe(49);
    expect(noteNumber('F#5')).toBe(67);
    expect(noteNumber('Bb3')).toBe(47);
    expect(noteNumber('OFF')).toBe(97);
    expect(() => noteNumber('H-4')).toThrow();
  });

  it('finds the volume column value that writes an exact Furnace volume', () => {
    const x = xmVolumeFor(12);
    expect(x).toBeGreaterThanOrEqual(0x10);
    expect(xmVolToFurnace(x)).toBe(12);
  });

  it('put replaces an effect already on the cell instead of stacking a copy', () => {
    const { p } = song();
    p.put(NEO.FM1, 2, { fx: [[0x04, 0x34]] }).put(NEO.FM1, 2, { fx: [[0x04, 0x46], [0x08, 0x11]] });
    const cell = p.pattern.channels[NEO.FM1].rows[2] as unknown as Record<string, number>;
    expect([cell.effTyp, cell.eff, cell.effTyp2, cell.eff2]).toEqual([0x04, 0x46, 0x08, 0x11]);
  });

  it('passes a clean song', () => {
    expect(lintNeoGeoSong(song().s.build())).toEqual([]);
  });

  it('rejects ADPCM-A cells and ADPCM-A instruments', () => {
    const { s, p } = song();
    const a = s.addInstrument('sfx', { ...DEFAULT_FURNACE, divInsType: INS_ADPCM_A, operators: [], macros: [] } as FurnaceConfig);
    p.put(NEO.A1, 0, { note: 'C-4', ins: a });
    const out = lintNeoGeoSong(s.build()).join('\n');
    expect(out).toMatch(/ADPCM-A is reserved/);
    expect(out).toMatch(/not for music/);
  });

  it('rejects a song whose last pattern has no 0B loop jump', () => {
    const { s, p } = song();
    p.pattern.channels[NEO.FM1].rows[15] = { ...p.pattern.channels[NEO.FM1].rows[14] };
    expect(lintNeoGeoSong(s.build()).join('\n')).toMatch(/no 0B jump/);
  });

  it('rejects SSG macros furtool drops: pitch, release, two loop points', () => {
    const pitch = lintNeoGeoSong(song([seq(4, [0, 1])]).s.build()).join('\n');
    expect(pitch).toMatch(/SSG macro 4 is not converted/);
    const release = lintNeoGeoSong(song([{ ...seq(0, [15, 8]), release: 1 }]).s.build()).join('\n');
    expect(release).toMatch(/release point/);
    const loops = lintNeoGeoSong(song([seq(0, [15, 8], 1), seq(1, [0, 4, 7], 0)]).s.build()).join('\n');
    expect(loops).toMatch(/one loop for all/);
  });

  it('rejects effects furtool cannot convert on FM 2 operator channels', () => {
    const { s, p } = song();
    p.put(NEO.OP2, 4, { fx: [[0x01, 0x10]] });
    expect(lintNeoGeoSong(s.build()).join('\n')).toMatch(/crashes furtool on an FM 2 operator channel/);
  });

  it('counts ADPCM-B V ROM in 256-byte blocks of 4-bit samples', () => {
    const { s } = song();
    s.addInstrument('kick', {
      ...DEFAULT_FURNACE, divInsType: INS_ADPCM_B, operators: [], macros: [],
      userSample: { name: 'kick', data: new Int16Array(3330), rate: 18500 },
    } as unknown as FurnaceConfig);
    expect(adpcmBSampleBytes(s.build())).toEqual([{ name: 'kick', samples: 3330, bytes: 1792 }]);
  });
});
