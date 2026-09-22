import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { useDubStore } from '@stores/useDubStore';

/**
 * "it always seem to start with the dub deck expanded though it should not"
 * (2026-09-22).
 *
 * The effect that expands the deck when the bus is ARMED also ran on the
 * initial mount, where it read an already-enabled bus — which a restored
 * project and AutoDub both give you — as an arming action, and expanded the
 * deck on every boot.
 */
describe('the dub deck starts collapsed', () => {
  it('the store default is collapsed', () => {
    expect(useDubStore.getState().stripCollapsed).toBe(true);
  });

  it('the initial mount records the bus state without acting on it', () => {
    const src = readFileSync(join(process.cwd(), 'src/components/dub/DubDeckStrip.tsx'), 'utf-8');
    const start = src.indexOf('const prevBusEnabledRef');
    const effect = src.slice(start, src.indexOf('}, [busEnabled, setStripCollapsed]);', start));

    // The initial mount must leave before it can touch the collapse state.
    const bail = effect.indexOf('if (isInitialMount) return;');
    const apply = effect.indexOf('setStripCollapsed(');
    expect(bail, 'the initial mount no longer bails out').toBeGreaterThan(-1);
    expect(apply, 'nothing sets the collapse state any more').toBeGreaterThan(-1);
    expect(bail, 'the initial mount can still reach setStripCollapsed').toBeLessThan(apply);

    // And it must not sneak the same call in through a deferred frame.
    expect(effect).not.toContain('requestAnimationFrame');
  });
});
