/**
 * A stub parser's empty grid does not pre-empt the UADE scan grid.
 *
 * Eleven formats have a native parser that returns one empty 64-row
 * placeholder while UADE plays the audio (`withNativeThenUADE(...,
 * { injectUADE: true })`). Formats with NO parser got the heuristic scan
 * grid from UADE; formats with a stub got the empty placeholder - a worse
 * display for having a parser (ledger F6, owner decision 2026-10-04: stubs
 * get the scan grid). The `native` preference branch already fell through
 * on zero notes; the inject branch returned the placeholder.
 */
import { describe, it, expect, vi } from 'vitest';
import type { TrackerSong } from '@/engine/TrackerReplayer';

const uadeSong = { name: 'from-uade', patterns: [], instruments: [] } as unknown as TrackerSong;
vi.mock('@lib/import/formats/UADEParser', () => ({ parseUADEFile: vi.fn(async () => uadeSong) }));

const emptyCell = () => ({ note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 });
function song(withNote: boolean): TrackerSong {
  const rows = Array.from({ length: 64 }, emptyCell);
  if (withNote) rows[0].note = 49;
  return {
    name: 'native', format: 'MOD', instruments: [], songPositions: [0], songLength: 1, restartPosition: 0,
    numChannels: 4, initialSpeed: 6, initialBPM: 125, linearPeriods: false,
    patterns: [{ id: 'p0', name: 'p0', length: 64, channels: [{ id: 'c0', name: 'c0', muted: false, solo: false, collapsed: false, volume: 100, pan: 0, instrumentId: null, color: null, rows }] }],
  } as unknown as TrackerSong;
}
const ctx = () => ({ buffer: new ArrayBuffer(64), originalFileName: 'eco.gray', prefs: {} as never, subsong: 0 });

describe('withNativeThenUADE with injectUADE', () => {
  it('hands a placeholder grid to UADE, which builds the scan grid', async () => {
    const { withNativeThenUADE } = await import('../parsers/withFallback');
    const out = await withNativeThenUADE('fredGray', ctx(), () => song(false), 'Stub', { injectUADE: true });
    expect(out.name).toBe('from-uade');
  });

  it('keeps a native grid that has notes, with UADE injected for audio', async () => {
    const { withNativeThenUADE } = await import('../parsers/withFallback');
    const out = await withNativeThenUADE('fredGray', ctx(), () => song(true), 'Real', { injectUADE: true });
    expect(out.name).toBe('native');
    expect((out as unknown as { uadeEditableFileData?: ArrayBuffer }).uadeEditableFileData?.byteLength).toBe(64);
  });
});
