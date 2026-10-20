/**
 * The Up Rough softsynth song file <-> DEViLBOX patterns + instruments (plan 2026-10-19 E1, D1-D5, E2 results).
 *
 *   parseSongFile(text)        read + validate, refusals by name (the same texts as tools/song_file.py)
 *   songFileToSong(doc)        file -> UpRoughSong: one Pattern per section, one channel per lane, instruments
 *   songToSongFile(song)       UpRoughSong -> file, refusing what the schema cannot hold
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
export const SCHEMA = 3;
/** Up Rough songs play at speed 6: 16 rows per bar, one row per 16th note (tools/song_file.py SPEED). */
export const SPEED = 6;
export const ROWS_PER_BAR = 16;
export const SONG_FILE_EXTENSION = '.uprough-song.json';
/** File picker filter. The macOS picker matches only the last extension segment, so a
 *  two-segment extension alone greys every song file out; '.json' keeps them selectable. */
export const SONG_FILE_ACCEPT = `${SONG_FILE_EXTENSION},.json`;

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
/** The style's GROOVE_TEMPLATES row (tools/hiphop.py), copied verbatim into song.groove; null when the style has none.
 *  TS has no style table, so only the shape is checked here; the host checks the value against its table. */
export interface SongFileGroove {
  swing: number;
  micro: { kick: number; snare: number; ch: number; ghost: number; perc: number; chop: number };
  vel: number;
}
export function songGroove(song: JsonObject): SongFileGroove | null {
  return song.groove as SongFileGroove | null;
}
/** The style's bass_cut (render_bass_bar's brightness multiplier), copied into song.bass_cut like the groove row. */
export function songBassCut(song: JsonObject): number {
  return song.bass_cut as number;
}

/** The style's resolved melody timbre (hiphop render_melody_bar: the render override, else the style's melody_voice), copied into song.melody_voice. */
export function songMelodyVoice(song: JsonObject): string {
  return song.melody_voice as string;
}

/** The style's bass_voice (render_bass_bar's voice), which the exporter writes into every non-808 bar as bass.voice;
 *  null when no bar plays the per-bar bass. */
export function songBassVoice(doc: { sections: { bars: { bass: Json }[] }[] }): string | null {
  for (const sec of doc.sections) {
    for (const bar of sec.bars) {
      const bb = bar.bass as JsonObject | null;
      if (bb !== null && typeof bb.voice === 'string') return bb.voice;
    }
  }
  return null;
}

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

/** The song's tempo and name: what the transport and the project metadata show (song.bpm / song.speed / song.name). */
export interface SongTempo { bpm: number; speed: number; name: string }
export interface UpRoughSong { meta: SongMeta; patterns: Pattern[]; instruments: InstrumentConfig[]; tempo: SongTempo }

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
  // BASS_VOICES, host order: the non-808 bass voices a style's bass_voice names ("808" is the plain sub, not bass808).
  '808', 'electro', 'reese', 'gfunk', 'sampled', 'electric', 'warmsub',
] as const;

/**
 * File voice -> the softsynth voice that plays it. The file names the hiphop engine's voices; the softsynth registry
 * has its own ids; every file voice has its own softsynth id (metal, shaker, tamb included), except the snare
 * family, which shares snare808.
 */
export const VOICE_TO_SOFTSYNTH: Record<string, string> = {
  kick: 'kick', snare: 'snare808', snare_accent: 'snare808', snare_ghost: 'snare808', clap: 'clap', rim: 'rim',
  tom: 'tom', ch: 'hatClosed', oh: 'hatOpen', conga: 'conga', cowbell: 'cowbell', metal: 'metal', ride: 'ride',
  shaker: 'shaker', tamb: 'tamb', bass808: 'bass808', melody: 'piano',
  '808': 'bassVoice808', electro: 'bassElectro', reese: 'bassReese', gfunk: 'bassGfunk', sampled: 'bassSampled',
  electric: 'bassElectric', warmsub: 'bassWarmsub',
};

/**
 * The header's melody timbre (song.melody_voice) -> the softsynth voice the file voice "melody" plays. The host
 * renders an unknown timbre as pluck; TS keeps no copy of the host STYLES table, so an unknown timbre is refused.
 */
export const MELODY_TIMBRE_SOFTSYNTH: Record<string, string> = {
  piano: 'piano', epiano: 'melodyEpiano', bell: 'melodyBell', fmbell: 'melodyFmbell', darkbell: 'melodyDarkbell',
  whistle: 'melodyWhistle', lead: 'melodyLead',
};

/** The softsynth voice a file voice plays; "melody" follows the header's timbre. */
export function softsynthOfFileVoice(fileVoice: string, melodyTimbre: string): string | undefined {
  return fileVoice === 'melody' ? MELODY_TIMBRE_SOFTSYNTH[melodyTimbre] : VOICE_TO_SOFTSYNTH[fileVoice];
}

const BASS_FILE_VOICES: readonly string[] = ['808', 'electro', 'reese', 'gfunk', 'sampled', 'electric', 'warmsub'];

const BUS_OF_VOICE = (v: string): string => (v === 'bass808' || BASS_FILE_VOICES.includes(v) ? 'bass' : v === 'melody' ? 'melody' : 'drums');

/** The file voice of an instrument: unchanged voice keeps the file's spelling, a changed one maps back by first match. */
function fileVoiceOf(config: string, previous: string | undefined, melodyTimbre: string): string | undefined {
  if (previous !== undefined && softsynthOfFileVoice(previous, melodyTimbre) === config) return previous;
  return FILE_VOICES.find((v) => softsynthOfFileVoice(v, melodyTimbre) === config);
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
const SONG = ['name', 'style', 'seed', 'key', 'bpm', 'speed', 'groove', 'bass_cut', 'melody_voice', 'rate', 'tier', 'bars', 'rows_per_bar', 'render', 'motif', 'chord_roots'];
const GROOVE = ['swing', 'micro', 'vel'];
const GROOVE_MICRO = ['kick', 'snare', 'ch', 'ghost', 'perc', 'chop'];
const SECTION = ['id', 'header', 'lanes', 'bars', 'locked'];
const HEADER = ['style', 'section', 'bars', 'seed', 'drum_seed', 'bar_offset', 'fill_pending', 'carry_fill', 'layers', 'melody_from_bar'];
const BAR = ['drop', 'fill', 'bass', 'melody', 'order'];
const INSTRUMENT = ['name', 'voice', 'params', 'seed'];
const SIDE_KEYS = ['vel', 'role', 'hat', 'e808', 'dur', 'ebass'];

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

const EBASS = ['semi', 'dur', 'glide', 'vel'];

/** A non-808 bass note's own numbers (host: render_bass_bar's (semi, step, dur_steps, glide, vel) minus the step, which is the cell row). */
function checkEbass(e: unknown, path: string): void {
  checkKeys(e, EBASS, path);
  const o = e as Record<string, unknown>;
  for (const k of ['semi', 'dur', 'vel']) {
    if (typeof o[k] !== 'number' || !Number.isFinite(o[k])) throw new SongFileError(`Field "${path}.${k}" in Up Rough song file schema ${SCHEMA} is not a number.`);
  }
  if (o.glide !== null && (typeof o.glide !== 'number' || !Number.isFinite(o.glide))) {
    throw new SongFileError(`Field "${path}.glide" in Up Rough song file schema ${SCHEMA} is not a number or null.`);
  }
}

const HAT = ['kind', 'vel', 'micro_ms', 'sub'];
const E808 = ['start_s', 'dur_s', 'semi', 'slide', 'role', 'kind'];

/** Each named field of `o` must hold `kind`: a finite number, text, true/false or a list. */
function checkFields(o: Record<string, unknown>, keys: readonly string[], kind: 'number' | 'string' | 'boolean' | 'array', path: string): void {
  for (const k of keys) {
    const v = o[k];
    const ok = kind === 'number' ? typeof v === 'number' && Number.isFinite(v)
      : kind === 'array' ? Array.isArray(v) : typeof v === kind;
    if (!ok) throw new SongFileError(`Field "${path}.${k}" in Up Rough song file schema ${SCHEMA} is not ${kind === 'number' ? 'a number' : kind === 'string' ? 'text' : kind === 'boolean' ? 'true or false' : 'a list'}.`);
  }
}

/** One side entry: the drum hit's vel / role, the melody note's dur, a hat's own record, an 808 note's timing, a bass note's numbers.
 *  Host validate() checks none of these past the key names; songFileToBarEvents reads every one, so a wrong type is refused here. */
function checkSideEntry(entry: Record<string, unknown>, path: string): void {
  for (const k of Object.keys(entry)) {
    if (!SIDE_KEYS.includes(k)) throw new SongFileError(`Unknown field "${path}.${k}" in Up Rough song file schema ${SCHEMA}.`);
  }
  if ('vel' in entry) checkFields(entry, ['vel'], 'number', path);
  if ('role' in entry) checkFields(entry, ['role'], 'string', path);
  if ('dur' in entry) {
    const dur = entry.dur;
    if (typeof dur !== 'number' || !Number.isInteger(dur) || dur < 1) throw new SongFileError(`Field "${path}.dur" in Up Rough song file schema ${SCHEMA} is not a whole number of rows.`);
  }
  if ('hat' in entry) {
    const p = `${path}.hat`;
    checkKeys(entry.hat, HAT, p);
    const h = entry.hat as Record<string, unknown>;
    checkFields(h, ['vel', 'micro_ms'], 'number', p);
    checkFields(h, ['kind'], 'string', p);
    checkFields(h, ['sub'], 'array', p);
  }
  if ('e808' in entry) {
    const p = `${path}.e808`;
    checkKeys(entry.e808, E808, p);
    const e = entry.e808 as Record<string, unknown>;
    checkFields(e, ['start_s', 'dur_s', 'semi'], 'number', p);
    checkFields(e, ['slide'], 'boolean', p);
    checkFields(e, ['role', 'kind'], 'string', p);
  }
  if ('ebass' in entry) checkEbass(entry.ebass, `${path}.ebass`);
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
  if (d.song.groove !== null) {
    const g = d.song.groove as Record<string, unknown>;
    checkKeys(g, GROOVE, 'song.groove');
    checkKeys(g.micro, GROOVE_MICRO, 'song.groove.micro');
    const m = g.micro as Record<string, unknown>;
    for (const [k, v] of [['swing', g.swing], ['vel', g.vel], ...GROOVE_MICRO.map((r) => [`micro.${r}`, m[r]] as const)] as const) {
      if (typeof v !== 'number' || !Number.isFinite(v)) throw new SongFileError(`Song groove field "${k}" is ${JSON.stringify(v)}, not a number.`);
    }
  }
  if (typeof d.song.bass_cut !== 'number' || !Number.isFinite(d.song.bass_cut) || d.song.bass_cut <= 0) throw new SongFileError(`Song field "bass_cut" is ${JSON.stringify(d.song.bass_cut)}, not a positive number.`);
  if (typeof d.song.melody_voice !== 'string' || !(d.song.melody_voice in MELODY_TIMBRE_SOFTSYNTH)) throw new SongFileError(`Song field "melody_voice" is ${JSON.stringify(d.song.melody_voice)}, not a melody timbre the softsynth has (known: ${Object.keys(MELODY_TIMBRE_SOFTSYNTH).join(', ')}).`);
  if (d.song.rows_per_bar !== ROWS_PER_BAR) throw new SongFileError(`rows_per_bar is ${JSON.stringify(d.song.rows_per_bar)}; schema ${SCHEMA} is 16 rows per bar.`);
  if (typeof d.song.name !== 'string') throw new SongFileError(`Song name ${JSON.stringify(d.song.name)} is not text.`);
  if (d.song.speed !== SPEED) throw new SongFileError(`Song speed is ${JSON.stringify(d.song.speed)}; Up Rough songs play at speed 6 (16 rows per bar).`);
  if (typeof d.song.bpm !== 'number' || !Number.isInteger(d.song.bpm) || d.song.bpm <= 0) throw new SongFileError(`Song tempo is ${JSON.stringify(d.song.bpm)} BPM; the ${String(d.song.style)} style renders at a whole number of BPM.`);
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
        if (fx !== null) throw new SongFileError(`Cell ${lane}:${row} in ${sec.id} has an effect; schema ${SCHEMA} renders no effect column.`);
      });
    }
    if (sec.bars.length !== sec.header.bars) throw new SongFileError(`${sec.id} has ${sec.bars.length} bar records, expected ${String(sec.header.bars)}`);
    sec.bars.forEach((bar, b) => checkKeys(bar, BAR, `${where}.bars[${b}]`));
  });
  for (const [sid, entries] of Object.entries(d.side)) {
    if (!ids.has(sid)) throw new SongFileError(`Side table names section "${sid}", which does not exist.`);
    for (const [cell, entry] of Object.entries(entries)) {
      if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) throw new SongFileError(`Side entry ${sid}.${cell} is not an object.`);
      checkSideEntry(entry as Record<string, unknown>, `side.${sid}.${cell}`);
    }
  }
  for (const o of d.order) {
    if (!Number.isInteger(o) || o < 0 || o >= d.sections.length) throw new SongFileError(`Order entry ${JSON.stringify(o)} is not a section index.`);
  }
  return d;
}

// --- file -> song --------------------------------------------------------------------------------------------------

function importInstrument(inst: SongFileInstrument, index: number, melodyTimbre: string): InstrumentConfig {
  const voiceId = softsynthOfFileVoice(inst.voice, melodyTimbre)!;
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
    channelMeta: { importedFromMOD: false, alwaysShow: true },
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
    instruments: d.instruments.map((inst, i) => importInstrument(inst, i, songMelodyVoice(d.song))),
    tempo: { bpm: d.song.bpm as number, speed: d.song.speed as number, name: d.song.name as string },
  };
}

// --- song -> file ------------------------------------------------------------------------------------------------

function checkInstrument(inst: InstrumentConfig, i: number, previous: string | undefined, melodyTimbre: string): string {
  const n = i + 1;
  if (inst.synthType !== 'UpRoughSoftsynth' || !inst.upRoughSoftsynth) {
    throw new SongFileError(`Instrument ${n} "${inst.name}" is ${inst.synthType}, not UpRoughSoftsynth. Up Rough songs play only softsynth voices: replace or remove it before export.`);
  }
  const cfg = inst.upRoughSoftsynth;
  const fileVoice = fileVoiceOf(cfg.voice, previous, melodyTimbre);
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

const TIMBRE_OF_SOFTSYNTH: Record<string, string> = Object.fromEntries(
  Object.entries(MELODY_TIMBRE_SOFTSYNTH).map(([timbre, id]) => [id, timbre]),
);

/**
 * The melody timbre the instruments play (O5b10): a melody instrument swapped to another timbre rewrites the header,
 * so the host renders the swapped timbre. One timbre per song (the host renders one melody_voice); no melody
 * instrument keeps the header's.
 */
function melodyTimbreOf(song: UpRoughSong, header: string): string {
  const timbres = new Set<string>();
  for (const inst of song.instruments) {
    const timbre = TIMBRE_OF_SOFTSYNTH[inst.upRoughSoftsynth?.voice ?? ''];
    if (timbre !== undefined) timbres.add(timbre);
  }
  if (timbres.size > 1) {
    throw new SongFileError(`The melody instruments play ${[...timbres].join(', ')}; an Up Rough song renders one melody timbre. Give them the same voice.`);
  }
  return [...timbres][0] ?? header;
}

const sideOf = (song: UpRoughSong, sid: string): Record<string, SideEntry> => song.meta.side[sid] ?? {};

/** Patterns + instruments -> file. Refuses by name what the schema cannot hold (D1a, D5). */
export function songToSongFile(song: UpRoughSong): SongFileDoc {
  const m = structuredClone(song.meta);
  const fileBpm = m.song.bpm as number;
  if (song.tempo.bpm !== fileBpm) {
    throw new SongFileError(`Tempo changed from ${fileBpm} to ${song.tempo.bpm} BPM; the ${String(m.song.style)} style renders at ${fileBpm} BPM.`);
  }
  if (song.tempo.speed !== SPEED) {
    throw new SongFileError(`Speed changed to ${song.tempo.speed}; Up Rough songs play at speed 6 (16 rows per bar).`);
  }
  m.song.name = song.tempo.name;
  const timbre = melodyTimbreOf(song, songMelodyVoice(m.song));
  if (timbre !== songMelodyVoice(m.song)) {
    m.song.melody_voice = timbre;
    (m.song.render as JsonObject).melody_voice = timbre;
  }
  const instruments: SongFileInstrument[] = song.instruments.map((inst, i) => ({
    name: inst.name, voice: checkInstrument(inst, i, m.fileVoices[i], timbre), params: {}, seed: 0,
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
        if (r.note === 97) throw new SongFileError(`Cell ${key} in ${meta.id} is a note off; schema ${SCHEMA} has no note-off.`);
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
