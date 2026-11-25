import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { parseFurnaceSong } from '../../../import/formats/FurnaceSongParser';
import { furnaceToGoatTracker, coarseCutoffByte, fineCutoffByte, furnaceSidNtsc } from '../goatSong';

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
    expect(cmds.has(0x08)).toBe(true); // CMD_SETWAVEPTR; 7 (CMD_SETWAVE) would write the table index into the waveform register
    expect(lossy).not.toMatch(/effect e[12]/); // slide on a row with a note runs as a wave-table slide program
    // wave table slide commands ($F1 up / $F2 down; $E1/$E2 would be silent waveforms), one row per tick (a $F1/$F2 row acts
    // for one frame only), ended by $FF 00
    const wl = g.song.tables[0].left, wr = g.song.tables[0].right;
    expect(wl.some((l, i) => (l === 0xf1 || l === 0xf2) && wl[i + 1] === l)).toBe(true);
    expect(wl.some((l, i) => (l === 0xf1 || l === 0xf2) && wl[i + 1] === 0xff && wr[i + 1] === 0)).toBe(true);
  });

  it('plays yeah! instrument pitch macros (tom, bd: relative, looping) as per-tick wave-table slide rows', async () => {
    const b = readFileSync(path.resolve(__dirname, '../../../../../public/data/songs/furnace/c64/yeah!.fur'));
    const m = await parseFurnaceSong(b.buffer.slice(b.byteOffset, b.byteOffset + b.length) as ArrayBuffer);
    const g = furnaceToGoatTracker(m, 0);
    // Every pitch-macro note gets a program; when the wave table is short they are cut short, never dropped.
    expect(g.lossy.join('|')).not.toMatch(/macro 4|pitch macro \(GT table full\)/);
    const wl = g.song.tables[0].left, wr = g.song.tables[0].right, sl = g.song.tables[3].left, sr = g.song.tables[3].right;
    // Every note row of the tom (Furnace ins 4 = GT 5) points its wave pointer at a program: the waveform row, then only
    // downward slide rows ($F2, the macro is -171/128 semitone per tick) whose speeds grow smaller as the frequency falls.
    const tomRows = g.song.patterns.flatMap((p) => p.filter((r) => r[1] === 5 && r[0] >= 0x60 && r[0] < 0xbd));
    // A row that already carries another command keeps it (reported lossy); every other tom row gets its pitch program.
    expect(tomRows.every((r) => r[2] !== 0)).toBe(true);
    expect(tomRows.filter((r) => r[2] === 8).length).toBeGreaterThan(0);
    for (const [, , cmd, data] of tomRows) {
      if (cmd !== 8) continue;
      expect(wl[data - 1]).toBeLessThan(0xe0);
      const speeds: number[] = [];
      for (let i = data; wl[i] !== 0xff; i++) { expect(wl[i]).toBe(0xf2); speeds.push((sl[wr[i] - 1] << 8) | sr[wr[i] - 1]); }
      expect(speeds.length).toBeGreaterThan(2);
      expect(speeds[1]).toBeLessThan(speeds[0]);
      expect(speeds[speeds.length - 1]).toBeLessThan(speeds[1]);
    }
  });
});

describe('Furnace E1xy/E2xy note-row slides in GoatTracker wave programs', () => {
  it('follows Furnace\'s linear-pitch slide per tick (yeah! voice 3 E2FC glided 1114 vs 999 one tick in)', async () => {
    const b = readFileSync(path.resolve(__dirname, '../../../../../public/data/songs/furnace/c64/yeah!.fur'));
    const m = await parseFurnaceSong(b.buffer.slice(b.byteOffset, b.byteOffset + b.length) as ArrayBuffer);
    const g = furnaceToGoatTracker(m, 0);
    const wl = g.song.tables[0].left, wr = g.song.tables[0].right, sl = g.song.tables[3].left, sr = g.song.tables[3].right;
    const clock = furnaceSidNtsc(m) ? 1022730 : 985248;
    const sid = (n: number) => 440 * 2 ** ((n - 57) / 12) * 16777216 / clock;
    // Pattern 5, voice 3: C-2 (GT note 24) with E2FC = 12 semitones down at 15*4*4/128 = 1.875 semitones per tick, clamped at C-1.
    const src = m.patterns.get(`0_2_${m.subsongs[0].orders[2][2]}`)!;
    const row = src.rows.findIndex((c) => c.effects.some((e) => e.type === 0xe2 && e.value === 0xfc));
    expect(row).toBeGreaterThanOrEqual(0);
    // GT note byte $60 + 24 (C-2), set-wave-pointer to a program whose first slide row goes down.
    const gtRow = g.song.patterns.flat().find((r) => r[0] === 0x60 + 24 && r[2] === 8 && wl[r[3]] === 0xf2);
    expect(gtRow).toBeDefined();
    let f = sid(24);
    // Wave table runs from the frame after note init: tick 1 lands Furnace's ticks 0 and 1, then one row per tick.
    for (let t = 1, i = gtRow![3]; t <= 8; t++) {
      if (wl[i] === 0xf2) { f -= (sl[wr[i] - 1] << 8) | sr[wr[i] - 1]; i++; }
      const want = sid(24 - Math.min(12, (t + 1) * 1.875));
      expect(Math.abs(1200 * Math.log2(f / want))).toBeLessThan(10);
    }
  });
});
