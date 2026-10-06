/**
 * soundPlayerEffectGlyphs.ts - Sound Player (Scott Johnston, SJS.*) private
 * effect id block + glyphs.
 *
 * SINGLE SOURCE OF TRUTH for the effTyp integers Sound Player's row commands
 * occupy in the tracker grid when no XM effect means the same thing (volume,
 * volume slide, filter, note cut and song end use the XM letters C, A, E0x,
 * EC0, B00 - soundPlayerCodec.ts). `effTyp` is a GLOBAL id space shared by
 * every format's display path (xmEffectToString + TrackerGLRenderer +
 * TrackerCanvas2DRenderer); this block, 0x63..0x69, follows SNX's 0x60..0x62
 * and no other format uses it.
 *
 * ZERO imports on purpose - imported by the renderer workers.
 *
 * Ground truth: SoundPlayer_v1.asm command table lbW0642F4 and its handlers
 * (thoughts/shared/research/2026-10-06_soundplayer-format.md).
 */

/** Sound Player private control-effect ids (reserved block 0x63..0x69). */
export const SPL_FX = {
  /** W: the voice stays on this row for `eff` row ticks (commands $57-$88, 1..50). */
  wait: 0x63,
  /** L: loop start, `eff` = repeat count 1..10 ($D2-$DB); L00 = loop end ($DC). */
  loop: 0x64,
  /** H: H01 hold the sample (no loop re-point, $CF), H00 release ($D0). */
  hold: 0x65,
  /** P: park - the voice re-reads this row forever ($DD). */
  park: 0x66,
  /** S: game sync flag: Sxx set flag xx ($BB-$CE), S80+xx clear ($E5-$F8), SFF clear all ($D1). */
  sync: 0x67,
  /** M: ADKCON modulation: M80|bits sets ($DF-$E4), Mbits clears ($F9-$FD). */
  adk: 0x68,
  /** N: a command byte this player version ignores, kept verbatim (eff = the byte). */
  inert: 0x69,
} as const;

export const SPL_FX_MIN = SPL_FX.wait;
export const SPL_FX_MAX = SPL_FX.inert;

export const SPL_EFFECT_GLYPH: Record<number, string> = {
  [SPL_FX.wait]: 'W',
  [SPL_FX.loop]: 'L',
  [SPL_FX.hold]: 'H',
  [SPL_FX.park]: 'P',
  [SPL_FX.sync]: 'S',
  [SPL_FX.adk]: 'M',
  [SPL_FX.inert]: 'N',
};

/** True when `effTyp` is a Sound Player private effect. */
export function isSoundPlayerEffect(effTyp: number): boolean {
  return effTyp >= SPL_FX_MIN && effTyp <= SPL_FX_MAX;
}

/** A Sound Player private effect as a 3-char grid token, or null outside the block. */
export function soundPlayerEffectToString(effTyp: number, eff: number): string | null {
  const glyph = SPL_EFFECT_GLYPH[effTyp];
  if (glyph === undefined) return null;
  return `${glyph}${(eff & 0xff).toString(16).toUpperCase().padStart(2, '0')}`;
}
