import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseMODFile } from '@lib/import/formats/MODParser';
import { exportSongToMOD } from '../modExport';

describe('MOD export keeps the header the file had', () => {
  // FLT4 tag, restart position 13, an empty sample slot with volume 64.
  const src = new Uint8Array(readFileSync('public/data/songs/audio-sculpture/m.mod'));
  it('unedited export equals the source', async () => {
    const song = await parseMODFile(src.buffer.slice(0) as ArrayBuffer, 'm.mod');
    const out = new Uint8Array(await (await exportSongToMOD(song, { bakeSynths: true })).blob.arrayBuffer());
    expect(out.length).toBe(src.length);
    expect(out.every((v, i) => v === src[i])).toBe(true);
  });
});
