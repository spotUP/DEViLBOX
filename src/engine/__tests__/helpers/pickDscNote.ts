/** A cell edit a Digital Sonix & Chrome module can express (shared by the export round trip and the live-edit table). */
export interface DscEdit { p: number; ch: number; r: number; note: number }
export interface DscGridSong { patterns: Array<{ channels: Array<{ rows: Array<{ note: number; instrument: number }> }> }> }

/**
 * Digital Sonix & Chrome: a cell IS a record (sample + period); a note edit the file can express is a
 * pitch another record of the same sample plays. The first cell with such a sibling record.
 */
export async function pickDscNote(song: DscGridSong, bytes: Uint8Array): Promise<DscEdit | null> {
  const { decodeDscModule } = await import('@/lib/import/formats/DigitalSonixChromeModule');
  const { periodToNote } = await import('@/lib/amiga/periodNotes');
  const { records } = decodeDscModule(bytes);
  for (let p = 0; p < song.patterns.length; p++) {
    for (let ch = 0; ch < song.patterns[p].channels.length; ch++) {
      const rows = song.patterns[p].channels[ch].rows;
      for (let r = 0; r < rows.length; r++) {
        const own = records[rows[r].instrument - 1];
        if (rows[r].note <= 0 || !own) continue;
        const sib = records.find((x) => x.pcmOffset === own.pcmOffset && x.length === own.length && periodToNote(x.period) !== rows[r].note);
        if (sib) return { p, ch, r, note: periodToNote(sib.period) };
      }
    }
  }
  return null;
}
