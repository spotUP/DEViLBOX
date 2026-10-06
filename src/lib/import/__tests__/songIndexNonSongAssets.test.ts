/**
 * The jukebox row "deflemask / CrazySoundEnginer" did not load: the folder's
 * 42 .dmf songs are detected (dmf row), but its four .zip archives (and
 * DevEd's .dmw wavetable, MegaSphere's .fdm patch) were offered as an
 * undetected row. Assets are not songs; the index must not list them.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isNonSongAsset } from '../companionResolver';
import { repoRoot } from './furnaceFileOpsWasmHarness';

describe('song index lists no DefleMask assets as songs', () => {
  it('classifies archives, wavetables and patches in the DefleMask corpus as assets', () => {
    expect(isNonSongAsset('deflemask/CrazySoundEnginer/NARC VGMS.zip')).toBe(true);
    expect(isNonSongAsset('deflemask/DevEd/perfume.dmw')).toBe(true);
    expect(isNonSongAsset('deflemask/MegaSphere/font.fdm')).toBe(true);
  });
  it('still treats modules, and zip songs of other formats, as songs', () => {
    expect(isNonSongAsset('deflemask/DevEd/7_grand_cop.dmf')).toBe(false);
    expect(isNonSongAsset('Sonix_Music_Driver/x/smus.be.zip')).toBe(false);
  });
  it('index.json has no undetected deflemask row', () => {
    const idx = JSON.parse(readFileSync(join(repoRoot, 'public/data/songs/index.json'), 'utf8')) as {
      entries: { label: string; formatKey: string | null; files: string[] }[];
    };
    const bad = idx.entries.filter((e) => e.formatKey === null && e.files.some((f) => f.includes('/deflemask/')));
    expect(bad.map((e) => e.label)).toEqual([]);
  });
});
