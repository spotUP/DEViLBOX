/**
 * An MMD3 song played silence: the MED parser handed every MED version to UADE,
 * whose OctaMED player only accepts med/mmd0/mmd1/mmd2, so UADE refused to load
 * it ("MMD3 not in eagleplayer.conf"). MMD3 now goes to libopenmpt; the versions
 * UADE plays keep the UADE path (and its chip-RAM pattern layout).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseMEDFile } from '../MEDParser';

const SONGS = join(__dirname, '../../../../../public/data/songs/formats');

function parse(name: string) {
  const bytes = readFileSync(join(SONGS, name));
  return parseMEDFile(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer, name);
}

describe('MED songs reach an engine that can play them', () => {
  it('sends an MMD3 song to libopenmpt, not to UADE (UADE refuses MMD3 and plays silence)', () => {
    const song = parse('bounty hunter - outro (remixed).mmd3');
    expect(song.uadeEditableFileData).toBeUndefined();
    expect(song.libopenmptFileData?.byteLength).toBeGreaterThan(0);
  });

  it.each(['universal monsters - dracula.mmd0', 'funky nightmare.mmd1'])('keeps %s on UADE', (name) => {
    const song = parse(name);
    expect(song.uadeEditableFileData?.byteLength).toBeGreaterThan(0);
    expect(song.uadePatternLayout).toBeDefined();
    expect(song.libopenmptFileData).toBeUndefined();
  });
});
