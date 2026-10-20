/**
 * Song file -> bar events: the input the softsynth song renderer plays (plan 2026-10-19 O6a).
 *
 * A port of tools/song_file.py to_events, field for field and in the same key order, so the host and DEViLBOX feed
 * one renderer the same numbers. A cell with no side entry renders with vel = volume / 64 and role "main". A side
 * value is the exact form of what its cell shows, so it wins only while the cell still shows it: once the volume or
 * the note in the grid is edited, the grid value renders (D5). That is how a tracker edit becomes audible without the
 * editor knowing the side table.
 */
import { roundHalfEven } from '@/engine/dj/scratch/scratchGrit';
import {
  DRUM_LANES, MELODY_LANES, ROWS_PER_BAR, SCHEMA, SongFileError, cellKey, parseSongFile,
  type Json, type JsonObject, type SongFileCell, type SongFileDoc, type SongFileSection,
} from './songFile';

/** hiphop.SONG_EVENTS_FORMAT: bump with the host when the events layout changes. */
export const SONG_EVENTS_FORMAT = 1;

const HAT_VOICES = ['ch', 'oh'];
const TONICS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const NOTE_NAMES = ['C-', 'C#', 'D-', 'D#', 'E-', 'F-', 'F#', 'G-', 'G#', 'A-', 'A#', 'B-'];

/** A plain drum hit: [voice, step, vel, role]. A hat hit is its side record with step and voice in front. */
export type DrumEvent = [string, number, number, string] | JsonObject;
export interface DrumBar { drop: Json; dev_merged: DrumEvent[]; fill: Json; hit_seed: number }
export interface BassBar { bev: Json }
/** One melody note: [midi, step, dur in rows]. */
export type MelodyNote = [number, number, number];
export interface BarEventsSection {
  header: JsonObject;
  drums: DrumBar[];
  bass: (BassBar | null)[];
  chops: Json;
  melody: (MelodyNote[] | null)[];
  scratch: Json;
  vocals: Json;
}
export interface BarEvents {
  format: number;
  params: JsonObject;
  sections: BarEventsSection[];
  melody: Json;
  chord_roots: Json;
  arrangement: [Json, Json, Json][];
  melody_windows: Json[];
}

/** Host numbering (song_file.note_name / note_midi): C-4 is MIDI 48. noteFromText is DEViLBOX's, one higher. */
export function hostNoteName(midi: number): string {
  const m = roundHalfEven(midi);
  return `${NOTE_NAMES[((m % 12) + 12) % 12]}${Math.floor(m / 12)}`;
}
export const hostNoteMidi = (name: string): number => NOTE_NAMES.indexOf(name.slice(0, 2)) + 12 * Number(name.slice(2));

const hitVol = (vel: number): number => roundHalfEven(vel * 64);
const hatVol = (vel: number): number => roundHalfEven((vel * 64) / 127);
const laneOf = (k: string): string => k.split(':')[0]!;
const rowOf = (k: string): number => Number(k.split(':')[1]);

/** The bar's cells as {"lane:row": cell}, every lane, rows counted from the section start. */
function barCells(sec: SongFileSection, b: number): Map<string, SongFileCell> {
  const out = new Map<string, SongFileCell>();
  for (const [lane, cells] of Object.entries(sec.lanes)) {
    for (let step = 0; step < ROWS_PER_BAR; step++) {
      const cell = cells[b * ROWS_PER_BAR + step];
      if (cell) out.set(cellKey(lane, b * ROWS_PER_BAR + step), cell);
    }
  }
  return out;
}

/** Cell keys of `lanes` in the bar's recorded order; cells added since (no order entry) follow in lane, then row order. */
function ordered(cells: Map<string, SongFileCell>, order: string[], lanes: readonly string[]): string[] {
  for (const k of order) if (!cells.has(k)) throw new SongFileError(`Bar order names cell ${k}, which is empty.`);
  const picked = order.filter((k) => lanes.includes(laneOf(k)));
  const rest = [...cells.keys()]
    .filter((k) => lanes.includes(laneOf(k)) && !order.includes(k))
    .sort((a, z) => lanes.indexOf(laneOf(a)) - lanes.indexOf(laneOf(z)) || rowOf(a) - rowOf(z));
  return [...picked, ...rest];
}

/** A bass side value's semitone, unless the grid note was edited: then the grid note renders (as a float, like the host). */
const bassSemi = (semi: number, note: string): number => (hostNoteName(36 + semi) !== note ? hostNoteMidi(note) - 36 : semi);

export function songFileToBarEvents(input: SongFileDoc): BarEvents {
  const doc = parseSongFile(input);
  const song = doc.song as Record<string, Json>;
  const key = song.key as { tonic: number; mode: string };
  const params: JsonObject = {
    style: song.style!, seed: song.seed!, bars: song.bars!, key: TONICS[key.tonic]! + (key.mode === 'minor' ? 'm' : ''),
    rate: song.rate!, tier: song.tier!, ...(song.render as JsonObject),
  };
  const sections: BarEventsSection[] = [];
  const arrangement: [Json, Json, Json][] = [];
  const windows: Json[] = [];
  for (const idx of doc.order) {
    const sec = doc.sections[idx]!;
    const side = doc.side[sec.id] ?? {};
    const { layers, melody_from_bar: fromBar, ...hdr } = sec.header;
    windows.push(fromBar!);
    arrangement.push([hdr.section!, hdr.bars!, layers!]);
    const drums: DrumBar[] = [];
    const bass: (BassBar | null)[] = [];
    const melody: (MelodyNote[] | null)[] = [];
    sec.bars.forEach((bar, b) => {
      const cells = barCells(sec, b);
      const at = (k: string): { cell: SongFileCell; step: number; e: JsonObject } =>
        ({ cell: cells.get(k)!, step: rowOf(k) - b * ROWS_PER_BAR, e: side[k] ?? {} });
      const dev: DrumEvent[] = [];
      for (const k of ordered(cells, bar.order, DRUM_LANES)) {
        const { cell: [, inst, vol], step, e } = at(k);
        const voice = doc.instruments[inst - 1]!.voice;
        if ('hat' in e && HAT_VOICES.includes(voice)) {
          const hat = { ...(e.hat as JsonObject) };
          if (hatVol(hat.vel as number) !== vol) hat.vel = roundHalfEven((vol * 127) / 64);
          dev.push({ step, voice, ...hat });
        } else {
          let vel = e.vel as number | undefined;
          if (vel === undefined || hitVol(vel) !== vol) vel = vol / 64;
          dev.push([voice, step, vel, (e.role as string | undefined) ?? 'main']);
        }
      }
      drums.push({ drop: bar.drop, dev_merged: dev, fill: bar.fill, hit_seed: (hdr.seed as number) + b });

      const bb = bar.bass as JsonObject | null;
      if (bb === null) {
        bass.push(null);
      } else if ('locked' in bb) { // files written before bass cells
        bass.push({ bev: bb.locked! });
      } else if ('voice' in bb) {
        const ev: Json[] = [];
        for (const k of ordered(cells, bar.order, ['bass'])) {
          const { cell: [note], step, e } = at(k);
          const eb = e.ebass as JsonObject | undefined;
          if (eb === undefined) throw new SongFileError(`Cell ${k} in ${sec.id} is a new bass note; schema ${SCHEMA} needs its timing in the side table.`);
          ev.push([bassSemi(eb.semi as number, note), step, eb.dur!, eb.glide!, eb.vel!]);
        }
        bass.push({ bev: ev });
      } else {
        const ev: Json[] = [];
        for (const k of ordered(cells, bar.order, ['bass'])) {
          const { cell: [note], step, e } = at(k);
          const e808 = e.e808 as JsonObject | undefined;
          // The 808 timing is the generator's (start, glide, length); there is no rule to derive it from a bare
          // tracker note yet, so refuse rather than guess (host to_events does the same).
          if (e808 === undefined) throw new SongFileError(`Cell ${k} in ${sec.id} is a new 808 note; schema ${SCHEMA} needs its timing in the side table.`);
          const n: JsonObject = { ...e808, step, bar: 0 };
          n.semi = bassSemi(n.semi as number, note);
          ev.push(n);
        }
        bass.push({ bev: { trap808: ev, profile: bb.profile!, root_semi: bb.root_semi! } });
      }

      if (bar.melody) {
        melody.push(ordered(cells, bar.order, MELODY_LANES).map((k): MelodyNote => {
          const { cell: [note], step, e } = at(k);
          return [hostNoteMidi(note), step, (e.dur as number | undefined) ?? 1];
        }));
      } else {
        melody.push(null);
      }
    });
    sections.push({
      header: hdr, drums, bass, chops: sec.locked.chops!, melody, scratch: sec.locked.scratch!, vocals: sec.locked.vocals!,
    });
  }
  return {
    format: SONG_EVENTS_FORMAT, params, sections, melody: song.motif!, chord_roots: song.chord_roots!,
    arrangement, melody_windows: windows,
  };
}
