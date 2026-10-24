import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, act } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { HeightGlide } from '@components/ui/HeightGlide';

/**
 * "we need to animate when i click those tabs" (2026-10-24). The PERFORM, EQ
 * and BUS tabs hold content of different heights, and the deck snapped from
 * one to the other, so the pattern editor above jumped with it. The deck's
 * root is now a HeightGlide: the inner box is measured and the outer box,
 * the one the editor gives way to, transitions to that height in pixels.
 *
 * happy-dom performs no layout, so the content height is stubbed and the
 * ResizeObserver is driven by hand.
 */

const SRC = readFileSync(join(process.cwd(), 'src/components/dub/DubDeckStrip.tsx'), 'utf-8');

let observed: Array<() => void> = [];
const realObserver = globalThis.ResizeObserver;
beforeEach(() => {
  observed = [];
  globalThis.ResizeObserver = class {
    cb: () => void;
    constructor(cb: () => void) { this.cb = cb; }
    observe() { observed.push(() => this.cb()); }
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});
afterEach(() => { cleanup(); globalThis.ResizeObserver = realObserver; });

const stubHeight = (el: HTMLElement, h: number) =>
  Object.defineProperty(el, 'offsetHeight', { configurable: true, get: () => h });

describe('the dub deck glides to the height of the opened tab', () => {
  it('the deck root is a HeightGlide holding deckRef, so the published height is the gliding one', () => {
    expect(SRC).toMatch(/<HeightGlide\n\s+ref=\{deckRef\}/);
  });

  it('gives the outer box the measured content height and a height transition', () => {
    render(<HeightGlide className="shell"><div>Perform</div></HeightGlide>);
    const content = screen.getByText('Perform').parentElement!;
    const shell = content.parentElement!;
    expect(shell.className).toContain('transition-[height]');
    expect(shell.className).toContain('motion-reduce:transition-none');

    stubHeight(content, 320);
    act(() => observed.forEach(fire => fire()));
    expect(shell.style.height).toBe('320px');

    stubHeight(content, 140);
    act(() => observed.forEach(fire => fire()));
    expect(shell.style.height).toBe('140px');
  });
});
