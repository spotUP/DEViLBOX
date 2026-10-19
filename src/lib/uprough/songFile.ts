/**
 * The Up Rough softsynth song file <-> DEViLBOX patterns + instruments (plan 2026-10-19 E1, D1-D5, E2 results).
 *
 *   parseSongFile(text)        read + validate, refusals by name (the same texts as tools/song_file.py)
 *   songFileToSong(doc)        file -> UpRoughSong: one Pattern per section, one channel per lane, instruments
 *   songToSongFile(song)       UpRoughSong -> file, refusing what schema 1 cannot hold
 *
 * Lossless: everything the grid cannot show (header, per-bar records, locked chops/scratch/vocals, the side table,
 * the song block, the generator) rides in `meta` and is written back verbatim. The grid owns only the cells and the
 * instruments. Editing rules for the side table live in songEdits.ts.
 */
import type { InstrumentConfig } from '@typedefs/instrument';
import type { ChannelData, Pattern, TrackerCell } from '@typedefs/tracker';
import { getSoftsynthVoice } from '@/engine/uprough/voiceRegistry';
import { voiceDefaults } from '@/engine/uprough/softsynthVoice';
import { INSERT_EFFECTS, INSERT_LABEL, insertKey } from '@/engine/uprough/effects/insertEffects';

export const FORMAT = 'uprough-softsynth-song';
export const SCHEMA = 1;
export const ROWS_PER_BAR = 16;
export const SONG_FILE_EXTENSION = '.uprough-song.json';

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export type JsonObject = { [key: string]: Json };

/** [note text, instrument number (1-based), volume 0-64, effect text or null] */
export type SongFileCell = [string, number, number, string | null];

export interface SongFileBar { drop: Json; fill: Json; bass: Json; melody: boolean; order: string[] }
export interface SongFileSection {
  id: string;
  header: JsonObject;
  lanes: Record<string, (SongFileCell | null)[]>;
  bars: SongFileBar[];
  locked: JsonObject;
}
export interface SongFileInstrument { name: string; voice: string; params: Record<string, number>; seed: number }
export type SideEntry = JsonObject;
export type SideTable = Record<string, Record<string, SideEntry>>;
export interface SongFileDoc {
  format: string;
  schema: number;
  generator: JsonObject;
  song: JsonObject;
  instruments: SongFileInstrument[];
  sections: SongFileSection[];
  order: number[];
  side: SideTable;
  bus: JsonObject;
}

/** What the grid cannot show: written back verbatim. */
export interface SongMeta {
  format: string;
  schema: number;
  generator: JsonObject;
  song: JsonObject;
  order: number[];
  side: SideTable;
  bus: JsonObject;
  /** Per section (same index as the patterns). */
  sections: { id: string; header: JsonObject; bars: SongFileBar[]; locked: JsonObject }[];
  /** The file's voice id of each instrument (same index as the instruments); see VOICE_TO_SOFTSYNTH. */
  fileVoices: string[];
}

export interface UpRoughSong { meta: SongMeta; patterns: Pattern[]; instruments: InstrumentConfig[] }

export class SongFileError extends Error {}

// --- lanes (D4) -----------------------------------------------------------------------------------------------

export const DRUM_LANES = ['kick', 'snare', 'clap', 'hat', 'perc1', 'perc2'] as const;
export const MELODY_LANES = ['melody1', 'melody2', 'melody3', 'melody4'] as const;
export const LANES = [...DRUM_LANES, 'bass', ...MELODY_LANES] as const;
export type Lane = typeof LANES[number];

export const LANE_LABEL: Record<Lane, string> = {
  kick: 'Kick', snare: 'Snare', clap: 'Clap', hat: 'Hat', perc1: 'Percussion 1', perc2: 'Percussion 2',
  bass: 'Bass', melody1: 'Melody 1', melody2: 'Melody 2', melody3: 'Melody 3', melody4: 'Melody 4',
};

export function laneOfChannel(ch: Pick<ChannelData, 'id' | 'name'>): Lane | undefined {
  return LANES.find((l) => l === ch.id) ?? LANES.find((l) => l === ch.name || LANE_LABEL[l] === ch.name);
}

// --- voices ----------------------------------------------------------------------------------------------------

/** The voice ids a song file may name (tools/song_file.py KNOWN_VOICES), in its order. */
export const FILE_VOICES = [
  'kick', 'snare', 'snare_accent', 'snare_ghost', 'clap', 'rim', 'tom', 'ch', 'oh', 'conga', 'cowbell', 'metal',
  'ride', 'shaker', 'tamb', 'bass808', 'melody',
] as const;

/**
 * File voice -> the softsynth voice that plays it. The file names the hiphop engine's voices; the softsynth registry
 * has its own ids. metal, shaker and tamb have no softsynth voice yet: they play as 'rim' (round trip is exact, the
 * preview sound is not).
 */
export const VOICE_TO_SOFTSYNTH: Record<string, string> = {
  kick: 'kick', snare: 'snare808', snare_accent: 'snare808', snare_ghost: 'snare808', clap: 'clap', rim: 'rim',
  tom: 'tom', ch: 'hatClosed', oh: 'hatOpen', conga: 'conga', cowbell: 'cowbell', metal: 'rim', ride: 'ride',
  shaker: 'rim', tamb: 'rim', bass808: 'bass808', melody: 'piano',
};

const BUS_OF_VOICE = (v: string): string => (v === 'bass808' ? 'bass' : v === 'melody' ? 'melody' : 'drums');

/** The file voice of an instrument: unchanged voice keeps the file's spelling, a changed one maps back by first match. */
function fileVoiceOf(config: string, previous: string | undefined): string | undefined {
  if (previous !== undefined && VOICE_TO_SOFTSYNTH[previous] === config) return previous;
  return FILE_VOICES.find((v) => VOICE_TO_SOFTSYNTH[v] === config);
}

// --- notes and cells ----------------------------------------------------------------------------------------------

const NOTE_NAMES = ['C-', 'C#', 'D-', 'D#', 'E-', 'F-', 'F#', 'G-', 'G#', 'A-', 'A#', 'B-'];
/** File note text -> DEViLBOX note value (1-96): C-4 is MIDI 48 and tracker note 49. */
export function noteFromText(text: string): number {
  const i = NOTE_NAMES.indexOf(text.slice(0, 2));
  const oct = Number(text.slice(2));
  if (i < 0 || !Number.isInteger(oct)) throw new SongFileError(`Note "${text}" is not a tracker note.`);
  return i + 12 * oct + 1;
}
export function noteToText(note: number): string {
  const m = note - 1;
  return `${NOTE_NAMES[m % 12]}${Math.floor(m / 12)}`;
}

const VOLUME_BASE = 0x10; // XM volume column: 0x10-0x50 = volume 0-64
const fxText = (t: number, e: number): string | null =>
  t === 0 && e === 0 ? null : t.toString(36).toUpperCase() + e.toString(16).toUpperCase().padStart(2, '0');
function fxParts(text: string | null): { effTyp: number; eff: number } {
  if (text === null) return { effTyp: 0, eff: 0 };
  const m = /^([0-9A-Z])([0-9A-F]{2})$/.exec(text);
  if (!m) throw new SongFileError(`Effect "${text}" is not an effect column text.`);
  return { effTyp: parseInt(m[1]!, 36), eff: parseInt(m[2]!, 16) };
}

export const emptyCell = (): TrackerCell => ({ note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 });
export const cellKey = (lane: string, row: number): string => `${lane}:${row}`;

/** Note delay EDx: effect type E, parameter Dx. */
export const hasNoteDelay = (c: TrackerCell): boolean => c.effTyp === 0xe && (c.eff >> 4) === 0xd;

// --- parse + validate (D1a) ----------------------------------------------------------------------------------------

const RENDER_PARAMS = [
  'section', 'sample', 'sample_age', 'stem', 'break_pitch', 'use_source_record', 'use_real_break',
  'real_break_kick_gain', 'real_break_lp', 'real_break_mode', 'vintage', 'scratch_cfg', 'melody_voice', 'use_trap808',
  'voice_cfg',
];
const TOP = ['format', 'schema', 'generator', 'song', 'instruments', 'sections', 'order', 'side', 'bus'];
const SONG = ['style', 'seed', 'key', 'rate', 'tier', 'bars', 'rows_per_bar', 'render', 'motif', 'chord_roots'];
const SECTION = ['id', 'header', 'lanes', 'bars', 'locked'];
const HEADER = ['style', 'section', 'bars', 'seed', 'drum_seed', 'bar_offset', 'fill_pending', 'carry_fill', 'layers', 'melody_from_bar'];
const BAR = ['drop', 'fill', 'bass', 'melody', 'order'];
const INSTRUMENT = ['name', 'voice', 'params', 'seed'];
const SIDE_KEYS = ['vel', 'role', 'hat', 'e808', 'dur'];

function checkKeys(obj: unknown, allowed: readonly string[], path: string): void {
  if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) {
    throw new SongFileError(`Field "${path}" in Up Rough song file schema ${SCHEMA} is not an object.`);
  }
  for (const k of Object.keys(obj)) {
    if (!allowed.includes(k)) throw new SongFileError(`Unknown field "${path ? `${path}.${k}` : k}" in Up Rough song file schema ${SCHEMA}.`);
  }
  for (const k of allowed) {
    if (!(k in obj)) throw new SongFileError(`Missing field "${path ? `${path}.${k}` : k}" in Up Rough song file schema ${SCHEMA}.`);
  }
}

const refuseNotSongFile = (v: unknown): never => {
  throw new SongFileError(`Not an Up Rough song file: format is "${typeof v === 'string' ? v : 'null'}", expected "${FORMAT}".`);
};

/** Read + validate. Same checks, same order and same texts as tools/song_file.py validate. */
export function parseSongFile(input: string | unknown): SongFileDoc {
  let value: unknown = input;
  if (typeof input === 'string') {
    try { value = JSON.parse(input); } catch { return refuseNotSongFile(null); }
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return refuseNotSongFile(null);
  const doc = value as Record<string, unknown>;
  if (doc.format !== FORMAT) return refuseNotSongFile(doc.format);
  if (typeof doc.schema !== 'number' || !Number.isInteger(doc.schema) || doc.schema > SCHEMA) {
    throw new SongFileError(`Up Rough song file schema ${String(doc.schema)} is newer than this reader (schema ${SCHEMA}). Update the maker / DEViLBOX.`);
  }
  if (doc.schema < SCHEMA) throw new SongFileError(`Up Rough song file schema ${doc.schema} has no migration to schema ${SCHEMA}.`);
  checkKeys(doc, TOP, '');
  const d = doc as unknown as SongFileDoc;
  checkKeys(d.song, SONG, 'song');
  checkKeys(d.song.render, RENDER_PARAMS, 'song.render');
  if (d.song.rows_per_bar !== ROWS_PER_BAR) throw new SongFileError(`rows_per_bar is ${JSON.stringify(d.song.rows_per_bar)}; schema 1 is 16 rows per bar.`);
  d.instruments.forEach((inst, i) => {
    checkKeys(inst, INSTRUMENT, `instruments[${i}]`);
    if (!(FILE_VOICES as readonly string[]).includes(inst.voice)) {
      throw new SongFileError(`Instrument ${i + 1} "${inst.name}" uses voice "${inst.voice}", which the softsynth does not have (known: ${FILE_VOICES.join(', ')}).`);
    }
    if (Object.keys(inst.params).length > 0 || inst.seed) {
      throw new SongFileError(`Instrument ${i + 1} "${inst.name}" sets params or a seed, which this renderer does not play yet.`);
    }
  });
  if (Object.keys(d.bus).length > 0) throw new SongFileError('The bus block is not rendered yet (E1 D6): it must be empty.');
  const ids = new Set<string>();
  d.sections.forEach((sec, si) => {
    const where = `sections[${si}]`;
    checkKeys(sec, SECTION, where);
    checkKeys(sec.header, HEADER, `${where}.header`);
    checkKeys(sec.locked, ['chops', 'scratch', 'vocals'], `${where}.locked`);
    ids.add(sec.id);
    const nrows = (sec.header.bars as number) * ROWS_PER_BAR;
    for (const [lane, cells] of Object.entries(sec.lanes)) {
      if (!(LANES as readonly string[]).includes(lane)) {
        throw new SongFileError(`Channel "${lane}" has notes but is not an Up Rough lane. Move them to a lane or clear the channel.`);
      }
      if (cells.length !== nrows) throw new SongFileError(`${sec.id} lane ${lane} has ${cells.length} rows, expected ${nrows}`);
      cells.forEach((cell, row) => {
        if (cell === null) return;
        const [, inst, , fx] = cell;
        if (!(inst >= 1 && inst <= d.instruments.length)) throw new SongFileError(`Cell ${lane}:${row} in ${sec.id} uses instrument ${inst}, which does not exist.`);
        if (fx !== null) throw new SongFileError(`Cell ${lane}:${row} in ${sec.id} has an effect; schema 1 renders no effect column.`);
      });
    }
    if (sec.bars.length !== sec.header.bars) throw new SongFileError(`${sec.id} has ${sec.bars.length} bar records, expected ${String(sec.header.bars)}`);
    sec.bars.forEach((bar, b) => checkKeys(bar, BAR, `${where}.bars[${b}]`));
  });
  for (const [sid, entries] of Object.entries(d.side)) {
    if (!ids.has(sid)) throw new SongFileError(`Side table names section "${sid}", which does not exist.`);
    for (const [cell, entry] of Object.entries(entries)) {
      if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) throw new SongFileError(`Side entry ${sid}.${cell} is not an object.`);
      for (const k of Object.keys(entry)) {
        if (!SIDE_KEYS.includes(k)) throw new SongFileError(`Unknown field "side.${sid}.${cell}.${k}" in Up Rough song file schema ${SCHEMA}.`);
      }
    }
  }
  for (const o of d.order) {
    if (!Number.isInteger(o) || o < 0 || o >= d.sections.length) throw new SongFileError(`Order entry ${JSON.stringify(o)} is not a section index.`);
  }
  return d;
}

// --- file -> song --------------------------------------------------------------------------------------------------

function importInstrument(inst: SongFileInstrument, index: number): InstrumentConfig {
  const voiceId = VOICE_TO_SOFTSYNTH[inst.voice]!;
  const voice = getSoftsynthVoice(voiceId);
  return {
    id: index + 1, name: inst.name, type: 'synth', synthType: 'UpRoughSoftsynth', effects: [], volume: -6, pan: 0,
    upRoughSoftsynth: { voice: voice ? voiceId : 'kick', params: { ...inst.params }, seed: inst.seed },
  } as InstrumentConfig;
}

function importChannel(lane: Lane, cells: (SongFileCell | null)[] | undefined, nrows: number): ChannelData {
  const rows: TrackerCell[] = [];
  for (let r = 0; r < nrows; r++) {
    const c = cells?.[r] ?? null;
    if (c === null) { rows.push(emptyCell()); continue; }
    const [note, inst, vol, fx] = c;
    rows.push({ ...emptyCell(), note: noteFromText(note), instrument: inst, volume: VOLUME_BASE + vol, ...fxParts(fx) });
  }
  return {
    id: lane, name: LANE_LABEL[lane], rows, muted: false, solo: false, collapsed: false, volume: 100, pan: 0,
    instrumentId: null, color: null,
  };
}

/** File -> patterns (one per section) + instruments, with the rest carried in `meta`. */
export function songFileToSong(doc: SongFileDoc): UpRoughSong {
  const d = structuredClone(doc);
  const patterns: Pattern[] = d.sections.map((sec) => {
    const nrows = (sec.header.bars as number) * ROWS_PER_BAR;
    return {
      id: sec.id, name: sec.id, length: nrows,
      channels: LANES.map((lane) => importChannel(lane, sec.lanes[lane], nrows)),
    };
  });
  return {
    meta: {
      format: d.format, schema: d.schema, generator: d.generator, song: d.song, order: d.order, side: d.side, bus: d.bus,
      sections: d.sections.map((s) => ({ id: s.id, header: s.header, bars: s.bars, locked: s.locked })),
      fileVoices: d.instruments.map((i) => i.voice),
    },
    patterns,
    instruments: d.instruments.map(importInstrument),
  };
}

// --- song -> file ------------------------------------------------------------------------------------------------

function checkInstrument(inst: InstrumentConfig, i: number, previous: string | undefined): string {
  const n = i + 1;
  if (inst.synthType !== 'UpRoughSoftsynth' || !inst.upRoughSoftsynth) {
    throw new SongFileError(`Instrument ${n} "${inst.name}" is ${inst.synthType}, not UpRoughSoftsynth. Up Rough songs play only softsynth voices: replace or remove it before export.`);
  }
  const cfg = inst.upRoughSoftsynth;
  const fileVoice = fileVoiceOf(cfg.voice, previous);
  if (fileVoice === undefined) {
    throw new SongFileError(`Instrument ${n} "${inst.name}" uses voice "${cfg.voice}", which the softsynth does not have (known: ${FILE_VOICES.join(', ')}).`);
  }
  for (const id of INSERT_EFFECTS) {
    if ((cfg.params[insertKey(id)] ?? 0) >= 0.5) {
      throw new SongFileError(`Instrument ${n} "${inst.name}" has its ${INSERT_LABEL[id]} insert on. Inserts are not part of the Up Rough mix: move it to the ${BUS_OF_VOICE(fileVoice)} bus or switch it off.`);
    }
  }
  const voice = getSoftsynthVoice(cfg.voice);
  const defaults = voice ? voiceDefaults(voice) : {};
  const changed = Object.entries(cfg.params).filter(([k, v]) => defaults[k] !== v);
  if (changed.length > 0 || cfg.seed) {
    throw new SongFileError(`Instrument ${n} "${inst.name}" sets params or a seed, which this renderer does not play yet.`);
  }
  return fileVoice;
}

const sideOf = (song: UpRoughSong, sid: string): Record<string, SideEntry> => song.meta.side[sid] ?? {};

/** Patterns + instruments -> file. Refuses by name what schema 1 cannot hold (D1a, D5). */
export function songToSongFile(song: UpRoughSong): SongFileDoc {
  const m = structuredClone(song.meta);
  const instruments: SongFileInstrument[] = song.instruments.map((inst, i) => ({
    name: inst.name, voice: checkInstrument(inst, i, m.fileVoices[i]), params: {}, seed: 0,
  }));
  const sections: SongFileSection[] = song.patterns.map((pat, si) => {
    const meta = m.sections[si];
    if (!meta) throw new SongFileError(`Pattern ${si} "${pat.name}" is not an Up Rough section.`);
    const side = sideOf(song, meta.id);
    const lanes: Record<string, (SongFileCell | null)[]> = {};
    pat.channels.forEach((ch, c) => {
      const lane = laneOfChannel(ch);
      const hasNotes = ch.rows.some((r) => r.note !== 0);
      if (lane === undefined) {
        if (hasNotes) throw new SongFileError(`Channel ${c + 1} "${ch.name}" has notes but is not an Up Rough lane. Move them to a lane or clear the channel.`);
        return;
      }
      const cells: (SongFileCell | null)[] = [];
      ch.rows.slice(0, pat.length).forEach((r, row) => {
        if (r.note === 0) { cells.push(null); return; }
        const key = cellKey(lane, row);
        const entry = side[key];
        if (hasNoteDelay(r) && entry && ('offset' in entry || 'e808' in entry || 'hat' in entry)) {
          throw new SongFileError(`Cell ${key} in ${meta.id} has both a note delay and an exact offset. Clear one.`);
        }
        if (r.note === 97) throw new SongFileError(`Cell ${key} in ${meta.id} is a note off; schema 1 has no note-off.`);
        if (r.instrument < 1 || r.instrument > instruments.length) throw new SongFileError(`Cell ${key} in ${meta.id} uses instrument ${r.instrument}, which does not exist.`);
        const vol = r.volume >= VOLUME_BASE && r.volume <= VOLUME_BASE + 64 ? r.volume - VOLUME_BASE : 64;
        cells.push([noteToText(r.note), r.instrument, vol, fxText(r.effTyp, r.eff)]);
      });
      if (cells.some((x) => x !== null)) lanes[lane] = cells;
    });
    return { id: meta.id, header: meta.header, lanes, bars: meta.bars, locked: meta.locked };
  });
  return {
    format: m.format, schema: m.schema, generator: m.generator, song: m.song, instruments, sections, order: m.order,
    side: m.side, bus: m.bus,
  };
}
