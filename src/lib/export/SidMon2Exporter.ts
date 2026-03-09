/**
 * SidMon2Exporter.ts — Export TrackerSong to SidMon II native format.
 *
 * Uses the Sd2Engine WASM save function to serialize the current module state
 * (including any cell edits) back to binary format. Falls back to the stored
 * sd2FileData if the engine is not running.
 */

import type { TrackerSong } from '@/engine/TrackerReplayer';
import { Sd2Engine } from '@/engine/sidmon2/Sd2Engine';

/**
 * Export a TrackerSong to SidMon II (.sd2) binary format.
 *
 * If the Sd2Engine is running, uses the WASM serializer to capture the current
 * module state including any live edits. Otherwise returns the original file data.
 */
export async function exportSidMon2File(song: TrackerSong): Promise<ArrayBuffer> {
  // Try WASM serializer first (captures edits)
  if (Sd2Engine.hasInstance()) {
    const engine = Sd2Engine.getInstance();
    const data = await engine.save();
    if (data && data.byteLength > 0) {
      return data;
    }
  }

  // Fall back to original file data
  if (song.sd2FileData) {
    return song.sd2FileData;
  }

  throw new Error('SidMon II export requires either a running Sd2Engine or stored file data');
}
