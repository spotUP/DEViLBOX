/**
 * Regression test: dub effect commands (effTyp 36/37/38) must display
 * as "Zxx" — not "?XX" or "0XX".
 *
 * Before fix: EFFECT_CHAR_MAP had no entries beyond 35, so effTyp 36-38
 * fell through to the '?' fallback in the GL renderer and '0' fallback
 * in xmEffectToString, producing garbled "?XX" / "0XX" in patterns.
 */
import { describe, it, expect } from 'vitest';
import { xmEffectToString } from '../xmConversions';
import { DUB_EFFECT_TYPE_MIN, DUB_EFFECT_TYPE_MAX } from '@/engine/dub/moveTable';

describe('xmEffectToString — dub effect commands', () => {
  it('effTyp 36 (DUB_EFFECT_GLOBAL) displays as Z + hex param', () => {
    expect(xmEffectToString(36, 0x00)).toBe('Z00');
    expect(xmEffectToString(36, 0x1A)).toBe('Z1A');
    expect(xmEffectToString(36, 0xFF)).toBe('ZFF');
  });

  it('effTyp 37 (DUB_EFFECT_PERCHANNEL) displays as Z + hex param', () => {
    expect(xmEffectToString(37, 0x03)).toBe('Z03');
    expect(xmEffectToString(37, 0xB5)).toBe('ZB5');
  });

  it('effTyp 38 (DUB_EFFECT_PARAM_STEP) displays as Z + hex param', () => {
    expect(xmEffectToString(38, 0x60)).toBe('Z60');
    expect(xmEffectToString(38, 0x00)).toBe('Z00');
  });

  it('effTyp 39 (DUB_EFFECT_GLOBAL_X) displays as Z + hex param', () => {
    // Extended slot, shipped with moves 16-31. This path was left at 36..38
    // while both grid renderers were updated, so a move authored in a cell
    // rendered a wrong character in the DOM cell and in Find/Replace.
    expect(xmEffectToString(39, 0x00)).toBe('Z00');
    expect(xmEffectToString(39, 0x2C)).toBe('Z2C');
  });

  it('effTyp 40 (DUB_EFFECT_PERCHANNEL_X) displays as Z + hex param', () => {
    expect(xmEffectToString(40, 0x12)).toBe('Z12');
    expect(xmEffectToString(40, 0xF3)).toBe('ZF3');
  });

  it('every declared dub slot renders as Z — ratchet against the next slot pair', () => {
    for (let t = DUB_EFFECT_TYPE_MIN; t <= DUB_EFFECT_TYPE_MAX; t++) {
      expect(xmEffectToString(t, 0x41)).toBe('Z41');
    }
  });

  it('does not claim effTyp outside the declared dub range', () => {
    // 41-47 are free; 0x40+ is the SunTronic reserved block. If a future slot
    // pair is declared, widen DUB_EFFECT_TYPE_MAX — the loop above then covers
    // it automatically and this guard moves with it.
    expect(xmEffectToString(DUB_EFFECT_TYPE_MAX + 1, 0x41)).not.toBe('Z41');
  });

  it('standard XM effects still render correctly', () => {
    expect(xmEffectToString(0, 0)).toBe('...');
    expect(xmEffectToString(10, 0x05)).toBe('A05');
    expect(xmEffectToString(15, 0x80)).toBe('F80');
    expect(xmEffectToString(33, 0x12)).toBe('X12');
  });
});
