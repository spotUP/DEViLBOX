/**
 * Act 2 (R2f): writes the host's decide events into the REAL tracker store as they arrive. The pattern is a real
 * pattern of the tracker (one per section, one channel per lane), the cursor sweeps with the fill, and the
 * finished song (`done.song`, opened by the caller) replaces the whole fill with the authoritative cells.
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

/** `start` of a generate run: one blank pattern per section, replacing the outgoing song's patterns. */
export function beginPatternFill(ev: Start): void {
  taken.clear();
  const st = useTrackerStore.getState();
  st.loadPatterns(ev.sections.map((x, i) => blankPattern(`${i + 1}_${x.name}`, x.bars)));
  st.setPatternOrder(ev.sections.map((_, i) => i));
}

/** One decide event -> cells in the section's pattern, then the cursor to the bar's first row. Returns the cell count. */
export function fillDecide(ev: Decide): number {
  const key = `${ev.section}:${ev.bar}`;
  let used = taken.get(key);
  if (!used) taken.set(key, used = new Set());
  const cells: FillCell[] = decideToCells(ev.lane, ev.bar, ev.cells, used);
  const pattern = useTrackerStore.getState().patterns[ev.section];
  if (!pattern) return 0;
  useTrackerStore.setState((state) => {
    const p = state.patterns[ev.section]!;
    for (const c of cells) {
      const ch = LANES.indexOf(c.lane);
      if (c.row < p.length) setCellInPattern(p, ch, c.row, { note: c.note, instrument: c.instrument, volume: c.volume });
    }
  });
  useTrackerStore.getState().setCurrentPattern(ev.section);
  useCursorStore.setState((s) => ({ cursor: { ...s.cursor, rowIndex: Math.min(pattern.length - 1, ev.bar * ROWS_PER_BAR) } }));
  return cells.length;
}
