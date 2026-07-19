import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Regression: the NavBar top bar rendered the Tour button on top of the "Play
 * Song" transport when the dub deck was expanded.
 *
 * Root cause was layout, not state: the top bar used `grid grid-cols-3` (three
 * equal 1fr tracks). The left group (title + version badge + server badges +
 * Desktop App + Tips + Tour) is intrinsically wider than a 1fr third, and CSS
 * grid tracks do NOT clip overflow, so the left content bled 100+px into the
 * centered middle track where the transport lives — the Tour button (a Play
 * triangle) landed directly on top of the Play Song button.
 *
 * Fix: `grid-cols-[auto_1fr_auto]` — the side tracks size to their content and
 * never overflow; the 1fr middle absorbs the slack and centers the transport in
 * the gap between the two groups.
 *
 * There is no DOM layout engine under jsdom and the project forbids Playwright,
 * so the invariant is guarded at its source: the top bar must NOT use the
 * equal-width `grid-cols-3` template that caused the overflow.
 */
describe('NavBar top bar does not overlap the transport', () => {
  // vitest runs from the repo root; resolve the source relative to cwd.
  const navBarPath = resolve(process.cwd(), 'src/components/layout/NavBar.tsx');
  const source = readFileSync(navBarPath, 'utf-8');

  // Isolate the top-bar <nav ...> opening tag.
  const navTag = source.match(/<nav\s+className="([^"]*)"/)?.[1];

  it('has a top-bar <nav> with an explicit grid template', () => {
    expect(navTag).toBeTruthy();
    expect(navTag).toContain('grid');
  });

  it('uses auto side tracks so wide left content cannot overflow into the centered transport', () => {
    // The exact template that fixes the overlap: sides size to content, middle flexes.
    expect(navTag).toContain('grid-cols-[auto_1fr_auto]');
  });

  it('does NOT use three equal 1fr columns (the template that caused the overlap)', () => {
    // `grid-cols-3` == three 1fr tracks; the left group is wider than its third
    // and overflows into the transport. Reverting to it must fail this test.
    expect(navTag).not.toContain('grid-cols-3');
  });
});
