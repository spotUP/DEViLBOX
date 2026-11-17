/**
 * maniacsOfNoiseGrid.ts - the Maniacs of Noise tracker grid, read from the module's own sequences and patterns.
 *
 * Source of truth: third-party/nuade/players/maniacsofnoise (mon_module.c detection and layouts, mon_commands.c
 * grammar, mon_voice.c / mon_old.c / mon_new.c timing and pitch, mon_walk.c block walk). A module is the replayer's
 * 68k image (file offset = address): three entry jumps, then code, then a data block whose song table, instrument
 * records and period table lie at version-specific offsets (MON_LAYOUTS below, matched by an FNV-1a signature of the
 * code).
 *
 * A song record holds four sequence offsets (from the song table; 0 = voice off), the master volume and the tempo.
 * A sequence is a list of words: below 0xF000 a pattern offset, from 0xF000 a command (Transpose, Repeat, FadeIn,
 * FadeOut, Tempo, Jump, Stop). A pattern is a byte list ended by End: a note byte is followed by a length (ticks =
 * length * tempo); the other commands are described by monCommandOf(). A note plays the period
 * (periodTable[note + transpose] * instrument tuning) >> 10; the grid note is that period read through periodToNote
 * (428 = C-2, measured, not a base constant).
 *
 * Layers (docs/FORMAT_COMMAND_STREAM_GRID.md): blockRows carry every sequence and pattern a voice reaches byte-exact,
 * one carrier cell per byte (cutoff = 1, period = byte). The display grid is one row per interrupt tick of subsong 1.
 * A stored note byte is played by every repeat that reaches it: `placements`.
 *
 * Columns (each is the argument byte of the command in force when the note starts, so every note that command reaches
 * shows, and an edit writes, the same byte): instrument column = Instrument argument + 1; volume column = Volume
 * argument + 0x10 (0..64 only); effect 1 (3xx) = the Slide start-note byte and effect 2 (4xx) = the Slide length byte,
 * on the one note a Slide precedes. Note lengths change the tick count (the rows move), so they are not a column.
 * Subsongs: `subsong` picks the song record; the count is the module's subsongCount byte.
 */
import type { Pattern, TrackerCell } from '@/types';
import { cellFieldsEqual } from '@/engine/uade/UADEPatternEncoder';
import { periodToNote } from '@/lib/amiga/periodNotes';

export const MANIACS_OF_NOISE_ROWS_PER_PATTERN = 64;
export const MON_VOLUME_BASE = 0x10;
export const MON_SLIDE_NOTE_EFFECT = 0x03;
export const MON_SLIDE_LENGTH_EFFECT = 0x04;
const MAX_TICKS = 30000;
const COMMAND_GUARD = 4096;
const VOICES = 4;
const INSTRUMENT_BYTES = 64;
const MAX_SUBSONGS = 0x7f;
const MASK_ADDRESS = 0xc;
const FNV_SEED = 0xcbf29ce484222325n;
const FNV_PRIME = 0x100000001b3n;

type Version = 'Gyroscope' | 'FlimbosQuest' | 'DeathTrap' | 'DragonWars' | 'MysteryWorldsEnd';

interface Layout {
  version: Version; signature: bigint; codeStart: number;
  interrupt: number; start: number; base: number; songTable: number; stride: number; periodTable: number; subsongCount: number;
}

const L = (version: Version, signature: bigint, interrupt: number, start: number, base: number, songTable: number,
  stride: number, periodTable: number, subsongCount: number, codeStart = 0): Layout =>
  ({ version, signature, codeStart, interrupt, start, base, songTable, stride, periodTable, subsongCount });

const MON_LAYOUTS: Layout[] = [
  L('Gyroscope', 0xFA6BCD0FF900A6F7n, 0x156, 0x62, 0x662, 0x1CA, 16, 0x13A, 0x134),
  L('FlimbosQuest', 0xB64E92DF48E1501Dn, 0x17E, 0x8A, 0x6A2, 0x1E2, 16, 0x152, 0x14C),
  L('DeathTrap', 0xE7D3E4869AC694CFn, 0x19A, 0xA4, 0x68C, 0x5C2, 12, 0x1B2, 0x1AC),
  L('DeathTrap', 0x423B2D249E7E8B0Fn, 0x19A, 0xA4, 0x68C, 0x5C2, 12, 0x1B2, 0x1AC),
  L('DragonWars', 0xC90A6CA2679CC325n, 0x19A, 0xA4, 0x6FA, 0x5C2, 12, 0x1B2, 0x1AC),
  L('MysteryWorldsEnd', 0x190BD113467DBD36n, 0x19A, 0xA4, 0x7DA, 0x5C2, 12, 0x1B2, 0x1AC, 0x30),
];

const be16 = (b: Uint8Array, o: number): number => (o >= 0 && o + 1 < b.length ? (b[o] << 8) | b[o + 1] : 0);
const s16 = (v: number): number => (v << 16) >> 16;
const pcTarget = (b: Uint8Array, at: number): number => at + s16(be16(b, at));

export interface ManiacsOfNoiseModule {
  layout: Layout; base: number; songs: number; instruments: number; subsongCount: number;
}

/** FNV-1a of the code from `first` to `end`; a `lea d16(pc),a3` that loads the voice mask address counts as zero. */
function codeSignature(b: Uint8Array, first: number, end: number): bigint | null {
  if (first > end || end > b.length) return null;
  let hash = FNV_SEED;
  for (let at = first; at < end; at++) {
    const word = at - ((at - first) & 1);
    const masked = word >= first + 2 && be16(b, word - 2) === 0x47fa && pcTarget(b, word) === MASK_ADDRESS;
    hash = BigInt.asUintN(64, (hash ^ BigInt(masked ? 0 : b[at])) * FNV_PRIME);
  }
  return hash;
}

/** mon_locate: the module's version layout and data block, or null when the file is not a known Maniacs of Noise module. */
export function detectManiacsOfNoise(b: Uint8Array): ManiacsOfNoiseModule | null {
  if (b.length < 0x100) return null;
  const jumps: number[] = [];
  for (let i = 0; i < 3; i++) {
    if (be16(b, i * 4) !== 0x4efa) return null;
    jumps.push(pcTarget(b, i * 4 + 2));
  }
  const [init, interrupt, startSong] = jumps;
  if (be16(b, init) !== 0x4bfa || (be16(b, init + 4) << 16 | be16(b, init + 6)) >>> 0 !== 0x08ad0000) return null;
  const base = pcTarget(b, init + 2);
  if (be16(b, startSong + 0x16) !== 0xb02d) return null;
  const countOffset = s16(be16(b, startSong + 0x18));
  const signature = codeSignature(b, init, base);
  if (signature === null) return null;
  const layout = MON_LAYOUTS.find(l => l.signature === signature && (l.codeStart === 0 || l.codeStart === init)
    && l.subsongCount === countOffset && interrupt - init === l.interrupt && startSong - init === l.start
    && base - init === l.base);
  if (!layout) return null;
  const countAt = base + layout.subsongCount;
  if (countAt >= b.length || b[countAt] === 0 || b[countAt] > MAX_SUBSONGS || base > b.length || layout.songTable >= b.length - base) return null;
  const songs = base + layout.songTable;
  const subsongCount = b[countAt];
  return { layout, base, songs, subsongCount, instruments: songs + subsongCount * layout.stride };
}

export type MonCommand = 'Note' | 'End' | 'Instrument' | 'Volume' | 'Slide' | 'SlideNote' | 'Release' | 'Arpeggio' | 'Wait' | 'Swing' | 'Rest' | 'Unknown';

/** mon_pattern_command: which command a pattern byte is. */
export function monCommandOf(version: Version, byte: number): MonCommand {
  if (version === 'Gyroscope') {
    switch (byte) {
      case 0xff: return 'End';
      case 0xfe: return 'Instrument';
      case 0xfd: return 'Volume';
      case 0xfc: return 'Slide';
      case 0xfb: return 'SlideNote';
      default: return 'Note';
    }
  }
  if ((byte & 0x80) === 0) return 'Note';
  const old: MonCommand[] = ['End', 'Instrument', 'Volume', 'Slide', 'SlideNote', 'Release'];
  const next: MonCommand[] = [...old, 'Arpeggio', 'Wait', 'Swing', 'Rest'];
  const table = version === 'FlimbosQuest' ? old : next;
  return table[byte & 0xf] ?? 'Unknown';
}

const ARGS: Record<MonCommand, number> = {
  Note: 1, End: 0, Instrument: 1, Volume: 1, Slide: 2, SlideNote: 3, Release: 1, Arpeggio: 2, Wait: 1, Swing: 1, Rest: 1, Unknown: 0,
};

const isOld = (v: Version): boolean => v === 'Gyroscope' || v === 'FlimbosQuest';

type SeqCommand = 'Transpose' | 'Repeat' | 'FadeIn' | 'FadeOut' | 'Tempo' | 'Jump' | 'Stop' | 'Unknown';
const SEQ_COMMANDS: SeqCommand[] = ['Transpose', 'Repeat', 'FadeIn', 'FadeOut', 'Tempo', 'Jump', 'Stop'];
const seqCommandOf = (word: number): SeqCommand => SEQ_COMMANDS[(word >> 8) & 0xf] ?? 'Unknown';
const isPatternWord = (word: number): boolean => word < 0xf000;

/** The note byte a voice plays is valid when it reads as a Note. */
const isNoteByte = (version: Version, byte: number): boolean => monCommandOf(version, byte) === 'Note';

export interface ManiacsOfNoisePlacement {
  voice: number; tick: number;
  /** File offset of the stored note byte. */
  offset: number;
  note: number;
  /** Grid note minus the stored byte. */
  delta: number;
  instrument: number;
  transpose: number;
  tuning: number;
  /** File offset of the Instrument argument in force (-1 = the voice's default instrument). */
  instrumentAt: number;
  /** Volume argument in force: its offset (-1 = none yet) and value. */
  volumeAt: number; volume: number;
  /** The Slide before this note: offsets and values of its start-note and length bytes (-1 = no slide). */
  slideNoteAt: number; slideNote: number; slideLengthAt: number; slideLength: number;
}

export interface ManiacsOfNoiseGrid {
  patterns: Pattern[];
  voices: number;
  filePatternAddrs: number[];
  filePatternSizes: number[];
  trackMap: number[][];
  blockRows: TrackerCell[][];
  placements: ManiacsOfNoisePlacement[];
  ticks: number;
  module: ManiacsOfNoiseModule;
  /** Highest instrument number any voice selects, plus one. */
  instrumentCount: number;
}

export function encodeManiacsOfNoiseStream(rows: TrackerCell[]): Uint8Array {
  return Uint8Array.from(rows, c => (c.period ?? 0) & 0xff);
}

const emptyCell = (): TrackerCell => ({ note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 });

const periodEntry = (b: Uint8Array, m: ManiacsOfNoiseModule, note: number): number => be16(b, m.base + m.layout.periodTable + note * 2);
/** mon_scaled_period: table entry times tuning, shifted by 10. */
const scaledPeriod = (b: Uint8Array, m: ManiacsOfNoiseModule, note: number, tuning: number): number =>
  Number((BigInt(periodEntry(b, m, note & 0xff)) * BigInt(tuning)) >> 10n) & 0xffff;
const gridNote = (b: Uint8Array, m: ManiacsOfNoiseModule, byte: number, transpose: number, tuning: number): number =>
  periodToNote(scaledPeriod(b, m, (byte + transpose) & 0xff, tuning));

/** One past the last byte of a pattern: the grammar to its End command. */
function patternEnd(b: Uint8Array, version: Version, start: number): number {
  let at = start;
  while (at < b.length) {
    const cmd = monCommandOf(version, b[at]);
    if (cmd === 'Unknown') return Math.min(at + 1, b.length);
    at += 1 + ARGS[cmd];
    if (cmd === 'End') break;
  }
  return Math.min(at, b.length);
}

interface Voice {
  running: boolean; track: number; sequence: number; pattern: number; patternStart: number;
  repeat: number; transpose: number; ticksLeft: number; restart: boolean; instrument: number; instrumentNumber: number; swing: number;
  instrumentAt: number; volumeAt: number; volume: number; slideAt: number;
}

/** Build the grid of a Maniacs of Noise module (`subsong`, 0-based); null when it is not one. */
export function buildManiacsOfNoiseGrid(buf: Uint8Array, sourceFile: string, subsong = 0): ManiacsOfNoiseGrid | null {
  const m = detectManiacsOfNoise(buf);
  if (!m) return null;
  const { version, stride } = m.layout;
  const old = isOld(version);
  const u8 = (o: number): number => (o >= 0 && o < buf.length ? buf[o] : 0);
  const songAt = (offset: number): number => m.songs + s16(offset);
  if (subsong < 0 || subsong >= m.subsongCount) return null;
  const record = m.songs + subsong * stride;
  const tracks = Array.from({ length: VOICES }, (_, i) => be16(buf, record + i * 2));
  let tempo = u8(record + 10);

  const blockIndex = new Map<number, number>();
  const blockRows: TrackerCell[][] = [];
  const addrs: number[] = [];
  const sizes: number[] = [];
  const addBlock = (start: number, end: number): void => {
    if (blockIndex.has(start) || start < 0 || start >= buf.length || end <= start) return;
    blockIndex.set(start, blockRows.length);
    blockRows.push(Array.from(buf.subarray(start, end), byte => ({ ...emptyCell(), cutoff: 1, period: byte })));
    addrs.push(start);
    sizes.push(end - start);
  };
  // Static blocks: each voice's sequence (to its first Stop or Jump word) and the patterns it names.
  for (let v = 0; v < VOICES; v++) {
    if (tracks[v] === 0) continue;
    const track = songAt(tracks[v]);
    let at = track;
    for (let n = 0; n < COMMAND_GUARD && at + 1 < buf.length; n++) {
      const word = be16(buf, at);
      at += 2;
      if (isPatternWord(word)) { const p = songAt(word); addBlock(p, patternEnd(buf, version, p)); continue; }
      const c = seqCommandOf(word);
      if (c === 'Stop' || c === 'Jump' || c === 'Unknown') break;
    }
    addBlock(track, at);
  }

  const voices: Voice[] = tracks.map(t => ({
    running: t !== 0, track: t !== 0 ? songAt(t) : 0, sequence: t !== 0 ? songAt(t) : 0, pattern: 0, patternStart: 0,
    repeat: 1, transpose: 0, ticksLeft: 0, restart: true, instrument: -1, instrumentNumber: 0, swing: 0,
    instrumentAt: -1, volumeAt: -1, volume: 0, slideAt: -1,
  }));
  let instrumentRegister = -1;
  let playing = true;
  let jumped = false;
  let maxInstrument = 0;
  const timelines: TrackerCell[][] = [[], [], [], []];
  const placements: ManiacsOfNoisePlacement[] = [];
  const tuningOf = (addr: number): number => (addr < 0 ? 0 : be16(buf, addr + 2));
  const lengthTicks = (v: Voice, length: number): number => {
    const t = (length * tempo - (old ? 0 : v.swing)) & 0xffff;
    if (!old) v.swing = 0;
    return t;
  };

  // mon_sequence_next: false when a Stop ends the song.
  const sequenceNext = (v: Voice, repeating: boolean): boolean => {
    if (repeating) {
      v.repeat = (v.repeat - 1) & 0xff;
      if (v.repeat !== 0) { v.pattern = v.patternStart; return true; }
      v.repeat = 1;
    }
    let at = v.sequence;
    for (let g = 0; g < COMMAND_GUARD; g++) {
      const word = be16(buf, at);
      at += 2;
      if (isPatternWord(word)) {
        v.patternStart = songAt(word); v.pattern = v.patternStart; v.sequence = at;
        return true;
      }
      const param = word & 0xff;
      switch (seqCommandOf(word)) {
        case 'Transpose': v.transpose = param; break;
        case 'Repeat': v.repeat = param; break;
        case 'Tempo': tempo = param; break;
        case 'Jump': at = v.track + param * 2; jumped = true; break;
        case 'FadeIn': case 'FadeOut': break;
        default: playing = false; return false;
      }
    }
    playing = false;
    return false;
  };

  const place = (vi: number, v: Voice, tick: number, offset: number, ins: number): void => {
    const note = gridNote(buf, m, u8(offset), v.transpose, ins);
    if (note <= 0) return;
    const cell: TrackerCell = { ...emptyCell(), note, instrument: v.instrumentNumber + 1 };
    if (v.volumeAt >= 0 && v.volume <= 0x40) cell.volume = MON_VOLUME_BASE + v.volume;
    const slide = v.slideAt;
    if (slide >= 0) {
      cell.effTyp = MON_SLIDE_NOTE_EFFECT; cell.eff = u8(slide);
      cell.effTyp2 = MON_SLIDE_LENGTH_EFFECT; cell.eff2 = u8(slide + 1);
      v.slideAt = -1;
    }
    timelines[vi][tick] = cell;
    placements.push({
      voice: vi, tick, offset, note, delta: note - u8(offset), instrument: v.instrumentNumber + 1, transpose: v.transpose, tuning: ins,
      instrumentAt: v.instrumentAt, volumeAt: v.volumeAt, volume: v.volume,
      slideNoteAt: slide, slideNote: slide >= 0 ? u8(slide) : 0, slideLengthAt: slide >= 0 ? slide + 1 : -1, slideLength: slide >= 0 ? u8(slide + 1) : 0,
    });
  };

  const readPattern = (vi: number, v: Voice, tick: number): boolean => {
    let ins = tuningOf(instrumentRegister);
    let at = v.pattern;
    for (let g = 0; g < COMMAND_GUARD; g++) {
      const at0 = at;
      const byte = u8(at++);
      const cmd = monCommandOf(version, byte);
      switch (cmd) {
        case 'Note': {
          const length = u8(at++);
          place(vi, v, tick, at0, ins);
          v.ticksLeft = lengthTicks(v, length);
          v.pattern = at;
          return true;
        }
        case 'End':
          if (!sequenceNext(v, true)) return false;
          at = v.pattern;
          break;
        case 'Instrument': {
          v.instrumentAt = at;
          const n = u8(at++);
          v.instrumentNumber = n; maxInstrument = Math.max(maxInstrument, n + 1);
          v.instrument = m.instruments + n * INSTRUMENT_BYTES;
          instrumentRegister = v.instrument;
          ins = tuningOf(instrumentRegister);
          break;
        }
        case 'Volume': v.volumeAt = at; v.volume = u8(at); at += 1; break;
        case 'Slide': v.slideAt = at; at += 2; break;
        case 'SlideNote': {
          place(vi, v, tick, at, ins);
          v.ticksLeft = lengthTicks(v, u8(at + 2));
          at += 3;
          v.pattern = at;
          return true;
        }
        case 'Release': case 'Rest':
          v.ticksLeft = lengthTicks(v, u8(at++));
          v.pattern = at;
          return true;
        case 'Wait':
          v.ticksLeft = u8(at++);
          v.pattern = at;
          return true;
        case 'Swing': v.swing = u8(at++); break;
        case 'Arpeggio': at += 2; break;
        default: playing = false; return false;
      }
    }
    playing = false;
    return false;
  };

  const seen = new Set<string>();
  let tick = 0;
  for (; tick < MAX_TICKS && playing; tick++) {
    jumped = false;
    for (let vi = VOICES - 1; vi >= 0 && playing; vi--) {
      const v = voices[vi];
      if (!v.running) continue;
      if (v.restart) {
        v.restart = false;
        if (!sequenceNext(v, false)) break;
      } else {
        instrumentRegister = v.instrument;
        v.ticksLeft = (v.ticksLeft - 1) & 0xffff;
        if (v.ticksLeft !== 0) continue;
      }
      if (!readPattern(vi, v, tick)) break;
    }
    if (jumped && playing) {
      const key = `${tempo}|${instrumentRegister}|${voices.map(v => [v.sequence, v.pattern, v.patternStart, v.repeat, v.transpose, v.ticksLeft, v.instrument, v.swing, v.restart].join(',')).join('|')}`;
      if (seen.has(key)) { tick++; break; }
      seen.add(key);
    }
  }
  const ticks = Math.max(1, tick);

  const R = MANIACS_OF_NOISE_ROWS_PER_PATTERN;
  const numPatterns = Math.ceil(ticks / R);
  const patterns: Pattern[] = Array.from({ length: numPatterns }, (_, p) => ({
    id: `pattern-${p}`, name: `Pattern ${p}`, length: R,
    channels: timelines.map((line, ch) => ({
      id: `channel-${ch}`, name: `Voice ${ch + 1}`, muted: false, solo: false, collapsed: false,
      volume: 100, pan: 0, instrumentId: null, color: null,
      rows: Array.from({ length: R }, (_, r) => ({ ...(line[p * R + r] ?? emptyCell()) })),
    })),
    importMetadata: {
      sourceFormat: 'MOD' as const, sourceFile, importedAt: new Date().toISOString(),
      originalChannelCount: 4, originalPatternCount: blockRows.length, originalInstrumentCount: maxInstrument,
    },
  }));
  const blockAt: number[][] = [[], [], [], []];
  for (const pl of placements) {
    const block = addrs.findIndex((a, i) => pl.offset >= a && pl.offset < a + sizes[i]);
    const p = Math.floor(pl.tick / R);
    if (blockAt[pl.voice][p] === undefined && block >= 0) blockAt[pl.voice][p] = block;
  }
  const trackMap = patterns.map((_, p) => [0, 1, 2, 3].map(v => blockAt[v][p] ?? -1));
  return { patterns, voices: VOICES, filePatternAddrs: addrs, filePatternSizes: sizes, trackMap, blockRows, placements, ticks, module: m, instrumentCount: maxInstrument };
}

/** Subsongs the module holds (its subsongCount byte); 0 when it is not a Maniacs of Noise module. */
export const maniacsOfNoiseSubsongCount = (b: Uint8Array): number => detectManiacsOfNoise(b)?.subsongCount ?? 0;

/** A subsong sounds when its walked grid has a note. */
export const maniacsOfNoiseSubsongAudible = (b: Uint8Array, subsong: number): boolean =>
  (buildManiacsOfNoiseGrid(b, '', subsong)?.placements.length ?? 0) > 0;

export interface ManiacsOfNoiseEditResult { data: Uint8Array; patched: number; warnings: string[] }

/**
 * Write the grid's note edits into the module. A changed note cell becomes the stored note byte whose period (with the
 * placement's transpose and instrument tuning) reads as that grid note, nearest to the current byte; the edit is made
 * in place, so an unedited export is byte-identical. Placements that play one byte must agree, else the byte is left
 * and a warning returned. Instrument, volume and slide columns are written to their command argument bytes; lengths are not.
 */
export function applyManiacsOfNoiseGridEdits(source: Uint8Array, edited: Pattern[], subsong = 0): ManiacsOfNoiseEditResult {
  const base = buildManiacsOfNoiseGrid(source, '', subsong);
  const out = new Uint8Array(source);
  const warnings: string[] = [];
  if (!base) return { data: out, patched: 0, warnings: ['the module is not a Maniacs of Noise module'] };
  const m = base.module;
  const R = MANIACS_OF_NOISE_ROWS_PER_PATTERN;
  const cellAt = (voice: number, tick: number): TrackerCell | undefined => edited[Math.floor(tick / R)]?.channels[voice]?.rows[tick % R];
  const placed = new Set<string>();
  const wanted = new Map<number, { bytes: Set<number>; edited: boolean }>();
  const slot = (offset: number) => {
    let w = wanted.get(offset);
    if (!w) { w = { bytes: new Set(), edited: false }; wanted.set(offset, w); }
    return w;
  };
  for (const pl of base.placements) {
    placed.add(`${pl.voice}:${pl.tick}`);
    const cell = cellAt(pl.voice, pl.tick);
    const w = slot(pl.offset);
    const current = source[pl.offset];
    if (!cell) { w.bytes.add(current); continue; }
    const want = cell.note ?? 0;
    if (want === pl.note) w.bytes.add(current);
    else {
      let byte = -1;
      if (want > 0) {
        for (let d = 0; d < 256 && byte < 0; d++) {
          for (const b of [current - d, current + d]) {
            if (b >= 0 && b < 256 && isNoteByte(m.layout.version, b) && gridNote(source, m, b, pl.transpose, pl.tuning) === want) { byte = b; break; }
          }
        }
      }
      if (byte >= 0) { w.bytes.add(byte); w.edited = true; }
      else { warnings.push(`voice ${pl.voice + 1} tick ${pl.tick}: note ${want} has no stored byte for this instrument or removes the note; not written`); w.bytes.add(current); }
    }
    const where = `voice ${pl.voice + 1} tick ${pl.tick}`;
    // A column is the argument byte of the command in force; cells sharing the byte must agree (the editor moves them together).
    const column = (offset: number, shown: number, want: number, byte: number | null, what: string): void => {
      if (offset < 0 || want === shown) { if (offset >= 0) slot(offset).bytes.add(source[offset]); return; }
      if (byte === null) { warnings.push(`${where}: ${what} cannot be stored in this command; not written`); if (offset >= 0) slot(offset).bytes.add(source[offset]); return; }
      const t = slot(offset); t.bytes.add(byte); t.edited = true;
    };
    const ins = cell.instrument ?? 0;
    column(pl.instrumentAt, pl.instrument, ins, ins >= 1 && ins <= 256 ? ins - 1 : null, 'the instrument');
    const vol = cell.volume ?? 0;
    const shownVol = pl.volumeAt >= 0 && pl.volume <= 0x40 ? MON_VOLUME_BASE + pl.volume : 0;
    column(pl.volumeAt, shownVol, vol, vol >= MON_VOLUME_BASE && vol <= MON_VOLUME_BASE + 0xff ? vol - MON_VOLUME_BASE : null, 'the volume');
    if (pl.slideNoteAt >= 0) {
      column(pl.slideNoteAt, pl.slideNote, cell.eff ?? 0, (cell.effTyp ?? 0) === MON_SLIDE_NOTE_EFFECT ? cell.eff ?? 0 : null, 'the slide note');
      column(pl.slideLengthAt, pl.slideLength, cell.eff2 ?? 0, (cell.effTyp2 ?? 0) === MON_SLIDE_LENGTH_EFFECT ? cell.eff2 ?? 0 : null, 'the slide length');
    } else if ((cell.effTyp ?? 0) !== 0 || (cell.effTyp2 ?? 0) !== 0) {
      warnings.push(`${where}: no Slide command precedes this note; the effect is not written`);
    }
  }
  let patched = 0;
  for (const [offset, w] of wanted) {
    if (!w.edited) continue;
    if (w.bytes.size === 1) { out[offset] = [...w.bytes][0]; patched++; }
    else warnings.push(`stream byte ${offset}: cells that play it were edited to different notes; not written`);
  }
  let stray = 0;
  edited.forEach((pat, p) => pat.channels.forEach((chn, v) => chn.rows.forEach((cell, r) => {
    if (placed.has(`${v}:${p * R + r}`)) return;
    if (!cellFieldsEqual(cell, base.patterns[p]?.channels[v]?.rows[r] ?? emptyCell())) stray++;
  })));
  if (stray > 0) warnings.push(`${stray} edited cell(s) are not on a note; not written (the stream would change length)`);
  return { data: out, patched, warnings };
}
