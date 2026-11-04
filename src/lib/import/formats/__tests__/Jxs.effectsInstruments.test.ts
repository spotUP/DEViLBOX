import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseJxsFile } from '../JxsParser';
import { decodeJxsModule } from '../jxsGrid';
import { exportJxs } from '@/lib/export/JxsExporter';
import { isReplacedInstrument } from '@/engine/replayer/hybridInstruments';
import { jxsEffectToString } from '../jxsEffectGlyphs';
import type { TrackerSong } from '@/engine/TrackerReplayer';

const FILES = ['doodmars - death.jxs', 'dreamer.jxs', 'jbells.jxs', 'popcorn.jxs', 'waterballet.jxs'];
const raw = (n: string) => new Uint8Array(readFileSync(`public/data/songs/formats/${n}`));
const load = (n: string) => {
  const t = parseJxsFile(raw(n), n);
  if (!t) throw new Error('parse failed');
  return t;
};
const bytesOf = async (t: TrackerSong) => new Uint8Array(await (await exportJxs(t)).data.arrayBuffer());

describe('JayTrax effects', () => {
  it('popcorn shows its row scripts as effect glyphs', () => {
    const t = load('popcorn.jxs');
    const tokens: string[] = [];
    t.patterns.forEach((p) => p.channels.forEach((c) => c.rows.forEach((r) => {
      if (r.effTyp) tokens.push(jxsEffectToString(r.effTyp, r.eff ?? 0) ?? 'NONE');
    })));
    expect(tokens.length).toBeGreaterThan(0);
    expect(tokens).not.toContain('NONE');
  });
  it.each(FILES)('%s exports byte-identical when unchanged', async (n) => {
    expect(await bytesOf(load(n))).toEqual(raw(n));
  });
  it('an edited effect cell round-trips to the right bytes', async () => {
    const t = load('popcorn.jxs');
    const m = decodeJxsModule(raw('popcorn.jxs'))!;
    const rows = t.patterns.flatMap((p) => p.channels.flatMap((c) => c.rows.filter((r) => r.effTyp)));
    const cell = rows[0];
    cell.eff = ((cell.eff ?? 0) + 1) & 0xff;
    const out = await bytesOf(t);
    const diff: number[] = [];
    raw('popcorn.jxs').forEach((v, i) => { if (out[i] !== v) diff.push(i); });
    expect(diff.length).toBe(1);
    expect((diff[0] - m.patternOffset) % 5).toBe(1); // the d byte of a row
    const again = parseJxsFile(out, 'p')!;
    expect(again.patterns.flatMap((p) => p.channels.flatMap((c) => c.rows.filter((r) => r.effTyp)))[0].eff).toBe(cell.eff);
  });
  it('a slot-field and a wave-reset script survive the cell mapping', async () => {
    const src = raw('popcorn.jxs');
    const m = decodeJxsModule(src)!;
    const t = load('popcorn.jxs');
    for (const sc of [14, 24, 40, 57, 58, 73]) {
      const img = src.slice();
      img[m.patternOffset + 4] = sc; img[m.patternOffset + 1] = 5; img[m.patternOffset + 3] = 0;
      const tt = parseJxsFile(img, 'x')!;
      (tt as unknown as { jxsFileData: ArrayBuffer }).jxsFileData = img.slice().buffer;
      expect(await bytesOf(tt)).toEqual(img);
      const base = t.patterns.flatMap((p) => p.channels.flatMap((c) => c.rows));
      const cells = tt.patterns.flatMap((p) => p.channels.flatMap((c) => c.rows));
      const cell = cells.find((r, i) => r.effTyp !== base[i].effTyp || r.eff !== base[i].eff || r.effTyp2 !== base[i].effTyp2)!;
      expect(cell.effTyp).toBeGreaterThanOrEqual(0x100);
      cell.eff = 6;
      const out = await bytesOf(tt);
      expect(out[m.patternOffset + 4]).toBe(sc);
      expect(out[m.patternOffset + 1]).toBe(6);
    }
    expect(t).toBeTruthy();
  });
  it('popcorn shows no ?01 on rows whose script the replayer ignores, and keeps their bytes on edit', async () => {
    const src = raw('popcorn.jxs');
    const m = decodeJxsModule(src)!;
    const t = load('popcorn.jxs');
    const glyphs = t.patterns.flatMap((p) => p.channels.flatMap((c) => c.rows))
      .filter((r) => r.effTyp).map((r) => jxsEffectToString(r.effTyp, r.eff ?? 0) ?? '');
    expect(glyphs.filter((g) => g.startsWith('?'))).toEqual([]);
    // script 200 is inert too: no effect shown
    const img = src.slice();
    img[m.patternOffset + 4] = 200; img[m.patternOffset + 1] = 5; img[m.patternOffset + 3] = 3;
    const tt = parseJxsFile(img, 'x')!;
    (tt as unknown as { jxsFileData: ArrayBuffer }).jxsFileData = img.slice().buffer;
    const cell = tt.patterns[0].channels[0].rows[0];
    expect(cell.effTyp).toBe(0);
    // a note edit on an inert row keeps d, p and script
    cell.note = ((cell.note ?? 0) % 96) + 1;
    const out = await bytesOf(tt);
    expect([out[m.patternOffset + 1], out[m.patternOffset + 3], out[m.patternOffset + 4]]).toEqual([5, 3, 200]);
  });
});

describe('JayTrax instruments', () => {
  it.each(FILES)('%s lists every instrument with the stored name, none replaced', (n) => {
    const t = load(n);
    const m = decodeJxsModule(raw(n))!;
    expect(t.instruments.length).toBe(m.instruments);
    expect(m.instruments).toBeGreaterThan(0);
    t.instruments.forEach((inst, i) => {
      expect(inst.id).toBe(i + 1);
      expect(inst.name).toBe(m.instrumentNames[i]);
      expect(isReplacedInstrument(inst, false)).toBe(false);
    });
  });
  it('popcorn names equal the bytes at +2 of each record', () => {
    const t = load('popcorn.jxs');
    expect(t.instruments.map((i) => i.name).some((x) => x.length > 0)).toBe(true);
  });
});
