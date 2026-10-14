import { describe, it, expect } from 'vitest';
import { padColumnSpan } from '../padGridSpan';

const spans = (count: number) => Array.from({ length: count }, (_, i) => padColumnSpan(i, count, 4));

describe('padColumnSpan', () => {
  it('fills the last row when it holds fewer pads than columns', () => {
    expect(spans(6)).toEqual([1, 1, 1, 1, 2, 2]);
    expect(spans(7)).toEqual([1, 1, 1, 1, 2, 1, 1]);
    expect(spans(5)).toEqual([1, 1, 1, 1, 4]);
  });
  it('leaves a full grid untouched', () => {
    expect(spans(8)).toEqual([1, 1, 1, 1, 1, 1, 1, 1]);
  });
});
