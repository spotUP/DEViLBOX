// sunGroupCodecBugs.test.ts
import { describe, it, expect } from 'vitest';
import { decodeSunGroup, encodeSunGroup } from '../sunGroupCodec';
import { parseSunTronicFile, readFixture } from './sunTestUtil';

const W = { arpShift: 4, volSlideRateFromStream: false };

describe('0x94 setPitchNoRetrig single-carrier', () => {
  it('decode->encode of a lone 0x94 group is byte-exact', () => {
    // 0x94 0x24 = set-pitch (raw pitch 0x24) ; 0x00 term
    const h1 = new Uint8Array([0x94, 0x24, 0x00]);
    const { cell } = decodeSunGroup(h1, 0, 0, 0, 0, W);
    expect(cell.effTyp).toBe(3);
    expect(cell.eff).toBe(0x24);                       // pitch carried as glide param, NOT 0
    expect(encodeSunGroup(cell, 0, 0, 0, W)).toEqual([0x94, 0x24, 0x00]);
  });

  it('edited 0x94 note emits ONE 0x94 carrier, no duplicate note byte', () => {
    const h1 = new Uint8Array([0x94, 0x24, 0x00]);
    const { cell } = decodeSunGroup(h1, 0, 0, 0, 0, W);
    // bump the glide pitch by one semitone via the effTyp-3 column
    const edited = { ...cell, eff: 0x25 };
    const bytes = encodeSunGroup(edited, 0, 0, 0, W);
    expect(bytes).toEqual([0x94, 0x25, 0x00]);         // exactly one 0x94, one arg, terminator
    expect(bytes.filter(b => b >= 0xb8).length).toBe(0); // no bare note byte emitted
  });

  it('corpus: every block containing a 0x94 opcode round-trips byte-exact', () => {
    for (const name of ['ready', 'ballblaser.src', 'Snake0.src']) {
      const song = parseSunTronicFile(readFixture(name), name);
      const L = song.uadeVariableLayout!;
      for (let fp = 0; fp < L.numFilePatterns; fp++) {
        const raw = Array.from(L.blockRawBytes![fp]);
        if (!raw.includes(0x94)) continue;
        const enc = Array.from(L.encoder.encodePattern(L.blockRows![fp], 0));
        expect(enc).toEqual(raw);
      }
    }
  });
});
