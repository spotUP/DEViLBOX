import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * "the dub deck needs to resize to fit the content vertically" (2026-09-22).
 *
 * The deck is a flex child of the tracker's editor column, and a flex child
 * shrinks below its own content unless told not to. So as the editor claimed
 * space the deck was squeezed and its lower rows were cut off — the same
 * defect the FT2 toolbar had in `688aacfd2`, where wrapped rows painted over
 * the controls beneath ("one yellow and one red on top of each other").
 *
 * happy-dom performs no layout, so this pins the contract rather than a
 * measured box: the deck is sized by its content, and the only height limit
 * is a last-resort cap for a deck taller than the window.
 */
const SRC = readFileSync(join(process.cwd(), 'src/components/dub/DubDeckStrip.tsx'), 'utf-8');

/** The deck's root element — the first div of the component's return. */
const rootClasses = (): string => {
  const at = SRC.indexOf('bg-dark-bgSecondary border-t border-dark-border font-mono');
  expect(at, 'the deck root moved').toBeGreaterThan(-1);
  const open = SRC.lastIndexOf('className="', at);
  return SRC.slice(open + 'className="'.length, SRC.indexOf('"', open + 'className="'.length));
};

describe('the dub deck is sized by its content', () => {
  it('does not shrink below what it needs', () => {
    expect(
      rootClasses(),
      'a flex child without shrink-0 is squeezed by its siblings, cutting off its own rows'
    ).toContain('shrink-0');
  });

  it('keeps a last-resort cap so a tall deck cannot fill the window', () => {
    const classes = rootClasses();
    expect(classes).toContain('overflow-y-auto');
    expect(classes).toMatch(/max-h-\[/);
  });

  it('the cap measures the viewport that is actually visible', () => {
    // Plain `vh` on iOS is the height with the browser toolbar hidden, so a
    // 60vh cap is bigger than the screen. See src/index.css --app-vh.
    const classes = rootClasses();
    expect(classes).toContain('var(--app-vh)');
    expect(classes, 'a bare vh unit is wrong on a phone').not.toMatch(/max-h-\[\d+vh\]/);
  });
});
