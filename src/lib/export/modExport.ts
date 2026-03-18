/**
 * MOD Export — converts a TrackerSong to ProTracker .MOD format.
 * Stub module — real implementation pending.
 */

import type { TrackerSong } from '@engine/TrackerReplayer';

export interface ModExportOptions {
  bakeSynths?: boolean;
}

export interface ModExportResult {
  blob: Blob;
  filename: string;
  warnings: string[];
}

export async function exportSongToMOD(
  _song: TrackerSong,
  _options?: ModExportOptions
): Promise<ModExportResult> {
  throw new Error('MOD export not yet implemented');
}
