/**
 * The lossless Sound Factory writer: a no-op export is byte-identical for every .psf in the corpus, and each grid
 * edit that used to be refused (insert / remove an effect, delay, note plus effect on one row, enable byte
 * zero -> non-zero, one shot) goes through exportSoundFactory - the product's edit entry point - and reads back
 * from the re-parsed file with the rest of the song unchanged.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import type { TrackerCell } from '@/types';
import { parseSoundFactoryWithEffects, type SoundFactoryParse } from '../SoundFactoryParser';
import { exportSoundFactory } from '@/lib/export/SoundFactoryExporter';
import { sfWriterStats } from '../soundFactoryEdits';
import { SF_FX } from '../soundFactoryEffectGlyphs';
import { BD_FX } from '../benDaglishEffectGlyphs';
import { SF_FX_ROW_OFFSET, SF_MAX_EFFECT_SLOTS } from '../soundFactoryGrid';
import { tokenizeSoundFactory } from '../soundFactoryStream';

const DIRS = ['public/templates', 'public/data/songs/formats', 'public/data/songs/soundfactory'];
const SLOT_TYP = ['effTyp', 'effTyp2', 'effTyp3', 'effTyp4', 'effTyp5', 'effTyp6', 'effTyp7', 'effTyp8'] as const;
const SLOT_VAL = ['eff', 'eff2', 'eff3', 'eff4', 'eff5', 'eff6', 'eff7', 'eff8'] as const;
const SHOWN = ['note', 'instrument', 'note2', 'instrument2', 'delay2', ...SLOT_TYP, ...SLOT_VAL] as const;

const corpus = (): Array<{ name: string; bytes: Uint8Array }> => DIRS.flatMap((d) =>
  readdirSync(join(process.cwd(), d)).filter((n) => n.toLowerCase().endsWith('.psf'))
    .map((n) => ({ name: n, bytes: new Uint8Array(readFileSync(join(process.cwd(), d, n))) })));

const GOLD = (): Uint8Array => new Uint8Array(readFileSync(join(process.cwd(), 'public/data/songs/formats/goldrunner.psf')));
const exportBytes = async (song: SoundFactoryParse['song']): Promise<Uint8Array> => new Uint8Array(await (await exportSoundFactory(song)).data.arrayBuffer());
const field = (cell: TrackerCell, k: string): number => (cell as unknown as Record<string, number | undefined>)[k] ?? 0;
const setField = (cell: TrackerCell, k: string, v: number): void => { (cell as unknown as Record<string, number>)[k] = v; };
const shown = (cell: TrackerCell): string => SHOWN.map((k) => field(cell, k)).join(',');
const fxOf = (cell: TrackerCell): Array<[number, number]> => SLOT_TYP.map((t, k) => [field(cell, t), field(cell, SLOT_VAL[k])] as [number, number]).filter(([t]) => t !== 0);
const freeSlot = (cell: TrackerCell): number => SLOT_TYP.findIndex((t) => field(cell, t) === 0);

/** Every cell of the song as a string, keyed channel/global row. */
function snapshot(song: SoundFactoryParse['song']): Map<string, string> {
  const m = new Map<string, string>();
  song.patterns.forEach((pat, p) => pat.channels.forEach((ch, c) => ch.rows.forEach((cell, r) => m.set(`${c}/${p * 64 + r}`, shown(cell)))));
  return m;
}

/** First anchored cell (a command to edit) that satisfies `want`. */
function findCell(parse: SoundFactoryParse, want: (cell: TrackerCell, c: number, g: number, ai: number) => boolean): { c: number; g: number; p: number; r: number; cell: TrackerCell } {
  for (let c = 0; c < parse.anchors.length; c++) for (let g = 0; g < parse.anchors[c].length; g++) {
    const ai = parse.anchors[c][g];
    if (ai < 0 || parse.voiceEvents[c][ai].fileOffset < 0) continue;
    const p = Math.floor(g / 64), r = g % 64;
    const cell = parse.song.patterns[p].channels[c].rows[r];
    if (want(cell, c, g, ai)) return { c, g, p, r, cell };
  }
  throw new Error('no cell for the edit');
}

/** Keys of every cell that plays the same stream command as cell (c, g): a shared subroutine shows an edit at each call. */
function sharing(parse: SoundFactoryParse, c: number, g: number): string[] {
  const off = parse.voiceEvents[c][parse.anchors[c][g]].fileOffset;
  const keys: string[] = [];
  parse.anchors.forEach((row, c2) => row.forEach((ai, g2) => { if (ai >= 0 && parse.voiceEvents[c2][ai].fileOffset === off) keys.push(`${c2}/${g2}`); }));
  return keys;
}

/** Export `parse.song` as edited, re-parse, and assert every cell but `edited` is as before. */
async function exportAndCheck(parse: SoundFactoryParse, before: Map<string, string>, edited: string[]): Promise<{ re: SoundFactoryParse; out: Uint8Array }> {
  const out = await exportBytes(parse.song);
  const re = parseSoundFactoryWithEffects(out, 'x.psf')!;
  expect(re).not.toBeNull();
  const after = snapshot(re.song);
  expect(after.size).toBe(before.size);
  for (const [k, v] of before) if (!edited.includes(k)) expect(after.get(k), `cell ${k} must be unchanged`).toBe(v);
  return { re, out };
}

describe('Sound Factory lossless writer', () => {
  it('a no-op export is byte-identical for every .psf, through the product entry point, and runs the writer once each', async () => {
    const files = corpus();
    expect(files.length).toBeGreaterThanOrEqual(4);
    for (const { name, bytes } of files) {
      const parse = parseSoundFactoryWithEffects(bytes, name)!;
      expect(parse, name).not.toBeNull();
      const calls = sfWriterStats.calls;
      const out = await exportBytes(parse.song);
      expect(sfWriterStats.calls - calls, `${name}: writer ran`).toBe(1);
      expect(out.length, name).toBe(bytes.length);
      expect(Buffer.compare(Buffer.from(out), Buffer.from(bytes)), `${name} byte-identical`).toBe(0);
    }
  });

  it('every .psf tokenizes to exactly its module length', () => {
    for (const { name, bytes } of corpus()) {
      const s = tokenizeSoundFactory(bytes)!;
      expect(s, name).not.toBeNull();
      expect(s.tokens.reduce((a, t) => a + t.bytes.length, 276), name).toBe(s.moduleLength);
    }
  });

  it('inserts an effect where the song has no command, and shifts nothing else', async () => {
    const src = GOLD();
    const parse = parseSoundFactoryWithEffects(src, 'goldrunner.psf')!;
    const before = snapshot(parse.song);
    const t = findCell(parse, (cell, c, g, ai) => cell.note > 0 && parse.voiceEvents[c][ai].isNote && sharing(parse, c, g).length === 1 && freeSlot(cell) >= 0 && !fxOf(cell).some(([id]) => id === BD_FX.channelVolume));
    const k = freeSlot(t.cell);
    setField(t.cell, SLOT_TYP[k], BD_FX.channelVolume); setField(t.cell, SLOT_VAL[k], 33);
    const { re, out } = await exportAndCheck(parse, before, sharing(parse, t.c, t.g));
    expect(out.length).toBe(src.length + 2);
    expect(fxOf(re.song.patterns[t.p].channels[t.c].rows[t.r])).toContainEqual([BD_FX.channelVolume, 33]);
  });

  it('removes an effect (its command leaves the stream)', async () => {
    const src = GOLD();
    const parse = parseSoundFactoryWithEffects(src, 'goldrunner.psf')!;
    const before = snapshot(parse.song);
    const t = findCell(parse, (cell) => fxOf(cell).some(([id]) => id === BD_FX.channelVolume));
    const k = SLOT_TYP.findIndex((s) => field(t.cell, s) === BD_FX.channelVolume);
    for (let j = k; j < SF_MAX_EFFECT_SLOTS - 1; j++) { setField(t.cell, SLOT_TYP[j], field(t.cell, SLOT_TYP[j + 1])); setField(t.cell, SLOT_VAL[j], field(t.cell, SLOT_VAL[j + 1])); }
    setField(t.cell, SLOT_TYP[SF_MAX_EFFECT_SLOTS - 1], 0); setField(t.cell, SLOT_VAL[SF_MAX_EFFECT_SLOTS - 1], 0);
    const { re, out } = await exportAndCheck(parse, before, sharing(parse, t.c, t.g));
    expect(out.length).toBeLessThan(src.length);
    expect(fxOf(re.song.patterns[t.p].channels[t.c].rows[t.r]).some(([id]) => id === BD_FX.channelVolume)).toBe(false);
  });

  it('changes a delay by moving ticks between neighbouring durations', async () => {
    const src = GOLD();
    const parse = parseSoundFactoryWithEffects(src, 'goldrunner.psf')!;
    const before = snapshot(parse.song);
    const t = findCell(parse, (cell, c, _g, ai) => field(cell, 'note') > 0 && freeSlot(cell) === 0 && ai > 0
      && parse.voiceEvents[c][ai].duration >= 2 && parse.voiceEvents[c][ai - 1].fileOffset >= 0);
    setField(t.cell, SLOT_TYP[0], SF_FX_ROW_OFFSET); setField(t.cell, SLOT_VAL[0], 1);
    const { re, out } = await exportAndCheck(parse, before, sharing(parse, t.c, t.g));
    expect(out.length).toBe(src.length);
    expect(fxOf(re.song.patterns[t.p].channels[t.c].rows[t.r])).toContainEqual([SF_FX_ROW_OFFSET, 1]);
  });

  it('changes note and effect on the same row', async () => {
    const src = GOLD();
    const parse = parseSoundFactoryWithEffects(src, 'goldrunner.psf')!;
    const before = snapshot(parse.song);
    const t = findCell(parse, (cell, c, g, ai) => field(cell, 'note') > 0 && freeSlot(cell) >= 0 && parse.eventContext.has(parse.voiceEvents[c][ai].fileOffset) && g > 0);
    const note = field(t.cell, 'note');
    const k = freeSlot(t.cell);
    setField(t.cell, 'note', note + 1);
    setField(t.cell, SLOT_TYP[k], BD_FX.channelVolume); setField(t.cell, SLOT_VAL[k], 21);
    const { re } = await exportAndCheck(parse, before, sharing(parse, t.c, t.g));
    const got = re.song.patterns[t.p].channels[t.c].rows[t.r];
    expect(field(got, 'note')).toBe(note + 1);
    expect(fxOf(got)).toContainEqual([BD_FX.channelVolume, 21]);
  });

  it('switches an enable byte from zero to non-zero (the operands appear)', async () => {
    const src = GOLD();
    let parse = parseSoundFactoryWithEffects(src, 'goldrunner.psf')!;
    const t0 = findCell(parse, (cell) => freeSlot(cell) >= 0 && !fxOf(cell).some(([id]) => id === SF_FX.vibrato));
    let k = freeSlot(t0.cell);
    setField(t0.cell, SLOT_TYP[k], SF_FX.vibrato); setField(t0.cell, SLOT_VAL[k], 0);
    const step1 = await exportAndCheck(parse, snapshot(parse.song), sharing(parse, t0.c, t0.g));
    expect(step1.out.length).toBe(src.length + 2); // vibrato opcode + enable byte 0
    parse = step1.re;
    const cell = parse.song.patterns[t0.p].channels[t0.c].rows[t0.r];
    k = SLOT_TYP.findIndex((s) => field(cell, s) === SF_FX.vibrato);
    expect(k).toBeGreaterThanOrEqual(0);
    const before = snapshot(parse.song);
    setField(cell, SLOT_VAL[k], 1);
    const step2 = await exportAndCheck(parse, before, [`${t0.c}/${t0.g}`]);
    expect(step2.out.length).toBe(step1.out.length + 4); // the four operands after the enable byte
    const back = fxOf(step2.re.song.patterns[t0.p].channels[t0.c].rows[t0.r]);
    expect(back).toContainEqual([SF_FX.vibrato, 1]);
    expect(back).toContainEqual([SF_FX.vibratoAmount, 0]);
  });

  it('inserts a one-shot command (presence only)', async () => {
    const src = GOLD();
    const parse = parseSoundFactoryWithEffects(src, 'goldrunner.psf')!;
    const before = snapshot(parse.song);
    const t = findCell(parse, (cell) => freeSlot(cell) >= 0 && !fxOf(cell).some(([id]) => id === SF_FX.oneShot));
    const k = freeSlot(t.cell);
    setField(t.cell, SLOT_TYP[k], SF_FX.oneShot); setField(t.cell, SLOT_VAL[k], 0);
    const { re, out } = await exportAndCheck(parse, before, sharing(parse, t.c, t.g));
    expect(out.length).toBe(src.length + 1);
    expect(fxOf(re.song.patterns[t.p].channels[t.c].rows[t.r]).some(([id]) => id === SF_FX.oneShot)).toBe(true);
  });
});
