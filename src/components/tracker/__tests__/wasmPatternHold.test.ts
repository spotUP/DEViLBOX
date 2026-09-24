import { describe, it, expect } from 'vitest';
import { resolveWasmPattern } from '../wasmPatternHold';

/**
 * "sonix pattern scroll flickers between data" (2026-09-24).
 *
 * The grid alternated between two patterns because the ROW came from the
 * engine every frame while the PATTERN only came from the engine on the
 * frames whose `songPos` passed a bounds check. On the rest it fell back to
 * the tracker store's index — a different clock — so the play head advanced
 * through a pattern the engine was not playing.
 */
describe('a WASM-driven grid keeps row and pattern on one clock', () => {
  const order = [5, 9, 9, 2];

  it('follows the engine when it reports a usable position', () => {
    const r = resolveWasmPattern({ songPos: 1, patternOrder: order, held: null, fallback: 0 });
    expect(r).toEqual({ pattern: 9, held: 9, songPosition: 1 });
  });

  it('HOLDS the last engine pattern when a frame reports nothing usable', () => {
    // The flicker itself: this frame used to hand back `fallback`.
    for (const songPos of [undefined, -1, 4, 99]) {
      const r = resolveWasmPattern({ songPos, patternOrder: order, held: 9, fallback: 0 });
      expect(r.pattern, `songPos=${songPos}`).toBe(9);
      expect(r.held, `songPos=${songPos}`).toBe(9);
      expect(r.songPosition, `songPos=${songPos}`).toBeUndefined();
    }
  });

  it('never flickers across a run of mixed frames', () => {
    let held: number | null = null;
    const seen: number[] = [];
    // A real engine: a good position, then several frames without one.
    for (const songPos of [1, undefined, undefined, 1, undefined, 1]) {
      const r = resolveWasmPattern({ songPos, patternOrder: order, held, fallback: 0 });
      held = r.held;
      seen.push(r.pattern);
    }
    expect(new Set(seen).size, 'one pattern for the whole run').toBe(1);
    expect(seen[0]).toBe(9);
  });

  it('uses the caller fallback only before the engine has resolved anything', () => {
    const r = resolveWasmPattern({ songPos: undefined, patternOrder: order, held: null, fallback: 3 });
    expect(r).toEqual({ pattern: 3, held: null, songPosition: undefined });
  });

  it('falls back to the position itself when the order has no entry there', () => {
    // A sparse order must not blank the grid.
    const r = resolveWasmPattern({ songPos: 2, patternOrder: [5, 9, undefined as unknown as number], held: null, fallback: 0 });
    expect(r.pattern).toBe(2);
  });

  it('takes position 0 as a real position, not as absent', () => {
    const r = resolveWasmPattern({ songPos: 0, patternOrder: order, held: 9, fallback: 7 });
    expect(r.pattern).toBe(5);
    expect(r.songPosition).toBe(0);
  });
});
