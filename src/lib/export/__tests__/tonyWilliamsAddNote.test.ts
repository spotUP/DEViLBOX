/**
 * Tony Williams: a note on an empty row inside a held note splits that note (duration, note, duration restored)
 * and relocates the tail (tonyWilliamsEdits.ts). Real song: future basketball main.tw. Reloaded, the note stands on
 * that row, the song has the same length, and every other note is unchanged; a note outside the player's table is
 * refused with a warning and nothing written.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseTonyWilliamsFile } from '@lib/import/formats/TonyWilliamsParser';
import { exportTonyWilliams } from './../TonyWilliamsExporter';

const NAME = 'future basketball main.tw';
const raw = readFileSync(join(process.cwd(), 'public/data/songs/sound-images', NAME));
const buf = (): ArrayBuffer => raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer;
const run = async (song: Awaited<ReturnType<typeof parseTonyWilliamsFile>>) => {
  const r = await exportTonyWilliams(song);
  return { data: new Uint8Array(await r.data.arrayBuffer()), warnings: r.warnings };
};

describe('Tony Williams note on an empty row', () => {
  it('lands on that row, keeps the song length and every other note', async () => {
    const song = await parseTonyWilliamsFile(buf(), NAME);
    let hit: [number, number, number] | null = null;
    song.patterns.forEach((pat, p) => pat.channels.forEach((ch, c) => ch.rows.forEach((row, r) => {
      if (!hit && r > 0 && row.note === 0 && ch.rows[r - 1].note > 0 && !row.effTyp && !row.effTyp2) hit = [p, c, r];
    })));
    const [p, c, r] = hit as unknown as [number, number, number];
    expect(hit).not.toBeNull();
    const before = song.patterns.map((pt) => pt.channels.map((ch) => ch.rows.map((x) => x.note)));
    song.patterns[p].channels[c].rows[r].note = 40;
    const { data, warnings } = await run(song);
    expect(warnings).toEqual([]);
    expect(data.length).toBeGreaterThan(raw.length);
    const re = await parseTonyWilliamsFile(data.buffer.slice(0) as ArrayBuffer, 'x.tw');
    expect(re.patterns.length).toBe(song.patterns.length);
    expect(re.patterns[p].channels[c].rows[r].note).toBe(40);
    re.patterns.forEach((pt, pi) => pt.channels.forEach((ch, ci) => ch.rows.forEach((row, ri) => {
      if (pi === p && ci === c && ri === r) return;
      expect(row.note).toBe(before[pi][ci][ri]);
    })));
  });

  it('refuses a note outside the player table with a warning and writes nothing', async () => {
    const song = await parseTonyWilliamsFile(buf(), NAME);
    const row = song.patterns[0].channels[0].rows.findIndex((x, i) => i > 0 && x.note === 0);
    song.patterns[0].channels[0].rows[row].note = 96;
    const { data, warnings } = await run(song);
    expect(warnings.some((w) => /not written/.test(w))).toBe(true);
    expect(Buffer.from(data).equals(raw)).toBe(true);
  });

  it('writes a note with another instrument with Instrument commands around it', async () => {
    let done = false;
    const probe = await parseTonyWilliamsFile(buf(), NAME);
    for (let p = 0; p < probe.patterns.length && !done; p++) for (let c = 0; c < 4 && !done; c++) for (let r = 1; r < 64 && !done; r++) {
      if (probe.patterns[p].channels[c].rows[r].note !== 0 || probe.patterns[p].channels[c].rows[r - 1].note === 0) continue;
      const song = await parseTonyWilliamsFile(buf(), NAME);
      const before = song.patterns.map((pt) => pt.channels.map((ch) => ch.rows.map((x) => x.note)));
      song.patterns[p].channels[c].rows[r].note = 40;
      song.patterns[p].channels[c].rows[r].instrument = 16;
      const { data, warnings } = await run(song);
      if (warnings.length > 0 || data.length === raw.length) continue;
      done = true;
      const re = await parseTonyWilliamsFile(data.buffer.slice(0) as ArrayBuffer, 'x.tw');
      expect(re.patterns[p].channels[c].rows[r].note).toBe(40);
      expect(re.patterns[p].channels[c].rows[r].instrument).toBe(16);
      re.patterns.forEach((pt, pi) => pt.channels.forEach((ch, ci) => ch.rows.forEach((row, ri) => {
        if (pi === p && ci === c && ri === r) return;
        expect(row.note).toBe(before[pi][ci][ri]);
      })));
    }
    expect(done).toBe(true);
  });
});
