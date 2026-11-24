import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { parseFurnaceSong } from '../../../import/formats/FurnaceSongParser';
import { furnaceToGoatTracker, coarseCutoffByte, fineCutoffByte } from '../goatSong';

describe('Furnace C64 effects in GoatTracker song data', () => {
  it('converts cutoff to the $D416 byte as Furnace c64.cpp does', () => {
    expect(coarseCutoffByte(100)).toBe(255);
    expect(coarseCutoffByte(0)).toBe(5); // (0+2)*2047/102 = 40 -> 40>>3 = 5? integer: 40 >> 3
    expect(fineCutoffByte(0x42, 0x10)).toBe(0x42);
  });

  it('maps yeah! cutoff (11xx, 40xx, 42xx) and arpeggio (00xy) to GT set-cutoff and set-wave-pointer commands', async () => {
    const b = readFileSync(path.resolve(__dirname, '../../../../../public/data/songs/furnace/c64/yeah!.fur'));
    const m = await parseFurnaceSong(b.buffer.slice(b.byteOffset, b.byteOffset + b.length) as ArrayBuffer);
    const g = furnaceToGoatTracker(m, 0);
    const lossy = g.lossy.join('|');
    expect(lossy).not.toMatch(/effect (11|40|42|00)\b/);
    const cmds = new Set(g.song.patterns.flatMap((p) => p.map((r) => r[2])));
    expect(cmds.has(0x0c)).toBe(true);
    expect(cmds.has(0x07)).toBe(true);
    expect(lossy).not.toMatch(/effect e[12]/); // slide on a row with a note runs as a wave-table slide program
    // wave table slide commands ($F1 up / $F2 down; $E1/$E2 would be silent waveforms) followed by the stop command ($F0)
    const wl = g.song.tables[0].left;
    expect(wl.some((l, i) => (l === 0xf1 || l === 0xf2) && wl.slice(i + 1).includes(0xf0))).toBe(true);
  });
});
