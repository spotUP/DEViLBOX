import { describe, it, expect } from 'vitest';
import { resolveCompanions, expectedCompanionNames, companionFilesIn, listingFromRelativePaths } from '../companionResolver';

// KDM songs play their instruments from waves.kwv in the song's directory; it is
// loaded as a companion (Modland or beside the opened file), never shipped.
describe('KDM waves.kwv companion', () => {
  const listing = listingFromRelativePaths(['flysong.kdm', 'kdmsong.kdm', 'waves.kwv']);

  it('resolves waves.kwv for every .kdm in the directory', () => {
    expect(resolveCompanions('flysong.kdm', listing).companions).toContain('waves.kwv');
    expect(resolveCompanions('KDMSONG.KDM', listing).companions).toContain('waves.kwv');
  });

  it('names waves.kwv when it is missing', () => {
    expect(expectedCompanionNames('x.kdm')).toEqual(['waves.kwv']);
  });

  it('treats waves.kwv as a companion, not a song', () => {
    expect(companionFilesIn(listing).has('waves.kwv')).toBe(true);
  });
});
