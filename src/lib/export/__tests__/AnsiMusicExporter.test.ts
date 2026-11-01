/**
 * ANSI music export is the parser read backwards: a real .ANS song exported and
 * parsed again sounds the same tones at the same times. Times are compared in
 * seconds, because the re-parse may pick a coarser grid (rows per whole note)
 * than the original.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseAnsiMusicFile } from '@lib/import/formats/AnsiMusicParser';
import type { TrackerSong } from '@/engine/TrackerReplayer';
import { exportAnsiMusic, ansiPlayString } from '../AnsiMusicExporter';

const dir = join(__dirname, '../../import/__tests__/fixtures/ansi-music');
const load = (name: string): ArrayBuffer => {
  const b = readFileSync(join(dir, name));
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
};

/**
 * What channel 0 sounds like along the order: [start s, end s, note] tones, tempo
 * from Fxx. A PC speaker has no envelope, so a note struck again at the same
 * pitch with no gap is one tone; adjacent same-pitch tones are merged. The
 * exporter relies on that: a 5-row note is written C8C32 under ML.
 */
function tones(song: TrackerSong): Array<[number, number, number]> {
  let speed = song.initialSpeed;
  let bpm = song.initialBPM;
  let t = 0;
  const out: Array<[number, number, number]> = [];
  let cur: [number, number, number] | null = null;
  const close = (at: number): void => {
    if (!cur) return;
    cur[1] = at;
    const prev = out[out.length - 1];
    if (prev && prev[2] === cur[2] && Math.abs(prev[1] - cur[0]) < 1e-9) prev[1] = cur[1];
    else out.push(cur);
    cur = null;
  };
  for (let pos = 0; pos < song.songLength; pos++) {
    const pat = song.patterns[song.songPositions[pos]];
    for (let i = 0; i < pat.length; i++) {
      const c = pat.channels[0].rows[i];
      if (c?.effTyp === 0x0f && c.eff > 0) {
        if (c.eff < 32) speed = c.eff;
        else bpm = c.eff;
      }
      if (c && c.note === 97) close(t);
      else if (c && c.note > 0 && c.note < 97) {
        close(t);
        cur = [t, t, c.note];
      }
      t += (speed * 2.5) / bpm;
    }
  }
  close(t);
  return out.map(([a, b, n]) => [Math.round(a * 1000) / 1000, Math.round(b * 1000) / 1000, n]);
}

async function reparse(song: TrackerSong): Promise<TrackerSong> {
  const bytes = await exportAnsiMusic(song).data.arrayBuffer();
  return parseAnsiMusicFile(bytes, 'out.ans');
}

describe('exportAnsiMusic', () => {
  it.each(['MUSIC_pavt199.ANS', 'ANSIPL20_INTRO.ANS', '!ANSIMUS.ANS'])(
    '%s re-imports with the same tones at the same times',
    async (name) => {
      const song = parseAnsiMusicFile(load(name), name);
      const again = await reparse(song);
      expect(again.format).toBe('AnsiMusic');
      const a = tones(song);
      const b = tones(again);
      expect(a.length).toBeGreaterThan(0);
      expect(b.map((x) => x[2])).toEqual(a.map((x) => x[2]));
      b.forEach(([start, end], i) => {
        expect(Math.abs(start - a[i][0])).toBeLessThan(0.002);
        expect(Math.abs(end - a[i][1])).toBeLessThan(0.002);
      });
    },
  );

  it('frames the block as ESC [ M F ... SO', async () => {
    const song = parseAnsiMusicFile(load('MUSIC_pavt199.ANS'), 'MUSIC_pavt199.ANS');
    const bytes = new Uint8Array(await exportAnsiMusic(song).data.arrayBuffer());
    expect(Array.from(bytes.slice(0, 4))).toEqual([0x1b, 0x5b, 0x4d, 0x46]);
    expect(bytes[bytes.length - 1]).toBe(0x0e);
  });

  it('writes a blank 64-row song as rests only', () => {
    const song = parseAnsiMusicFile(load('MUSIC_pavt199.ANS'), 'MUSIC_pavt199.ANS');
    const pat = song.patterns[song.songPositions[0]];
    const blank: TrackerSong = {
      ...song,
      songLength: 1,
      songPositions: [song.songPositions[0]],
      patterns: song.patterns.map((p) =>
        p === pat ? { ...p, channels: p.channels.map((ch) => ({ ...ch, rows: ch.rows.map((c) => ({ ...c, note: 0, effTyp: 0, eff: 0 })) })) } : p,
      ),
    };
    expect(ansiPlayString(blank)).toMatch(/^T\d+ML(P\d+)+$/);
  });

  it('refuses a note PLAY cannot hold', () => {
    const song = parseAnsiMusicFile(load('MUSIC_pavt199.ANS'), 'MUSIC_pavt199.ANS');
    const pat = song.patterns[song.songPositions[0]];
    pat.channels[0].rows[0] = { ...pat.channels[0].rows[0], note: 90 };
    expect(() => exportAnsiMusic(song)).toThrow(/O0 C to O6 B/);
  });
});
