/**
 * ZXAY STRC and AMAD files are refused with the reason, not misplayed.
 *
 * Same container as .ay, but the song data is a structure for a replayer
 * that lived in DeliAY / AY_Emul, not Z80 code; no player in reach has it
 * (thoughts/shared/research/2026-10-04_ay-strc-amad.md, ledger F15).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ayContainerType, isAYFormat, isAYStructuredFormat, parseAYStructuredFile } from '../formats/AYParser';
import { FORMAT_REGISTRY } from '../FormatRegistry';

const SONGS = resolve(__dirname, '../../../../public/data/songs');
const read = (rel: string): ArrayBuffer => {
  const b = readFileSync(resolve(SONGS, rel));
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
};

describe('ZXAY STRC / AMAD', () => {
  it('are ZXAY containers that are not EMUL', () => {
    const strc = read('ay-strc/mega mix 1.strc');
    const amad = read('ay-amadeus/aztec theme.amad');
    expect(ayContainerType(strc)).toBe('STRC');
    expect(ayContainerType(amad)).toBe('AMAD');
    expect(ayContainerType(read('ay-emul/spring.emul'))).toBe('EMUL');
    expect(isAYFormat(strc)).toBe(false);
    expect(isAYStructuredFormat(strc)).toBe(true);
    expect(isAYStructuredFormat(amad)).toBe(true);
  });

  it('the parser names the payload and the missing replayer', async () => {
    await expect(parseAYStructuredFile(read('ay-amadeus/aztec theme.amad'), 'aztec theme.amad'))
      .rejects.toThrow(/AMAD \(Amadeus\).*no available player/);
    await expect(parseAYStructuredFile(read('ay-strc/mega mix 1.strc'), 'mega mix 1.strc'))
      .rejects.toThrow(/STRC/);
  });

  it('the registry routes .strc and .amad to that parser', () => {
    const entry = FORMAT_REGISTRY.find((f) => f.extRegex?.test('x.strc'));
    expect(entry?.key).toBe('ayStructured');
    expect(FORMAT_REGISTRY.find((f) => f.extRegex?.test('x.amad'))?.key).toBe('ayStructured');
    expect(entry?.nativeParser?.parseFn).toBe('parseAYStructuredFile');
  });
});
