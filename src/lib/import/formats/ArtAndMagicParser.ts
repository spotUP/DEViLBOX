/**
 * ArtAndMagicParser.ts - Art and Magic (.aam) module layout and note-stream codec. Layout from nuade
 * players/artandmagic/artandmagic.c (locate_layout, next_track_entry, read_note).
 *
 * An .aam file is a relocatable 68k program: driver code, song tables, 8SVX sample forms. The table addresses come
 * from the driver's pc-relative `lea` instructions; stored addresses are of the original link and map to file
 * offsets through the relocation origin (A - word at origin + instruments).
 *
 * The editable grid follows docs/FORMAT_COMMAND_STREAM_GRID.md: the note streams are variable-length per-voice command
 * streams, so each used pattern's bytes are a file pattern whose carrier rows (blockRows) hold them byte-exact (one
 * byte per row: cutoff = 1, period = byte, the Rob Hubbard carrier fields), and the display is a step grid of the three
 * voices' first pass through their track lists (one row per step; every step is swing + 1 = 3 ticks in the known
 * modules, hence speed 3). `noteBytes` pair each note cell with the byte that names its note, so a same-length note
 * edit is written in place (ArtAndMagicExporter.ts). Playback stays UADE.
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { InstrumentConfig, Pattern, TrackerCell } from '@/types';
import type { UADEVariablePatternLayout } from '@/engine/uade/UADEPatternEncoder';
import { periodToGridNote } from '@/lib/amiga/periodNotes';
import { artAndMagicEncoder } from '@/engine/uade/encoders/ArtAndMagicEncoder';

const LEA_PC_MASK = 0xf1ff;
const LEA_PC_OPCODE = 0x41fa;
const BUILD_MARK_OFFSET = 0x20e;
const BUILD_MARK = 0x01020408;
const VOICE_TABLE_ENTRY_SIZE = 8;
const VOICE_TABLE_ENTRIES = 5;
const ORIGIN_BEFORE_INSTRUMENTS = 9;
const PITCH_SEQS = 32;

/** Note-stream bytes (artandmagic.c NoteByte_*). Below 0x60 a byte is a note. */
export const AAM_PITCH_SEQ = 0x60;
export const AAM_DURATION = 0x80;
export const AAM_INSTRUMENT = 0xc0;
export const AAM_REST = 0xf0;
export const AAM_LEGATO = 0xfb;
export const AAM_LEVEL = 0xfc;
export const AAM_PORTAMENTO = 0xfd;
export const AAM_STOP = 0xfe;
export const AAM_PATTERN_END = 0xff;

export interface AamLayout {
  firstForm: number;
  sampleTable: number;
  voiceTable: number;
  firstNote: number;
  instruments: number;
  periods: number;
  patterns: number;
  pitchSeqs: number;
  origin: number;
  pointersEnd: number;
}

// lea site of each field in the first and the second driver build (artandmagic.c s_layout_sites).
const SITES: [keyof AamLayout, number, number][] = [
  ['firstForm', 0x0a, 0x0a],
  ['sampleTable', 0x12, 0x12],
  ['voiceTable', 0xe0, 0xe0],
  ['firstNote', 0xfc, 0xfc],
  ['instruments', 0x15c, 0x15c],
  ['periods', 0x39e, 0x3a0],
  ['patterns', 0x472, 0x476],
  ['pitchSeqs', 0x4e4, 0x4e8],
];

const rd16 = (b: Uint8Array, o: number): number => (o >= 0 && o + 1 < b.length ? (b[o] << 8) | b[o + 1] : 0);
const rd32 = (b: Uint8Array, o: number): number => ((rd16(b, o) << 16) | rd16(b, o + 2)) >>> 0;

/** The table addresses, or null when no known driver build fits. */
export function locateAamLayout(b: Uint8Array): AamLayout | null {
  const build = rd32(b, BUILD_MARK_OFFSET) === BUILD_MARK ? 1 : 0;
  const l = {} as AamLayout;
  for (const [field, s0, s1] of SITES) {
    const site = build ? s1 : s0;
    if ((rd16(b, site) & LEA_PC_MASK) !== LEA_PC_OPCODE) return null;
    const target = site + 2 + ((rd16(b, site + 2) << 16) >> 16);
    if (target < 0 || target >= b.length) return null;
    l[field] = target;
  }
  l.origin = l.instruments - ORIGIN_BEFORE_INSTRUMENTS;
  if (l.instruments < ORIGIN_BEFORE_INSTRUMENTS || l.origin < l.patterns
    || l.patterns !== l.voiceTable + VOICE_TABLE_ENTRY_SIZE * VOICE_TABLE_ENTRIES) return null;
  l.pointersEnd = l.patterns + 4 * (((l.origin - l.patterns) >> 2) + 1);
  if (l.pitchSeqs < l.patterns || l.pitchSeqs + 4 * PITCH_SEQS > l.pointersEnd) return null;
  return l;
}

/** File offset of the stored (unrelocated) address at `at`. */
export function aamPointer(b: Uint8Array, l: AamLayout, at: number): number {
  return (rd32(b, at) - rd32(b, l.origin) + l.instruments) >>> 0;
}

export interface AamTrackEntry {
  /** File offset of the entry's first byte. */
  offset: number;
  noteBase?: number;
  instrumentBase?: number;
  repeats: number;
  pattern: number;
}

/** A voice's track list (channels 1..3), up to its loop byte (0xFF + restart offset). */
export function readAamTrackList(b: Uint8Array, l: AamLayout, channel: number): AamTrackEntry[] {
  let pos = aamPointer(b, l, l.voiceTable + VOICE_TABLE_ENTRY_SIZE * channel);
  const out: AamTrackEntry[] = [];
  while (pos < b.length && b[pos] !== 0xff) {
    const e: AamTrackEntry = { offset: pos, repeats: 0, pattern: 0 };
    let x = b[pos++];
    if (x >= 0x80) { e.noteBase = x & 0x7f; x = b[pos++]; }
    if (x >= 0x70) { e.instrumentBase = x & 0xf; x = b[pos++]; }
    if (x >= 0x60) { e.repeats = x & 0xf; x = b[pos++]; }
    e.pattern = x;
    out.push(e);
  }
  return out;
}

/** Bytes of the note-stream command at `pos`: the wire grammar, one place. */
export function aamCommandLen(b: Uint8Array, pos: number): number {
  const x = b[pos];
  if (x === AAM_PORTAMENTO) return 4; // params (speed << 4 | start step), from note, to note
  if (x === AAM_LEVEL) return 2;
  return 1;
}

export interface AamCommand { offset: number; bytes: number[] }

/** A pattern's note stream as commands, to and including its 0xFF / 0xFE terminator. Null when it runs off the file. */
export function splitAamPattern(b: Uint8Array, start: number): AamCommand[] | null {
  const out: AamCommand[] = [];
  let pos = start;
  while (pos < b.length) {
    const len = aamCommandLen(b, pos);
    if (pos + len > b.length) return null;
    out.push({ offset: pos, bytes: Array.from(b.subarray(pos, pos + len)) });
    const x = b[pos];
    pos += len;
    if (x === AAM_PATTERN_END || x === AAM_STOP) return out;
  }
  return null;
}

/** Concatenated command bytes: the encoder side of the carrier codec. */
export function encodeAamCommands(cmds: AamCommand[]): Uint8Array {
  return Uint8Array.from(cmds.flatMap((c) => c.bytes));
}

/** Indices of the patterns the three voices' track lists use, ascending. */
export function aamUsedPatterns(b: Uint8Array, l: AamLayout): number[] {
  const used = new Set<number>();
  for (let ch = 1; ch <= 3; ch++) for (const e of readAamTrackList(b, l, ch)) used.add(e.pattern);
  return [...used].sort((x, y) => x - y);
}

/** File offset of pattern `index`'s note stream. */
export function aamPatternOffset(b: Uint8Array, l: AamLayout, index: number): number {
  return aamPointer(b, l, l.patterns + 4 * index);
}

/** Entries of the period table (artandmagic.c period_at; measured: 96 words, a 0 word after the last). */
export const AAM_PERIODS = 96;

/** Grid note of table index `index`, 0 when outside the table. */
export function aamIndexNote(b: Uint8Array, l: AamLayout, index: number): number {
  return index >= 0 && index < AAM_PERIODS ? periodToGridNote(rd16(b, l.periods + 2 * index)) : 0;
}

export interface AamEvent {
  /** Step at which the event starts. */
  step: number;
  /** Grid note (a replayed note repeats the previous one), NOTE_OFF for a rest. */
  note: number;
  instrument: number;
  /** File offset of the byte naming the note (a note, or a portamento's from-note); -1 for a replay or a rest. */
  offset: number;
}

const NOTE_OFF = 97;
const ROWS_PER_PATTERN = 64;
const NUM_CHANNELS = 4;
const MAX_STEPS = 64 * 256;

/** One voice's first pass through its track list as note events (read_note / next_track_entry, without the loop). */
export function aamVoiceEvents(b: Uint8Array, l: AamLayout, channel: number): { events: AamEvent[]; steps: number } {
  const events: AamEvent[] = [];
  let step = 0;
  let noteBase = 0;
  let instrumentBase = 0;
  let duration = 0;
  let instrument = 0;
  let prevNote = 0;
  const at = (pos: number): number => (pos < b.length ? b[pos] : AAM_STOP);
  const emit = (note: number, offset: number): void => {
    events.push({ step, note, instrument, offset });
    step += duration || 256; // steps_left is a byte: 0 wraps to 256 steps
  };
  for (const entry of readAamTrackList(b, l, channel)) {
    if (entry.noteBase !== undefined) noteBase = entry.noteBase;
    if (entry.instrumentBase !== undefined) instrumentBase = entry.instrumentBase;
    for (let pass = 0; pass <= entry.repeats; pass++) {
      let pos = aamPatternOffset(b, l, entry.pattern);
      while (step < MAX_STEPS) {
        let x = at(pos++);
        if (x === AAM_LEGATO) x = at(pos++);
        if (x === AAM_PATTERN_END) break;
        if (x === AAM_STOP) return { events, steps: step };
        const portamento = (from: number): void => {
          prevNote = aamIndexNote(b, l, at(from + 1) + noteBase);
          emit(prevNote, from + 1);
          pos = from + 3;
        };
        if (x === AAM_PORTAMENTO) { portamento(pos); continue; }
        // A prefix ends the event on a portamento (when allowed) or a byte of its own class or above: the previous note again.
        const ends = (replayFrom: number, portamentoAllowed: boolean): boolean => {
          x = at(pos++);
          if (portamentoAllowed && x === AAM_PORTAMENTO) { portamento(pos); return true; }
          if (x >= replayFrom) { pos--; emit(prevNote, -1); return true; }
          return false;
        };
        if (x === AAM_LEVEL) { pos++; if (ends(AAM_LEGATO, true)) continue; }
        if (x >= AAM_REST) { duration = x & 0xf; emit(NOTE_OFF, -1); continue; }
        if (x >= AAM_INSTRUMENT) { instrument = ((x & 0x3f) + instrumentBase) & 0xff; if (ends(AAM_INSTRUMENT, true)) continue; }
        if (x >= AAM_DURATION) { duration = x & 0x3f; if (ends(AAM_DURATION, true)) continue; }
        if (x >= AAM_PITCH_SEQ) { if (ends(AAM_PITCH_SEQ, false)) continue; }
        prevNote = aamIndexNote(b, l, x + noteBase);
        emit(prevNote, pos - 1);
      }
    }
  }
  return { events, steps: step };
}

/** Load an Art and Magic module as an editable step grid over UADE playback. */
export function parseArtAndMagicFile(buffer: ArrayBuffer, filename: string): TrackerSong {
  const b = new Uint8Array(buffer);
  const l = locateAamLayout(b);
  if (!l) throw new Error('Art and Magic: no known driver build in this file');
  const voices = [1, 2, 3].map((ch) => aamVoiceEvents(b, l, ch));
  const steps = Math.max(1, ...voices.map((v) => v.steps));
  const numPatterns = Math.ceil(steps / ROWS_PER_PATTERN);
  const patterns: Pattern[] = Array.from({ length: numPatterns }, (_, pi) => ({
    id: `pattern-${pi}`,
    name: `Pattern ${pi}`,
    length: ROWS_PER_PATTERN,
    channels: Array.from({ length: NUM_CHANNELS }, (_, ch) => ({
      id: `channel-${ch}`,
      name: `Channel ${ch + 1}`,
      muted: false, solo: false, collapsed: false, volume: 100,
      pan: ch === 0 || ch === 3 ? -50 : 50,
      instrumentId: null, color: null,
      rows: Array.from({ length: ROWS_PER_PATTERN }, (): TrackerCell => ({
        note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0,
      })),
    })),
  }));

  // Voices 1..3 play on channels 0..2; channel 3 (voice 4) has no track list of its own.
  const noteBytes: NonNullable<UADEVariablePatternLayout['noteBytes']> = [];
  let maxInstrument = 0;
  voices.forEach(({ events }, ch) => {
    for (const ev of events) {
      const pattern = Math.floor(ev.step / ROWS_PER_PATTERN);
      const row = ev.step % ROWS_PER_PATTERN;
      if (pattern >= numPatterns) break;
      const cell = patterns[pattern].channels[ch].rows[row];
      cell.note = ev.note;
      if (ev.note !== 0 && ev.note !== NOTE_OFF) {
        cell.instrument = ev.instrument + 1;
        maxInstrument = Math.max(maxInstrument, ev.instrument + 1);
      }
      if (ev.offset >= 0) noteBytes.push({ pattern, channel: ch, row, offset: ev.offset, note: ev.note });
    }
  });

  const blocks = aamUsedPatterns(b, l).map((index) => {
    const addr = aamPatternOffset(b, l, index);
    const cmds = splitAamPattern(b, addr) ?? [];
    const bytes = encodeAamCommands(cmds);
    const rows = Array.from(bytes, (x) => ({
      note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0, cutoff: 1, period: x, pan: 0, resonance: 0,
    } as TrackerCell));
    return { addr, size: bytes.length, rows };
  }).filter((blk) => blk.size > 0).sort((x, y) => x.addr - y.addr)
    // Two pattern indices can name one stream: keep it once.
    .filter((blk, i, all) => i === 0 || all[i - 1].addr !== blk.addr);

  const layout: UADEVariablePatternLayout = {
    formatId: 'artAndMagic',
    numChannels: NUM_CHANNELS,
    numFilePatterns: blocks.length,
    rowsPerPattern: ROWS_PER_PATTERN,
    moduleSize: b.length,
    encoder: artAndMagicEncoder,
    filePatternAddrs: blocks.map((blk) => blk.addr),
    filePatternSizes: blocks.map((blk) => blk.size),
    // The display is a step grid, not the file patterns: no display pattern maps to a file pattern.
    trackMap: patterns.map(() => Array.from({ length: NUM_CHANNELS }, () => -1)),
    blockRows: blocks.map((blk) => blk.rows),
    noteBytes,
  };

  const instruments: InstrumentConfig[] = Array.from({ length: Math.max(1, maxInstrument) }, (_, i) => ({
    id: i + 1, name: '', type: 'synth' as const, synthType: 'Synth' as const, effects: [], volume: 0, pan: 0,
  } as InstrumentConfig));

  const moduleName = (filename.split('/').pop() ?? filename).replace(/^aam\./i, '').replace(/\.aam$/i, '');
  const songPositions = patterns.map((_, i) => i);
  return {
    name: `${moduleName} [Art and Magic]`,
    format: 'MOD' as TrackerFormat,
    patterns,
    instruments,
    songPositions,
    songLength: songPositions.length,
    restartPosition: 0,
    numChannels: NUM_CHANNELS,
    initialSpeed: 3,
    initialBPM: 125,
    linearPeriods: false,
    uadePlayerTickGrid: true,
    uadeVariableLayout: layout,
    uadeEditableFileData: buffer.slice(0) as ArrayBuffer,
    uadeEditableFileName: filename,
  } as TrackerSong;
}
