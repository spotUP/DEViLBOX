// FamiStudio route: envelope encoder (port of FamitoneMusicFile.cs ProcessEnvelope), ROM patching, player staleness.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildFamistudioRom, encodeEnvelope, type FamistudioMeta } from '../nes/famistudioSong';

const ROOT = path.resolve(__dirname, '../../../..');
const DIR = path.join(ROOT, 'public/nes/famistudio');
const META: FamistudioMeta = JSON.parse(readFileSync(path.join(DIR, 'player.json'), 'utf8'));

describe('famistudio envelope encoder', () => {
  it('writes the single-value default forms', () => {
    expect(encodeEnvelope([15], -1, -1, 'vol')).toEqual([0x00, 192 + 15, 0x7f, 0x00, 0x02]);
    expect(encodeEnvelope([0], -1, -1, 'arp')).toEqual([192, 0x7f, 0x00, 0x00]);
  });
  it('run-length encodes repeats and ends on the loop pointer', () => {
    const d = encodeEnvelope([15, 15, 15, 15, 8], -1, -1, 'vol');
    expect(d[0]).toBe(0x00);
    expect(d).toContain(192 + 15);
    expect(d).toContain(192 + 8);
    expect(d[d.length - 2]).toBe(0x00);
    expect(d.length).toBeLessThan(1 + 5 + 2);
  });
});

describe('famistudio ROM', () => {
  it('patches music and DPCM at the player addresses and refuses oversize data', () => {
    const player = readFileSync(path.join(DIR, 'player.nes'));
    const song = { music: new Uint8Array([1, 2, 3]), dpcm: new Uint8Array([9]), lossy: [], channelsWithNotes: [], firstNotes: [] };
    const rom = buildFamistudioRom(player, META, song);
    expect(rom.length).toBe(player.length);
    expect([...rom.subarray(META.prgOffset + META.musicAddr - 0x8000, META.prgOffset + META.musicAddr - 0x8000 + 3)]).toEqual([1, 2, 3]);
    expect(rom[META.prgOffset + META.dpcmAddr - 0x8000]).toBe(9);
    expect(() => buildFamistudioRom(player, META, { ...song, music: new Uint8Array(META.musicCap + 1) })).toThrow();
  });
  it('player.nes is built from the current sources (run tools/build-nes-famistudio-player.sh)', () => {
    const h = createHash('sha1');
    for (const f of [path.join(DIR, 'player.s'), path.join(DIR, 'fs.cfg'), path.join(ROOT, 'third-party/famistudio/famistudio_ca65.s')]) h.update(readFileSync(f));
    expect(h.digest('hex')).toBe(META.sourceHash);
  });
});
