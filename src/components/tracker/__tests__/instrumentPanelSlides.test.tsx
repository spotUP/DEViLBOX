import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { HorizontalReveal } from '@components/ui/HorizontalReveal';

/**
 * The tracker's instrument panel popped in and out with no animation: it was
 * mounted only while open, so closing removed it at once, and opening only
 * faded it. It now sits in a HorizontalReveal, which keeps it mounted and
 * slides the width through a 0fr <-> 1fr grid track.
 */

const SRC = readFileSync(join(process.cwd(), 'src/components/tracker/TrackerView.tsx'), 'utf-8');

afterEach(cleanup);

describe('instrument panel slides open and closed', () => {
  it('the tracker view drives the panel through HorizontalReveal instead of unmounting it', () => {
    expect(SRC).toMatch(/<HorizontalReveal open=\{showInstrumentPanel\}/);
    expect(SRC).not.toMatch(/isWide && showInstrumentPanel &&/);
  });

  it('keeps the panel mounted while closed, collapsed to a 0fr track and out of reach', () => {
    const { rerender } = render(
      <HorizontalReveal open={false}><div>Instruments</div></HorizontalReveal>,
    );
    const closed = screen.getByText('Instruments').parentElement!.parentElement!;
    expect(closed.className).toContain('grid-cols-[0fr]');
    expect(closed.className).toContain('transition-[grid-template-columns]');
    expect(closed.hasAttribute('inert')).toBe(true);
    expect(closed.getAttribute('aria-hidden')).toBe('true');

    rerender(<HorizontalReveal open={true}><div>Instruments</div></HorizontalReveal>);
    const open = screen.getByText('Instruments').parentElement!.parentElement!;
    expect(open).toBe(closed);
    expect(open.className).toContain('grid-cols-[1fr]');
    expect(open.hasAttribute('inert')).toBe(false);
  });
});
