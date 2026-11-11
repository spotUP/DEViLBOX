/**
 * An MCP pattern write outside the song answers with an error, never `{ ok: true }`.
 * Composer dogfood (2026-11-11): `set_cells` on channel 5 of a 4-channel song
 * returned `{ ok: true }` and wrote nothing, and a patternIndex that does not
 * exist wrote into the current pattern. The composing model then built a song
 * on writes that never happened.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/engine/TrackerReplayer', () => ({
  getTrackerReplayer: () => new Proxy({ stop: () => undefined, hasReplacedInstruments: false, replacedInstrumentIds: [] }, {
    get: (t, k) => (k in t ? (t as Record<string | symbol, unknown>)[k] : () => undefined),
  }),
  peekTrackerReplayer: () => null,
}));
vi.mock('@engine/ToneEngine', () => {
  const engine = new Proxy({}, { get: () => () => Promise.resolve() });
  return { getToneEngine: () => engine };
});
vi.mock('@/engine/ToneEngine', () => {
  const engine = new Proxy({}, { get: () => () => Promise.resolve() });
  return { getToneEngine: () => engine };
});
vi.mock('@stores/useInstrumentTypeStore', () => {
  const state = new Proxy({}, { get: () => () => Promise.resolve() });
  return { useInstrumentTypeStore: { getState: () => state } };
});

import { setCell, setCells, clearCell, clearChannel, clearPattern, fillRange, writeNoteSequence } from '../writeHandlers';
import { useTrackerStore } from '@/stores/useTrackerStore';
import { resetStore } from '@/stores/__tests__/_harness';

function current() {
  const st = useTrackerStore.getState();
  return st.patterns[st.currentPatternIndex];
}

/** Every note in the current pattern, as one string: unchanged means nothing was written. */
function notesOfCurrentPattern(): string {
  return current().channels.map((c) => c.rows.map((r) => r.note).join(',')).join('|');
}

describe('MCP pattern writes outside the song', () => {
  beforeEach(() => resetStore(useTrackerStore));

  it('set_cell on a channel the song does not have names the channel count and the tool that adds channels', () => {
    const channelCount = current().channels.length;
    const result = setCell({ channel: channelCount, row: 0, note: 'C-3' });
    expect(result).not.toHaveProperty('ok');
    expect(String(result.error)).toContain(`the song has ${channelCount} channels`);
    expect(String(result.error)).toContain('set_channel_count');
  });

  it('set_cell on a row past the pattern end names the pattern length', () => {
    const length = current().length;
    const result = setCell({ channel: 0, row: length, note: 'C-3' });
    expect(String(result.error)).toContain(`has ${length} rows`);
  });

  it('set_cell with a patternIndex that does not exist writes nothing into the current pattern', () => {
    const before = notesOfCurrentPattern();
    const result = setCell({ patternIndex: useTrackerStore.getState().patterns.length, channel: 0, row: 0, note: 'C-3' });
    expect(String(result.error)).toContain('patternIndex');
    expect(notesOfCurrentPattern()).toBe(before);
  });

  it('refuses a fractional or negative position', () => {
    expect(setCell({ channel: 0.5, row: 0, note: 'C-3' })).toHaveProperty('error');
    expect(setCell({ channel: 0, row: -1, note: 'C-3' })).toHaveProperty('error');
    expect(setCell({ channel: 0, row: 1.5, note: 'C-3' })).toHaveProperty('error');
  });

  it('set_cells with one bad cell writes none of the batch', () => {
    const before = notesOfCurrentPattern();
    const result = setCells({ cells: [
      { channel: 0, row: 0, note: 'C-3' },
      { channel: current().channels.length, row: 1, note: 'E-3' },
    ] });
    expect(result).toHaveProperty('error');
    expect(notesOfCurrentPattern()).toBe(before);
  });

  it('write_note_sequence that runs past the pattern end writes none of its notes', () => {
    const before = notesOfCurrentPattern();
    const result = writeNoteSequence({ channel: 0, startRow: current().length - 1, notes: ['C-3', 'E-3'] });
    expect(result).toHaveProperty('error');
    expect(notesOfCurrentPattern()).toBe(before);
  });

  it('fill_range past the pattern end, or with a step that never advances, writes nothing', () => {
    const before = notesOfCurrentPattern();
    expect(fillRange({ channel: 0, startRow: 0, endRow: current().length, cell: { note: 'C-3' } })).toHaveProperty('error');
    expect(fillRange({ channel: 0, startRow: 0, endRow: 4, step: 0, cell: { note: 'C-3' } })).toHaveProperty('error');
    expect(notesOfCurrentPattern()).toBe(before);
  });

  it('fill_range with the fields the tool sends (flat note and instrument) writes the notes', () => {
    // The MCP tool schema has no `cell` key: it sends note, instrument, ... flat.
    const result = fillRange({ channel: 0, startRow: 0, endRow: 8, step: 4, note: 'C-3', instrument: 1 });
    expect(result).toMatchObject({ ok: true, count: 3 });
    for (const row of [0, 4, 8]) {
      expect(current().channels[0].rows[row].note).toBeGreaterThan(0);
      expect(current().channels[0].rows[row].instrument).toBe(1);
    }
    expect(current().channels[0].rows[1].note).toBe(0);
  });

  it('fill_range that names no cell field reports an error instead of ok', () => {
    const before = notesOfCurrentPattern();
    expect(fillRange({ channel: 0, startRow: 0, endRow: 8, step: 4 })).toHaveProperty('error');
    expect(notesOfCurrentPattern()).toBe(before);
  });

  it('clear_cell, clear_channel and clear_pattern refuse a target that does not exist', () => {
    const channelCount = current().channels.length;
    expect(clearCell({ channel: channelCount, row: 0 })).toHaveProperty('error');
    expect(clearChannel({ channel: channelCount })).toHaveProperty('error');
    expect(clearPattern({ patternIndex: useTrackerStore.getState().patterns.length })).toHaveProperty('error');
  });

  it('still writes inside the song: last channel, last row, and a full-length sequence', () => {
    const lastChannel = current().channels.length - 1;
    const lastRow = current().length - 1;
    expect(setCell({ channel: lastChannel, row: lastRow, note: 'C-3' })).toEqual({ ok: true });
    expect(current().channels[lastChannel].rows[lastRow].note).toBeGreaterThan(0);

    expect(writeNoteSequence({ channel: 0, startRow: lastRow - 2, notes: ['C-3', 'E-3'], step: 2 })).toMatchObject({ ok: true, count: 2 });
    expect(fillRange({ channel: 0, startRow: 0, endRow: 8, step: 4, cell: { note: 'C-3' } })).toMatchObject({ ok: true, count: 3 });
    expect(clearChannel({ channel: lastChannel })).toEqual({ ok: true });
    expect(clearPattern({})).toEqual({ ok: true });
  });
});
