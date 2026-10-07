/**
 * The Hippel TFMX walk (HippelTfmxWalk.ts) is what the decoder that plays the
 * song walks, tick for tick.
 *
 * The decoder is libtfmxaudiodecoder's HippelDecoder in the TFMX wasm (the
 * engine .hip and .hip7 play on in the app). Its walk export (tfmx_module_walk_*,
 * Decoder.h walkEnable) logs every track-step load, every pattern row a voice
 * reads and the period the player looks up for it, with the tick. The TS
 * walk must log the same, per voice, for every subsong of every corpus file,
 * 4 voices (.hip) and 7 (.hip7). The grid is built from the TS walk
 * (hippelGrid), so this is the proof that the grid is what the replayer plays.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { readHippelTfmx, walkHippelTfmx, hippelNoteIndex, type HippelWalkRecord } from '@/lib/import/formats/HippelTfmxWalk';
import { loadTfmxWalkModule, HIPPEL_TFMX_CORPUS, type TfmxWalkHost } from './helpers/tfmxWalkHost';

const ROOT = join(process.cwd(), 'public/data/songs');
const TICKS = 30_000;

let host: TfmxWalkHost;
beforeAll(async () => { host = await loadTfmxWalkModule(); });

describe('Hippel TFMX walk matches the decoder', () => {
  it.each(HIPPEL_TFMX_CORPUS)('%s (%i voices): every subsong, every step load and row read, per tick', (rel, voices) => {
    const bytes = new Uint8Array(readFileSync(join(ROOT, rel)));
    const m = readHippelTfmx(bytes)!;
    expect(m, 'the song is found').not.toBeNull();
    expect(m.voices).toBe(voices);
    expect(host.songs(bytes)).toBe(m.nSongs);
    for (let sub = 0; sub < m.nSongs; sub++) {
      const decoder = host.walk(bytes, sub, TICKS);
      expect(decoder.voices).toBe(voices);
      expect(decoder.records.length, 'the decoder walk ran (sentinel)').toBeGreaterThan(1000);
      const lastTick = Math.max(...decoder.records.map((r) => r[0]));
      const mine = walkHippelTfmx(m, sub, lastTick + 1);
      // Steps and rows, per voice, strictly.
      for (const kind of [0, 1]) {
        for (let v = 0; v < voices; v++) {
          const a = decoder.records.filter((r) => r[1] === kind && r[2] === v);
          const b = mine.filter((r) => r[1] === kind && r[2] === v);
          expect(b.length, `${rel} subsong ${sub} voice ${v} kind ${kind}: record count`).toBe(a.length);
          const bad = a.findIndex((r, i) => r.some((x, j) => x !== b[i][j]));
          expect(bad, bad < 0 ? '' : `${rel} subsong ${sub} voice ${v} kind ${kind} record ${bad}: decoder ${a[bad]} walk ${b[bad]}`).toBe(-1);
        }
      }
      // The pitch the player looks up for each note, per voice, in order. A sound sequence that
      // transposes (e = sequence transpose) moves it: added when not negative, the note itself
      // when negative (a fixed-pitch instrument). The grid shows the pattern note either way, so
      // these are held to the decoder's own formula instead, and counted.
      let pitched = 0;
      let moved = 0;
      for (let v = 0; v < voices; v++) {
        const a = decoder.records.filter((r) => r[1] === 2 && r[2] === v);
        const b = mine.filter((r) => r[1] === 2 && r[2] === v);
        expect(b.length, `${rel} subsong ${sub} voice ${v}: note count`).toBe(a.length);
        a.forEach((r: HippelWalkRecord, i) => {
          const where = `${rel} subsong ${sub} voice ${v} note ${i}`;
          // tick, step, pattern note, transpose, volume sequence playing: the walk's own.
          expect([r[0], r[3], r[6], r[7], r[9]], where).toEqual([b[i][0], b[i][3], b[i][6], b[i][7], b[i][9]]);
          const seq = r[8];
          if (seq === 0) {
            expect([r[4], r[5]], where).toEqual([b[i][4], b[i][5]]);
          } else {
            moved++;
            const t = seq >= 0 ? hippelNoteIndex(r[6], r[7] + seq) : seq & 0x7f;
            expect(r[4], `${where} (sequence transpose ${seq})`).toBe(seq >= 0 ? t : hippelNoteIndex(0, seq));
          }
          pitched++;
        });
      }
      console.log(`[hippel walk] ${rel} subsong ${sub}: ${pitched} notes, ${moved} moved by a sound sequence`);
      expect(pitched).toBeGreaterThan(50);
    }
  }, 60_000);
});
