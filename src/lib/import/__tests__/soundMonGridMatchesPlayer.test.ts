/**
 * Regression: the BP SoundMon grid did not show the notes the replayer plays.
 *
 * Symptoms (tools/uade-audit/gridVsPaula.ts on testmod.bp3):
 *   - notes below C-1 read as C-1. The parser named a period through
 *     ProTracker's octaves only, so a bass line 23 11 23 11 (B-1 B-0) showed
 *     B-1 C-1, and 13 11 13 8 showed four C-1s;
 *   - option 10 (transposes off, Soundmon2.2.s bpnext) was ignored, so a
 *     row that switches the step transpose off showed the transposed note;
 *   - the codec's fallback for an edited cell wrote note - 36, two octaves
 *     away from the name it reads back.
 *
 * SoundMonNotes.ts now holds the table and the one mapping both ways (named
 * by the period played, periodNotes 428 = C-2). Parser, codec and exporter
 * all use it.
 *
 * The expected sequences were read from UADE's Paula write log while the real
 * replayer played the file (gridVsPaula note-on rules). The replayer runs the
 * step's four columns on Paula voices 3, 2, 1, 0 (bpnext counts d0 down while
 * it walks the voices up); grid channel k is column k. Synth voices restart
 * their waveform on every tick, so both sides collapse consecutive repeats.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseSoundMonFile } from '../formats/SoundMonParser';
import { bpNoteToNote, noteToBpNote } from '../formats/SoundMonNotes';
import { encodeSoundMonCell } from '@/engine/uade/encoders/SoundMonEncoder';
import type { TrackerSong } from '@/engine/TrackerReplayer';

function bytes(rel: string): Uint8Array {
  return new Uint8Array(readFileSync(join(process.cwd(), rel)));
}
async function parse(data: Uint8Array, name: string): Promise<TrackerSong> {
  const ab = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
  return parseSoundMonFile(ab, name);
}

/** A channel's notes in song order, consecutive repeats collapsed. */
function channelPitches(song: TrackerSong, ch: number, count: number): number[] {
  const out: number[] = [];
  for (const p of song.songPositions) {
    for (const cell of song.patterns[p].channels[ch].rows) {
      if (cell.note > 0 && cell.note < 97 && cell.note !== out[out.length - 1]) out.push(cell.note);
      if (out.length === count) return out;
    }
  }
  return out;
}

describe('BP SoundMon grid plays what the replayer plays', () => {
  it('names SoundMon pitches by the period they play (note 1 = 856 = C-1 = 13)', () => {
    expect(bpNoteToNote(1)).toBe(13);
    expect(bpNoteToNote(-1)).toBe(11);  // 960
    expect(bpNoteToNote(-11)).toBe(1);  // 1712 = C-0
    expect(bpNoteToNote(25)).toBe(37);  // 214 = C-3
    for (let n = -11; n <= 48; n++) if (n !== 0) expect(noteToBpNote(bpNoteToNote(n))).toBe(n);
  });

  it('testmod.bp3: the voices open with the notes Paula plays, below C-1 included', async () => {
    const song = await parse(bytes('public/data/songs/bp-soundmon-3/testmod.bp3'), 'testmod.bp3');
    expect(channelPitches(song, 0, 12)).toEqual([13, 11, 13, 8, 13, 11, 13, 8, 13, 11, 13, 8]); // Paula voice 3
    expect(channelPitches(song, 2, 30)).toEqual([                                              // Paula voice 1
      37, 39, 37, 39, 37, 39, 37, 39, 25, 13, 25, 13, 25, 13, 25, 13,
      25, 13, 25, 13, 25, 13, 25, 13, 23, 11, 23, 11, 23, 11]);
  });

  it('nicktune1.bp: the voices open with the notes Paula plays', async () => {
    const song = await parse(bytes('public/data/songs/bp-soundmon-2/nicktune1.bp'), 'nicktune1.bp');
    expect(channelPitches(song, 0, 16)).toEqual([39, 42, 41, 37, 34, 42, 41, 37, 39, 42, 41, 37, 34, 42, 41, 37]); // voice 3
    expect(channelPitches(song, 1, 4)).toEqual([37, 46, 37, 46]);                                                   // voice 2
    expect(channelPitches(song, 2, 8)).toEqual([15, 27, 15, 27, 15, 27, 15, 27]);                                   // voice 1
  });

  it('option 10 with a high nibble plays the row without the step transpose', async () => {
    // nicktune1 step 0, column 0: pattern 1, transpose 0, rows 0/2 = notes 27/30.
    const data = bytes('public/data/songs/bp-soundmon-2/nicktune1.bp').slice();
    const songLength = (data[30] << 8) | data[31];
    data[512 + 3] = 5;                               // step 0, column 0: transpose +5
    const row0 = 512 + songLength * 16;              // pattern 1, row 0
    data[row0 + 1] = (data[row0 + 1] & 0xf0) | 10;   // option 10 ...
    data[row0 + 2] = 0x10;                           // ... high nibble: transpose off
    const song = await parse(data, 'nicktune1.bp');
    const rows = song.patterns[0].channels[0].rows;
    expect(rows[0].note).toBe(bpNoteToNote(27));     // untransposed
    expect(rows[2].note).toBe(bpNoteToNote(30 + 5)); // transposed
  });

  it('the codec writes an edited note back as the value that plays it', () => {
    const cell = { note: 11, instrument: 4, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 };
    expect(encodeSoundMonCell(cell)[0]).toBe(0xff); // -1 plays 960 = A#-0 = note 11
  });
});
