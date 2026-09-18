/**
 * Gate F4 reachability — the shapes are only real if something builds them.
 *
 * The shape maths and the engine driver are tested where they live
 * (`gestureShape.test.ts`, `GestureEngine.test.ts`). This says the table is
 * sound and that the two callers that can trace a shape actually do.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { MOVE_AUTOMATION, automationFor } from '../moveAutomation';
import { shapeValue } from '../gestureShape';

describe('the automation table', () => {
  it('describes a real travel for every entry', () => {
    for (const [moveId, a] of Object.entries(MOVE_AUTOMATION)) {
      expect(a.param, moveId).toBeTruthy();
      expect(a.from, moveId).not.toBe(a.to);
      expect(Number.isFinite(a.from), moveId).toBe(true);
      expect(Number.isFinite(a.to), moveId).toBe(true);
    }
  });

  it('uses an exponential curve wherever the range is a frequency', () => {
    for (const [moveId, a] of Object.entries(MOVE_AUTOMATION)) {
      if (!/Hz$/i.test(a.param)) continue;
      expect(a.curve, moveId).toBe('exponential');
      // Exponential needs both ends positive or it falls back to linear.
      expect(a.from, moveId).toBeGreaterThan(0);
      expect(a.to, moveId).toBeGreaterThan(0);
    }
  });

  it('produces values inside the range it declares', () => {
    for (const a of Object.values(MOVE_AUTOMATION)) {
      const lo = Math.min(a.from, a.to);
      const hi = Math.max(a.from, a.to);
      for (const p of [0, 0.25, 0.5, 0.75, 1]) {
        const v = shapeValue(a.shape, p, a.from, a.to, a.curve);
        expect(v).toBeGreaterThanOrEqual(lo - 1e-6);
        expect(v).toBeLessThanOrEqual(hi + 1e-6);
      }
    }
  });

  it('has nothing to say about a move that cannot be swept', () => {
    expect(automationFor('echoThrow')).toBeNull();
    expect(automationFor('nonsense')).toBeNull();
  });

  it('covers filterDrop, the move the gesture is named for', () => {
    const a = automationFor('filterDrop');
    expect(a?.param).toBe('targetHz');
    expect(a?.shape).toBe('sweep');
  });
});

describe('every automated move can actually take the parameter mid-flight', () => {
  it('exposes an update path that reads the declared param', () => {
    for (const [moveId, a] of Object.entries(MOVE_AUTOMATION)) {
      const src = readFileSync(
        join(__dirname, '..', '..', '..', 'engine', 'dub', 'moves', `${moveId}.ts`), 'utf8',
      );
      // A move listed here without an update path would be silently degraded
      // by the engine at runtime — the exact failure Gate F4 refused to ship.
      expect(src, moveId).toMatch(/update\s*\(/);
      expect(src, moveId).toContain(a.param);
    }
  });
});

describe('wiring contract — the performer traces the shape', () => {
  const autoDub = readFileSync(
    join(__dirname, '..', '..', '..', 'engine', 'dub', 'AutoDub.ts'), 'utf8',
  );

  it('asks the table rather than hardcoding a range', () => {
    expect(autoDub).toContain("import { automationFor } from '@/lib/dub/moveAutomation'");
    expect(autoDub).toContain('automationFor(choice.moveId)');
  });

  it('passes the shape and the travel to the gesture', () => {
    expect(autoDub).toContain('shape: automation.shape');
    expect(autoDub).toContain('param: automation.param');
    expect(autoDub).toContain('curve: automation.curve');
  });

  it('does not try to sweep a one-shot, which has no hold to travel over', () => {
    expect(autoDub).toContain('holdMsForGesture > 0 ? automationFor(choice.moveId) : null');
  });
});
