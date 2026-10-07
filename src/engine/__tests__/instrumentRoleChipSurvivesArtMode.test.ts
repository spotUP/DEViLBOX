/**
 * UI5 (owner 2026-10-07, amanda.ahx): the AHX instrument list showed names only, no chips.
 *
 * AHX/HVL names are ASCII art, and a narrow panel hides the type chips too. index.css keeps ONE chip in both cases,
 * `.instrument-badge--role`, but InstrumentList marked the role chip `instrument-badge--part`, so the rule that
 * exempts it never matched and the chip was hidden with the others. The song analyzer itself runs for AHX (its
 * parser fills tracker patterns) and getSynthBadge covers HivelySynth (measured 2026-10-07: 9 verdicts, badge WAV).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { getSynthBadge } from '@constants/channelTypeCompat';

describe('the role chip is the one chip that stays when the others are hidden', () => {
  const tsx = readFileSync('src/components/instruments/InstrumentList.tsx', 'utf8');
  const css = readFileSync('src/index.css', 'utf8');

  it('the class InstrumentList puts on the role chip has a display:block rule in the narrow and the art cases', () => {
    const used = [...tsx.matchAll(/instrument-badge--([a-z]+)/g)].map((m) => m[1]);
    expect(used.length).toBeGreaterThan(0);
    for (const mod of new Set(used)) {
      expect(css, `narrow panel keeps --${mod}`).toMatch(new RegExp(`@container instrument-panel[^{]*\\{[\\s\\S]*?\\.instrument-badge--${mod}\\s*\\{\\s*display:\\s*block`));
      expect(css, `art mode keeps --${mod}`).toMatch(new RegExp(`\\.instrument-list--art \\.instrument-badge--${mod}\\s*\\{\\s*display:\\s*block`));
    }
  });

  it('a HivelySynth instrument gets a real type badge, not the fallback', () => {
    expect(getSynthBadge('HivelySynth')).not.toEqual(getSynthBadge('NoSuchSynth'));
  });
});
