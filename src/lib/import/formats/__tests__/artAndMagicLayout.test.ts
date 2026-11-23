import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import {
  locateAamLayout, readAamTrackList, aamUsedPatterns, aamPatternOffset, splitAamPattern, encodeAamCommands,
} from '../ArtAndMagicParser';

const FILES = ['public/data/songs/formats/agony-level1.aam', 'public/data/songs/formats/agony-level2.aam'];

describe.each(FILES)('Art and Magic layout + note-stream codec: %s', (path) => {
  const b = new Uint8Array(readFileSync(path));
  const l = locateAamLayout(b);

  it('locates the driver tables', () => {
    expect(l).not.toBeNull();
    expect(String.fromCharCode(...b.subarray(l!.firstForm, l!.firstForm + 4))).toBe('FORM');
  });

  it('every voice has a track list naming patterns inside the pointer table', () => {
    const maxPatterns = (l!.pointersEnd - l!.patterns) >> 2;
    for (let ch = 1; ch <= 3; ch++) {
      const list = readAamTrackList(b, l!, ch);
      expect(list.length).toBeGreaterThan(0);
      for (const e of list) expect(e.pattern).toBeLessThan(maxPatterns);
    }
  });

  it('every used pattern splits into commands that re-encode byte-exact', () => {
    const used = aamUsedPatterns(b, l!);
    expect(used.length).toBeGreaterThan(0);
    for (const p of used) {
      const start = aamPatternOffset(b, l!, p);
      const cmds = splitAamPattern(b, start);
      expect(cmds, `pattern ${p} at ${start}`).not.toBeNull();
      const enc = encodeAamCommands(cmds!);
      expect([...enc]).toEqual([...b.subarray(start, start + enc.length)]);
      // A pattern is a short stream ending in a terminator, never a run into the sample area.
      expect(start + enc.length).toBeLessThan(l!.firstForm);
    }
  });
});
