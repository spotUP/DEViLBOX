/**
 * The Hippel grid shows the pitch the decoder plays, not the pattern note.
 *
 * Owner 2026-10-07, lethalxcess-intro.hip7: "bogus note data". A sound
 * sequence shifts or fixes the pitch of the notes it plays (18345 of 19017 in
 * that song), and the grid showed pattern note + step transpose. The decoder
 * (libtfmxaudiodecoder in the TFMX wasm) logs the pitch it looks up per note
 * start; the grid, built with the transposes it reports (hippelPlayedPitch),
 * must show exactly that, on every corpus .hip / .hip7. Notes below the
 * notation's C-0 (warp's bass) are shown in the octave below it (c_1..b_1, no
 * octave shift), not clamped to note 1, and editing a
 * cell sets the pattern note so the played pitch becomes the typed note.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { TrackerSong } from '@/engine/TrackerReplayer';
import type { TrackerCell } from '@/types';
import { parseJochenHippel7VFile } from '@/lib/import/formats/JochenHippel7VParser';
import { parseJochenHippelAmigaSogFile } from '@/lib/import/formats/JochenHippelSTParser';
import { hippelPlayedPitch } from '@/lib/import/formats/hippelPlayedPitch';
import { periodToPitch } from '@/lib/amiga/periodNotes';
import { isLowOctaveNote, noteValueToPitch, pitchToNoteValue } from '@/lib/tracker/noteValue';
import { rebuildHippelModule } from '@/engine/hippel/rebuildHippelModule';
import { loadTfmxWalkModule, HIPPEL_TFMX_CORPUS, type TfmxWalkHost } from './helpers/tfmxWalkHost';

const ROOT = join(process.cwd(), 'public/data/songs');
let host: TfmxWalkHost;
beforeAll(async () => { host = await loadTfmxWalkModule(); });

const walker = async (bytes: Uint8Array, subsong: number, ticks: number) => host.walk(bytes, subsong, ticks).records;

async function parsePlayed(rel: string, bytes: Uint8Array): Promise<TrackerSong> {
  const played = await hippelPlayedPitch(bytes, walker);
  expect(played, 'the decoder walked the song (sentinel)').not.toBeNull();
  expect(played!.size, 'the decoder reported note starts').toBeGreaterThan(200);
  const buffer = bytes.slice().buffer as ArrayBuffer;
  const name = rel.split('/').pop()!;
  return rel.endsWith('.hip7') ? parseJochenHippel7VFile(buffer, name, played!) : parseJochenHippelAmigaSogFile(buffer, name, played!);
}

/** Each note start of the first pass, with the grid cell it lands on: [step pattern, voice, row, record]. */
function noteStarts(song: TrackerSong, bytes: Uint8Array, ticks: number) {
  const records = host.walk(bytes, 0, ticks).records;
  const loads = records.filter((r) => r[1] === 0 && r[2] === 0);
  const passLen = loads.findIndex((r, i) => i > 0 && r[3] === loads[0][3]);
  const passEnd = loads[passLen][0];
  const rowOf = new Map<number, number[]>();
  const out: Array<{ pattern: number; voice: number; row: number; period: number; tick: number }> = [];
  const patternOfStep = new Map<number, number>();
  loads.slice(0, passLen).forEach((r, i) => patternOfStep.set(r[3], i));
  for (const r of records) {
    if (r[0] >= passEnd) break;
    if (r[1] === 1) rowOf.set(r[2], r);
    else if (r[1] === 2) {
      const read = rowOf.get(r[2])!;
      out.push({ pattern: patternOfStep.get(r[3])!, voice: r[2], row: read[4], period: r[5], tick: r[0] });
    }
  }
  expect(song.patterns.length).toBe(passLen);
  return out;
}

describe('Hippel grid note is the pitch the decoder plays', () => {
  it.each(HIPPEL_TFMX_CORPUS)('%s: every note start shows the played pitch (sound-sequence transposes and fixed pitches included)', async (rel) => {
    const bytes = new Uint8Array(readFileSync(join(ROOT, rel)));
    const song = await parsePlayed(rel, bytes);
    expect(song.gridUnmatchedReason).toBeUndefined();
    const starts = noteStarts(song, bytes, 30_000);
    expect(starts.length, 'note starts in the first pass').toBeGreaterThan(200);
    let moved = 0;
    for (const s of starts) {
      const cell = song.patterns[s.pattern].channels[s.voice].rows[s.row];
      // The pitch itself, no octave shift (owner decision 2026-10-07): the grid holds the octave below C-0
      expect(noteValueToPitch(cell.note), `${rel} pattern ${s.pattern} voice ${s.voice} row ${s.row} (period ${s.period})`).toBe(periodToPitch(s.period));
      if (cell.hippelSeq) moved++;
    }
    console.log(`[hippel played pitch] ${rel}: ${starts.length} note starts, ${moved} moved by a sound sequence`);
  }, 120_000);

  it('warp: notes below the notation range are shown at their own pitch, never clamped to C-0', async () => {
    const rel = 'hippel/warp (ingame 2).hip';
    const bytes = new Uint8Array(readFileSync(join(ROOT, rel)));
    const song = await parsePlayed(rel, bytes);
    const starts = noteStarts(song, bytes, 30_000);
    const below = starts.filter((s) => periodToPitch(s.period) < 1);
    expect(below.length, 'the song plays below C-0').toBeGreaterThan(100);
    const shown = new Set(below.map((s) => song.patterns[s.pattern].channels[s.voice].rows[s.row].note));
    expect(shown.size, 'distinct low pitches stay distinct').toBeGreaterThanOrEqual(3);
    // Shown in the octave below C-0 (c_1 .. b_1), not an octave up: every such cell is a low-octave value at its pitch
    for (const s of below) {
      const note = song.patterns[s.pattern].channels[s.voice].rows[s.row].note;
      expect(isLowOctaveNote(note), `pattern ${s.pattern} voice ${s.voice} row ${s.row}: ${note}`).toBe(true);
      expect(noteValueToPitch(note)).toBe(periodToPitch(s.period));
    }
    // and the notes at or above C-0 are not shifted either
    const above = starts.find((s) => periodToPitch(s.period) >= 1)!;
    expect(song.patterns[above.pattern].channels[above.voice].rows[above.row].note).toBe(periodToPitch(above.period));
  }, 120_000);

  it.each(HIPPEL_TFMX_CORPUS)('%s: typing a note into a cell makes the decoder play that note', async (rel) => {
    const bytes = new Uint8Array(readFileSync(join(ROOT, rel)));
    const song = await parsePlayed(rel, bytes);
    const starts = noteStarts(song, bytes, 30_000);
    // A sequence-pitched start (not fixed), where the song has one a plain start, and one in the octave below C-0
    // (warp); each one semitone up.
    const plain = (s: typeof starts[number]) => (song.patterns[s.pattern].channels[s.voice].rows[s.row].hippelSeq ?? 0) >= 0;
    const targets = [
      starts.find((s) => (song.patterns[s.pattern].channels[s.voice].rows[s.row].hippelSeq ?? 0) > 0),
      starts.find((s) => song.patterns[s.pattern].channels[s.voice].rows[s.row].hippelSeq === undefined),
      starts.find((s) => plain(s) && periodToPitch(s.period) < 0),
    ].filter((s): s is NonNullable<typeof s> => !!s);
    expect(targets.length, 'a start to edit').toBeGreaterThan(0);
    if (rel.startsWith('hippel/warp')) expect(targets.some((t) => periodToPitch(t.period) < 0), 'warp: an edit inside the octave below C-0').toBe(true);
    for (const t of targets) {
      const patterns = song.patterns.map((p) => ({ channels: p.channels.map((c) => ({ rows: c.rows.map((x): TrackerCell => ({ ...x })) })) }));
      const cell = patterns[t.pattern].channels[t.voice].rows[t.row];
      const typed = pitchToNoteValue(noteValueToPitch(cell.note)! + 1);
      cell.note = typed;
      const rebuilt = rebuildHippelModule(song.hippelFileData!, patterns, song.instruments.length)!;
      expect(rebuilt.refused, 'the edit has room').toEqual([]);
      expect(rebuilt.written).toBe(1);
      const after = host.walk(rebuilt.bytes, 0, t.tick + 2).records.find((r) => r[1] === 2 && r[0] === t.tick && r[2] === t.voice)!;
      expect(after, 'sentinel: the decoder started the note').toBeDefined();
      expect(pitchToNoteValue(periodToPitch(after[5])), `${rel}: the decoder now plays the typed note`).toBe(typed);
    }
  }, 120_000);
});
