/**
 * The position matrix and the pattern editor are separate editors (owner 2026-11-03: "clicking and scrolling the
 * pattern editor also scrolls the matrix it should not, they are separate"; "the selected line is not vertically
 * centered its at the bottom").
 *
 * Cause: both are PatternEditorCanvas in format mode, and every format canvas read and wrote the tracker's ONE
 * cursor (useCursorStore). A click, wheel or arrow in the pattern editor moved the matrix's row; a pattern row past
 * the last song position clamped the matrix row to its last line. The matrix also added the dub deck height to its
 * reference height although the deck takes height only from the pattern editor, so its edit row pinned to the
 * bottom edge (editRowTop).
 *
 * The real canvases render side by side, their messages to the render worker captured.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act, cleanup } from '@testing-library/react';

type Msg = { type: string; h?: number; referenceH?: number; cursor?: { rowIndex: number } };
const bridges: Msg[][] = [];
vi.mock('@engine/renderer/OffscreenBridge', () => ({
  TrackerOffscreenBridge: class {
    posts: Msg[] = [];
    constructor(_f: unknown, _o: unknown) { bridges.push(this.posts); }
    post(m: Msg) { this.posts.push(m); }
    dispose() {}
  },
}));
vi.mock('@/engine/ToneEngine', () => ({ getToneEngine: () => new Proxy({}, { get: () => () => Promise.resolve() }) }));
vi.mock('@/engine/TrackerReplayer', () => ({
  getTrackerReplayer: () => new Proxy({}, { get: (_t, k) => (k === 'isPlaying' ? () => false : () => undefined) }),
  peekTrackerReplayer: () => null,
}));

import '@stores';
import { PatternEditorCanvas } from '@/components/tracker/PatternEditorCanvas';
import { formatKeyOwnedBy, POSITION_MATRIX_ATTR } from '@/components/tracker/formatKeyboard';
import { useUIStore } from '@stores/useUIStore';
import { useCursorStore } from '@stores/useCursorStore';
import type { ColumnDef, FormatChannel } from '@/components/shared/format-editor-types';

const HEIGHT = 300;
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 60)); });
const last = (posts: Msg[], type: string): Msg => posts.filter((m) => m.type === type).pop()!;

const columns: ColumnDef[] = [{
  key: 'v', label: 'Trk', charWidth: 2, color: '#fff', emptyColor: '#666', emptyValue: undefined, type: 'hex',
  hexDigits: 2, formatter: (v) => v.toString(16).padStart(2, '0'),
}];
const channel = (rows: number): FormatChannel[] => [{
  label: 'CH1', patternLength: rows, rows: Array.from({ length: rows }, () => ({ v: 0 })),
}];

function renderBoth() {
  bridges.length = 0;
  const view = render(
    <>
      <div style={{ width: 400, height: HEIGHT }}>
        <PatternEditorCanvas formatColumns={columns} formatChannels={channel(8)} formatRowsArePositions />
      </div>
      <div style={{ width: 400, height: HEIGHT }}>
        <PatternEditorCanvas formatColumns={columns} formatChannels={channel(64)} />
      </div>
    </>,
  );
  const [matrix, pattern] = bridges;
  return { view, matrix, pattern };
}

describe('the position matrix is its own editor', () => {
  beforeEach(() => {
    HTMLCanvasElement.prototype.transferControlToOffscreen = (() => ({})) as never;
    globalThis.ResizeObserver = class {
      cb: ResizeObserverCallback;
      constructor(cb: ResizeObserverCallback) { this.cb = cb; }
      observe(el: Element) {
        this.cb([{ target: el, contentRect: { width: 400, height: HEIGHT } } as unknown as ResizeObserverEntry], this as never);
      }
      unobserve() {}
      disconnect() {}
    } as never;
    useUIStore.setState({ dubDeckHeight: 0 });
    useCursorStore.getState().setFormatCursor({ channelIndex: 0, rowIndex: 0, columnIndex: 0 });
  });
  afterEach(() => {
    cleanup();
    useUIStore.setState({ dubDeckHeight: 0 });
  });

  it('a pattern editor cursor move leaves the matrix row where it is', async () => {
    const { matrix, pattern } = renderBoth();
    await settle();
    await act(async () => { useCursorStore.getState().setFormatCursor({ channelIndex: 0, rowIndex: 40, columnIndex: 0 }); });
    await settle();
    expect(last(pattern, 'cursor').cursor!.rowIndex).toBe(40);
    // before the fix the matrix drew the shared row clamped to its last position (7): the bottom line
    expect(last(matrix, 'cursor').cursor!.rowIndex).toBe(0);
  });

  it('the dub deck pushes the pattern editor only, so the matrix row stays centred in its own height', async () => {
    const { matrix, pattern } = renderBoth();
    await settle();
    await act(async () => { useUIStore.getState().setDubDeckHeight(250); });
    await settle();
    expect(last(pattern, 'layout').referenceH).toBe(HEIGHT + 250);
    expect(last(matrix, 'layout').referenceH).toBe(HEIGHT);
  });

  it('window keys go to the matrix only while focus is inside it', () => {
    const matrixBox = document.createElement('div');
    matrixBox.setAttribute(POSITION_MATRIX_ATTR, 'true');
    const inMatrix = document.createElement('span');
    matrixBox.appendChild(inMatrix);
    const patternBox = document.createElement('div');
    expect(formatKeyOwnedBy(matrixBox, true, patternBox)).toBe(false);
    expect(formatKeyOwnedBy(patternBox, false, patternBox)).toBe(true);
    expect(formatKeyOwnedBy(matrixBox, true, inMatrix)).toBe(true);
    expect(formatKeyOwnedBy(patternBox, false, inMatrix)).toBe(false);
  });
});
