import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  toneColor,
  resolveControlTone,
  deriveControlColors,
  type ControlTone,
} from '../controlColor';

/**
 * Controls take a colour by NAME.
 *
 * `Knob`, `Fader`, `Toggle` and `Switch3Way` took a raw hex, and 1,822 call
 * sites passed one — the single largest source of hardcoded colour in
 * DEViLBOX, and the reason those controls did not follow the theme. A name
 * fixes it in four files instead of at 1,822 call sites (2026-09-23).
 */
const TONES: ControlTone[] = [
  'primary', 'secondary', 'highlight', 'warning', 'error', 'success', 'neutral',
];

describe('toneColor', () => {
  it('resolves every tone through a CSS variable, so the theme still decides', () => {
    // A baked hex table would be wrong the moment anyone switches theme.
    for (const tone of TONES) {
      expect(toneColor(tone), tone).toMatch(/^var\(--color-/);
    }
  });

  it('gives each tone its own colour', () => {
    const seen = new Set(TONES.map(toneColor));
    expect(seen.size, 'two tones resolve to the same variable').toBe(TONES.length);
  });
});

describe('resolveControlTone', () => {
  it('prefers the name over a raw hex when both are given', () => {
    expect(resolveControlTone('warning', '#ff0000', '#00d4aa')).toBe(toneColor('warning'));
  });

  it('still accepts a raw hex, so call sites can migrate view by view', () => {
    // 1,822 of them. Migrating in one change would be unreviewable.
    expect(resolveControlTone(undefined, '#4a9eff', '#00d4aa')).toBe('#4a9eff');
  });

  it('falls back when neither is given', () => {
    expect(resolveControlTone(undefined, undefined, '#00d4aa')).toBe('#00d4aa');
  });
});

describe('a tone works with the shared colour recipe', () => {
  it('produces every surface without throwing, in a document-less environment', () => {
    // The variables cannot resolve under vitest, so this also pins the
    // fallback path: a control must still render when the theme is unreadable.
    for (const tone of TONES) {
      const c = deriveControlColors(toneColor(tone));
      expect(c.text, tone).toMatch(/^#/);
      expect(c.bg, tone).toMatch(/^rgba\(/);
      expect(c.border, tone).toMatch(/^rgba\(/);
      expect(c.glow, tone).toMatch(/^rgba\(/);
    }
  });
});

/**
 * And the wiring: all four controls actually accept it.
 */
describe('every control takes the same colour vocabulary', () => {
  const files = {
    Knob: 'src/components/controls/Knob.tsx',
    Fader: 'src/components/controls/Fader.tsx',
    Toggle: 'src/components/controls/Toggle.tsx',
    Switch3Way: 'src/components/controls/Switch3Way.tsx',
  };

  for (const [name, path] of Object.entries(files)) {
    it(`${name} accepts a tone`, () => {
      const src = readFileSync(resolve(process.cwd(), path), 'utf8');
      expect(src, `${name} has no tone prop`).toContain('tone?: ControlTone');
      expect(src).toContain("from '@components/ui/controlColor'");
    });
  }
});
