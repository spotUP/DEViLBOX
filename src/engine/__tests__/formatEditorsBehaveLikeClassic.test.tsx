/**
 * P14g (owner 2026-10-07, amanda.ahx): "it's not like the normal pattern editor - the cursor stays put and notes are added
 * downwards - why did you invent a new weird edit mode?". The format canvases kept a parallel copy of the classic editor's
 * cursor movement, scroll and entry. Now ONE rule (cursorNavigation.ts, playbackNavigation.ts, formatEntryPlan.ts) serves both.
 *
 * Table: the same keys, stopped with edit on, typed into the classic pattern editor and into every canvas mode (the real
 * PatternEditorCanvas, its messages to the render worker captured). Per key the row cursor, the channel, the row the view
 * is drawn on (what the worker renders: the play head when playing, else the cursor, TrackerGLRenderer) and the cell
 * writes must be identical to classic. Then recording while playing: the note lands on the playback row and the cursor stays.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, act, renderHook, cleanup } from '@testing-library/react';

type Msg = { type: string; cursor?: { rowIndex: number; channelIndex: number }; row?: number; isPlaying?: boolean };
const posted: Msg[] = [];
vi.mock('@engine/renderer/OffscreenBridge', () => ({
  TrackerOffscreenBridge: class { constructor(_f: unknown, _o: unknown) {} post(m: Msg) { posted.push(m); } dispose() {} },
}));
vi.mock('@/engine/ToneEngine', () => ({ getToneEngine: () => new Proxy({}, { get: () => () => Promise.resolve() }) }));
vi.mock('@/engine/TrackerReplayer', () => ({
  getTrackerReplayer: () => new Proxy({}, { get: (_t, k) => (k === 'isPlaying' ? () => false : () => undefined) }),
  peekTrackerReplayer: () => null,
}));

import '@stores';
import { PatternEditorCanvas } from '@/components/tracker/PatternEditorCanvas';
import { useTrackerInput } from '@/hooks/tracker/useTrackerInput';
import { useCursorStore } from '@stores/useCursorStore';
import { useEditorStore } from '@stores/useEditorStore';
import { useFormatStore } from '@stores/useFormatStore';
import { useTrackerStore } from '@stores/useTrackerStore';
import { useTransportStore } from '@stores/useTransportStore';
import { HIVELY_COLUMNS } from '@/components/hively/hivelyAdapter';
import { KLYS_COLUMNS } from '@/components/klystrack/klysAdapter';
import { JAMCRACKER_COLUMNS } from '@/components/jamcracker/jamcrackerAdapter';
import { SF2_COLUMNS } from '@/components/sidfactory2/sf2Adapter';
import { CC_COLUMNS } from '@/components/cheesecut/cheeseCutterAdapter';
import { MUSICLINE_COLUMNS } from '@/components/musicline/musiclineAdapter';
import { GTU_COLUMNS } from '@/components/gtultra/gtuAdapter';
import type { ColumnDef } from '@/components/shared/format-editor-types';
import type { EditorMode } from '@/types/tracker';

const ROWS = 64;
const CHANNELS = 4;
const KEYS = ['z', 'x', 'ArrowDown', 'PageDown', 'Tab', 'c', 'Tab', 'Tab', 'z', 'End', 'ArrowDown', 'Home', 'ArrowUp', 'v'];

const CANVAS_MODES: Array<[EditorMode, ColumnDef[]]> = [
  ['hively', HIVELY_COLUMNS], ['klystrack', KLYS_COLUMNS], ['jamcracker', JAMCRACKER_COLUMNS], ['sidfactory2', SF2_COLUMNS],
  ['cheesecutter', CC_COLUMNS], ['musicline', MUSICLINE_COLUMNS], ['goattracker', GTU_COLUMNS],
];

const press = (key: string) => act(async () => {
  window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
  window.dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true, cancelable: true }));
  await new Promise((r) => setTimeout(r, 30));
});

/** The row the render worker draws on: its last playback and cursor messages (TrackerGLRenderer: isPlaying ? playRow : cursor.rowIndex). */
function drawnRow(): number {
  let cursor: Msg['cursor']; let playback: Msg | undefined;
  for (const m of posted) { if (m.type === 'cursor') cursor = m.cursor; if (m.type === 'playback') playback = m; }
  return playback?.isPlaying ? playback.row! : cursor!.rowIndex;
}

interface Step { key: string; row: number; channel: number; drawn: number; writes: string }

function resetStores(mode: EditorMode, editStep: number, columnIndex = 0) {
  posted.length = 0;
  useFormatStore.setState({ editorMode: mode });
  useEditorStore.setState({ recordMode: true, editStep, currentOctave: 3, followPlayback: true });
  useTransportStore.setState({ isPlaying: false, currentRow: 0 });
  useCursorStore.getState().moveCursorToChannel(0);
  useCursorStore.getState().moveCursorToRow(0);
  useCursorStore.getState().setFormatCursor({ channelIndex: 0, rowIndex: 0, columnIndex });
}

async function runClassic(keys: string[]): Promise<Step[]> {
  resetStores('classic', 1);
  const t = useTrackerStore.getState();
  t.patterns[0].channels.forEach((c, ch) => c.rows.forEach((_, r) => t.setCell(ch, r, { note: 0 })));
  const hook = renderHook(() => useTrackerInput());
  const view = render(<div style={{ width: 800, height: 600 }}><PatternEditorCanvas /></div>);
  await act(async () => { await new Promise((r) => setTimeout(r, 80)); });
  const out: Step[] = [];
  for (const key of keys) {
    await press(key);
    const c = useCursorStore.getState().cursor;
    const writes = useTrackerStore.getState().patterns[0].channels
      .flatMap((ch, ci) => ch.rows.flatMap((cell, r) => (cell.note ? [`${ci}:${r}`] : []))).join(',');
    out.push({ key, row: c.rowIndex, channel: c.channelIndex, drawn: drawnRow(), writes });
  }
  view.unmount(); hook.unmount(); cleanup();
  return out;
}

async function runCanvas(mode: EditorMode, columns: ColumnDef[], keys: string[]): Promise<Step[]> {
  resetStores(mode, 1, columns.findIndex((c) => c.type === 'note'));
  const written: string[] = [];
  const channels = Array.from({ length: CHANNELS }, (_, i) => ({ label: `C${i}`, patternLength: ROWS, rows: [] }));
  const hook = renderHook(() => useTrackerInput());
  const view = render(<div style={{ width: 800, height: 600 }}>
    <PatternEditorCanvas formatColumns={columns} formatChannels={channels as never} formatCurrentRow={0} formatIsPlaying={false}
      onFormatCellChange={(c, r, k) => { if (k === columns.find((x) => x.type === 'note')!.key) written.push(`${c}:${r}`); }} />
  </div>);
  await act(async () => { await new Promise((r) => setTimeout(r, 80)); });
  const out: Step[] = [];
  for (const key of keys) {
    await press(key);
    const c = useCursorStore.getState().cursor;
    out.push({ key, row: c.rowIndex, channel: c.channelIndex, drawn: drawnRow(), writes: [...new Set(written)].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).join(',') });
  }
  view.unmount(); hook.unmount(); cleanup();
  return out;
}

const table = (steps: Step[]) => steps.map((s) => `${s.key.padEnd(10)} row ${String(s.row).padStart(2)} ch ${s.channel} drawn ${String(s.drawn).padStart(2)} writes ${s.writes}`).join('\n');
const sortedWrites = (w: string) => w.split(',').filter(Boolean).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).join(',');

describe('every editor mode moves, scrolls and writes like the classic pattern editor', () => {
  beforeEach(() => {
    HTMLCanvasElement.prototype.transferControlToOffscreen = (() => ({})) as never;
    const t = useTrackerStore.getState();
    // classic needs a pattern of the same shape
    useTrackerStore.setState({ currentPatternIndex: 0 });
    if (t.patterns[0]?.length !== ROWS || t.patterns[0].channels.length < CHANNELS) {
      throw new Error(`the default pattern is ${t.patterns[0]?.length} rows x ${t.patterns[0]?.channels.length}`);
    }
  });

  it('same keys, same cursor row, channel, drawn scroll row and cell writes in classic and all 7 canvas modes', async () => {
    const classic = await runClassic(KEYS);
    const rows: string[] = [`classic\n${table(classic)}`];
    const failures: string[] = [];
    for (const [mode, columns] of CANVAS_MODES) {
      const got = await runCanvas(mode, columns, KEYS);
      rows.push(`${mode}\n${table(got)}`);
      got.forEach((g, i) => {
        const want = classic[i];
        const same = g.row === want.row && g.channel === want.channel && g.drawn === want.drawn && sortedWrites(g.writes) === sortedWrites(want.writes);
        if (!same) failures.push(`${mode} after "${g.key}": row ${g.row}/${want.row} ch ${g.channel}/${want.channel} drawn ${g.drawn}/${want.drawn} writes [${g.writes}] vs [${want.writes}]`);
      });
    }
    if (process.env.P14G_TABLE) console.log(rows.join('\n\n'));
    expect(failures).toEqual([]);
  }, 60000);

  it('a held arrow steps once until the initial delay has passed, and while the song plays the view follows the play head the cursor is not moved by arrows (follow off: it is, and the view stays on it)', async () => {
    for (const [mode, columns] of CANVAS_MODES) {
      resetStores(mode, 1, columns.findIndex((c) => c.type === 'note'));
      const channels = Array.from({ length: CHANNELS }, (_, i) => ({ label: `C${i}`, patternLength: ROWS, rows: [] }));
      const view = render(<div style={{ width: 800, height: 600 }}>
        <PatternEditorCanvas formatColumns={columns} formatChannels={channels as never} formatCurrentRow={0} formatIsPlaying={false} onFormatCellChange={() => {}} />
      </div>);
      await act(async () => { await new Promise((r) => setTimeout(r, 80)); });
      await act(async () => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
        await new Promise((r) => setTimeout(r, 120)); // classic waits 250 ms before the first repeat
        window.dispatchEvent(new KeyboardEvent('keyup', { key: 'ArrowDown', bubbles: true }));
      });
      expect(useCursorStore.getState().cursor.rowIndex, `${mode} held arrow`).toBe(1);
      view.unmount(); cleanup();

      // playing + follow on: arrows leave the cursor, the view is on the play head
      for (const follow of [true, false]) {
        resetStores(mode, 1, columns.findIndex((c) => c.type === 'note'));
        useEditorStore.setState({ followPlayback: follow });
        const v = render(<div style={{ width: 800, height: 600 }}>
          <PatternEditorCanvas formatColumns={columns} formatChannels={channels as never} formatCurrentRow={9} formatIsPlaying onFormatCellChange={() => {}} />
        </div>);
        await act(async () => { await new Promise((r) => setTimeout(r, 80)); });
        await press('ArrowDown');
        expect(useCursorStore.getState().cursor.rowIndex, `${mode} follow ${follow}`).toBe(follow ? 0 : 1);
        expect(drawnRow(), `${mode} follow ${follow} drawn`).toBe(follow ? 9 : 1);
        v.unmount(); cleanup();
      }
    }
  }, 60000);

  it('recording while playing still writes at the playback row and leaves the cursor', async () => {
    for (const [mode, columns] of CANVAS_MODES) {
      resetStores(mode, 1, columns.findIndex((c) => c.type === 'note'));
      useTransportStore.setState({ isPlaying: true, currentRow: 7 });
      const written: string[] = [];
      const channels = Array.from({ length: CHANNELS }, (_, i) => ({ label: `C${i}`, patternLength: ROWS, rows: [] }));
      const view = render(<div style={{ width: 800, height: 600 }}>
        <PatternEditorCanvas formatColumns={columns} formatChannels={channels as never} formatCurrentRow={7} formatIsPlaying
          onFormatCellChange={(c, r) => written.push(`${c}:${r}`)} />
      </div>);
      await act(async () => { await new Promise((r) => setTimeout(r, 80)); });
      await press('z');
      expect(written, mode).toEqual(['0:7']);
      expect(useCursorStore.getState().cursor.rowIndex, mode).toBe(0);
      expect(drawnRow(), `${mode} follows the play head`).toBe(7);
      view.unmount(); cleanup();
    }
  }, 60000);
});
