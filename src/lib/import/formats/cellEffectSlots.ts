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

/** The cell's effects in slot order (empty slots skipped), the order `addCellEffect` filled them. */
export function cellEffects(cell: TrackerCell): Array<[number, number]> {
  const rec = cell as unknown as Record<string, number | undefined>;
  const out: Array<[number, number]> = [];
  for (const [kt, kv] of SLOTS) if (rec[kt]) out.push([rec[kt] as number, (rec[kv] ?? 0) & 0xff]);
  return out;
}

/**
 * The byte patches (file offset, value) that turn the effect slots of `was` into those of `cell`, for a format whose effect
 * columns show stream commands. Only a changed value of an existing command is expressible (same length); adding, removing
 * or retyping a command is refused with the reason. `sources[i]` is the byte behind slot i (`at` -1: the command has none).
 */
export function effectEditPatches(
  cell: TrackerCell, was: TrackerCell, sources: ReadonlyArray<{ typ: number; at: number }>,
): { patches: Array<[number, number]>; refusal: string | null } {
  const a = cellEffects(was);
  const b = cellEffects(cell);
  if (a.length !== b.length) return { patches: [], refusal: 'a stream command cannot be added or removed without changing the stream length' };
  const patches: Array<[number, number]> = [];
  for (let i = 0; i < a.length; i++) {
    if (a[i][0] !== b[i][0]) return { patches: [], refusal: 'a stream command cannot be turned into another command' };
    if (a[i][1] === b[i][1]) continue;
    const src = sources[i];
    if (!src || src.typ !== a[i][0] || src.at < 0) return { patches: [], refusal: 'this command has no argument byte to change' };
    patches.push([src.at, b[i][1]]);
  }
  return { patches, refusal: null };
}
