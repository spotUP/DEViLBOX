/**
 * SoundMasterExporter - write a Sound Master module back to its own file, with
 * the grid's edits.
 *
 * The module the song was loaded from is decoded (SoundMasterModule.ts), every
 * grid cell that differs from the song as decoded is written into its pattern
 * row with that row's context (transposes, instrument offset, the instrument
 * the voice holds - soundMasterGrid.ts), and the module is encoded again:
 * byte-exact where nothing was edited.
 *
 * Not the chip-RAM readback: the player relocates its built-in sample slots
 * and UADE's eagleplayer patches the replayer in chip RAM.
 */

import type { TrackerSong } from '@/engine/TrackerReplayer';
import { SmSong, applySmGrid } from '@lib/import/formats/soundMasterGrid';

export function exportSoundMaster(song: TrackerSong): { data: Uint8Array; filename: string; warnings: string[] } {
  const src = song.uadeEditableFileData;
  if (!src) throw new Error('Sound Master export needs the module the song was loaded from');
  const sm = new SmSong(new Uint8Array(src));
  const refused = applySmGrid(sm, song.patterns);
  return {
    data: sm.exportFile(),
    filename: song.uadeEditableFileName?.split('/').pop() ?? 'song.sm',
    warnings: refused.length
      ? [`${refused.length} edited cell(s) cannot be written (a note outside the player's period table at that transpose): ${refused.slice(0, 8).join(', ')}`]
      : [],
  };
}
