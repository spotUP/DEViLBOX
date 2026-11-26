/**
 * AProSysParser tests on the real corpus (public/data/songs/aprosys): every song parses, has 4 channels,
 * at least one pattern with a note, and no invented instrument name (the format stores none).
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isAProSysFormat, parseAProSysFile } from '../formats/AProSysParser';

const DIR = join(__dirname, '../../../../public/data/songs/aprosys/Petter A. Urkedal');
const FILES = readdirSync(DIR).filter((f) => f.toLowerCase().endsWith('.aps'));

describe('isAProSysFormat', () => {
  it('matches by extension and prefix only', () => {
    expect(isAProSysFormat(new ArrayBuffer(0), 'x.aps')).toBe(true);
    expect(isAProSysFormat(new ArrayBuffer(0), 'aps.x')).toBe(true);
    expect(isAProSysFormat(new ArrayBuffer(0), 'x.mod')).toBe(false);
  });
});

describe('parseAProSysFile', () => {
  it('throws on a non-ADRVPACK buffer', () => {
    expect(() => parseAProSysFile(new ArrayBuffer(100), 'x.aps')).toThrow();
  });

  it('has a corpus', () => {
    expect(FILES.length).toBeGreaterThan(20);
  });

  it.each(FILES)('parses %s', (name) => {
    const b = readFileSync(join(DIR, name));
    const song = parseAProSysFile(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer, name);
    expect(song.numChannels).toBe(4);
    expect(song.patterns.length).toBeGreaterThan(0);
    const notes = song.patterns.flatMap((p) => p.channels.flatMap((c) => c.rows)).filter((c) => c.note > 0);
    expect(notes.length).toBeGreaterThan(0);
    for (const i of song.instruments) expect(i.name).toBe('');
  });
});
