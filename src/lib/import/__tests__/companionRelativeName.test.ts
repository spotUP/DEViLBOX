/**
 * Regression: folder-dropped multi-file Amiga songs (SunTronic instr/, Sonix
 * Instruments/, ZoundMonitor Samples/) had silent sampled channels because the
 * drag-drop path keyed companions by bare File.name, collapsing the
 * subdirectory (instr/perc1.x -> perc1.x). The replayer opens the sidecars at
 * their subdir-relative path, so the vFS key must preserve the subdir.
 *
 * companionRelativeName() computes the companion's path relative to the main
 * file's directory from webkitRelativePath (set by the folder-drop traversal in
 * GlobalDragDropHandler / a directory picker).
 *
 * Fails on revert: the old code used cf.name, which returns "perc1.x" instead
 * of "instr/perc1.x" — the first assertion below would fail.
 */
import { describe, it, expect } from 'vitest';

import { companionRelativeName } from '../companionRelativeName';

function fileWithRelPath(name: string, relPath?: string): File {
  const f = new File([new Uint8Array([0])], name);
  if (relPath !== undefined) {
    Object.defineProperty(f, 'webkitRelativePath', { value: relPath, configurable: true });
  }
  return f;
}

describe('companionRelativeName', () => {
  it('preserves the instr/ subdir for a folder-dropped SunTronic sidecar', () => {
    const main = fileWithRelPath('analgestic2.src', 'SUNTronicTunes/analgestic2.src');
    const comp = fileWithRelPath('perc1.x', 'SUNTronicTunes/instr/perc1.x');
    expect(companionRelativeName(main, comp)).toBe('instr/perc1.x');
  });

  it('preserves a deeper Samples/ subtree relative to the main dir', () => {
    const main = fileWithRelPath('hittheroad.sng', 'Zoundmonitor/AJ/hittheroad.sng');
    const comp = fileWithRelPath('electom', 'Zoundmonitor/AJ/Samples/electom');
    expect(companionRelativeName(main, comp)).toBe('Samples/electom');
  });

  it('walks to the common ancestor when companion is in a sibling subtree', () => {
    const main = fileWithRelPath('song.sng', 'Zoundmonitor/AJ/song.sng');
    const comp = fileWithRelPath('electom', 'Zoundmonitor/Samples/electom');
    expect(companionRelativeName(main, comp)).toBe('Samples/electom');
  });

  it('uses the companion relative path as-is when only it has one', () => {
    const main = fileWithRelPath('song.sng'); // flat picker, no relPath
    const comp = fileWithRelPath('electom', 'Samples/electom');
    expect(companionRelativeName(main, comp)).toBe('Samples/electom');
  });

  it('falls back to the bare filename for flat drops', () => {
    const main = fileWithRelPath('song.sng');
    const comp = fileWithRelPath('smpl.song');
    expect(companionRelativeName(main, comp)).toBe('smpl.song');
  });
});
