/**
 * SynTrackerExporter.ts — write an edited SynTracker song back to its native binary.
 *
 * SynTracker uses PER-CHANNEL position lists: each of the 4 channels has its own list of
 * pattern indices, so a song position combines four independently-chosen patterns. The parser
 * builds one combined pattern per song position (patterns[pos].channels[ch]); this exporter
 * writes each channel's cells back to that channel's underlying pattern block.
 *
 * Cells are stored losslessly (raw SynTracker bytes: note, instrument, effect cmd, effect val
 * — see SynTrackerParser), so re-encoding an unedited module is byte-identical to the original.
 * We start from the original file bytes (uadeEditableFileData) to preserve the header, sample
 * names, position lists, and any patterns not referenced by the position lists.
 *
 * Reference: third-party/uade-3.05/amigasrc/players/wanted_team/SynTracker (magic SYNTRACKER-SONG:)
 */
import type { TrackerSong } from '@/engine/TrackerReplayer';

const PATTERN_BASE = 0x0800;
const ROWS_PER_PATTERN = 32;
const BYTES_PER_CELL = 4;
const BYTES_PER_PATTERN = ROWS_PER_PATTERN * BYTES_PER_CELL; // 128
const POSITION_LIST_BASE = 0x0614;
const POSITION_LIST_SIZE = 128; // bytes per channel
const NUM_CHANNELS = 4;

export function exportSynTrackerFile(song: TrackerSong): Uint8Array {
  const original = song.uadeEditableFileData;
  if (!original) {
    throw new Error('SynTracker export requires the original file data (uadeEditableFileData)');
  }
  const out = new Uint8Array(original.slice(0));

  const positions = Math.min(song.patterns.length, POSITION_LIST_SIZE);
  for (let pos = 0; pos < positions; pos++) {
    const pattern = song.patterns[pos];
    if (!pattern) continue;
    for (let ch = 0; ch < NUM_CHANNELS; ch++) {
      const channel = pattern.channels[ch];
      if (!channel) continue;
      // The channel's underlying pattern index comes from its position list in the file.
      const patIdx = out[POSITION_LIST_BASE + ch * POSITION_LIST_SIZE + pos] ?? 0;
      const patOff = PATTERN_BASE + patIdx * BYTES_PER_PATTERN;
      for (let row = 0; row < ROWS_PER_PATTERN; row++) {
        const cellOff = patOff + row * BYTES_PER_CELL;
        if (cellOff + BYTES_PER_CELL > out.length) break;
        const cell = channel.rows[row];
        out[cellOff] = (cell?.note ?? 0) & 0xff;
        out[cellOff + 1] = (cell?.instrument ?? 0) & 0xff;
        out[cellOff + 2] = (cell?.effTyp ?? 0) & 0xff;
        out[cellOff + 3] = (cell?.eff ?? 0) & 0xff;
      }
    }
  }

  return out;
}
