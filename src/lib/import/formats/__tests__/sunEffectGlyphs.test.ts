/**
 * Regression: SunTronic private control effects render as real grid glyphs, not
 * "?00".
 *
 * The tracker grid effect column showed "?00" for SunTronic control commands
 * (restartVolEnv/masterFade/paulaAttach/…) because their effTyp ids sat past the
 * shared 41-slot glyph array, and others collided with dub (36-40 → "Z") / OPL
 * (0x30-0x3F → "~F/~C/~M/~V"). The fix relocates every SunTronic custom effect
 * into the reserved 0x40..0x4F block and teaches the shared display path
 * (xmEffectToString — consulted by both tracker renderers) about it.
 *
 * Fails on revert: drop the SunTronic branch in xmEffectToString and every id
 * falls back to '0'/OPL → the glyph no longer matches SUN_EFFECT_GLYPH.
 */
import { describe, it, expect } from 'vitest';
import { xmEffectToString } from '@/lib/xmConversions';
import {
  SUN_FX,
  SUN_EFFECT_GLYPH,
  SUN_FX_MIN,
  SUN_FX_MAX,
  isSunEffect,
  sunEffectToString,
} from '../sunEffectGlyphs';

describe('SunTronic effect glyphs', () => {
  it('every SunTronic private effTyp renders a real glyph + 2 hex — never "?" or "0"', () => {
    for (const [name, effTyp] of Object.entries(SUN_FX)) {
      const s = xmEffectToString(effTyp, 0x00);
      // First char is the registered glyph, not the '?'/'0'/'~' fallbacks.
      expect(s[0], `${name} (effTyp ${effTyp}) glyph`).toBe(SUN_EFFECT_GLYPH[effTyp]);
      expect(s[0]).not.toBe('?');
      expect(s[0]).not.toBe('~');
      // Full 3-char token: glyph + 2-hex low byte.
      expect(s, `${name} token`).toBe(`${SUN_EFFECT_GLYPH[effTyp]}${(0x00).toString(16).toUpperCase().padStart(2, '0')}`);
    }
  });

  it('param low byte renders as 2 upper-hex digits', () => {
    expect(xmEffectToString(SUN_FX.masterFade, 0xab)).toBe('GAB');
    expect(xmEffectToString(SUN_FX.arpSelect, 0x0140 & 0xff)).toBe('J40');
  });

  it('the reserved block does NOT collide with dub (36-40) or OPL (0x30-0x3F)', () => {
    // Block is strictly above OPL's 0x3F and dub's 40.
    expect(SUN_FX_MIN).toBeGreaterThan(0x3f);
    expect(SUN_FX_MIN).toBeGreaterThan(40);
    // All ids are unique and inside the declared bounds.
    const ids = Object.values(SUN_FX);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(isSunEffect(id)).toBe(true);
      expect(id).toBeGreaterThanOrEqual(SUN_FX_MIN);
      expect(id).toBeLessThanOrEqual(SUN_FX_MAX);
    }
  });

  it('sunEffectToString returns null for non-SunTronic effTyps (e.g. XM Cxx=12)', () => {
    expect(sunEffectToString(12, 0x40)).toBeNull();
    expect(sunEffectToString(0, 0)).toBeNull();
  });
});
