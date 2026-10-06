/**
 * Digital Sonix & Chrome (DSC.*) codec: every byte of every corpus module is
 * decoded into the module model and written back verbatim, the grid covers
 * every track byte, and grid edits export to the right byte.
 *
 * Before 2026-10-06 the track block was read as 4-byte "sequence entries" laid
 * out as rows with the bytes stashed in invisible carriers: byte-exact, but no
 * cell held a note (0 notes in every file), and the entries, records and
 * subsongs were not decoded at all. The model and its layout are reversed from
 * DigitalSonixChrome_v1.asm (thoughts/shared/research/2026-10-06_digitalsonixchrome-format.md).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { parseDscFile } from '../DigitalSonixChromeParser';
import {
  decodeDscModule, encodeDscModule, dscSections, dscSubsongCount, dscSubsongEntries,
} from '../DigitalSonixChromeModule';
import { exportDigitalSonixChrome } from '@/lib/export/DigitalSonixChromeExporter';
import { periodToNote } from '@/lib/amiga/periodNotes';
import type { TrackerSong } from '@/engine/TrackerReplayer';

const ROOT = join(process.cwd(), 'public/data/songs');
const CORPUS = [
  ...readdirSync(join(ROOT, 'digital-sonix-and-chrome/David Hanlon')).filter((f) => f.endsWith('.dsc'))
    .map((f) => join('digital-sonix-and-chrome/David Hanlon', f)),
  "digital-sonix-and-chrome/dragon'sbreath ingame 1.dsc",
  "formats/dragon'sbreath_fanfares.dsc",
];

function load(rel: string): Uint8Array {
  return new Uint8Array(readFileSync(join(ROOT, rel)));
}
function parse(bytes: Uint8Array, name: string, subsong = 0): TrackerSong {
  return parseDscFile(bytes.slice().buffer as ArrayBuffer, name, subsong);
}

describe('Digital Sonix & Chrome module codec', () => {
  it('has the 14 corpus modules', () => {
    expect(CORPUS.length).toBe(14);
  });

  it.each(CORPUS)('%s: decode -> encode is byte-exact', (rel) => {
    const bytes = load(rel);
    expect([...encodeDscModule(decodeDscModule(bytes))]).toEqual([...bytes]);
  });

  it.each(CORPUS)('%s: the grid cells cover every track byte, once per (pattern,row,channel), and round-trip', (rel) => {
    const bytes = load(rel);
    const song = parse(bytes, rel);
    const layout = song.uadePatternLayout!;
    const { tracksOff, recordsOff } = dscSections(bytes);
    const covered = new Set<number>();
    song.patterns.forEach((pat, p) => {
      pat.channels.forEach((ch, c) => ch.rows.forEach((cell, r) => {
        const off = layout.getCellFileOffset!(p, r, c);
        expect(off).toBeGreaterThanOrEqual(tracksOff);
        expect(off).toBeLessThan(recordsOff);
        covered.add(off);
        expect(layout.encodeCell(cell)[0], `p${p} r${r} c${c}`).toBe(bytes[off]);
        expect(layout.encodeCell(layout.decodeCell!(bytes.subarray(off, off + 1)))[0]).toBe(bytes[off]);
      }));
      // Rows past the pattern's own length are not cells.
      expect(layout.getCellFileOffset!(p, pat.length, 0)).toBe(-1);
    });
    expect(covered.size).toBe(recordsOff - tracksOff);
  });

  it('a cell is a record trigger: note = the record period, instrument = record + 1, 0xFF = empty', () => {
    const bytes = load("digital-sonix-and-chrome/David Hanlon/dragon'sbreath demo 2.dsc");
    const m = decodeDscModule(bytes);
    const song = parse(bytes, 'demo 2.dsc');
    const layout = song.uadePatternLayout!;
    let notes = 0, empties = 0;
    song.patterns.forEach((pat, p) => pat.channels.forEach((ch, c) => ch.rows.forEach((cell, r) => {
      const b = bytes[layout.getCellFileOffset!(p, r, c)];
      if (b === 0xff) { expect(cell.note).toBe(0); empties++; return; }
      expect(cell.instrument).toBe(b + 1);
      expect(cell.note).toBe(periodToNote(m.records[b].period));
      notes++;
    })));
    expect(notes).toBeGreaterThan(1000);
    expect(empties).toBeGreaterThan(1000);
  });

  it('orders the entries of the chosen subsong, each `repeats` times, at the tempo word speed', () => {
    const bytes = load("formats/dragon'sbreath_fanfares.dsc");
    const m = decodeDscModule(bytes);
    // Entries: (0,1,64) (192,40,64) | (64,2,64) (192,40,64) | (128,2,64) (192,4,64) | (all zero)
    expect(dscSubsongCount(m)).toBe(4);
    expect(dscSubsongEntries(m, 3)).toEqual([]);
    const lengths = [0, 1, 2].map((s) => parse(bytes, 'fanfares.dsc', s).songPositions.length);
    expect(lengths).toEqual([41, 42, 6]);
    const s1 = parse(bytes, 'fanfares.dsc', 1);
    expect(s1.patterns[s1.songPositions[0]].name).toBe('Rows 64-127');
    expect(s1.initialSpeed).toBe(5); // tempo word 304: (152 + 1500) / 304
    expect(() => parse(bytes, 'fanfares.dsc', 3)).toThrow(/plays nothing/);
  });
});

describe('Digital Sonix & Chrome export', () => {
  const REL = "digital-sonix-and-chrome/David Hanlon/dragon'sbreath ingame 1.dsc";

  it('exports an unedited song as the original file', () => {
    const bytes = load(REL);
    expect([...exportDigitalSonixChrome(parse(bytes, 'ingame 1.dsc'))]).toEqual([...bytes]);
  });

  it('writes an edited cell to its track byte and nothing else', () => {
    const bytes = load(REL);
    const song = parse(bytes, 'ingame 1.dsc');
    const layout = song.uadePatternLayout!;
    const m = decodeDscModule(bytes);
    const rows = song.patterns[0].channels[2].rows;
    const r = rows.findIndex((c) => c.note > 0);
    const target = (rows[r].instrument % m.records.length); // another record (0-based index)
    rows[r] = { ...rows[r], instrument: target + 1, note: periodToNote(m.records[target].period), period: m.records[target].period };
    rows[r + 1] = { ...rows[r + 1], note: 0, instrument: 0 };
    const out = exportDigitalSonixChrome(song);
    const off = layout.getCellFileOffset!(0, r, 2);
    const diffs = [...out].flatMap((b, i) => (b !== bytes[i] ? [i] : []));
    const expected = [off];
    if (bytes[off + 1] !== 0xff) expected.push(off + 1);
    expect(diffs).toEqual(expected);
    expect(out[off]).toBe(target);
    if (expected.length === 2) expect(out[off + 1]).toBe(0xff);
  });

  it('a typed note on an instrument picks the record of the same sample at that pitch', () => {
    const bytes = load(REL);
    const m = decodeDscModule(bytes);
    const layout = parse(bytes, 'ingame 1.dsc').uadePatternLayout!;
    // Records 0..3 share one sample at four periods (428, 381, 359, 320).
    expect(new Set(m.records.slice(0, 4).map((r) => r.pcmOffset)).size).toBe(1);
    const note = periodToNote(m.records[2].period);
    expect(layout.encodeCell({ note, instrument: 1, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 })[0]).toBe(2);
    // A pitch no record of that sample plays keeps the instrument's own record.
    expect(layout.encodeCell({ note: 70, instrument: 1, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 })[0]).toBe(0);
    // Note-off and empty cells are "no trigger".
    expect(layout.encodeCell({ note: 97, instrument: 1, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 })[0]).toBe(0xff);
  });
});
