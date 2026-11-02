/**
 * P14e: MaxTrax takes tracker keyboard note entry (it was double click only).
 *
 * Drives the key handler the grid's onKeyDown calls (handleMaxTraxKey) on a REAL MaxTrax song, through the real
 * useMaxTraxGrid editor, and checks the typed note landed in the store and the writer ran (maxTraxRev bump, worklet
 * projection). The ownership table must name the view as the writer of its keys: with 'none' the window handler only
 * jams and the grid had no handler at all.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const { projectEventToWorklet, recook } = vi.hoisted(() => ({ projectEventToWorklet: vi.fn(), recook: vi.fn() }));
vi.mock('@/engine/maxtrax/MaxTraxEngine', () => ({
  MaxTraxEngine: { getInstance: () => ({ projectEventToWorklet, recook }) },
}));

import { parseMaxTrax } from '@/lib/import/formats/maxtrax/maxtraxFormat';
import { useMaxTraxGrid } from '@/hooks/useMaxTraxGrid';
import { useFormatStore } from '@/stores/useFormatStore';
import { useEditorStore } from '@stores/useEditorStore';
import { handleMaxTraxKey, type MaxTraxCursor, type MaxTraxKeyEvent } from '@/lib/maxtrax/maxtraxKeyboard';
import { ENTRY_OWNER, windowHandlerWritesCells } from '@/lib/tracker/formatModeKeyOwnership';

const FIXTURE = join(process.cwd(), 'public/data/songs/maxtrax', 'contraptionzack-march.mxtx');
const TPR = 24;

const key = (k: string): MaxTraxKeyEvent => ({ key: k, repeat: false, ctrlKey: false, altKey: false, metaKey: false, preventDefault: () => {} });

beforeEach(() => {
  vi.clearAllMocks();
  const bytes = readFileSync(FIXTURE);
  useFormatStore.getState().setMaxTraxData(parseMaxTrax(new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength)));
  useEditorStore.setState({ recordMode: true, currentOctave: 4, editStep: 1 });
});

function setup() {
  const hook = renderHook(() => useMaxTraxGrid(0, TPR));
  let cursor: MaxTraxCursor = { column: 0, row: 0 };
  const press = (k: string) => act(() => {
    handleMaxTraxKey(key(k), {
      grid: hook.result.current.grid!,
      getCursor: () => cursor,
      setCursor: (c) => { cursor = c; },
      isPlaying: () => false,
      playbackRow: () => 0,
      edit: hook.result.current.edit,
    });
  });
  return { hook, press, at: (c: MaxTraxCursor) => { cursor = c; }, cursor: () => cursor };
}

describe('MaxTrax keyboard note entry', () => {
  it('the view owns its keys (the window handler only jams)', () => {
    expect(ENTRY_OWNER.maxtrax).toBe('view');
    expect(windowHandlerWritesCells('maxtrax')).toBe(false);
  });

  it('typing a note key on an existing note changes its pitch through the store and the worklet, and steps down', () => {
    const { hook, press, at, cursor } = setup();
    const on = hook.result.current.grid!.noteCells.find((c) => c.kind === 'noteOn')!;
    const rev = useFormatStore.getState().maxTraxRev;
    at({ column: on.column, row: on.row });
    press('z'); // C in the current octave 4 = MIDI 60
    expect(useFormatStore.getState().maxTraxData!.scores[0].events[on.eventIndex].command).toBe(60);
    expect(useFormatStore.getState().maxTraxRev).toBeGreaterThan(rev);
    expect(projectEventToWorklet).toHaveBeenCalledWith(0, on.eventIndex, expect.objectContaining({ command: 60 }));
    expect(cursor().row).toBe(on.row + 1);
  });

  it('typing on an empty cell inserts a note in that column channel at that row, keeping later events in place', () => {
    const { hook, press, at } = setup();
    const grid = hook.result.current.grid!;
    const before = useFormatStore.getState().maxTraxData!.scores[0].events;
    const col = grid.columns.findIndex((_, i) => grid.noteCells.every((c) => c.column !== i || c.row !== 3));
    expect(col).toBeGreaterThanOrEqual(0);
    at({ column: col, row: 3 });
    press('x'); // D in octave 4 = MIDI 62
    const after = useFormatStore.getState().maxTraxData!.scores[0].events;
    expect(after.length).toBe(before.length + 1);
    const abs = (evs: typeof after) => { let t = 0; return evs.map((e) => (t += e.startTime)); };
    const a = abs(after);
    const i = after.findIndex((e, k) => e.command === 62 && a[k] === 3 * TPR && (e.data & 0x0f) === grid.columns[col].channel);
    expect(i).toBeGreaterThanOrEqual(0);
    const beforeAbs = abs(before);
    expect(a.filter((_, k) => k !== i)).toEqual(beforeAbs);
  });

  it('edit mode off writes nothing', () => {
    useEditorStore.setState({ recordMode: false });
    const { hook, press, at } = setup();
    const on = hook.result.current.grid!.noteCells.find((c) => c.kind === 'noteOn')!;
    const rev = useFormatStore.getState().maxTraxRev;
    at({ column: on.column, row: on.row });
    press('z');
    expect(useFormatStore.getState().maxTraxRev).toBe(rev);
  });
});
