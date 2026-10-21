/**
 * Act 2 (R2f): writes the host's decide events into the REAL tracker store as they arrive. The pattern is a real
 * pattern of the tracker (one per section, one channel per lane), the cursor sweeps with the fill, and the
 * finished song (`done.song`, opened by the caller) replaces the whole fill with the authoritative cells.
 * The blank song opens through applySong (openGeneratingSong); decides that arrive before it lands wait in a queue.
 */
import type { Pattern, TrackerCell } from '@typedefs/tracker';
import { useTrackerStore } from '@stores/useTrackerStore';
import { useCursorStore } from '@stores/useCursorStore';
import { setCellInPattern } from '@stores/tracker/patternEditActions';
import { LANES, LANE_LABEL, ROWS_PER_BAR, emptyCell } from '../songFile';
import type { R2Event } from '@/engine/uprough/r2Events';
import { decideToCells, type FillCell } from './decideToCells';

type Start = Extract<R2Event, { type: 'start' }>;
type Decide = Extract<R2Event, { type: 'decide' }>;

function blankPattern(name: string, bars: number): Pattern {
  const rows = bars * ROWS_PER_BAR;
  return {
    id: name, name, length: rows,
    channels: LANES.map((lane) => ({
      id: lane, name: LANE_LABEL[lane], rows: Array.from({ length: rows }, (): TrackerCell => emptyCell()),
      muted: false, solo: false, collapsed: false, volume: 100, pan: 0, instrumentId: null, color: null,
      channelMeta: { importedFromMOD: false, alwaysShow: true },
    })),
  };
}

/** Rows already taken in the current bar, per section and bar (the perc overflow rule). */
const taken = new Map<string, Set<string>>();

/** Cells of the run whose blank song is still loading; null once it is in the tracker. */
let pending: Queued[] | null = null;
/** The run the queue belongs to: a newer start supersedes an older load still in flight. */
let run = 0;
type Queued = { ev: Decide; cells: FillCell[] };
/** The current run's blank song load, settled once its queued cells are in the tracker (or it failed). */
let loading: Promise<void> = Promise.resolve();

/** Settles when the blank song of the latest run is in the tracker with its queued cells flushed. */
export function patternFillLoaded(): Promise<void> {
  return loading;
}

/** `start` of a generate run: a blank song of one pattern per section replaces the outgoing song. */
export function beginPatternFill(ev: Start): Promise<void> {
  taken.clear();
  pending = [];
  const mine = ++run;
  const patterns = ev.sections.map((x, i) => blankPattern(`${i + 1}_${x.name}`, x.bars));
  // Dynamic: the factory store must not statically pull the load path (stores, engine) into every panel import.
  const load = import('../openUpRoughSong')
    .then(({ openGeneratingSong }) => openGeneratingSong(`${ev.style} ${ev.seed}`, patterns))
    .then(() => {
      if (mine !== run) return;
      const queued = pending ?? [];
      pending = null;
      for (const q of queued) writeCells(q.ev, q.cells);
    }, (err: unknown) => {
      if (mine === run) pending = null;
      throw err;
    });
  loading = load.catch(() => undefined);
  return load;
}

/** `done`: the finished song replaces the fill, so cells still queued for a blank song that has not landed are dropped. */
export function endPatternFill(): void {
  run++;
  pending = null;
}

/** One decide event -> cells in the section's pattern, then the cursor to the bar's first row. Returns the cell count. */
export function fillDecide(ev: Decide): number {
  const key = `${ev.section}:${ev.bar}`;
  let used = taken.get(key);
  if (!used) taken.set(key, used = new Set());
  const cells: FillCell[] = decideToCells(ev.lane, ev.bar, ev.cells, used);
  if (pending) pending.push({ ev, cells });
  else writeCells(ev, cells);
  return cells.length;
}

function writeCells(ev: Decide, cells: FillCell[]): void {
  const pattern = useTrackerStore.getState().patterns[ev.section];
  if (!pattern) return;
  useTrackerStore.setState((state) => {
    const p = state.patterns[ev.section]!;
    for (const c of cells) {
      const ch = LANES.indexOf(c.lane);
      if (c.row < p.length) setCellInPattern(p, ch, c.row, { note: c.note, instrument: c.instrument, volume: c.volume });
    }
  });
  useTrackerStore.getState().setCurrentPattern(ev.section);
  useCursorStore.setState((s) => ({ cursor: { ...s.cursor, rowIndex: Math.min(pattern.length - 1, ev.bar * ROWS_PER_BAR) } }));
}
