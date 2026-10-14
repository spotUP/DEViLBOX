import { describe, expect, it } from 'vitest';
import { classifyProbes, mergeUnsure, unsureCovered } from '../nuadeProbeCensus';

describe('nuade probe census', () => {
  it('records an Unsure-only player separately instead of dropping it', () => {
    const r = classifyProbes(['a', 'b', 'c', 'd'], (id) => ({ a: 0, b: 2, c: -1, d: 2 })[id] ?? -1);
    expect(r.supported).toEqual(['a']);
    expect(r.unsure).toEqual(['b', 'd']);
  });
  it('a row recorded before Unsure was counted is not covered; a scoped row covers only its ids', () => {
    expect(unsureCovered({ size: 1, ids: [] }, ['b'])).toBe(false);
    const e = mergeUnsure({ size: 1, ids: [] }, ['b'], ['b'], ['a', 'b', 'c']);
    expect(unsureCovered(e, ['b'])).toBe(true);
    expect(unsureCovered(e, ['b', 'c'])).toBe(false);
    const f = mergeUnsure(e, ['c'], [], ['a', 'b', 'c']);
    expect(f.unsure).toEqual(['b']);
    expect(unsureCovered(f, ['b', 'c'])).toBe(true);
  });
});
