import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The FT2 toolbar box must be as tall as its rows.
 *
 * Its rows wrap at narrow widths (the mobile rules in index.css). A
 * shrinkable container with a fixed 80 px minimum kept that height while the
 * wrapped rows painted on over the controls beneath — "one yellow and one red
 * on top of each other", the hover tooltip coming from the numeric input
 * underneath (2026-09-22).
 */
describe('FT2 toolbar container', () => {
  it('is sized by its content and never squeezed', () => {
    const src = readFileSync(join(process.cwd(), 'src/components/tracker/TrackerView.tsx'), 'utf-8');
    const i = src.indexOf('<FT2Toolbar');
    const wrapper = src.slice(src.lastIndexOf('<div', i), i);
    expect(wrapper).toContain('flex-shrink-0');
    expect(wrapper).not.toContain('min-h-[');
    expect(wrapper).not.toMatch(/\bflex-shrink\b(?!-0)/);
  });
});
