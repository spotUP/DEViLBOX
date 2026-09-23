import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { moveButtonStyle, MOVE_COLOR, type MoveColor } from '../moveButtonStyle';

/**
 * Every move button lights when its move is active, and they all do it the
 * same way.
 *
 * This used to check that a seventeen-case switch had a `case` for every
 * colour a move table used, because a token with no case fell through to the
 * idle default and the button never showed it was held — Riddim, Float, Build,
 * Emph and Liquid were all invisible when down. "ui button does not light up
 * the midi controller does" (2026-09-23).
 *
 * The switch is gone. A colour is now an input to one recipe, so there is no
 * case to miss — but the guarantee still has to hold, and it is worth more as
 * a BEHAVIOURAL check than as a count of source lines. So these call the
 * recipe.
 */
const EVERY_COLOR = Object.values(MOVE_COLOR) as MoveColor[];

describe('every move colour has an active state', () => {
  it('covers every colour a move can carry', () => {
    expect(EVERY_COLOR.length).toBeGreaterThanOrEqual(7);
  });

  it('looks different lit than unlit — whatever the colour', () => {
    for (const color of EVERY_COLOR) {
      const idle = moveButtonStyle(color, false);
      const lit = moveButtonStyle(color, true);
      expect(lit.style.backgroundColor, `${color} background`).not.toBe(idle.style.backgroundColor);
      expect(lit.style.borderColor, `${color} border`).not.toBe(idle.style.borderColor);
      expect(lit.className, `${color} is-active`).toContain('is-active');
    }
  });

  it('glows when lit and not when idle, so a held move reads across a room', () => {
    // A background change alone was invisible on the darker colours, which is
    // how a held move could look identical to an idle one.
    for (const color of EVERY_COLOR) {
      expect(moveButtonStyle(color, true).style.boxShadow, color).toBeTruthy();
      expect(moveButtonStyle(color, false).style.boxShadow, color).toBeUndefined();
    }
  });

  it('gives every colour the same hover contract', () => {
    // Not "most of them". The complaint was that some buttons hovered and some
    // did not, and a few changed to something unrelated.
    for (const color of EVERY_COLOR) {
      const s = moveButtonStyle(color, false).style as Record<string, unknown>;
      expect(s['--dub-move-hover-bg'], color).toBeTruthy();
      expect(s['--dub-move-hover-border'], color).toBeTruthy();
    }
  });

  it('carries the class the one hover rule is written against', () => {
    const css = readFileSync(join(process.cwd(), 'src/index.css'), 'utf-8');
    expect(moveButtonStyle(MOVE_COLOR.primary, false).className).toContain('dub-move-button');
    expect(css).toContain('.dub-move-button:hover:not(:disabled)');
  });
});

/**
 * And the source of truth: the recipe is the design system's, not the deck's.
 */
describe('the deck does not define its own colour behaviour', () => {
  const STYLE = readFileSync(join(process.cwd(), 'src/components/dub/moveButtonStyle.ts'), 'utf-8');

  it('calls the shared control-colour recipe', () => {
    expect(STYLE).toContain("from '@components/ui/controlColor'");
  });

  it('has no hand-written per-colour branch left', () => {
    expect(STYLE, 'a switch over colours is what drifted').not.toMatch(/case '[a-z-]+(\/\d+)?':/);
  });
});
