/**
 * Ben Daglish: a note with another instrument on a blank row is written as [sample-map byte][note][rest][old map byte]
 * (benDaglishEdits.ts swapFor), read back through a fresh walk and a fresh import on the real corpus songs.
 */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

vi.mock('@/engine/ToneEngine', () => {
  const engine = new Proxy({}, { get: () => () => Promise.resolve() });
  return { getToneEngine: () => engine };
});

import { parseBenDaglishFile } from '../formats/BenDaglishParser';
import { walkBenDaglish, BD_WALK } from '../formats/BenDaglishWasmExtractor';
import { applyBdGridEdits } from '../formats/benDaglishEdits';
import { installWasmNodeFetch } from './helpers/dwNodeFetch';
import type { TrackerSong } from '@/engine/TrackerReplayer';

let restore = () => {};
beforeAll(() => { restore = installWasmNodeFetch('bd', 'Bd'); });
afterAll(() => restore());

const SONGS = ['ben-daglish/motorhead-titleandingame.bd', 'formats/mickey_mouse.bd'];

describe.each(SONGS)('Ben Daglish blank-row instrument swap: %s', (rel) => {
  it('writes note and instrument, reads both back, every other cell unchanged; no-swap edit adds 2 bytes, swap 4', async () => {
    const f = readFileSync(resolve(process.cwd(), 'public/data/songs', rel));
    const ab = f.buffer.slice(f.byteOffset, f.byteOffset + f.byteLength) as ArrayBuffer;
    const name = rel.split('/').pop()!;
    const song = await parseBenDaglishFile(ab.slice(0), name) as unknown as TrackerSong;
    const walk = await walkBenDaglish(ab.slice(0), 0);
    const lay = song.uadeVariableLayout!;
    const grow = { sizes: lay.filePatternSizes!, ...lay.trackTable! };
    const used = [...new Set(walk.events.filter((e) => e.kind === BD_WALK.note && e.a >= 0).map((e) => e.a + 1))];
    const clone = () => song.patterns.map((p) => ({ ...p, channels: p.channels.map((c) => ({ ...c, rows: c.rows.map((r) => ({ ...r })) })) }));
    let hit: { out: Uint8Array; edited: ReturnType<typeof clone>; p: number; ch: number; row: number; inst: number } | undefined;
    let refusals = new Set<string>();
    search: for (let p = 0; p < song.patterns.length; p++) for (let ch = 0; ch < song.patterns[p].channels.length; ch++) {
      let prev: { note: number; instrument: number } | undefined;
      for (let row = 0; row < song.patterns[p].channels[ch].rows.length; row++) {
        const r = song.patterns[p].channels[ch].rows[row];
        if (r.note) { prev = { note: r.note, instrument: r.instrument }; continue; }
        if (!prev) continue;
        for (const inst of used) {
          if (inst === prev.instrument) continue;
          const edited = clone();
          Object.assign(edited[p].channels[ch].rows[row], { note: prev.note, instrument: inst });
          const res = applyBdGridEdits(new Uint8Array(ab), walk, lay.filePatternAddrs!, edited, grow);
          if (res.warnings.length === 0 && res.patched === 4) { hit = { out: res.data, edited, p, ch, row, inst }; break search; }
          res.warnings.forEach((w) => refusals.add(w.replace(/^pattern \d+ voice \d+ row \d+/, '').replace(/\d+/g, 'N')));
        }
        if (refusals.size > 40) break search;
      }
    }
    expect(hit, `some blank row takes another instrument; refusals: ${[...refusals].join(' | ')}`).toBeTruthy();
    const { out, edited, p, ch, row, inst } = hit!;
    const buf = out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength) as ArrayBuffer;
    const song2 = await parseBenDaglishFile(buf.slice(0), name) as unknown as TrackerSong;
    const cell = (ps: TrackerSong['patterns']) => ps.map((pp) => pp.channels.map((c) => c.rows.map((r) => [r.note, r.note ? r.instrument : 0].join())));
    expect(song2.patterns[p].channels[ch].rows[row].note).toBe(edited[p].channels[ch].rows[row].note);
    expect(song2.patterns[p].channels[ch].rows[row].instrument).toBe(inst);
    // the track is shared: every other run of it (same bytes) shows the new note too, and nothing else differs
    const a = cell(song2.patterns), b = cell(edited);
    const want = a[p][ch][row];
    const diff: string[] = [];
    a.forEach((pp, i) => pp.forEach((c, j) => c.forEach((v, k) => { if (v !== b[i]?.[j]?.[k]) diff.push(`${i}/${j}/${k}: ${v} vs ${b[i]?.[j]?.[k]} (edit ${p}/${ch}/${row})`); })));
    expect(diff.filter((d) => !d.includes(`: ${want} vs 0,0 `)), 'cells that differ other than the same track run again').toEqual([]);
    const walk2 = await walkBenDaglish(buf.slice(0), 0);
    const count = (w: typeof walk) => w.events.filter((e) => e.kind === BD_WALK.note).length;
    expect(count(walk2) - count(walk), 'one more note per run of the track').toBe(diff.length + 1);
  }, 120000);
});
