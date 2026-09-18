import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { resolveVinylLevel } from '@/lib/dub/vinylLevel';

/**
 * Regression: the JA Press vinyl chain is wired post-master
 * (`this.master -> vinylEffect -> vinylOutputNode`), so disabling the dub bus
 * never silenced it — the disable path only closes the input gate, zeroes echo
 * intensity and spring wet, and drops return_.gain, all of which sit upstream.
 * Worse, the JA slider is `disabled={!busEnabled}`, so disabling the bus to
 * stop the noise locked the only control that could turn it down.
 */
describe('resolveVinylLevel — the vinyl chain follows the bus', () => {
  it('silences the vinyl chain when the bus is disabled', () => {
    expect(resolveVinylLevel(false, 7)).toBe(0);
  });

  it('keeps silencing it no matter how high the user set JA', () => {
    expect(resolveVinylLevel(false, 10)).toBe(0);
  });

  it('applies the requested level when the bus is enabled', () => {
    expect(resolveVinylLevel(true, 7)).toBe(7);
  });

  it('clamps out-of-range levels', () => {
    expect(resolveVinylLevel(true, 99)).toBe(10);
    expect(resolveVinylLevel(true, -4)).toBe(0);
  });
});

describe('DubBus wiring contract', () => {
  const src = readFileSync(
    join(__dirname, '..', 'DubBus.ts'),
    'utf8',
  );

  it('keeps the user level separate from the applied level', () => {
    // Zeroing the user's setting on disable would lose it on re-enable.
    expect(src).toContain('_desiredVinylLevel');
    expect(src).toMatch(/setVinylLevel\(level10: number\): void \{\s*\n\s*this\._desiredVinylLevel/);
  });

  it('re-applies the vinyl level whenever the bus enabled flag changes', () => {
    const toggle = src.slice(src.indexOf("if (typeof settings.enabled === 'boolean') {"));
    // Window rather than an exact offset: the guarantee is that the enabled
    // toggle re-applies the vinyl level, not that it does so within N
    // characters — a comment above the call should not fail this.
    expect(toggle.slice(0, 1200)).toContain('this._applyVinylLevel()');
  });

  it('resolves the applied level through resolveVinylLevel, not an inline ternary', () => {
    expect(src).toContain('resolveVinylLevel(this.enabled, this._desiredVinylLevel)');
  });
});
