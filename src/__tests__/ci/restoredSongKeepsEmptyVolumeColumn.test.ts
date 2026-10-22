/**
 * A restored song keeps its empty cells empty, so its notes play at full level.
 *
 * The bug: savedSongToApply migrates the whole project when any one instrument needs it (an incomplete config,
 * a missing type). migrateCell then ran the old-format conversions on cells already in the current format:
 * instrument 0 became 1 and the empty volume column (0) became 0x10, XM "set volume 0". After a restore every
 * cell of the song said "volume 0" and pattern playback was a click. Cells in the current format now pass through.
 */
import { describe, it, expect } from 'vitest';
import { EMPTY_CELL, type Pattern, type TrackerCell } from '@typedefs';
import type { InstrumentConfig } from '@typedefs/instrument';
import { savedSongToApply } from '@lib/song/savedSong';
import type { ProjectMetadata } from '@typedefs/project';

const note: TrackerCell = { ...EMPTY_CELL, note: 49, instrument: 1 }; // C-4, volume column empty
const pattern: Pattern = {
  id: 'p0',
  name: 'Untitled Pattern',
  length: 4,
  channels: [0, 1].map((ch) => ({
    id: `ch${ch}`, name: `Channel ${ch + 1}`, muted: false, solo: false, collapsed: false, volume: 80, pan: 0,
    instrumentId: null, color: null,
    rows: [ch === 0 ? { ...note } : { ...EMPTY_CELL }, { ...EMPTY_CELL }, { ...EMPTY_CELL }, { ...EMPTY_CELL }],
  })),
} as unknown as Pattern;

/** An instrument the migration fills in: WobbleBass without its envelope. */
const incomplete = { id: 1, name: 'WobbleBass', type: 'synth', synthType: 'WobbleBass', volume: 0, pan: 0 } as unknown as InstrumentConfig;

const restore = () => savedSongToApply({
  metadata: { name: 'Untitled' } as unknown as ProjectMetadata,
  bpm: 125, patterns: [structuredClone(pattern)], instruments: [incomplete],
});

describe('a restored song keeps its empty cells empty', () => {
  it('migrates the incomplete instrument (the path the bug took)', () => {
    expect(restore().instruments[0].wobbleBass?.envelope).toBeDefined();
  });

  it('keeps every cell value: no instrument 1 and no "set volume 0" on empty cells', () => {
    const rows = restore().patterns[0].channels.flatMap((c) => c.rows);
    expect(rows).toEqual(pattern.channels.flatMap((c) => c.rows));
    expect(rows.filter((r) => r.volume === 0x10)).toHaveLength(0);
  });

  it('still converts an old-format cell (string note, direct volume 0-64)', () => {
    const old = structuredClone(pattern);
    old.channels[0].rows[0] = { note: 'C-4', instrument: 0, volume: 32, effect: '...' } as unknown as TrackerCell;
    const out = savedSongToApply({
      metadata: { name: 'Old' } as unknown as ProjectMetadata, bpm: 125, patterns: [old], instruments: [incomplete],
    }).patterns[0].channels[0].rows[0];
    expect(out.note).toBeGreaterThan(0);
    expect(out.instrument).toBe(1);
    expect(out.volume).toBe(0x10 + 32);
  });
});
