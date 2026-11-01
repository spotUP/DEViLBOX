import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tryChipDumpParse } from '../parsers/ChipDumpParsers';
import { parseAnsiMusicFile, isAnsiMusicFormat } from '../formats/AnsiMusicParser';
import { scanAnsiMusicBlocks } from '../formats/ansiMusic';

const dir = join(__dirname, 'fixtures', 'ansi-music');
const load = (name: string): ArrayBuffer => {
  const b = readFileSync(join(dir, name));
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
};

describe('AnsiMusicParser on real fixtures', () => {
  it.each([
    ['MUSIC_pavt199.ANS', 1],
    ['!ANSIMUS.ANS', 4],
    ['RELIGIOU.MUS', 52],
    ['ANSIPL20_INTRO.ANS', 1],
  ])('%s has %i subsongs', async (name, count) => {
    const song = await tryChipDumpParse(load(name), name.toLowerCase(), name);
    const direct = parseAnsiMusicFile(load(name), name);
    expect(direct.fileSubsongs?.count).toBe(count);
    if (!name.endsWith('.MUS')) expect(song?.fileSubsongs?.count).toBe(count);
  });

  it('MUSIC_pavt199: first note, row, BPM, instrument', async () => {
    const song = await tryChipDumpParse(load('MUSIC_pavt199.ANS'), 'music_pavt199.ans', 'MUSIC_pavt199.ANS');
    expect(song).not.toBeNull();
    expect(song!.format).toBe('AnsiMusic');
    expect(song!.initialBPM).toBe(120);
    expect(song!.instruments[0].synthType).toBe('FurnacePCSPKR');
    const rows = song!.patterns[0].channels[0].rows;
    const first = rows.findIndex((c) => c.note > 0 && c.note < 97);
    expect(first).toBe(0);
    // O3 C = semitone 36 = note 37; row = 1/12 whole = 8 ticks at 24 ticks per quarter
    expect(rows[first].note).toBe(37);
    expect(song!.initialSpeed).toBe(8);
  });

  it('subsong argument selects the block', async () => {
    const a = parseAnsiMusicFile(load('!ANSIMUS.ANS'), 'x.ans', 0);
    const b = parseAnsiMusicFile(load('!ANSIMUS.ANS'), 'x.ans', 2);
    expect(b.fileSubsongs?.current).toBe(2);
    expect(JSON.stringify(a.patterns)).not.toBe(JSON.stringify(b.patterns));
  });

  it('plain ANSI art (music block removed) is rejected and falls through', async () => {
    const buf = new Uint8Array(load('MUSIC_pavt199.ANS'));
    const { blocks } = scanAnsiMusicBlocks(buf);
    const parts: Uint8Array[] = [];
    let at = 0;
    for (const b of blocks) { parts.push(buf.subarray(at, b.start)); at = b.end; }
    parts.push(buf.subarray(at));
    const art = Uint8Array.from(parts.flatMap((p) => Array.from(p)));
    expect(isAnsiMusicFormat(art.buffer as ArrayBuffer)).toBe(false);
    expect(await tryChipDumpParse(art.buffer as ArrayBuffer, 'art.ans', 'art.ans')).toBeNull();
  });
});
