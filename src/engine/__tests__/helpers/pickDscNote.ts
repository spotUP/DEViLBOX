/** A cell edit a Digital Sonix & Chrome module can express (shared by the export round trip and the live-edit table). */
export interface DscEdit { p: number; ch: number; r: number; note: number }
export interface DscGridSong { songPositions: number[]; patterns: Array<{ channels: Array<{ rows: Array<{ note: number; instrument: number }> }> }> }

/**
 * Digital Sonix & Chrome: a cell IS a record (sample + period); a note edit the file can express is a
 * pitch another record of the same sample plays. The index-th cell (default the first) with such a sibling record in PLAY order
 * (positions in order, rows top down): a cell in a block the tune reaches late is past the rendered window.
 */
export async function pickDscNote(song: DscGridSong, bytes: Uint8Array, index = 0): Promise<DscEdit | null> {
  const found: DscEdit[] = [];
  const { decodeDscModule } = await import('@/lib/import/formats/DigitalSonixChromeModule');
  const { periodToNote } = await import('@/lib/amiga/periodNotes');
  const { records } = decodeDscModule(bytes);
  for (const p of new Set(song.songPositions)) {
    const chans = song.patterns[p].channels;
    for (let r = 0; r < chans[0].rows.length; r++) {
      for (let ch = 0; ch < chans.length; ch++) {
        const row = chans[ch].rows[r];
        const own = records[row.instrument - 1];
        if (row.note <= 0 || !own) continue;
        const sib = records.find((x) => x.pcmOffset === own.pcmOffset && x.length === own.length && periodToNote(x.period) !== row.note);
        if (sib) found.push({ p, ch, r, note: periodToNote(sib.period) });
      }
    }
  }
  // `index` skips the cells that play before a mid-song write (the live-while-playing table walks 0, 1, 2 ...)
  return found[Math.min(index, found.length - 1)] ?? null;
}
