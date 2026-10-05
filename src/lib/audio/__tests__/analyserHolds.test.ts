/**
 * The scope view went flat when the dub bus opened: the strip's visualizers
 * mounted and unmounted, and one unmount disconnected the master analysers
 * every visualizer shares (2026-10-05).
 */
import { describe, it, expect } from 'vitest';
import { AnalyserHolds } from '../analyserHolds';

describe('shared analyser holds', () => {
  it("one visualizer's release keeps the tap for another", () => {
    const h = new AnalyserHolds();
    const scopeView = {}, dubStrip = {};
    expect(h.acquire(scopeView)).toBe(true);
    expect(h.acquire(dubStrip)).toBe(false);
    expect(h.release(dubStrip)).toBe(false);
    expect(h.held).toBe(true);
    expect(h.release(scopeView)).toBe(true);
    expect(h.held).toBe(false);
  });

  it('a repeated acquire by one holder needs one release; a stranger release does nothing', () => {
    const h = new AnalyserHolds();
    const a = {};
    h.acquire(a); h.acquire(a);
    expect(h.release({})).toBe(false);
    expect(h.release(a)).toBe(true);
  });
});
