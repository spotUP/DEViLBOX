/**
 * Jochen Hippel Amiga (.hip, 4 voices) and 7V (.hip7): the grid is what the
 * decoder plays, row by row, voice by voice; the playhead is the row sounding.
 *
 * The decoder is libtfmxaudiodecoder's HippelDecoder in the TFMX wasm, the
 * engine that plays both formats. Its walk export (tfmx_module_walk_*) logs
 * every step load and row read per voice with the tick, and the volume
 * sequence the note starts. The parsers (parseJochenHippelAmigaSogFile for
 * .hip, parseJochenHippel7VFile for .hip7) must give, for every corpus song:
 *   - one pattern per step the voices load, in the order they load them, with
 *     as many rows as the voices read in it (a break note ends a step early);
 *   - on every voice and row a note exactly where the voice reads a note, the
 *     instrument it starts, none where its note byte keeps the sound playing;
 *   - the speed the rows run at (initial speed, speed effect where it changes);
 *   - no cell for a row that holds no note;
 * and a song whose voices do not load their steps together opens in the scope
 * view with the reason (no guessed grid). The decoder's reported position
 * (tfmx_module_position, the playhead's source) maps through the cell spans
 * to the row the walk says voice 0 last read.
 * Run only through the parsers and the decoder, never through the walk module
 * the grid is built from: hippelTfmxWalkMatchesDecoder.test.ts holds that to
 * the decoder tick for tick.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { TrackerSong } from '@/engine/TrackerReplayer';
import { parseJochenHippel7VFile } from '@/lib/import/formats/JochenHippel7VParser';
import { parseJochenHippelAmigaSogFile } from '@/lib/import/formats/JochenHippelSTParser';
import { hippelGrid, hippelIndexToXm, hippelNoteIndex, readHippelTfmx } from '@/lib/import/formats/HippelTfmxWalk';
import { mapHippelCells, rebuildHippelModule } from '@/engine/hippel/rebuildHippelModule';
import { hippelRowAt } from '@/engine/hippel/hippelCellSpans';
import { loadTfmxWalkModule, HIPPEL_TFMX_CORPUS, type TfmxWalkHost } from './helpers/tfmxWalkHost';

const ROOT = join(process.cwd(), 'public/data/songs');
const TICKS = 30_000;

function parse(rel: string, bytes: Uint8Array): TrackerSong {
  const buffer = bytes.slice().buffer as ArrayBuffer;
  const name = rel.split('/').pop()!;
  return rel.endsWith('.hip7') ? parseJochenHippel7VFile(buffer, name) : parseJochenHippelAmigaSogFile(buffer, name);
}

let host: TfmxWalkHost;
beforeAll(async () => { host = await loadTfmxWalkModule(); });

/**
 * Hold the song's grid to the decoder's walk of the same bytes. Returns what
 * it checked, for the sentinel assertions.
 */
function holdGridToDecoder(rel: string, bytes: Uint8Array, song: TrackerSong): { notes: number; rows: number; patterns: number; rowCounts: number[] } {
  const m = readHippelTfmx(bytes)!;
  // Parsed without the decoder's sequence transposes: the pattern notes, an octave up when the song plays below C-0.
  const bias = hippelGrid(m, 0).bias;
  const { records, voices } = host.walk(bytes, 0, TICKS);
  expect(records.length, 'the decoder walk ran (sentinel)').toBeGreaterThan(1000);
  expect(song.numChannels).toBe(voices);

  const loads = records.filter((r) => r[1] === 0 && r[2] === 0);
  const first = loads[0];
  const passLen = loads.findIndex((r, i) => i > 0 && r[3] === first[3]);
  expect(passLen, 'the song loops within the walk').toBeGreaterThan(0);
  expect(song.patterns.length, `${rel}: one pattern per step the voices load`).toBe(passLen);
  expect(song.songPositions).toEqual(Array.from({ length: passLen }, (_, i) => i));

  // The pitch the decoder starts a note on, and the volume sequence, by tick and voice.
  const started = new Map<string, number[]>();
  for (const r of records) if (r[1] === 2) started.set(`${r[0]}:${r[2]}`, r);
  const reads = records.filter((r) => r[1] === 1);

  let notes = 0;
  let rowsChecked = 0;
  const rowCounts: number[] = [];
  let speed = song.initialSpeed;
  const durations: number[] = [];
  for (let k = 0; k < passLen; k++) {
    const t0 = loads[k][0];
    const t1 = loads[k + 1][0];
    const pattern = song.patterns[k];
    const rowsOfStep = reads.filter((r) => r[2] === 0 && r[0] >= t0 && r[0] < t1);
    rowCounts.push(rowsOfStep.length);
    expect(pattern.length, `${rel} step ${k}: rows the voices read`).toBe(rowsOfStep.length);
    for (let v = 0; v < voices; v++) {
      const own = reads.filter((r) => r[2] === v && r[0] >= t0 && r[0] < t1);
      expect(own.length, `${rel} step ${k} voice ${v} reads the same rows`).toBe(rowsOfStep.length);
      own.forEach((r, row) => {
        const cell = pattern.channels[v].rows[row];
        const where = `${rel} step ${k} voice ${v} row ${row}`;
        expect(r[4], `${where}: row index`).toBe(row);
        const noteByte = r[5];
        if ((noteByte & 0x7f) === 0) {
          expect([cell.note, cell.instrument], `${where}: no note read`).toEqual([0, 0]);
          expect(started.has(`${r[0]}:${v}`), `${where}: the decoder starts no note`).toBe(false);
        } else {
          const s = started.get(`${r[0]}:${v}`);
          expect(s, `${where}: the decoder starts the note`).toBeDefined();
          expect(cell.note, `${where}: the note the voice reads (note ${noteByte & 0x7f}, transpose ${r[7]})`)
            .toBe(hippelIndexToXm(hippelNoteIndex(noteByte & 0x7f, r[7]), bias));
          const sequence = s![9];
          expect(cell.instrument, `${where}: the volume sequence it starts`)
            .toBe((noteByte & 0x80) !== 0 ? 0 : sequence < m.nVolume ? sequence + 1 : 0);
          notes++;
        }
        rowsChecked++;
      });
    }
    // Row durations: speed effect where it changes.
    pattern.channels[0].rows.forEach((cell) => {
      if (cell.effTyp === 0x0f) speed = cell.eff;
      durations.push(speed);
    });
  }
  // The ticks between the voice 0 rows of the pass are the durations the grid's speeds give.
  const passReads = reads.filter((r) => r[2] === 0 && r[0] >= loads[0][0] && r[0] < loads[passLen][0]);
  expect(passReads.length).toBe(durations.length);
  for (let i = 0; i + 1 < passReads.length; i++) {
    expect(passReads[i + 1][0] - passReads[i][0], `${rel} row ${i}: ticks the row lasts`).toBe(durations[i]);
  }
  return { notes, rows: rowsChecked, patterns: passLen, rowCounts };
}

describe('Hippel Amiga TFMX grid is the decoder walk', () => {
  it.each(HIPPEL_TFMX_CORPUS)('%s: every step, row, note and instrument of every voice', (rel) => {
    const bytes = new Uint8Array(readFileSync(join(ROOT, rel)));
    const song = parse(rel, bytes);
    expect(song.gridUnmatchedReason).toBeUndefined();
    const done = holdGridToDecoder(rel, bytes, song);
    console.log(`[hippel grid] ${rel}: ${done.patterns} steps, rows per step ${[...new Set(done.rowCounts)].join('/')}, ${done.notes} notes over ${done.rows} voice rows`);
    expect(done.notes).toBeGreaterThan(200);
  }, 120_000);

  it.each(HIPPEL_TFMX_CORPUS)('%s: the reported position maps to the row voice 0 last read', (rel) => {
    const bytes = new Uint8Array(readFileSync(join(ROOT, rel)));
    const song = parse(rel, bytes);
    const spans = mapHippelCells(song.hippelFileData!, song.instruments.length)!;
    expect(spans.length, 'the cell spans the playhead maps through').toBe(song.patterns.length);
    const session = host.open(bytes, 0);
    let seen = 0;
    let firstStep = -1;
    let last: number[] | null = null;
    const rowsShown = new Set<string>();
    let from = 0;
    for (let block = 0; block < (44100 * 30) / 441; block++) {
      session.render(441);
      const fresh = session.records(from);
      from += fresh.length;
      for (const r of fresh) {
        if (r[1] === 0 && r[2] === 0 && firstStep < 0) firstStep = r[3];
        if (r[1] === 1 && r[2] === 0) last = r;
      }
      const pos = session.position();
      if (!pos || !last) continue;
      const row = hippelRowAt(spans, pos[0], pos[1]);
      expect(`${pos[0]}:${row}`, `block ${block}: reported position vs the row voice 0 last read`).toBe(`${last[3] - firstStep}:${last[4]}`);
      rowsShown.add(`${pos[0]}:${row}`);
      seen++;
    }
    expect(seen, 'positions checked (sentinel)').toBeGreaterThan(1000);
    expect(rowsShown.size, 'the playhead moved through the song').toBeGreaterThan(100);
  }, 120_000);

  it.each(HIPPEL_TFMX_CORPUS)('%s: an unedited grid writes the file back byte for byte; an edited note is the note the decoder then reads', (rel) => {
    const bytes = new Uint8Array(readFileSync(join(ROOT, rel)));
    const song = parse(rel, bytes);
    const same = rebuildHippelModule(song.hippelFileData!, song.patterns, song.instruments.length)!;
    expect(same.refused).toEqual([]);
    expect(same.written).toBe(0);
    expect(Buffer.from(same.bytes).equals(Buffer.from(bytes))).toBe(true);

    // The first row with a note on voice 1 (a note a step transpose can move up a tone).
    let at: [number, number, number] | null = null;
    song.patterns.forEach((pat, p) => pat.channels[1].rows.forEach((c, r) => {
      if (!at && c.note > 12 && c.note < 40 && c.instrument > 0) at = [p, r, c.note];
    }));
    expect(at, 'a row to edit').not.toBeNull();
    const [p, r, note] = at!;
    const edited = song.patterns.map((pat) => ({ channels: pat.channels.map((c) => ({ rows: c.rows.map((x) => ({ ...x })) })) }));
    edited[p].channels[1].rows[r].note = note + 2;
    const out = rebuildHippelModule(song.hippelFileData!, edited, song.instruments.length)!;
    expect(out.refused).toEqual([]);
    expect(out.written).toBeGreaterThan(0);
    // The decoder reads the edited byte on that row of that step, and the reparsed grid shows the note.
    const heard = parse(rel, out.bytes);
    expect(heard.patterns[p].channels[1].rows[r].note).toBe(note + 2);
    const walk = host.walk(out.bytes, 0, TICKS).records;
    const first = walk.find((x) => x[1] === 0 && x[2] === 0)![3];
    const row = walk.find((x) => x[1] === 1 && x[2] === 1 && x[3] === first + p && x[4] === r)!;
    const was = host.walk(bytes, 0, TICKS).records.find((x) => x[1] === 1 && x[2] === 1 && x[3] === first + p && x[4] === r)!;
    expect(row[5] & 0x7f, 'the note byte the decoder reads on that row').toBe((was[5] & 0x7f) + 2);
  }, 120_000);

  it('a break note ends a step early on every voice: the grid pattern is that short, as the decoder walks it', () => {
    const rel = 'hippel/warp (ingame 2).hip';
    const original = new Uint8Array(readFileSync(join(ROOT, rel)));
    const m = readHippelTfmx(original)!;
    const bytes = original.slice();
    // The break (note byte 1) on row 8 of every pattern: every step is 8 rows long, on every voice.
    for (let p = 0; p < m.nPatterns; p++) bytes[m.patternsOff + p * 0x40 + 8 * 2] = 1;
    const song = parse(rel, bytes);
    expect(song.gridUnmatchedReason).toBeUndefined();
    expect(song.patterns.every((p) => p.length === 8)).toBe(true);
    holdGridToDecoder(rel, bytes, song);
  }, 120_000);

  it('voices that leave a step on different rows have no pattern-per-step grid: the scope view, with the reason', () => {
    const rel = 'hippel/warp (ingame 2).hip';
    const original = new Uint8Array(readFileSync(join(ROOT, rel)));
    const m = readHippelTfmx(original)!;
    const bytes = original.slice();
    // A step where voices 0 and 1 read different patterns; the break goes into voice 1's only.
    let step = -1;
    for (let s = 0; s < m.nSteps && step < 0; s++) {
      if (original[m.trackOff + s * m.stepLen] !== original[m.trackOff + s * m.stepLen + m.columnSize]) step = s;
    }
    expect(step, 'the corpus has a step with different patterns on voices 0 and 1').toBeGreaterThanOrEqual(0);
    const p1 = original[m.trackOff + step * m.stepLen + m.columnSize];
    bytes[m.patternsOff + p1 * 0x40 + 8 * 2] = 1;
    const song = parse(rel, bytes);
    expect(song.gridUnmatchedReason).toMatch(/different rows/);
    expect(song.patterns.length).toBe(1);
    expect(song.patterns[0].channels.every((c) => c.rows.every((r) => r.note === 0))).toBe(true);
  });
});
