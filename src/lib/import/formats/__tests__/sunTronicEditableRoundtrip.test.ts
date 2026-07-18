/**
 * SunTronic V1.3 editable-pattern round-trip gate (Phase 1).
 *
 * The block pool (`blockRows`) is decoded from the command stream at raw pitch
 * (transpose 0) via `decodeSunGroup`, and each pool cell carries its exact
 * source group bytes in `sunRaw`. The native exporter re-encodes each block by
 * driving `layout.encoder.encodePattern(blockRows[fp], 0)`, which concatenates
 * every cell's `sunRaw`. For an UNEDITED song that re-encode must reproduce the
 * original block bytes exactly — otherwise a byte-exact save is impossible.
 *
 * This gate drives the encoder DIRECTLY (not via UADEPatternEncoder's
 * encodeVariableBlock, which short-circuits identical arrays to the raw
 * baseline) so it actually exercises the sunRaw concatenation path.
 *
 * Fails-on-revert: revert Task 5's blockRows decode (back to `b.rows` from the
 * per-item decodeSunBlock, which never sets `sunRaw`) and the encoder emits
 * empty blocks → mismatch → this fails.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseSunTronicFile } from '../SunTronicParser';

const CORPUS = join(process.cwd(), 'public/data/songs/formats/SUNTronicTunes');
function readFixture(name: string): ArrayBuffer {
  const raw = new Uint8Array(readFileSync(join(CORPUS, name)));
  return raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer;
}

describe('SunTronic V1.3 editable round-trip — encoder reproduces every block byte-exact', () => {
  for (const name of ['ready', 'kompo04-mix.src', 'multi-arp-long.src', 'ox.src', 'snake.src']) {
    it(`${name}: encodePattern(blockRows[fp]) === blockRawBytes[fp] for every block`, () => {
      const song = parseSunTronicFile(readFixture(name), name);
      const L = song.uadeVariableLayout!;
      expect(L.formatId).toBe('sunTronic');
      expect(L.blockRows!.length).toBe(L.numFilePatterns);
      expect(L.blockRows!.length).toBeGreaterThan(0);
      for (let fp = 0; fp < L.numFilePatterns; fp++) {
        const enc = L.encoder.encodePattern(L.blockRows![fp], 0);
        expect(Array.from(enc), `${name} block ${fp}`).toEqual(Array.from(L.blockRawBytes![fp]));
      }
    });
  }
});
