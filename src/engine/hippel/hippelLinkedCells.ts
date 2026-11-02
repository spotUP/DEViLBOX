/**
 * Linked copies of a reused Hippel pattern block.
 *
 * A CoSo / 7V module stores a pattern block once and lets several track steps
 * and voices point at it; the grid shows a copy per use. As in most trackers,
 * such a block behaves like one pattern used at several order positions:
 * editing one copy edits all of them. The spans (hippelCellSpans) give every
 * grid cell its block offset; cells with the same offset are the same bytes.
 */
import type { TrackerCell } from '@/types';
import type { HippelCellSpans } from './hippelCellSpans';
import { mapHippelCells } from './rebuildHippelModule';

export interface GridPos { pattern: number; channel: number; row: number }

interface GridPattern { channels: Array<{ rows: TrackerCell[] }> }

const byOffset = new WeakMap<HippelCellSpans, Map<number, GridPos[]>>();

/** Every grid position that shows the bytes at each span offset (built once per span map). */
function positionsByOffset(spans: HippelCellSpans): Map<number, GridPos[]> {
  let map = byOffset.get(spans);
  if (map) return map;
  map = new Map();
  spans.forEach((channels, pattern) => channels?.forEach((rows, channel) => rows?.forEach((span, row) => {
    if (!span) return;
    const list = map!.get(span.offset);
    if (list) list.push({ pattern, channel, row }); else map!.set(span.offset, [{ pattern, channel, row }]);
  })));
  byOffset.set(spans, map);
  return map;
}

const FIELDS = ['note', 'instrument', 'volume'] as const;

/**
 * The cells that must change with an edit: for every cell of `after` whose
 * note, instrument or volume differs from `before`, each other grid position
 * sharing its block, with the edited values. Positions the edit already
 * changed are not returned.
 */
export function hippelLinkedEdits(
  spans: HippelCellSpans,
  patternIndex: number,
  before: GridPattern,
  after: GridPattern,
  /** The song's patterns now: a copy under another step transpose moves by the same interval, not to the same pitch. */
  patterns: readonly GridPattern[],
): Array<GridPos & { values: Pick<TrackerCell, 'note' | 'instrument' | 'volume'> }> {
  const sharers = positionsByOffset(spans);
  const out = new Map<string, GridPos & { values: Pick<TrackerCell, 'note' | 'instrument' | 'volume'> }>();
  after.channels.forEach((ch, channel) => ch.rows.forEach((cell, row) => {
    const old = before.channels[channel]?.rows[row];
    if (!old || FIELDS.every((f) => (old[f] ?? 0) === (cell[f] ?? 0))) return;
    const span = spans[patternIndex]?.[channel]?.[row];
    if (!span) return;
    for (const pos of sharers.get(span.offset) ?? []) {
      if (pos.pattern === patternIndex && pos.channel === channel && pos.row === row) continue;
      const there = patterns[pos.pattern]?.channels[pos.channel]?.rows[pos.row];
      if (!there) continue;
      // Steps carry their own note and instrument transposes, so one block shows as different values: a changed note or
      // instrument moves every copy by the same interval. A typed value onto, or a clear of, an empty field has no
      // interval and is copied as typed. Fields the edit left alone stay as each copy shows them.
      const shift = (f: 'note' | 'instrument'): number => {
        if ((old[f] ?? 0) === (cell[f] ?? 0)) return there[f] ?? 0;
        const moved = (old[f] ?? 0) > 0 && (cell[f] ?? 0) > 0 && (there[f] ?? 0) > 0;
        return moved ? (there[f] ?? 0) + ((cell[f] ?? 0) - (old[f] ?? 0)) : (cell[f] ?? 0);
      };
      out.set(`${pos.pattern}:${pos.channel}:${pos.row}`, {
        ...pos, values: { note: shift('note'), instrument: shift('instrument'), volume: (old.volume ?? 0) === (cell.volume ?? 0) ? there.volume : cell.volume },
      });
    }
  }));
  // An edit that already touched a sharer in this pattern (a paste over several copies) stays as typed.
  return [...out.values()].filter((e) => e.pattern !== patternIndex
    || FIELDS.every((f) => (before.channels[e.channel]?.rows[e.row]?.[f] ?? 0) === (after.channels[e.channel]?.rows[e.row]?.[f] ?? 0)));
}

const spansOfModule = new WeakMap<ArrayBuffer, Map<string, HippelCellSpans | null>>();

/** The cell spans of the loaded module for one subsong, mapped once per module. */
export function hippelSpansFor(module: ArrayBuffer, instrumentCount: number, subsong: number): HippelCellSpans | null {
  let perSubsong = spansOfModule.get(module);
  if (!perSubsong) spansOfModule.set(module, perSubsong = new Map());
  const key = `${subsong}:${instrumentCount}`;
  if (!perSubsong.has(key)) perSubsong.set(key, mapHippelCells(module, instrumentCount, subsong));
  return perSubsong.get(key) ?? null;
}
