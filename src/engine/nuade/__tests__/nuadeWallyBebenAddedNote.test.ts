/**
 * WB-NUADE-ADDED-NOTE: nuade accepts a Wally Beben module after the add-note edit (phrase copied to the end of the
 * file, table entry repointed to an absolute address, file grows) and plays it: not silent, and a voice whose phrase
 * table entries are untouched equals the original's.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseWallyBebenFile, readWallyBebenStructure } from '@lib/import/formats/WallyBebenParser';
import { addWallyBebenNote } from '@lib/import/formats/wallyBebenEdits';
import { NuadeHeadless } from '../nuadeHeadless';

const raw = new Uint8Array(readFileSync(join(process.cwd(), 'public/data/songs/wally-beben/wicked.wb')));
const SR = 48000;

async function render(data: Uint8Array): Promise<Float32Array[]> {
  const n = await NuadeHeadless.create(SR);
  n.reinit();
  n.open(data, 'wicked.wb', 'wallybeben');
  expect(n.start(n.defaultSubsong)).toBe(true);
  const out = n.render(SR * 30, true).voices;
  n.close();
  return out;
}

describe('nuade plays a Wally Beben module with a note added past a phrase end', () => {
  it('accepts it, is not silent, and keeps voices that do not play the edited phrase', async () => {
    const song = parseWallyBebenFile(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer, 'wicked.wb');
    const st = readWallyBebenStructure(raw);
    const lay = song.uadePatternLayout!;
    const sites: { p: number; c: number; r: number; data: Uint8Array }[] = [];
    for (let p = 0; p < song.patterns.length && sites.length < 12; p++) for (let c = 0; c < 4; c++) {
      const rows = song.patterns[p].channels[c].rows;
      const r = rows.findIndex((x, i) => i > 0 && x.note === 0 && lay.getCellFileOffset!(p, i, c) < 0);
      if (r < 0) continue;
      const res = addWallyBebenNote(raw, { pattern: p, channel: c, row: r, note: 40, instrument: 0 });
      if ('data' in res && !sites.some((x) => st.voiceSeqs[x.c][x.p] === st.voiceSeqs[c][p])) sites.push({ p, c, r, data: res.data });
    }
    expect(sites.length).toBeGreaterThan(0);
    const a = await render(raw);
    let audible = 0;
    for (const { p, c, r, data } of sites) {
      expect(data.length).toBeGreaterThan(raw.length);
      const k = st.voiceSeqs[c][p];
      const b = await render(data);
      const first = b.map((vb, v) => { for (let i = 0; i < vb.length; i++) if (a[v][i] !== vb[i]) return i; return -1; });
      console.log('WB site step', p, 'voice', c, 'row', r, 'phrase', k, 'first differing frame per voice', JSON.stringify(first), 'first nonzero orig/edit', JSON.stringify(a.map((x) => x.findIndex((s) => s !== 0))), JSON.stringify(b.map((x) => x.findIndex((s) => s !== 0))));
      expect(b.some((x) => x.some((s) => s !== 0))).toBe(true);
      for (let v = 0; v < 4; v++) if (!st.voiceSeqs[v].includes(k)) expect(first[v]).toBe(-1);
      if (first[c] >= 0) audible++;
    }
    expect(audible).toBeGreaterThan(0);
  });
});
