/**
 * Every format's extRegex must be a plain alternation (`\.(a|b|c)$` or
 * `\.a$`): the set of supported extensions - the gate every file load passes -
 * is read from it. `\.nsfe?$` read as the literal ".nsfe?", so the app called
 * every .nsf "Unsupported file format" while the parser could play it
 * (2026-10-05); `\.dm1?$` and `mmd[0-3]` were invisible the same way.
 */
import { describe, it, expect } from 'vitest';
import { FORMAT_REGISTRY, isSupportedFormat } from '../FormatRegistry';

describe('registry extensions are readable by the supported-format gate', () => {
  it('every extRegex is a plain alternation of literal extensions', () => {
    const bad = FORMAT_REGISTRY.filter((f) => f.extRegex).filter((f) => {
      const m = f.extRegex!.source.match(/^\\\.\(?([^)$]+)\)?\$$/);
      return !m || m[1].split('|').some((e) => /[?*+[\]{}().^$]/.test(e.replace(/\\\./g, '')));
    }).map((f) => `${f.key}: ${f.extRegex!.source}`);
    expect(bad).toEqual([]);
  });

  it('the files those patterns name pass the gate', () => {
    for (const name of ['dr mario.nsf', 'song.nsfe', 'tune.dm', 'tune.dm1', 'song.mmd0', 'song.mmd3']) {
      expect(isSupportedFormat(name), name).toBe(true);
    }
  });
});
