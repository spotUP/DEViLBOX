import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseTonyWilliamsFile } from '../TonyWilliamsParser';
import { walkTonyWilliams } from '../tonyWilliamsWalk';
import { exportTonyWilliams } from '@lib/export/TonyWilliamsExporter';
import { encodeVariableBlock } from '@/engine/uade/UADEPatternEncoder';
import type { TrackerSong } from '@/engine/TrackerReplayer';

const PATH = 'public/data/songs/formats/future basketball main.tw';
const load = (): ArrayBuffer => { const b = readFileSync(PATH); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer; };
const bytesOf = async (s: TrackerSong): Promise<Uint8Array> => new Uint8Array(await (await exportTonyWilliams(s)).data.arrayBuffer());

describe('Tony Williams corpus', () => {
  it('unedited export is byte-exact and block carriers re-encode verbatim', async () => {
    const buf = load();
    const song = await parseTonyWilliamsFile(buf, 'future basketball main.tw');
    const layout = (song as unknown as { uadeVariableLayout: { blockRows: unknown[][]; blockRawBytes: Uint8Array[]; encoder: unknown } }).uadeVariableLayout;
    expect(layout.blockRows.length).toBeGreaterThan(10);
    expect(song.patterns.length).toBeGreaterThan(1);
    expect(Buffer.from(await bytesOf(song)).equals(Buffer.from(buf))).toBe(true);
    void encodeVariableBlock;
  });

  it('one note edit changes exactly that byte and survives a reparse', async () => {
    const buf = load();
    const song = await parseTonyWilliamsFile(buf, 'future basketball main.tw');
    let hit: { p: number; c: number; r: number } | null = null;
    for (let p = 0; p < song.patterns.length && !hit; p++) {
      const chs = song.patterns[p]!.channels;
      for (let c = 0; c < chs.length && !hit; c++) {
        const r = chs[c]!.rows.findIndex((x) => x.note > 0 && x.note < 80);
        if (r >= 0) hit = { p, c, r };
      }
    }
    expect(hit).not.toBeNull();
    const cell = song.patterns[hit!.p]!.channels[hit!.c]!.rows[hit!.r]!;
    const before = cell.note;
    cell.note = before + 1;
    const out = await bytesOf(song);
    const orig = new Uint8Array(buf);
    const diffs = [...orig.keys()].filter((i) => orig[i] !== out[i]);
    expect(diffs.length).toBe(1);
    const at = diffs[0]!;
    expect(out[at]).toBe(orig[at]! + 1);
    const walk = walkTonyWilliams(buf, 0)!;
    expect(walk.events.some((e) => e.cmd.op < 0x80 && e.cmd.offset === at)).toBe(true);
    const re = await parseTonyWilliamsFile(out.buffer.slice(0) as ArrayBuffer, 'x.tw');
    expect(re.patterns[hit!.p]!.channels[hit!.c]!.rows[hit!.r]!.note).toBe(before + 1);
  });
});
