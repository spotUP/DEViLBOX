/**
 * InStereo! 1.0 (`ISM!V1.2`) editability: the real fantasi8.is goes through the import entry point (parseModuleToSong),
 * a grid cell is edited, and the native export router (exportNativeSong) writes the original module back. Sentinel:
 * writeEditsIntoInStereo1Module must run for every export.
 *
 * Layout (thoughts/spot/2026-11-04_instereo1-layout.md): header u16 @8 positions, u16 @10 track rows; positions are
 * 4 voices x {u16 startTrackRow, s8 soundTranspose, s8 noteTranspose}; the track is one array of 4-byte lines
 * {note, instrument, effect (low nibble), arg} that every position and voice reads a run of. Grid note = line byte 0
 * + noteTranspose + 36 (XM), so an edit stores note - 36 - noteTranspose in byte 0 of the line the cell was read from.
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { TrackerSong } from '@/engine/TrackerReplayer';

const sentinel = vi.hoisted(() => ({ calls: 0 }));
// the in-place writer re-reads the loaded module with the parser; the import does too, so the export is measured as a delta
vi.mock('@lib/import/formats/InStereo1Parser', async (importOriginal) => {
  const orig = await importOriginal<typeof import('@lib/import/formats/InStereo1Parser')>();
  return { ...orig, parseInStereo1File: (...a: Parameters<typeof orig.parseInStereo1File>) => { sentinel.calls++; return orig.parseInStereo1File(...a); } };
});

const PATH = 'public/data/songs/formats/fantasi8.is';
const NAME = 'fantasi8.is';

async function load(bytes?: Uint8Array): Promise<{ raw: Uint8Array; song: TrackerSong }> {
  const { parseModuleToSong } = await import('@lib/import/parseModuleToSong');
  const raw = new Uint8Array(readFileSync(join(process.cwd(), PATH)));
  const song = await parseModuleToSong(new File([new Uint8Array(bytes ?? raw)], NAME));
  return { raw, song };
}

async function exportOf(song: TrackerSong): Promise<{ bytes: Uint8Array; warnings: string[] }> {
  const { exportNativeSong } = await import('@lib/export/nativeExportRouter');
  const res = await exportNativeSong(song);
  if (!res) throw new Error('no native export');
  const d = res.data as Blob | Uint8Array;
  const bytes = d instanceof Uint8Array ? d : new Uint8Array(await d.arrayBuffer());
  return { bytes, warnings: res.warnings };
}

describe('InStereo! 1.0 native export: fantasi8.is', () => {
  it('exports byte-exact unedited, writes a note edit into the module by copy on write, re-imports it with nothing else moved', async () => {
    const { raw, song } = await load();
    expect(song.uadePatternLayout?.formatId).toBe('inStereo1');
    expect(raw.length).toBe(45656);
    const before = sentinel.calls;
    const same = await exportOf(song);
    expect(sentinel.calls).toBe(before + 1);
    expect(same.warnings).toEqual([]);
    expect(Array.from(same.bytes)).toEqual(Array.from(raw));

    // fantasi8.is: 204 positions x 4 voices read 288 track lines in 16-line runs; no line is read by one run only, so
    // every edit lands in a shared run and is copied (64 bytes) after the padding rows, which become rows, plus 64
    // new padding rows (256 bytes). The header's track row count (u16 @10) goes 288 -> 288 + 64 + 16.
    const p = song.patterns.findIndex((pat) => pat.channels[0].rows.some((c) => c.note > 0 && c.note < 90));
    const r = song.patterns[p].channels[0].rows.findIndex((c) => c.note > 0 && c.note < 90);
    const cell = song.patterns[p].channels[0].rows[r];
    const newNote = cell.note + 1;
    cell.note = newNote;
    const edited = await exportOf(song);
    expect(edited.warnings).toEqual([]);
    const posOff = 0x1100, trackOff = 0x1dc0, oldEnd = trackOff + (288 + 64) * 4;
    expect(edited.bytes.length).toBe(raw.length + 64 + 256);
    expect(edited.bytes[10] * 256 + edited.bytes[11]).toBe(288 + 64 + 16);
    // sections before the position table are the module's own, apart from the row count
    const head = (b: Uint8Array) => Array.from(b.subarray(0, posOff)).map((x, i) => (i === 10 || i === 11 ? 0 : x));
    expect(head(edited.bytes)).toEqual(head(raw));
    // the track as it was (rows and padding) is unchanged: the copy is the only place the edit went
    expect(Array.from(edited.bytes.subarray(trackOff, oldEnd))).toEqual(Array.from(raw.subarray(trackOff, oldEnd)));
    // sample data after the track is the module's own, moved by the growth
    expect(Array.from(edited.bytes.subarray(edited.bytes.length - (raw.length - oldEnd)))).toEqual(Array.from(raw.subarray(oldEnd)));

    const again = await load(edited.bytes);
    expect(again.song.patterns.length).toBe(song.patterns.length);
    song.patterns.forEach((pat, pi) => pat.channels.forEach((c, ci) => c.rows.forEach((was, ri) => {
      const now = again.song.patterns[pi].channels[ci].rows[ri];
      const orig = pi === p && ci === 0 && ri === r ? newNote : was.note;
      expect([now.note, now.instrument]).toEqual([orig, was.instrument]);
    })));
  }, 300000);
});
