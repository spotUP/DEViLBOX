/**
 * Regression: SNX (Sonix Music Driver) private effect glyph block (0x60..0x62).
 *
 * SNX surfaces three per-cell control opcodes as tracker effect columns —
 * channel volume (0x81), tempo (0x82), detune/pitch-mod (0x83) — each assigned a
 * reserved effTyp so the shared grid renderers show a stable glyph. This guards
 * the glyph mapping and the block bounds, and confirms the ids don't collide with
 * the XM effect space (so xmEffectToString routes them to the SNX hook, not a
 * bogus XM letter).
 */
import { describe, it, expect } from 'vitest';
import {
  SNX_FX,
  SNX_FX_MIN,
  SNX_FX_MAX,
  sonixEffectToString,
  isSonixEffect,
} from '../sonixEffectGlyphs';
import { xmEffectToString } from '@/lib/xmConversions';

describe('SNX private effect glyphs', () => {
  it('maps chanVol/tempo/detune to their reserved effTyp block 0x60..0x62', () => {
    expect(SNX_FX.chanVol).toBe(0x60);
    expect(SNX_FX.tempo).toBe(0x61);
    expect(SNX_FX.detune).toBe(0x62);
    expect(SNX_FX_MIN).toBe(0x60);
    expect(SNX_FX_MAX).toBe(0x62);
  });

  it('renders each SNX effect as glyph + 2 hex of the param byte', () => {
    expect(sonixEffectToString(SNX_FX.chanVol, 0x40)).toBe('V40');
    expect(sonixEffectToString(SNX_FX.tempo, 0x06)).toBe('T06');
    // Detune is signed: -1 (0xFF) is carried verbatim as its two's-complement byte.
    expect(sonixEffectToString(SNX_FX.detune, 0xff)).toBe('DFF');
  });

  it('returns null for non-SNX effTyps (XM Cxx=12, empty)', () => {
    expect(sonixEffectToString(12, 0x40)).toBeNull();
    expect(sonixEffectToString(0, 0)).toBeNull();
    expect(isSonixEffect(12)).toBe(false);
    expect(isSonixEffect(0x40)).toBe(false); // SunTronic block, not SNX
    expect(isSonixEffect(SNX_FX.tempo)).toBe(true);
  });

  it('is reachable through the shared xmEffectToString dispatch', () => {
    // The grid EffectCell path goes through xmEffectToString; the SNX hook must fire
    // for the reserved block instead of falling to a bogus XM letter.
    expect(xmEffectToString(SNX_FX.chanVol, 0x40)).toBe('V40');
    expect(xmEffectToString(SNX_FX.detune, 0x0c)).toBe('D0C');
  });
});
