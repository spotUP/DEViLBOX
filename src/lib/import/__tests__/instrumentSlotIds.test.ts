/**
 * Imported instruments keep the slot number the pattern cells name.
 *
 * micro15.mod uses samples 16, 18 and 19 and leaves 14, 15 and 17 empty.
 * The MOD parser skips empty slots, and the import used to number the
 * survivors 1..16 in list order, so a cell saying "16" played slot 19's
 * tone loop instead of the hi-hat.
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// The drag-and-drop import (importModuleFile) with only the Tone engine,
// toasts, lookups and the worker-bound classifier mocked - as
// modAfterAhxIsClassic.test.ts runs it.
vi.mock('@/engine/ToneEngine', () => {
  const engine = {
    releaseAll: vi.fn(), disposeAllInstruments: vi.fn(), preloadInstruments: vi.fn(async () => {}),
    invalidateInstrument: vi.fn(), setBPM: vi.fn(),
  };
  return { getToneEngine: () => engine };
});
vi.mock('@/stores/useNotificationStore', () => ({ notify: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() } }));
vi.mock('@/lib/modland/ModlandDetector', () => ({ checkModlandFile: vi.fn(async () => ({ found: true })) }));
vi.mock('@stores/useInstrumentTypeStore', () => ({
  useInstrumentTypeStore: { getState: () => ({ resetClassified: () => {}, classifyInstruments: () => {} }) },
}));
vi.mock('@/lib/songdb', () => ({ computeSongDBHash: () => '', lookupSongDB: async () => null }));
import { parseMOD } from '../formats/MODParser';
import { convertParsedInstruments } from '../InstrumentConverter';
import type { ParsedInstrument } from '@typedefs/tracker';

const MICRO15 = resolve(__dirname, '../../../__tests__/fixtures/micro15-goto80.mod');

const parsed = (id: number): ParsedInstrument => ({ id, name: `s${id}`, samples: [], fadeout: 0, volumeType: 'none', panningType: 'none' });

describe('instrument slot ids on import', () => {
  it('MOD samples after an empty slot keep their slot number', async () => {
    const bytes = readFileSync(MICRO15);
    const { instruments } = await parseMOD(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
    const converted = convertParsedInstruments(instruments, 'MOD');
    expect(converted.map((i) => i.id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 16, 18, 19]);
    // Slot 16 is the 1960-byte hi-hat, not slot 19's 222-byte loop.
    const hat = instruments.find((i) => i.id === 16)!;
    expect(hat.samples[0].length).toBe(1960);
    expect(converted.find((i) => i.id === 16)!.sample?.loopStart).toBe(hat.samples[0].loopStart);
  });

  it('the imported song plays slot 16 where the cells say 16 (through importTrackerModule)', async () => {
    // The dialog's ModuleInfo for a MOD: the native parse ModuleLoader makes
    // (loadWithNativeParser's MOD branch) - the branch that numbered by index.
    const { importTrackerModule } = await import('@/lib/file/UnifiedFileLoader');
    const { useInstrumentStore } = await import('@/stores/useInstrumentStore');
    const { useTrackerStore } = await import('@/stores/useTrackerStore');
    const bytes = readFileSync(MICRO15);
    const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    const parsedMod = await parseMOD(arrayBuffer);
    const info = {
      metadata: { title: 'micro15', type: 'MOD', channels: 4, patterns: 5, orders: 6, instruments: 16, samples: 16, duration: 0 },
      arrayBuffer, file: new File([bytes], 'micro15.mod'),
      nativeData: { format: 'MOD', importMetadata: parsedMod.metadata, instruments: parsedMod.instruments, patterns: parsedMod.patterns },
    };
    await importTrackerModule(info as never, { useLibopenmpt: false } as never);
    await new Promise<void>((r) => queueMicrotask(r));
    const ids = useInstrumentStore.getState().instruments.map((i) => i.id);
    expect(ids).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 16, 18, 19]);
    expect(useInstrumentStore.getState().getInstrument(16)!.sample?.loopStart).toBe(1074);
    // Channel 2 of the first played pattern names slot 16.
    const t = useTrackerStore.getState();
    const cells = t.patterns[t.patternOrder[0]].channels[1].rows.map((r) => r.instrument).filter(Boolean);
    expect(new Set(cells)).toEqual(new Set([16]));
  }, 60000);

  it('a list with a gap is numbered by slot, not by index', () => {
    expect(convertParsedInstruments([parsed(1), parsed(2), parsed(16)], 'MOD').map((i) => i.id)).toEqual([1, 2, 16]);
  });

  it('a parser without slot numbers is numbered from one', () => {
    expect(convertParsedInstruments([parsed(0), parsed(0)], 'XRNS').map((i) => i.id)).toEqual([1, 2]);
  });
});
