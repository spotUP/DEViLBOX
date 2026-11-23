/** C64 export: a filter program's $D417 voice mask routes only the voices its instrument plays on. Regression: the mask was
 * hard-coded $07, so "C64 junk"'s bass (voice 1 only in Furnace, $D417 = $F1) filtered all three voices on the .prg. */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseFurnaceSong } from '../../import/formats/FurnaceSongParser';
import { furnaceToGoatTracker } from '../c64/goatSong';

describe('C64 GoatTracker filter routing', () => {
  it('"C64 junk": every filter parameter row routes voice 1 only', async () => {
    const fur = readFileSync(join(__dirname, '../../../../public/data/songs/furnace/c64/C64 junk.fur'));
    const m = await parseFurnaceSong(fur.buffer.slice(fur.byteOffset, fur.byteOffset + fur.length) as ArrayBuffer);
    const ft = furnaceToGoatTracker(m, 0).song.tables[2];
    const masks = ft.left.flatMap((l, i) => (l >= 0x80 && l < 0xff ? [ft.right[i] & 15] : []));
    expect(masks.length).toBeGreaterThan(0);
    expect(new Set(masks)).toEqual(new Set([1]));
  });
});
