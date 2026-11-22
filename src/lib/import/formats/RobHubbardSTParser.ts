/**
 * RobHubbardSTParser.ts — Rob Hubbard ST (Atari ST player in an Amiga wrapper) detection and editable grid.
 *
 * Detection (from "Rob Hubbard ST_v2.asm", DTP_Check2):
 *   long[0] == $00407F40, long[4] == $00C081C0, long[56] == $41FAFFEE.
 *
 * Stream grammar: read from the module's own 68k command reader (battleships.rho, reader at 0x36e, jump table at 0x7a8),
 * not from the EaglePlayer asm, which only locates routines.
 *
 *   Song table T: the `moveq #2,d7 ; lea T(pc),a2` pair ($7E02 $41FA disp) after offset 180. long(T) / 12 = sub-songs;
 *   each sub-song is 3 longs, one per voice, each an offset from T to a track list.
 *   Track list: longs, each an offset from T to a block; 0 ends the list and the voice loops to entry 0.
 *   Block: a command stream ended by $87. Command lengths by first byte:
 *     $00-$7F note (1, advances time by the current duration)   $80 rest (1, advances)   $8F (1, advances)
 *     $84, $88 (3)   $89 (2)   $8E song end (1)   $D0-$DF instrument envelope (4)   everything else 1 byte:
 *     $B8-$BF speed = b-$B7, $C0-$CF instrument select, $E0-$FF duration = b-$DF (kept per voice across blocks).
 *
 * Three layers (docs/FORMAT_COMMAND_STREAM_GRID.md): each block is a file pattern whose `blockRows` carry its commands
 * byte-exact (cutoff = byte count, period/pan/resonance = the bytes, a 4-byte command takes two carrier rows); the encoder
 * concatenates them. The display is a tick grid (one row per duration unit) of sub-song 0, with `noteBytes` naming the
 * file byte of every note so the exporter moves only that byte.
 *
 * Reference: third-party/uade-3.05/amigasrc/players/wanted_team/RobHubbardST/Rob Hubbard ST_v2.asm
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { InstrumentConfig, Pattern, TrackerCell } from '@/types';
import type { UADEVariablePatternLayout } from '@/engine/uade/UADEPatternEncoder';
import { periodToGridNote } from '@/lib/amiga/periodNotes';
import { robHubbardSTEncoder } from '@/engine/uade/encoders/RobHubbardSTEncoder';

const MIN_FILE_SIZE = 60;
const NUM_CHANNELS = 4;
const NUM_VOICES = 3;
const ROWS_PER_PATTERN = 64;
/** Guard against a stream that never advances time or never ends. */
const MAX_DISPLAY_ROWS = ROWS_PER_PATTERN * 256;
const MAX_BLOCK_BYTES = 4096;

function u16BE(buf: Uint8Array, off: number): number {
  return off + 1 < buf.length ? (buf[off] << 8) | buf[off + 1] : 0;
}

function u32BE(buf: Uint8Array, off: number): number {
  return off + 3 < buf.length ? ((buf[off] << 24) | (buf[off + 1] << 16) | (buf[off + 2] << 8) | buf[off + 3]) >>> 0 : 0;
}

/**
 * The replayer's period table (word per semitone), found by the player's own lookup `lea T(pc),a0 ; add.w d0,d0 ;
 * move.w d0,d4 ; move.w (a0,d0.w),d5` ($41FA disp $D040 $3800 $3A30 $0000). Measured on battleships.rho: T = 0x6c8,
 * 3421 at index 0, halving every 12 entries (index 24 = 855, 36 = 428), indexed by the note byte plus the arpeggio step.
 */
function findPeriodTable(buf: Uint8Array): number | null {
  for (let i = 0; i + 12 < buf.length; i += 2) {
    if (u16BE(buf, i) === 0x41fa && u16BE(buf, i + 4) === 0xd040 && u16BE(buf, i + 6) === 0x3800 && u16BE(buf, i + 8) === 0x3a30) {
      return i + 2 + ((u16BE(buf, i + 2) << 16) >> 16);
    }
  }
  return null;
}

/** Grid note of a note byte: the period the replayer reads from its table, named by periodToGridNote (never a base constant). */
function rhstNoteToTrackerNote(buf: Uint8Array, table: number | null, idx: number): number {
  return table === null ? 0 : periodToGridNote(u16BE(buf, table + idx * 2));
}

/** Byte count of the command starting with `b`, from the module's jump table. */
export function rhstCommandLength(b: number): number {
  if (b === 0x84 || b === 0x88) return 3;
  if (b === 0x89) return 2;
  if (b >= 0xd0 && b <= 0xdf) return 4;
  return 1;
}

export function isRobHubbardSTFormat(buffer: ArrayBuffer | Uint8Array): boolean {
  const buf = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (buf.length < MIN_FILE_SIZE) return false;
  return u32BE(buf, 0) === 0x00407f40 && u32BE(buf, 4) === 0x00c081c0 && u32BE(buf, 56) === 0x41faffee;
}

/** File offset of the song table, or null when the `moveq #2,d7 ; lea T(pc),a2` pair is missing. */
export function findRobHubbardSTSongTable(buf: Uint8Array): number | null {
  for (let i = 180; i + 5 < buf.length; i += 2) {
    if (u16BE(buf, i) !== 0x7e02 || u16BE(buf, i + 2) !== 0x41fa) continue;
    const disp = (u16BE(buf, i + 4) << 16) >> 16;
    const t = i + 4 + disp;
    const head = u32BE(buf, t);
    if (t > 0 && t + 12 <= buf.length && head > 0 && head % 12 === 0) return t;
  }
  return null;
}

interface Block { addr: number; size: number; rows: TrackerCell[] }

/** Split a block into byte-exact carrier rows; stops after $87 (block end) or $8E (song end). */
function readBlock(buf: Uint8Array, addr: number): Block {
  const rows: TrackerCell[] = [];
  let p = addr;
  while (p < buf.length && p - addr < MAX_BLOCK_BYTES) {
    const b = buf[p];
    const len = Math.min(rhstCommandLength(b), buf.length - p);
    for (let k = 0; k < len; k += 3) {
      const n = Math.min(3, len - k);
      rows.push({
        note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0,
        cutoff: n, period: buf[p + k], pan: n > 1 ? buf[p + k + 1] : 0, resonance: n > 2 ? buf[p + k + 2] : 0,
      } as TrackerCell);
    }
    p += len;
    if (b === 0x87 || b === 0x8e) break;
  }
  return { addr, size: p - addr, rows };
}

interface NoteEvent { row: number; offset: number; note: number; instrument: number }

export function parseRobHubbardSTFile(buffer: ArrayBuffer, filename: string, _moduleBase = 0): TrackerSong {
  const buf = new Uint8Array(buffer);
  if (!isRobHubbardSTFormat(buf)) throw new Error('Not a Rob Hubbard ST module');
  const t = findRobHubbardSTSongTable(buf);
  if (t === null) throw new Error('Rob Hubbard ST: song table not found');

  const baseName = filename.split('/').pop() ?? filename;
  const moduleName = baseName.replace(/^rho\./i, '').replace(/\.rho$/i, '') || baseName;

  const table = findPeriodTable(buf);
  const blocks = new Map<number, Block>();
  const voices: NoteEvent[][] = [];
  const voiceRows: number[] = [];
  let speed = 0;
  let maxInstrument = 0;

  for (let v = 0; v < NUM_VOICES; v++) {
    const list = t + u32BE(buf, t + v * 4);
    const events: NoteEvent[] = [];
    let row = 0;
    let dur = 1;
    let instrument = 0;
    let ended = false;
    // One pass over the track list; the player then loops to entry 0.
    for (let e = list; !ended && e + 3 < buf.length && row < MAX_DISPLAY_ROWS; e += 4) {
      const rel = u32BE(buf, e);
      if (rel === 0) break;
      const addr = t + rel;
      if (addr >= buf.length) break;
      let block = blocks.get(addr);
      if (!block) { block = readBlock(buf, addr); blocks.set(addr, block); }
      for (let p = addr; p < addr + block.size && row < MAX_DISPLAY_ROWS; p += rhstCommandLength(buf[p])) {
        const b = buf[p];
        if (b < 0x80) {
          events.push({ row, offset: p, note: rhstNoteToTrackerNote(buf, table, b), instrument });
          row += dur;
        } else if (b === 0x80 || b === 0x8f) row += dur;
        else if (b === 0x8e) ended = true;
        else if (b >= 0xb8 && b <= 0xbf) { if (!speed) speed = b - 0xb7; }
        else if (b >= 0xc0 && b <= 0xcf) { instrument = b - 0xc0 + 1; maxInstrument = Math.max(maxInstrument, instrument); }
        else if (b >= 0xe0) dur = b - 0xdf;
      }
    }
    voices.push(events.filter((ev) => ev.note !== 0));
    voiceRows.push(row);
  }

  const numPatterns = Math.max(1, Math.ceil(Math.max(...voiceRows) / ROWS_PER_PATTERN));
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

  const noteBytes: NonNullable<UADEVariablePatternLayout['noteBytes']> = [];
  voices.forEach((events, ch) => {
    for (const ev of events) {
      const pattern = Math.floor(ev.row / ROWS_PER_PATTERN);
      const row = ev.row % ROWS_PER_PATTERN;
      const cell = patterns[pattern].channels[ch].rows[row];
      cell.note = ev.note;
      cell.instrument = ev.instrument;
      noteBytes.push({ pattern, channel: ch, row, offset: ev.offset, note: ev.note });
    }
  });

  const sorted = [...blocks.values()].sort((a, b) => a.addr - b.addr);
  const layout: UADEVariablePatternLayout = {
    formatId: 'robHubbardST',
    numChannels: NUM_CHANNELS,
    numFilePatterns: sorted.length,
    rowsPerPattern: ROWS_PER_PATTERN,
    moduleSize: buf.length,
    encoder: robHubbardSTEncoder,
    filePatternAddrs: sorted.map((b) => b.addr),
    filePatternSizes: sorted.map((b) => b.size),
    // The display is a tick grid, not the file blocks: no display pattern maps to a block.
    trackMap: patterns.map(() => Array.from({ length: NUM_CHANNELS }, () => -1)),
    blockRows: sorted.map((b) => b.rows),
    noteBytes,
  };

  const instruments: InstrumentConfig[] = Array.from({ length: Math.max(1, maxInstrument) }, (_, i) => ({
    id: i + 1, name: '', type: 'synth' as const, synthType: 'Synth' as const, effects: [], volume: 0, pan: 0,
  } as InstrumentConfig));

  const songPositions = patterns.map((_, i) => i);
  return {
    name: `${moduleName} [Rob Hubbard ST]`,
    format: 'MOD' as TrackerFormat,
    patterns,
    instruments,
    songPositions,
    songLength: songPositions.length,
    restartPosition: 0,
    numChannels: NUM_CHANNELS,
    initialSpeed: speed || 6,
    initialBPM: 125,
    linearPeriods: false,
    uadePlayerTickGrid: true,
    uadeVariableLayout: layout,
    uadeEditableFileData: buffer.slice(0) as ArrayBuffer,
    uadeEditableFileName: filename,
  } as TrackerSong;
}
