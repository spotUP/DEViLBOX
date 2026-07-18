// sunGroupCodecBugs.test.ts
import { describe, it, expect } from 'vitest';
import { decodeSunGroup, encodeSunGroup } from '../sunGroupCodec';
import { SUN_EFFECT_BY_OP, sunEncodeEffect } from '../sunEffectMap';
import { SUN_FX } from '../sunEffectGlyphs';
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

describe('decodeSunGroup respects block limit', () => {
  it('stops at limit when the group lacks a 0x00 terminator', () => {
    // no terminator; two note-ish bytes then next block would start at index 2
    const h1 = new Uint8Array([0xc7, 0xc5, 0xc3]);
    const g = decodeSunGroup(h1, 0, 0, 0, 0, W, 2); // limit = 2
    expect(g.nextPos).toBe(2);                       // did NOT read index 2
    expect(g.cell.sunRaw).toEqual([0xc7, 0xc5]);     // exactly the block's bytes
  });
  it('default limit (omitted) preserves prior behaviour', () => {
    const h1 = new Uint8Array([0xc7, 0x00]);
    const g = decodeSunGroup(h1, 0, 0, 0, 0, W);
    expect(g.nextPos).toBe(2);
    expect(g.cell.sunRaw).toEqual([0xc7, 0x00]);
  });
});

describe('Fxx opcode-identity split (0x98 speed vs 0x8e ciaTempo)', () => {
  const W = { arpShift: 4, volSlideRateFromStream: false };

  it('0x98 owns effTyp 15 for all params (speed >= 0x20 stays 0x98)', () => {
    expect(SUN_EFFECT_BY_OP.get(0x98)!.decode([0x20])).toEqual({ effTyp: 15, param: 0x20 });
    expect(sunEncodeEffect(15, 0x20, W)).toEqual({ op: 0x98, argBytes: [0x20] });
  });

  it('0x8e ciaTempo is SUN_FX.ciaTempo for all params (tempo < 0x20 stays 0x8e word)', () => {
    expect(SUN_EFFECT_BY_OP.get(0x8e)!.decode([0x00, 0x10])).toEqual({ effTyp: SUN_FX.ciaTempo, param: 0x0010 });
    expect(sunEncodeEffect(SUN_FX.ciaTempo, 0x0010, W)).toEqual({ op: 0x8e, argBytes: [0x00, 0x10] });
  });

  it('corpus: every block with 0x98 or 0x8e round-trips byte-exact', () => {
    // Techno0.src omitted — lacks drin arp table and cannot be parsed by parseSunTronicV13Score.
    // ballblaser.src is a reliable V1.3 fixture that contains both 0x98 and 0x8e opcodes.
    for (const name of ['ready', 'ballblaser.src', 'ox.src']) {
      const song = parseSunTronicFile(readFixture(name), name);
      const L = song.uadeVariableLayout!;
      for (let fp = 0; fp < L.numFilePatterns; fp++) {
        const raw = Array.from(L.blockRawBytes![fp]);
        if (!raw.includes(0x98) && !raw.includes(0x8e)) continue;
        expect(Array.from(L.encoder.encodePattern(L.blockRows![fp], 0))).toEqual(raw);
      }
    }
  });
});
