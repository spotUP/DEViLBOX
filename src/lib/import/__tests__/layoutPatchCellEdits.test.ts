/**
 * The formats that export through layoutPatch.patchModuleByLayout (Ems, Tomy, Fashion, David Hanney, StoneTracker): a note edit, an
 * instrument edit and an effect edit made in the grid on a real song's non-empty cell must be in the exported file, shown again when
 * the exported file is parsed. The carrier-byte bug class (GlueMon 8d9c49ca8): an encoder that returns stored bytes loses the edit.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { TrackerCell } from '@/types';
import type { TrackerSong } from '@/engine/TrackerReplayer';
import { parseEMSFile } from '@/lib/import/formats/EMSParser';
import { parseTomyTrackerFile } from '@/lib/import/formats/TomyTrackerParser';
import { parseFashionTrackerFile } from '@/lib/import/formats/FashionTrackerParser';
import { parseDavidHanneyFile } from '@/lib/import/formats/DavidHanneyParser';
import { parseStoneTrackerFile } from '@/lib/import/formats/StoneTrackerParser';
import { exportEms } from '@/lib/export/EmsExporter';
import { exportTomyTracker } from '@/lib/export/TomyTrackerExporter';
import { exportFashionTracker } from '@/lib/export/FashionTrackerExporter';
import { exportDavidHanney } from '@/lib/export/DavidHanneyExporter';
import { exportStoneTracker } from '@/lib/export/StoneTrackerExporter';
import { getCellFileOffset } from '@/engine/uade/UADEPatternEncoder';
import { baselineOf, setGridBaseline } from '@/lib/song/gridBaseline';

const SONGS = join(process.cwd(), 'public/data/songs');
const read = (dir: string, name: string): Uint8Array => new Uint8Array(readFileSync(join(SONGS, dir, name)));
const ab = (u: Uint8Array): ArrayBuffer => u.slice().buffer as ArrayBuffer;

interface Case {
  format: string;
  parse: () => TrackerSong;
  parseBytes: (b: Uint8Array) => TrackerSong;
  exp: (s: TrackerSong) => Promise<{ data: Uint8Array }>;
}

const stoneBank = read('stonetracker', 'hypnosphere.sps');
const CASES: Case[] = [
  { format: 'Ems (je taime.ems)', parse: () => parseEMSFile(ab(read('formats', 'je taime.ems')), 'je taime.ems'), parseBytes: (b) => parseEMSFile(ab(b), 'je taime.ems'), exp: exportEms },
  { format: 'Tomy (irrepressible intro.sg)', parse: () => parseTomyTrackerFile(ab(read('formats', 'irrepressible intro.sg')), 'irrepressible intro.sg'), parseBytes: (b) => parseTomyTrackerFile(ab(b), 'irrepressible intro.sg'), exp: exportTomyTracker },
  { format: 'Fashion (ivory tover ii.ex)', parse: () => parseFashionTrackerFile(ab(read('fashion-tracker', 'ivory tover ii.ex')), 'ivory tover ii.ex'), parseBytes: (b) => parseFashionTrackerFile(ab(b), 'ivory tover ii.ex'), exp: exportFashionTracker },
  { format: 'David Hanney (tearaway_thomas.dh)', parse: () => parseDavidHanneyFile(ab(read('formats', 'tearaway_thomas.dh')), 'tearaway_thomas.dh'), parseBytes: (b) => parseDavidHanneyFile(ab(b), 'tearaway_thomas.dh'), exp: exportDavidHanney },
  { format: 'StoneTracker (hypnosphere.spm)', parse: () => parseStoneTrackerFile(read('stonetracker', 'hypnosphere.spm'), 'hypnosphere.spm', stoneBank), parseBytes: (b) => parseStoneTrackerFile(b, 'hypnosphere.spm', stoneBank), exp: exportStoneTracker },
];

type Pos = { p: number; c: number; r: number };
/** The first cell that passes `want` and that the layout has a file place for. */
function findCell(song: TrackerSong, want: (cell: TrackerCell) => boolean): Pos | null {
  const layout = song.uadePatternLayout!;
  for (let p = 0; p < song.patterns.length; p++) {
    for (let c = 0; c < song.patterns[p].channels.length; c++) {
      const rows = song.patterns[p].channels[c].rows;
      for (let r = 0; r < rows.length; r++) {
        if (want(rows[r]) && getCellFileOffset(layout, p, r, c) >= 0) return { p, c, r };
      }
    }
  }
  return null;
}

const EDITS: Array<{ kind: string; want: (x: TrackerCell) => boolean; edit: (x: TrackerCell) => Partial<TrackerCell>; field: keyof TrackerCell }> = [
  { kind: 'note', want: (x) => x.note > 24 && x.note < 60, edit: (x) => ({ note: x.note + 1 }), field: 'note' },
  { kind: 'instrument', want: (x) => x.instrument > 0 && x.instrument < 15 && x.note > 24 && x.note < 60, edit: (x) => ({ instrument: x.instrument === 1 ? 2 : 1 }), field: 'instrument' },
  { kind: 'effect', want: (x) => x.effTyp > 0 && x.eff > 0, edit: (x) => ({ eff: x.eff ^ 1 }), field: 'eff' },
];

describe('layoutPatch callers: a grid edit reaches the exported file', () => {
  for (const cs of CASES) {
    for (const e of EDITS) {
      const has = findCell(cs.parse(), e.want) !== null;
      // A real song with no non-empty cell of this kind cannot show the edit: recorded as skipped (unverified), never faked.
      (has ? it : it.skip)(`${cs.format}: ${e.kind} edit survives export and re-parse${has ? '' : ' (no such cell in the real song: unverified)'}`, async () => {
        const song = cs.parse();
        const pos = findCell(song, e.want);
        const { p, c, r } = pos!;
        setGridBaseline(baselineOf(song.patterns));
        const cell = song.patterns[p].channels[c].rows[r];
        const next = { ...cell, ...e.edit(cell) };
        song.patterns[p].channels[c].rows[r] = next;
        const out = (await cs.exp(song)).data;
        setGridBaseline(null);
        const back = cs.parseBytes(out).patterns[p].channels[c].rows[r];
        expect(back[e.field]).toBe(next[e.field]);
        expect(back[e.field]).not.toBe(cell[e.field]);
      });
    }
  }
});
