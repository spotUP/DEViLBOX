/**
 * ROM exports read the editor song, not the file-ops WASM's last-loaded one: a GB song held only in the stores
 * (project restore, no .fur re-import) exports a module with its notes and instrument, not a blank default.
 */
import { describe, expect, it } from 'vitest';
import { useFormatStore, useTrackerStore, useInstrumentStore } from '@stores';
import { liveFurnaceModule } from '../liveFurModule';
import { furnaceToHuge } from '../gb/hugeSong';
import { FurnaceDispatchPlatform } from '../../../engine/furnace-dispatch/platforms';
import { DEFAULT_FURNACE } from '@/types/instrument/defaults';
import { EMPTY_CELL } from '@/types/tracker';
import type { Pattern } from '@/types/tracker';
import type { InstrumentConfig, FurnaceConfig } from '@/types/instrument';

const ROWS = 16;
const channel = (i: number) => ({ id: `c${i}`, name: `Ch ${i + 1}`, rows: Array.from({ length: ROWS }, () => ({ ...EMPTY_CELL })), muted: false, solo: false, collapsed: false, volume: 100, pan: 0, instrumentId: null, color: null });

describe('liveFurnaceModule (restored GB song, nothing loaded in the file-ops WASM)', () => {
  it('carries the editor notes into the hUGE song data', async () => {
    const pat: Pattern = { id: 'p0', name: 'p0', length: ROWS, channels: Array.from({ length: 4 }, (_, i) => channel(i)) };
    for (const r of [0, 4, 8, 12]) pat.channels[0].rows[r] = { ...EMPTY_CELL, note: 49 + r, instrument: 1 };
    const inst = { id: 1, name: 'Lead', type: 'synth', synthType: 'FurnaceGB', furnace: { ...DEFAULT_FURNACE, chipType: 6, divInsType: 4, operators: [], macros: [], opMacros: [], wavetables: [] } as FurnaceConfig } as unknown as InstrumentConfig;
    useTrackerStore.setState({ patterns: [pat], patternOrder: [0] });
    useInstrumentStore.setState({ instruments: [inst] });
    useFormatStore.setState({ furnaceNative: { subsongs: [], activeSubsong: 0, chipIds: [FurnaceDispatchPlatform.GB] }, furnaceActiveSubsong: 0 });

    const live = await liveFurnaceModule();
    expect(live.module.systems).toEqual([0x04]);
    const notes = [...live.module.patterns.values()].flatMap((p) => p.rows).filter((c) => c.note >= 0 && c.note < 180);
    expect(notes.length).toBe(4);
    expect(() => furnaceToHuge(live.module, live.subsong)).not.toThrow();
  });
});
