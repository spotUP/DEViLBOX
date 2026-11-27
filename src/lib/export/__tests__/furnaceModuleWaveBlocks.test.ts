/** Module wavetables reach the .fur as WAVE blocks Furnace's own reader (fur.cpp in the fileops WASM) and the TS parser load back. */
import { describe, it, expect, beforeAll } from 'vitest';
import { exportFurnaceModule } from '../FurnaceModuleExporter';
import { parseFurnaceSong } from '@/lib/import/formats/FurnaceSongParser';
import { loadFurFileWasm } from '@/lib/import/wasm/FurnaceFileOps';
import { installFurnaceFileOpsWasm } from '@/lib/import/__tests__/furnaceFileOpsWasmHarness';
import { DEFAULT_FURNACE } from '@/types/instrument/defaults';
import { EMPTY_CELL, type Pattern } from '@/types/tracker';
import type { InstrumentConfig } from '@/types/instrument';

beforeAll(() => installFurnaceFileOpsWasm());

const waves = [
  { data: Array.from({ length: 32 }, (_, i) => i % 16), width: 32, height: 15 },
  { data: Array.from({ length: 64 }, (_, i) => 63 - i), width: 64, height: 63 },
];

function song() {
  const p: Pattern = {
    id: 'p0', name: 'p0', length: 4,
    channels: Array.from({ length: 14 }, (_, i) => ({
      id: `c${i}`, name: `Ch ${i + 1}`, rows: Array.from({ length: 4 }, () => ({ ...EMPTY_CELL })),
      muted: false, solo: false, collapsed: false, volume: 100, pan: 0, instrumentId: null, color: null,
    })),
  };
  p.channels[0].rows[0] = { ...EMPTY_CELL, note: 49, instrument: 1 };
  const fm = { ...DEFAULT_FURNACE, chipType: 14, macros: [], opMacros: [{}, {}, {}, {}] };
  const inst = { id: 1, name: 'FM', type: 'synth', synthType: 'FurnaceOPNB', furnace: fm } as unknown as InstrumentConfig;
  return { name: 'Waves', patterns: [p], instruments: [inst], songPositions: [0], initialSpeed: 6, initialBPM: 125, wavetables: waves };
}

const buf = (b: Uint8Array): ArrayBuffer => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;

describe('exportFurnaceModule WAVE blocks', () => {
  it('round-trips wavetables through Furnace fur.cpp and the TS parser', async () => {
    const { bytes } = exportFurnaceModule(song());
    const furnace = await loadFurFileWasm(buf(bytes));
    expect(furnace.wavetables).toEqual(waves);
    const ts = await parseFurnaceSong(buf(bytes));
    expect(ts.wavetables).toEqual(waves.map((w) => ({ name: '', ...w })));
    expect(ts.instruments.length).toBe(1);
  });

  it('refuses a wave Furnace would reject', () => {
    expect(() => exportFurnaceModule({ ...song(), wavetables: [{ data: [], width: 300, height: 15 }] })).toThrow(/wavetable 0/);
  });
});
