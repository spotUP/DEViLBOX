import { describe, it, expect } from 'vitest';
import { adscRouteFor } from '../adscRoute';

describe('adscRouteFor', () => {
  it('sends an Audio Sculpture module (.as companion) to UADE', () => {
    expect(adscRouteFor(['popelich-brutalo.adsc.as'])).toBe('uade');
  });

  it('keeps StarTrekker AM (.nt companion) on the native engine', () => {
    expect(adscRouteFor(['tune.adsc.nt'])).toBe('startrekker');
    expect(adscRouteFor(['tune.nt', 'other.as'])).toBe('startrekker');
  });

  it('defaults to StarTrekker when nothing says otherwise', () => {
    expect(adscRouteFor([])).toBe('startrekker');
  });
});
