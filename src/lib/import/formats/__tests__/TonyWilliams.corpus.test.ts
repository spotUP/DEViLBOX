import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseTonyWilliamsFile } from '../TonyWilliamsParser';
import { walkTonyWilliams, readTwBlock } from '../tonyWilliamsWalk';
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

  it('future basketball has one sample instrument per used table entry with the file PCM and loop (was 16 empty placeholders)', async () => {
    const buf = load();
    const raw = new Uint8Array(buf);
    const song = await parseTonyWilliamsFile(buf, 'future basketball main.tw');
    const walk = walkTonyWilliams(buf, 0)!;
    const used = new Set<number>();
    for (const a of walk.blocks) for (const c of readTwBlock(raw, a) ?? []) if (c.op >= 0xd0 && c.op <= 0xdf) used.add(c.op - 0xd0);
    expect(song.instruments.map((i) => i.id)).toEqual([...used].sort((a, b) => a - b).map((n) => n + 1));
    expect(song.instruments.length).toBeGreaterThan(1);
    const dv = new DataView(buf);
    for (const inst of song.instruments) {
      const o = walk.info.instrumentTable + (inst.id - 1) * 12;
      const ptr = dv.getUint32(o);
      const len = dv.getUint16(o + 4) * 2;
      // The sampler WAV is 16-bit mono (signed 8-bit PCM << 8) from byte 44; decode it back to the file's bytes.
      const wav = new DataView(inst.sample!.audioBuffer!);
      const pcm = new Uint8Array(len);
      for (let i = 0; i < len; i++) pcm[i] = wav.getInt16(44 + i * 2, true) >> 8;
      expect(len).toBeGreaterThan(0);
      expect(Buffer.from(pcm).equals(Buffer.from(raw.subarray(ptr, ptr + len)))).toBe(true);
      const loopPtr = dv.getUint32(o + 6);
      const loopLen = dv.getUint16(o + 10) * 2;
      const looped = loopLen > 2 && loopPtr >= ptr && loopPtr + loopLen <= ptr + len;
      expect(inst.sample!.loop).toBe(looped);
      if (looped) {
        expect(inst.sample!.loopStart).toBe(loopPtr - ptr);
        expect(inst.sample!.loopEnd).toBe(loopPtr - ptr + loopLen);
      }
    }
    expect(song.instruments.some((i) => i.sample!.loop)).toBe(true);
    expect(Buffer.from(await bytesOf(song)).equals(Buffer.from(buf))).toBe(true);
  });

  it('blinkys scary school-sfx (sound-effect build, one block per voice, unused 4th voice) decodes and a note edit round-trips', async () => {
    const f = readFileSync('public/data/songs/formats/blinkys scary school-sfx.tw');
    const buf = f.buffer.slice(f.byteOffset, f.byteOffset + f.byteLength) as ArrayBuffer;
    const song = await parseTonyWilliamsFile(buf, 'blinkys scary school-sfx.tw');
    const notes = [0, 1, 2, 3].map((c) => song.patterns.reduce((n, p) => n + p.channels[c]!.rows.filter((x) => x.note > 0 && x.note < 80).length, 0));
    expect(notes.slice(0, 3).every((n) => n > 0)).toBe(true);
    expect(notes[3]).toBe(0);
    expect(Buffer.from(await bytesOf(song)).equals(Buffer.from(buf))).toBe(true);
    let hit: { p: number; c: number; r: number } | null = null;
    for (let p = 0; p < song.patterns.length && !hit; p++) {
      for (let c = 0; c < 3 && !hit; c++) {
        const r = song.patterns[p]!.channels[c]!.rows.findIndex((x) => x.note > 0 && x.note < 80);
        if (r >= 0) hit = { p, c, r };
      }
    }
    const cell = song.patterns[hit!.p]!.channels[hit!.c]!.rows[hit!.r]!;
    const before = cell.note;
    cell.note = before + 1;
    const out = await bytesOf(song);
    const orig = new Uint8Array(buf);
    expect([...orig.keys()].filter((i) => orig[i] !== out[i]).length).toBe(1);
    const re = await parseTonyWilliamsFile(out.buffer.slice(0) as ArrayBuffer, 'x.tw');
    expect(re.patterns[hit!.p]!.channels[hit!.c]!.rows[hit!.r]!.note).toBe(before + 1);
  });
});
