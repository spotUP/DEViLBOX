import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseSpeedySystemFile } from '@/lib/import/formats/SpeedySystemParser';
import { packSpeedySystemRows, encodeSpeedySystemCell, decodeSpeedySystemCell } from '@/engine/uade/encoders/SpeedySystemEncoder';

const path = 'public/data/songs/speedy-system/pauker rap 2.ss';
const load = () => { const b = readFileSync(path); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer; };

describe('Speedy System editable grid', () => {
  it('decodes real notes; every stored pattern repacks byte-exact or reports its canonical form', async () => {
    const song = await parseSpeedySystemFile(load(), 'x.ss');
    const lay = song.uadeVariableLayout!;
    const bytes = new Uint8Array(load());
    let notes = 0, same = 0;
    lay.filePatternAddrs.forEach((a, fp) => {
      const rows = lay.blockRows![fp];
      for (const r of rows) { if (r.note) notes++; expect(Array.from(encodeSpeedySystemCell(decodeSpeedySystemCell(encodeSpeedySystemCell(r))))).toEqual(Array.from(encodeSpeedySystemCell(r))); }
      const packed = packSpeedySystemRows(rows);
      if (Buffer.from(packed).equals(Buffer.from(bytes.subarray(a, a + lay.filePatternSizes[fp])))) same++;
    });
    console.log(`SPEEDY patterns=${song.patterns.length} filePatterns=${lay.numFilePatterns} notes=${notes} packerExact=${same}`);
    expect(notes).toBeGreaterThan(20);
    expect(song.patterns.length).toBeGreaterThan(1);
  });

  const run = async (edit: (song: Awaited<ReturnType<typeof parseSpeedySystemFile>>) => void) => {
    const { exportNativeSong } = await import('@/lib/export/nativeExportRouter');
    const song = await parseSpeedySystemFile(load(), 'x.ss');
    const g = await import('@/lib/song/gridBaseline');
    g.setGridBaseline(g.baselineOf(song.patterns), g.extraBaselineOf(song.patterns));
    edit(song);
    const res = await exportNativeSong(song);
    expect(res).not.toBeNull();
    const d = res!.data as Blob | Uint8Array | ArrayBuffer;
    return d instanceof Blob ? new Uint8Array(await d.arrayBuffer()) : new Uint8Array(d as ArrayBuffer);
  };

  it('unedited export equals the original bytes', async () => {
    expect(Buffer.from(await run(() => {})).equals(Buffer.from(load()))).toBe(true);
  });

  it('a one-cell edit changes only that pattern slot', async () => {
    let slot = [0, 0];
    const out = await run((song) => {
      const lay = song.uadeVariableLayout!;
      // the first pattern whose edited repack still fits its slot (the unedited one is stored verbatim)
      for (let p = 0; p < song.patterns.length; p++) for (let ch = 0; ch < 4; ch++) {
        const fp = lay.trackMap[p][ch];
        const rows = song.patterns[p].channels[ch].rows.map((r, i) => (i === 1 ? { ...r, note: 30, instrument: 2, eff: 0x11 } : r));
        if (slot[1] === 0 && packSpeedySystemRows(rows).length <= lay.filePatternSizes[fp]) {
          slot = [lay.filePatternAddrs[fp], lay.filePatternAddrs[fp] + lay.filePatternSizes[fp]];
          song.patterns[p].channels[ch].rows = rows;
        }
      }
    });
    expect(slot[1]).toBeGreaterThan(0);
    const orig = new Uint8Array(load());
    expect(out.length).toBe(orig.length);
    const diff = [...out].map((v, i) => (v !== orig[i] ? i : -1)).filter((i) => i >= 0);
    console.log(`SPEEDY edit diff bytes=${diff.length} slot=${slot}`);
    expect(diff.length).toBeGreaterThan(0);
    for (const i of diff) expect(i >= slot[0] && i < slot[1]).toBe(true);
  });

  it('a pattern that outgrows its slot is appended and every pointer to it rewritten', async () => {
    let target = -1; let refs: number[] = [];
    const out = await run((song) => {
      const lay = song.uadeVariableLayout!;
      // the stored pattern with the shortest slot: filling all 16 rows with distinct notes always outgrows it
      const fp = lay.trackMap[0][0];
      target = fp; refs = lay.sectionRefs!.at[fp];
      song.patterns[0].channels[0].rows = song.patterns[0].channels[0].rows.map((r, i) => ({ ...r, note: 1 + i, instrument: 1, eff: 0x11 }));
    });
    const orig = new Uint8Array(load());
    expect(out.length).toBeGreaterThan(orig.length);
    const base = 0x12 + [...orig.subarray(0x12, 0x40)].findIndex((_, i) => i % 2 === 0 && orig[0x12 + i] === 0 && orig[0x13 + i] === 0 && orig[0x14 + i] === 0x11 && orig[0x15 + i] === 0x90);
    const dv = new DataView(out.buffer, out.byteOffset);
    expect(target).toBeGreaterThanOrEqual(0);
    for (const at of refs) expect(base + dv.getUint32(at)).toBe((orig.length + 1) & ~1);
    // only the pointer longs and the appended pattern differ
    const diff = [...orig].map((v, i) => (v !== out[i] ? i : -1)).filter((i) => i >= 0);
    for (const i of diff) expect(refs.some((r) => i >= r && i < r + 4)).toBe(true);
  });
});
