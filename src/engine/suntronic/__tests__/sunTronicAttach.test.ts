/**
 * Regression: the native SunTronic renderer models Paula volume-attach (ADKCON
 * low nibble, opcode 0x91). When voice V is latched as an attach modulator the
 * hardware (a) mutes voice V (adk_mask=0, audio.c:269) and (b) overwrites voice
 * V+1's per-sample volume with voice V's raw DMA word every fetch (custom.c:508,
 * audio.c:506) — so voice V+1 becomes an amplitude-modulated carrier that rails
 * to full scale while voice V goes silent.
 *
 * Bug (2026-07-17): opcode 0x91 was a no-op, so attach was unmodelled. The
 * modulator played as an audible drone and the carrier played its flat envelope
 * (or, when it had no note of its own, was silent) — for the four attach songs
 * (comming0/freak/sound-test/sound12.tn) UADE plays a silent modulator + an AM'd
 * lead, native played the opposite.
 *
 * sound12.tn latches attach on voice 1 → voice 2 (all voices synth, so this is
 * self-contained: no companion PCM). The structural signature the model produces:
 *   - modulator (v1): RMS ≈ 0 (muted).
 *   - carrier (v2): rails to full scale (peak ≈ 1.0, RMS high) — the AM.
 * Reverting the 0x91 latch / mixer AM leaves the modulator audible (RMS ~0.16 >
 * threshold) and the carrier at the normal single-voice Paula ceiling (peak
 * ~0.25 < threshold) → both witnesses break. UADE sample-exactness of the carrier
 * waveform is the separate deferred Paula-DMA scheduler (attach amplifies that
 * phase drift because volume is sign-sensitive); this test locks the MODEL, not
 * the cycle-accurate timbre.
 */
import { describe, it, expect } from 'vitest';
import { parseSunTronicV13Score } from '@/lib/import/formats/SunTronicV13';
import { renderSunTronicMix } from '../SunTronicNativeRender';
import oracle from '../__fixtures__/suntronicAttachOracle.json';

const rms = (s: Float32Array): number => {
  let a = 0;
  for (let i = 0; i < s.length; i++) a += s[i] * s[i];
  return Math.sqrt(a / Math.max(1, s.length));
};
const peak = (s: Float32Array): number => {
  let m = 0;
  for (let i = 0; i < s.length; i++) { const a = Math.abs(s[i]); if (a > m) m = a; }
  return m;
};

describe('SunTronic Paula volume-attach (opcode 0x91)', () => {
  const { name, modulator, carrier, bytesB64, seconds } = oracle as {
    name: string; modulator: number; carrier: number; bytesB64: string; seconds: number;
  };
  const data = new Uint8Array(Buffer.from(bytesB64, 'base64'));
  const score = parseSunTronicV13Score(data);
  const mix = renderSunTronicMix(score, [], { seconds });

  it(`${name}: attach modulator voice ${modulator} is muted`, () => {
    // adk_mask=0 forces the modulator's own output to 0. Revert (no attach) leaves
    // it playing its synth timbre (~0.16 RMS).
    expect(rms(mix.ch[modulator])).toBeLessThan(0.02);
  });

  it(`${name}: attach carrier voice ${carrier} is amplitude-modulated (rails)`, () => {
    // vol = modulator's full unsigned DMA word → carrier_sample*word clips to full
    // scale. Revert leaves the carrier at the normal single-voice ceiling (~0.25).
    expect(peak(mix.ch[carrier])).toBeGreaterThan(0.9);
    expect(rms(mix.ch[carrier])).toBeGreaterThan(0.5);
  });
});
