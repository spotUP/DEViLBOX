/**
 * cellEffectSlots.ts - put a format's private effects into a tracker cell's effect slots.
 *
 * A cell holds up to four effects (effTyp/eff .. effTyp4/eff4); the channel shows as many effect columns as its
 * fullest cell needs (2 minimum, the grid's default; `channelMeta.effectCols` above that). Shared by the grids
 * whose stream commands have no XM equivalent (same slot layout fredEditorGrid.ts fredLineToCell uses).
 */
import type { TrackerCell } from '@/types';

const SLOTS: ReadonlyArray<readonly [keyof TrackerCell, keyof TrackerCell]> = [
  ['effTyp', 'eff'], ['effTyp2', 'eff2'], ['effTyp3', 'eff3'], ['effTyp4', 'eff4'],
];

/** Put `effTyp`/`eff` into the first free slot of `cell`; false when all four slots are taken. */
export function addCellEffect(cell: TrackerCell, effTyp: number, eff: number): boolean {
  const rec = cell as unknown as Record<string, number | undefined>;
  for (const [kt, kv] of SLOTS) {
    if (!rec[kt]) {
      rec[kt] = effTyp;
      rec[kv] = eff & 0xff;
      return true;
    }
  }
  return false;
}

/** Effect columns a cell needs (2 minimum). */
export function cellEffectColumns(cell: TrackerCell): number {
  return cell.effTyp4 ? 4 : cell.effTyp3 ? 3 : 2;
}

/** The `channelMeta` that widens a channel to the effect columns its rows use, or nothing at 2 or fewer. */
export function effectColumnsMeta(rows: readonly TrackerCell[]): { channelMeta: { importedFromMOD: false; effectCols: number } } | Record<string, never> {
  const effectCols = Math.max(2, ...rows.map(cellEffectColumns));
  return effectCols > 2 ? { channelMeta: { importedFromMOD: false, effectCols } } : {};
}
