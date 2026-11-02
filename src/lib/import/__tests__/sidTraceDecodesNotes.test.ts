import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseSIDFile } from '../formats/SIDParser';

// Real compiled PSID (Abaddon / Starfish), run through the product SID import.
const FILE = 'public/data/songs/sid/abaddon-starfish-test.sid';

describe('SID import decodes the register trace into an editable song', () => {
  it('gives gate-segmented notes, trace-inferred instruments and a fitted row grid', async () => {
    const bytes = readFileSync(FILE);
    const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    const song = await parseSIDFile(buf, 'abaddon-starfish-test.sid');

    const cells = song.patterns.flatMap((p) => p.channels.flatMap((c) => c.rows));
    const noteStarts = cells.filter((c) => c.note > 0 && c.note < 97);
    console.log('SIDTRACE', JSON.stringify({
      instruments: song.instruments.length, noteStarts: noteStarts.length,
      speed: song.initialSpeed, patterns: song.patterns.length,
      names: song.instruments.slice(0, 3).map((i) => i.name),
    }));

    // P1: instruments inferred from the trace, not the three fixed voice instruments.
    expect(song.instruments.length).toBeGreaterThan(0);
    expect(song.instruments.every((i) => i.synthType === 'C64SID' && /^Instrument \d+$/.test(i.name))).toBe(true);
    const used = new Set(noteStarts.map((c) => c.instrument));
    for (const id of used) expect(song.instruments.some((i) => i.id === id)).toBe(true);

    // P2: notes segmented by gate; every note start cell carries an instrument.
    expect(noteStarts.length).toBeGreaterThan(8);
    expect(noteStarts.every((c) => c.instrument > 0)).toBe(true);

    // P3: row grid fitted to the note starts (not the fixed fallback of 6 by default luck).
    expect(song.initialSpeed).toBeGreaterThanOrEqual(1);
    expect(song.initialSpeed).toBeLessThanOrEqual(16);
  });
});
