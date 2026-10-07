/**
 * Undo, redo and macro paste reach the playing engine.
 *
 * They restored the pattern in the store (replacePattern, readMacroSlot) and
 * stopped there: the engine kept playing the note the user had just undone.
 * A typed edit hands its cell to sendCellEditsToEngine; so must these.
 *
 * One reachability test on a Digital Sound Studio song: the store's real
 * setCell, the history store's undo/redo restored through replacePattern and
 * the real readMacroSlot, counting the engine's setCell (the sentinel).
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { TrackerSong } from '@/engine/TrackerReplayer';
// Static imports: the store graph takes long to transform on a loaded machine,
// and module collection is not bound by the test timeout.
import { parseDigitalSoundStudioFile } from '@lib/import/formats/DigitalSoundStudioParser';
import { useTrackerStore } from '@/stores/useTrackerStore';
import { useCursorStore } from '@/stores/useCursorStore';
import { useHistoryStore } from '@/stores/useHistoryStore';

const ROOT = resolve(__dirname, '../../..');
type Call = { pattern: number; row: number; channel: number; note: number };
const calls: Call[] = [];
let loaded: TrackerSong | null = null;

vi.mock('@/engine/dss/DssEngine', () => ({
  DssEngine: {
    hasInstance: () => true,
    getInstance: () => ({
      setCell: (pattern: number, row: number, channel: number, note: number) => { calls.push({ pattern, row, channel, note }); },
    }),
  },
}));
vi.mock('@engine/TrackerReplayer', async (orig) => ({
  ...(await orig<object>()),
  getTrackerReplayer: () => ({
    getSong: () => loaded,
    syncCellToWasmSequencer: () => {},
    setChannelMuteMask: () => {},
    isPlaying: () => false,
  }),
}));

const settle = () => new Promise((r) => setTimeout(r, 0));

describe('undo, redo and macro paste reach the engine', { timeout: 60000 }, () => {
  it('each restores the cell in the replayer, not just in the grid', async () => {
    loaded = parseDigitalSoundStudioFile(new Uint8Array(readFileSync(resolve(ROOT, 'public/data/songs/digital-sound-studio/zrimay.dss'))), 'zrimay.dss')!;
    // What every undo/redo entry point does (App, toolbar, Ctrl+Z, MIDI): pop the
    // history, put the pattern back through the store's replacePattern.
    const restore = (dir: 'undo' | 'redo') => {
      const pattern = useHistoryStore.getState()[dir]();
      expect(pattern, `${dir} had something to restore`).toBeTruthy();
      useTrackerStore.getState().replacePattern(useTrackerStore.getState().currentPatternIndex, pattern!);
    };
    const undo = () => restore('undo');
    const redo = () => restore('redo');
    useTrackerStore.getState().loadPatterns(structuredClone(loaded.patterns));
    useHistoryStore.getState().clearHistory();
    useTrackerStore.setState({ currentPatternIndex: 0 });

    const CH = 0;
    const rows = useTrackerStore.getState().patterns[0].channels[CH].rows;
    const row = rows.findIndex((c) => c.note === 0);
    expect(row).toBeGreaterThanOrEqual(0);
    useTrackerStore.getState().setCell(CH, row, { note: 61, instrument: 1 });
    await settle();
    expect(calls.at(-1)).toMatchObject({ row, channel: CH, note: 61 });

    // undo puts the empty cell back in the replayer
    calls.length = 0;
    undo();
    await settle();
    expect(calls).toContainEqual(expect.objectContaining({ pattern: 0, row, channel: CH, note: 0 }));

    // redo plays the note again
    calls.length = 0;
    redo();
    await settle();
    expect(calls).toContainEqual(expect.objectContaining({ pattern: 0, row, channel: CH, note: 61 }));

    // macro paste: store the typed cell, paste it on another empty row
    const at = (r: number) => useCursorStore.setState((st) => ({ cursor: { ...st.cursor, channelIndex: CH, rowIndex: r } }));
    at(row);
    useTrackerStore.getState().writeMacroSlot(0);
    const target = useTrackerStore.getState().patterns[0].channels[CH].rows.findIndex((c, r) => r > row && c.note === 0);
    expect(target).toBeGreaterThan(row);
    at(target);
    calls.length = 0;
    useTrackerStore.getState().readMacroSlot(0);
    await settle();
    expect(calls).toContainEqual(expect.objectContaining({ pattern: 0, row: target, channel: CH, note: 61 }));
  });
});
