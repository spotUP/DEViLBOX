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

  it('standard XM effects still render correctly', () => {
    expect(xmEffectToString(0, 0)).toBe('...');
    expect(xmEffectToString(10, 0x05)).toBe('A05');
    expect(xmEffectToString(15, 0x80)).toBe('F80');
    expect(xmEffectToString(33, 0x12)).toBe('X12');
  });
});
