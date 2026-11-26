import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseTonyWilliamsFile } from '../TonyWilliamsParser';
import { walkTonyWilliams } from '../tonyWilliamsWalk';
import { relocateTonyWilliams } from '../tonyWilliamsRelocate';
import { TW_FX } from '../tonyWilliamsEffectGlyphs';
import { exportTonyWilliams } from '@lib/export/TonyWilliamsExporter';
import type { TrackerSong } from '@/engine/TrackerReplayer';

const DIR = 'public/data/songs/sound-images/';
const FILES = ['future basketball main.tw', 'blinkys scary school-sfx.tw'] as const;
const load = (n: string): ArrayBuffer => { const b = readFileSync(DIR + n); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer; };
const bytesOf = async (s: TrackerSong): Promise<{ data: Uint8Array; warnings: string[] }> => {
  const r = await exportTonyWilliams(s);
  return { data: new Uint8Array(await r.data.arrayBuffer()), warnings: r.warnings };
};
type Cell = Record<string, number>;
const KEYS: Array<[string, string]> = [['effTyp', 'eff'], ['effTyp2', 'eff2'], ['effTyp3', 'eff3'], ['effTyp4', 'eff4'], ['effTyp5', 'eff5']];
const fx = (c: Cell): string[] => KEYS.filter(([t]) => (c[t] ?? 0) !== 0).map(([t, v]) => `${c[t]}:${c[v]}`).sort();

/** Pointer sites from the "tail pointer hunt" notes, per fixture (oracle only; the code finds them by structure). */
const EXPECTED_DISP: Record<string, number[]> = {
  'future basketball main.tw': [0xcc, 0x228, 0x482, 0x13a2, 0x13ca, 0x13f2, 0x1400],
  'blinkys scary school-sfx.tw': [0xd2, 0x1ec, 0x456, 0xb5c, 0xb6a, 0xae6, 0xaf0, 0xafa, 0xb04],
};
const INSTR: Record<string, number> = { 'future basketball main.tw': 0x704, 'blinkys scary school-sfx.tw': 0x710 };

describe('Tony Williams length-changing edits', () => {
  for (const name of FILES) {
    it(`${name}: relocation patches every pointer and each resolves to the same moved content`, () => {
      const orig = new Uint8Array(load(name));
      const walk = walkTonyWilliams(orig, 0)!;
      const at = Math.min(...walk.blocks) + 1;
      const r = relocateTonyWilliams(orig, [{ at, remove: 0, insert: new Uint8Array([0xb7, 0xb7]) }]);
      if ('error' in r) throw new Error(r.error);
      expect(r.data.length).toBe(orig.length + 2);
      const disp = r.pointers.filter((p) => p.kind === 'disp').map((p) => p.site).sort((a, b) => a - b);
      expect(disp).toEqual([...EXPECTED_DISP[name]!].sort((a, b) => a - b));
      const instr = r.pointers.filter((p) => p.kind === 'instrument').map((p) => p.site);
      for (const s of instr) expect(s >= INSTR[name]! && s < INSTR[name]! + 96).toBe(true);
      expect(instr.length).toBeGreaterThan(0);
      expect(r.pointers.some((p) => p.kind === 'list')).toBe(true);
      if (name.startsWith('blinkys')) expect(r.pointers.filter((p) => p.kind === 'sfx').map((p) => p.site)).toEqual([0xb6e, 0xb70, 0xb72, 0xb74, 0xb76]);
      for (const p of r.pointers) {
        if (p.newTarget === p.oldTarget) continue;
        // the 4 bytes at the old target in the original equal the 4 bytes at the new target (code words that were themselves patched are skipped)
        const patched = r.pointers.some((q) => q.site >= p.oldTarget && q.site < p.oldTarget + 4);
        if (patched) continue;
        expect(Buffer.from(r.data.subarray(p.newTarget, p.newTarget + 4)).equals(Buffer.from(orig.subarray(p.oldTarget, p.oldTarget + 4)))).toBe(true);
      }
      // untouched bytes: everything else is the original, shifted
      const moved = new Set(r.pointers.map((p) => p.site));
      for (let i = 0; i < orig.length; i++) {
        const ni = i >= at ? i + 2 : i;
        const site = [...moved].some((m) => i >= m && i < m + 4);
        if (!site) expect(r.data[ni]).toBe(orig[i]);
      }
    });

    it(`${name}: an effect added to a note cell grows the file, re-parses, and leaves every other cell alone`, async () => {
      const buf = load(name);
      for (const pick of ['first', 'last'] as const) {
        const song = await parseTonyWilliamsFile(buf, name);
        const hits: Array<[number, number, number]> = [];
        song.patterns.forEach((pat, p) => pat.channels.forEach((ch, c) => ch.rows.forEach((row, r) => {
          if (row.note > 0 && row.note < 80 && fx(row as unknown as Cell).length === 0) hits.push([p, c, r]);
        })));
        const [p, c, r] = (pick === 'first' ? hits[0] : hits[hits.length - 1])!;
        const before = song.patterns.map((pt) => pt.channels.map((ch) => ch.rows.map((x) => ({ ...x }) as unknown as Cell)));
        const cell = song.patterns[p]!.channels[c]!.rows[r] as unknown as Cell;
        cell.effTyp = TW_FX.volume; cell.eff = 9;
        const { data, warnings } = await bytesOf(song);
        expect(warnings).toEqual([]);
        expect(data.length - buf.byteLength).toBe(2);
        const re = await parseTonyWilliamsFile(data.buffer.slice(0) as ArrayBuffer, 'x.tw');
        expect(re.patterns.length).toBe(song.patterns.length);
        let changed = 0;
        re.patterns.forEach((pt, pi) => pt.channels.forEach((ch, ci) => ch.rows.forEach((row, ri) => {
          const a = before[pi]![ci]![ri]!;
          const b = row as unknown as Cell;
          expect(b.note).toBe(a.note);
          expect(b.instrument).toBe(a.instrument);
          const fa = fx(a); const fb = fx(b);
          if (fa.join() === fb.join()) return;
          changed++;
          expect(fb).toEqual([...fa, `${TW_FX.volume}:9`].sort());
        })));
        expect(changed).toBeGreaterThanOrEqual(1);
        expect((re.patterns[p]!.channels[c]!.rows[r] as unknown as Cell).effTyp).toBe(TW_FX.volume);
      }
    });

    it(`${name}: clearing an effect cell removes its command and the rest still parses unchanged`, async () => {
      const buf = load(name);
      const song = await parseTonyWilliamsFile(buf, name);
      let hit: [number, number, number, number] | null = null;
      song.patterns.forEach((pat, p) => pat.channels.forEach((ch, c) => ch.rows.forEach((row, r) => {
        const cell = row as unknown as Cell;
        if (!hit && cell.effTyp === TW_FX.volume) hit = [p, c, r, 0];
      })));
      if (!hit) return; // fixture has no volume command
      const [p, c, r] = hit as [number, number, number, number];
      const before = song.patterns.map((pt) => pt.channels.map((ch) => ch.rows.map((x) => ({ ...x }) as unknown as Cell)));
      const cell = song.patterns[p]!.channels[c]!.rows[r] as unknown as Cell;
      cell.effTyp = 0; cell.eff = 0;
      const { data, warnings } = await bytesOf(song);
      expect(warnings).toEqual([]);
      expect(data.length).toBe(buf.byteLength); // -1 byte, +1 pad
      const re = await parseTonyWilliamsFile(data.buffer.slice(0) as ArrayBuffer, 'x.tw');
      re.patterns.forEach((pt, pi) => pt.channels.forEach((ch, ci) => ch.rows.forEach((row, ri) => {
        const a = before[pi]![ci]![ri]!;
        const b = row as unknown as Cell;
        expect(b.note).toBe(a.note);
        if (pi === p && ci === c && ri === r) expect(fx(b)).toEqual(fx(a).filter((x) => x !== fx(a)[0]));
      })));
    });
  }
});
