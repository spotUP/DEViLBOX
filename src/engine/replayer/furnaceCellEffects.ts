/**
 * Which cell effects of a tracker-made song go to a Furnace chip.
 *
 * The cell's effect columns carry Furnace effect codes (0x00-0xFF) for a Furnace chip
 * instrument; FurnaceEffectRouter maps each code to the chip's dispatch commands. The tracker
 * handles the song-flow codes itself (Bxx, Dxx, Fxx, E6x/EEx), and Cxx is the channel volume
 * (a 0-64 level that FurnaceDispatchSynth scales to the chip's own range), so those never go
 * to the router: a second mapping of them would apply the same command twice.
 */
import type { TrackerCell } from '@/types';

/** Effect codes the replayer consumes itself; the router must not see them. */
const TRACKER_OWNED_EFFECTS: ReadonlySet<number> = new Set([0x0B, 0x0C, 0x0D, 0x0E, 0x0F]);

export interface CellChipEffect {
  effect: number;
  param: number;
}

/** The numbered effect columns of a cell as [effTyp, eff] pairs. */
function effectColumns(row: TrackerCell): Array<[number | undefined, number | undefined]> {
  return [
    [row.effTyp, row.eff], [row.effTyp2, row.eff2], [row.effTyp3, row.eff3], [row.effTyp4, row.eff4],
    [row.effTyp5, row.eff5], [row.effTyp6, row.eff6], [row.effTyp7, row.eff7], [row.effTyp8, row.eff8],
  ];
}

/** Effects of the row for the chip router, in column order. Effect 0 with parameter 0 is an empty column. */
export function furnaceCellChipEffects(row: TrackerCell): CellChipEffect[] {
  const out: CellChipEffect[] = [];
  for (const [effTyp, eff] of effectColumns(row)) {
    if (effTyp === undefined || eff === undefined) continue;
    if (effTyp === 0 && eff === 0) continue;
    if (TRACKER_OWNED_EFFECTS.has(effTyp)) continue;
    out.push({ effect: effTyp, param: eff });
  }
  return out;
}

/** The last Cxx of the row as a 0-1 level, or null. */
export function cellSetVolumeLevel(row: TrackerCell): number | null {
  let level: number | null = null;
  for (const [effTyp, eff] of effectColumns(row)) {
    if (effTyp === 0x0C && eff !== undefined) level = Math.min(64, eff) / 64;
  }
  return level;
}
