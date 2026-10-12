/**
 * A SID's tracker song has 3 channels per chip and the notes of every chip.
 *
 * Bug: SIDParser read its own header copy - the "second chip" from byte 0x78
 * (startPage), the "third" from 0x79 (pageLength), the model from the clock
 * bits - and emulated only the first chip's registers ($D400-$D41F), so a
 * 1-chip tune with a relocation page showed 6 or 9 channels, and a 2SID / 3SID
 * had silent channels past the third. Real HVSC files.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseSIDFile } from '../formats/SIDParser';

const load = (name: string): ArrayBuffer => {
  const b = readFileSync(join(__dirname, '../../sid/__tests__/fixtures', name));
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
};
const notesOn = (song: Awaited<ReturnType<typeof parseSIDFile>>, ch: number): number =>
  song.patterns.reduce((n, p) => n + p.channels[ch].rows.filter((r) => r.note > 0 && r.note < 97).length, 0);

describe('a SID song has every chip\'s voices', () => {
  it('a 1-chip tune (Commando) has 3 channels', async () => {
    const song = await parseSIDFile(load('Commando.sid'), 'Commando.sid');
    expect(song.numChannels).toBe(3);
  });

  it('a 2SID tune (Sparkster - Lakeside) has 6 channels, the second chip\'s with notes', async () => {
    const song = await parseSIDFile(load('Sparkster-Lakeside_2SID.sid'), 'Sparkster-Lakeside_2SID.sid');
    expect(song.numChannels).toBe(6);
    expect(notesOn(song, 3) + notesOn(song, 4) + notesOn(song, 5)).toBeGreaterThan(0);
  }, 60_000);

  it('a 3SID tune (Devils ReSIDence) has 9 channels, the third chip\'s with notes', async () => {
    const song = await parseSIDFile(load('Devils_ReSIDence_3SID.sid'), 'Devils_ReSIDence_3SID.sid');
    expect(song.numChannels).toBe(9);
    expect(notesOn(song, 6) + notesOn(song, 7) + notesOn(song, 8)).toBeGreaterThan(0);
  }, 60_000);
});
