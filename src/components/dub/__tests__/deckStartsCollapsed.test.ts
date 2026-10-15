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

  it('only the Bus button expands the deck: no effect expands it when the bus turns on by itself', () => {
    const src = readFileSync(join(process.cwd(), 'src/components/dub/DubDeckStrip.tsx'), 'utf-8');
    // A restored project and AutoDub enable the bus after the first render; an effect on busEnabled that set the
    // collapse state expanded the deck on every boot (2026-09-22 fixed the first render only, 2026-10-15 the rest).
    expect(src).not.toMatch(/\}, \[busEnabled, setStripCollapsed\]\)/);
    expect(src).not.toContain('prevBusEnabledRef');
    // The button does it: arming expands (collapsed becomes false), disarming collapses.
    expect(src).toMatch(/setDubBusPower\(!busEnabled\); setStripCollapsed\(busEnabled\)/);
  });
});
