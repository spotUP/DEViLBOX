import { describe, expect, it } from 'vitest';
import { exportFurnaceModule } from '../FurnaceModuleExporter';
import { furnaceSettingsForExport, parseGrooves, parseSpeedList } from '../furnaceSongSettings';
import { parseFurnaceSong } from '@/lib/import/formats/FurnaceSongParser';
import { DEFAULT_FURNACE } from '@/types/instrument/defaults';
import { EMPTY_CELL } from '@/types/tracker';
import type { Pattern } from '@/types/tracker';
import type { InstrumentConfig } from '@/types/instrument';
import type { ProjectMetadata } from '@typedefs/project';

function baseSong() {
  const channels = Array.from({ length: 14 }, (_, i) => ({
    id: `c${i}`, name: `C${i}`, muted: false, solo: false, collapsed: false, volume: 100, pan: 0, instrumentId: null, color: null,
    rows: Array.from({ length: 16 }, () => ({ ...EMPTY_CELL })),
  }));
  const p = { id: 'p0', name: 'p0', length: 16, channels } as unknown as Pattern;
  const inst = { id: 1, name: 'FM', synthType: 'FurnaceOPNB', furnace: { ...DEFAULT_FURNACE } } as unknown as InstrumentConfig;
  return { name: 'T', patterns: [p], instruments: [inst], songPositions: [0], initialSpeed: 6, initialBPM: 150 };
}
const parse = (b: Uint8Array) => parseFurnaceSong(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer);

describe('Furnace song settings', () => {
  it('writes author, album, system name, tuning, arp speed, speed pattern, virtual tempo, tick rate and grooves into the .fur', async () => {
    const meta = {
      author: 'Ada', furnace: {
        album: 'Disc', systemName: 'My Board', tuning: 432, arpSpeed: 3, speedPattern: [6, 4, 5], virtualTempoN: 200, virtualTempoD: 100, hz: 50,
        grooves: [[6, 4, 5], [2, 2]],
      },
    } as unknown as ProjectMetadata;
    const mod = await parse(exportFurnaceModule({ ...baseSong(), ...furnaceSettingsForExport(meta) }).bytes);
    expect(mod.author).toBe('Ada');
    expect(mod.category).toBe('Disc');
    expect(mod.systemName).toBe('My Board');
    expect(mod.tuning).toBeCloseTo(432, 3);
    const sub = mod.subsongs[0];
    expect(sub.arpLen).toBe(3);
    expect(sub.speedPattern).toEqual([6, 4, 5]);
    expect([sub.virtualTempo, sub.virtualTempoD]).toEqual([200, 100]);
    expect(sub.hz).toBe(50);
    expect(mod.grooves.map((g) => g.val.slice(0, g.len))).toEqual([[6, 4, 5], [2, 2]]);
  });

  it('keeps today\'s output when nothing is set', async () => {
    const mod = await parse(exportFurnaceModule({ ...baseSong(), ...furnaceSettingsForExport({ author: 'Unknown' } as ProjectMetadata) }).bytes);
    expect(mod.author).toBe('');
    expect(mod.tuning).toBe(440);
    expect(mod.subsongs[0].speed1).toBe(6);
  });

  it('parses speed and groove text', () => {
    expect(parseSpeedList('6, 4 5 x 0 300')).toEqual([6, 4, 5]);
    expect(parseGrooves('6,4\n\n2 2')).toEqual([[6, 4], [2, 2]]);
  });
});
