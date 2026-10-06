/**
 * DigitalSonixChromeExporter - write a Digital Sonix & Chrome (DSC.*) song
 * back to its own file, with the grid's edits.
 *
 * The module model (DigitalSonixChromeModule.ts) is decoded from the file the
 * song was loaded from, each grid cell whose track byte differs from the file
 * is written into its track, and the model is encoded again: byte-exact for
 * every unedited byte. Only cells that changed are written, so a block shown
 * by two patterns (entries naming overlapping rows) keeps the edit made in
 * either.
 *
 * Not the chip-RAM readback: the player relocates the entry and record
 * pointers in place (InstallSamples), so chip RAM no longer holds a loadable
 * file.
 */

import type { TrackerSong } from '@/engine/TrackerReplayer';
import { decodeDscModule, dscSections, encodeDscModule } from '@lib/import/formats/DigitalSonixChromeModule';
import { parseDscFile } from '@lib/import/formats/DigitalSonixChromeParser';

export function exportDigitalSonixChrome(song: TrackerSong): Uint8Array {
  const src = song.uadeEditableFileData;
  if (!src) throw new Error('Digital Sonix & Chrome export needs the module the song was loaded from');
  const bytes = new Uint8Array(src);
  const model = decodeDscModule(bytes);
  const { tracksOff, trackLen } = dscSections(bytes);
  // The layout is a pure function of the file; re-derive it so a song restored
  // from a project (functions not serialised) exports the same way.
  const layout = parseDscFile(src.slice(0), song.uadeEditableFileName ?? 'song.dsc').uadePatternLayout!;
  const offsetOf = layout.getCellFileOffset!;

  song.patterns.forEach((pattern, p) => {
    if (p >= layout.numPatterns) return;
    pattern.channels.forEach((channel, ch) => {
      channel.rows.forEach((cell, row) => {
        const off = offsetOf(p, row, ch);
        if (off < 0) return;
        const byte = layout.encodeCell(cell)[0];
        if (byte === bytes[off]) return;
        const rel = off - tracksOff;
        model.tracks[Math.floor(rel / trackLen)][rel % trackLen] = byte;
      });
    });
  });
  return encodeDscModule(model);
}
