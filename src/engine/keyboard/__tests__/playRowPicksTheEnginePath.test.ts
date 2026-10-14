/**
 * Enter (playRow) on a song a whole-song engine plays asks the replayer to preview the row through the engine; the
 * instrument path (previewCell) is for every other song, for an engine without a row preview, and not for a song that
 * is playing (playback already is the grid).
 *
 * Two layers, each where it lives: playRow reacts to the replayer's answer; TrackerReplayer.previewRow makes the
 * decision from the stores (the loaded song's engine, the transport).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const toneEngine = vi.hoisted(() => ({
  ensureInstrumentReady: vi.fn(async () => {}),
  triggerNoteAttack: vi.fn(),
  triggerNoteRelease: vi.fn(),
  triggerChannelMeter: vi.fn(),
  isChannelMuted: vi.fn((_ch: number) => false),
}));
vi.mock('@/engine/ToneEngine', () => ({ getToneEngine: () => toneEngine }));

const previewRow = vi.hoisted(() => vi.fn<(pos: number, row: number) => string>());
vi.mock('@/engine/TrackerReplayer', () => {
  const replayer = new Proxy({}, { get: (_t, k) => (k === 'previewRow' ? previewRow : k === 'isPlaying' ? () => false : () => undefined) });
  return { getTrackerReplayer: () => replayer, peekTrackerReplayer: () => null };
});

import { playRow } from '@engine/keyboard/commands/playRow';
import { rowPreviewRoute } from '@/engine/replayer/NativeEngineRouting';
import { useTrackerStore, useCursorStore, useInstrumentStore } from '@stores';
import { useFormatStore } from '@stores/useFormatStore';
import type { InstrumentConfig } from '@/types/instrument';

function setup() {
  useInstrumentStore.setState({ instruments: [{ id: 1, name: 'lead', type: 'sample', synthType: 'Sampler' } as InstrumentConfig] });
  const t = useTrackerStore.getState();
  useTrackerStore.setState({ currentPatternIndex: 0, currentPositionIndex: 3 });
  t.setCell(0, 8, { note: 42, instrument: 1 });
  useCursorStore.getState().moveCursorToRow(8);
  useCursorStore.getState().moveCursorToChannel(0);
}

describe('playRow picks the engine path', () => {
  beforeEach(() => { vi.clearAllMocks(); setup(); });

  it('a song the replayer previews through its engine: previewRow gets the position and row, previewCell is not called', async () => {
    previewRow.mockReturnValue('engine');
    playRow();
    await Promise.resolve();
    expect(previewRow).toHaveBeenCalledWith(3, 8);
    expect(toneEngine.triggerNoteAttack).not.toHaveBeenCalled();
  });

  it('a playing engine song sounds nothing: the song already is the grid', async () => {
    previewRow.mockReturnValue('playing');
    expect(playRow()).toBe(0);
    await Promise.resolve();
    expect(previewRow).toHaveBeenCalledTimes(1);
    expect(toneEngine.triggerNoteAttack).not.toHaveBeenCalled();
  });

  it('a song with no engine row preview takes the instrument path', async () => {
    previewRow.mockReturnValue('unsupported');
    playRow();
    await new Promise((r) => setTimeout(r, 0));
    expect(toneEngine.triggerNoteAttack).toHaveBeenCalledTimes(1);
  });
});

describe('rowPreviewRoute decides from the stores', () => {
  beforeEach(() => { useFormatStore.setState({ nuadeFileData: null, jamCrackerFileData: null } as never); });
  const route = (playing = false) => rowPreviewRoute(useFormatStore.getState() as unknown as Record<string, unknown>, useInstrumentStore.getState().instruments, playing);

  it('a tracker song is unsupported (the instrument path)', () => {
    expect(route()).toBe('unsupported');
  });

  it('a stopped nuade song is previewed by the engine', () => {
    useFormatStore.setState({ nuadeFileData: new ArrayBuffer(8), nuadePlayerId: 'wallybeben' } as never);
    expect(route()).toBe('engine');
  });

  it('a playing nuade song sounds nothing', () => {
    useFormatStore.setState({ nuadeFileData: new ArrayBuffer(8), nuadePlayerId: 'wallybeben' } as never);
    expect(route(true)).toBe('playing');
  });

  it('an engine song without a row preview adapter is unsupported, stopped or playing', () => {
    useFormatStore.setState({ jamCrackerFileData: new ArrayBuffer(8) } as never);
    expect(route()).toBe('unsupported');
    expect(route(true)).toBe('unsupported');
  });
});
