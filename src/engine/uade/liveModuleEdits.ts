/**
 * The 'uade-module' live-edit route (G24): export the stores' module, diff it into the chip RAM UADE plays
 * from (liveModuleWrite). Edits are applied one at a time, in order; the export is the whole module, so a
 * burst of cells costs the last export's diff only.
 */
import type { TrackerSong } from '../TrackerReplayer';
import { UADEEngine } from './UADEEngine';
import { writeEditedModuleLive, type LiveModuleResult } from './liveModuleWrite';

let chain: Promise<unknown> = Promise.resolve();

export function applyEditedModuleToChipRam(song: TrackerSong): Promise<LiveModuleResult | null> {
  const run = async (): Promise<LiveModuleResult | null> => {
    if (!UADEEngine.hasInstance()) return null;
    const { exportNativeSong } = await import('@/lib/export/nativeExportRouter');
    const out = await exportNativeSong(null, {});
    if (!out) return null;
    const result = await writeEditedModuleLive(song, out.data, UADEEngine.getInstance());
    if (result.status === 'next-play' || result.status === 'unplaced') {
      console.warn(`[liveModuleEdits] ${result.status}: ${result.why}; the next play carries the edit`);
    }
    return result;
  };
  const next = chain.then(run, run);
  chain = next.catch(() => undefined);
  return next;
}
