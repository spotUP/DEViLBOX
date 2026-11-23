/** HuSIC screen strings: title at LL0+0 (12), author at LL0+25 (19), both NUL terminated. */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseFurnaceSong } from '../../../import/formats/FurnaceSongParser';
import { furnaceToHusic, type HusicLayout } from '../husicSong';

const root = join(__dirname, '../../../../..');
const player = readFileSync(join(root, 'public/pce/player.pce'));
const layout = JSON.parse(readFileSync(join(root, 'public/pce/player.json'), 'utf8')) as HusicLayout;

describe('HuSIC author field', () => {
  it('holds a 19 character author and an empty author as a bare NUL', async () => {
    const b = readFileSync(join(root, 'public/data/songs/furnace/pce/Ma-Da-Ra.fur'));
    const m = await parseFurnaceSong(b.buffer.slice(b.byteOffset, b.byteOffset + b.length) as ArrayBuffer);
    const at = layout.constBank * 0x2000 + (layout.ll0 - 0x4000) + 25;
    const str = (rom: Uint8Array) => { let s = ''; for (let i = at; rom[i]; i++) s += String.fromCharCode(rom[i]); return s; };
    m.author = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    expect(str(furnaceToHusic(m, 0, player, layout).rom)).toBe('ABCDEFGHIJKLMNOPQRS');
    m.author = '';
    expect(str(furnaceToHusic(m, 0, player, layout).rom)).toBe('');
  });
});
