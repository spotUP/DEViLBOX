/**
 * VGMParser.ts — Video Game Music format parser
 *
 * Supports VGM 1.00–1.71 and VGZ (gzip-compressed).
 * Detects chip type from header clocks, reconstructs note events from
 * YM2612 key-on/off + F-number writes, and builds a TrackerSong with
 * one pattern per track and one instrument per detected chip.
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { Pattern, TrackerCell, ChannelData } from '@/types';
import type { InstrumentConfig, FurnaceConfig } from '@/types/instrument';
import { DEFAULT_FURNACE } from '@/types/instrument';

// ── Helpers ───────────────────────────────────────────────────────────────────

function emptyCell(): TrackerCell {
  return { note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 };
}

function emptyPattern(id: string, name: string, numCh: number, rows: number): Pattern {
  return {
    id, name, length: rows,
    channels: Array.from({ length: numCh }, (_, i): ChannelData => ({
      id: `ch${i}`, name: `CH ${i + 1}`, muted: false, solo: false,
      collapsed: false, volume: 100, pan: 0, instrumentId: null, color: null,
      rows: Array.from({ length: rows }, emptyCell),
    })),
  };
}

function readUtf16LEString(buf: Uint8Array, off: number): { text: string; nextOff: number } {
  let text = '';
  let i = off;
  while (i + 1 < buf.length) {
    const lo = buf[i], hi = buf[i + 1];
    if (lo === 0 && hi === 0) { i += 2; break; }
    text += String.fromCharCode(lo | (hi << 8));
    i += 2;
  }
  return { text, nextOff: i };
}

/** Convert YM2612 F-number + block to MIDI note (1–96). */
function ym2612FnumToNote(fnum: number, block: number): number {
  // freq = fnum * clock / (144 * 2^(21-block)),  clock = 7670454 Hz (NTSC)
  const freq = fnum * 7670454 / (144 * (1 << (21 - block)));
  if (freq <= 0) return 0;
  const note = Math.round(12 * Math.log2(freq / 440) + 69);
  return Math.max(1, Math.min(96, note));
}

// ── GD3 Metadata ──────────────────────────────────────────────────────────────

interface Gd3Tags {
  trackName: string;
  gameName: string;
  systemName: string;
  author: string;
  date: string;
}

function parseGd3(buf: Uint8Array, gd3Abs: number): Gd3Tags {
  const magic = String.fromCharCode(buf[gd3Abs], buf[gd3Abs+1], buf[gd3Abs+2], buf[gd3Abs+3]);
  if (magic !== 'Gd3 ') return { trackName: '', gameName: '', systemName: '', author: '', date: '' };
  let off = gd3Abs + 12; // skip magic(4) + version(4) + length(4)
  const readStr = (): string => { const r = readUtf16LEString(buf, off); off = r.nextOff; return r.text; };
  const trackName = readStr(); readStr(); // EN then JP
  const gameName  = readStr(); readStr();
  const systemName = readStr(); readStr();
  const author    = readStr(); readStr();
  const date      = readStr();
  return { trackName, gameName, systemName, author, date };
}

// ── Chip Detection ────────────────────────────────────────────────────────────

interface VGMChips {
  sn76489: boolean;
  ym2413:  boolean;
  ym2612:  boolean;
  ym2151:  boolean;
  ym2203:  boolean;
  ym2608:  boolean;
  ym2610:  boolean;
  ym3812:  boolean;
  ymf262:  boolean;
  ay8910:  boolean;
}

function detectChips(dv: DataView, version: number): VGMChips {
  const clk = (off: number): number =>
    dv.byteLength > off + 4 ? dv.getUint32(off, true) & 0x7FFFFFFF : 0;
  return {
    sn76489: clk(0x0C) > 0,
    ym2413:  clk(0x10) > 0,
    ym2612:  version >= 0x101 ? clk(0x2C) > 0 : false,
    ym2151:  version >= 0x101 ? clk(0x30) > 0 : false,
    ym2203:  version >= 0x110 ? clk(0x44) > 0 : false,
    ym2608:  version >= 0x110 ? clk(0x48) > 0 : false,
    ym2610:  version >= 0x110 ? clk(0x4C) > 0 : false,
    ym3812:  version >= 0x110 ? clk(0x50) > 0 : false,
    ymf262:  version >= 0x150 ? clk(0x5C) > 0 : false,
    ay8910:  version >= 0x151 ? clk(0x74) > 0 : false,
  };
}

function buildInstruments(chips: VGMChips): InstrumentConfig[] {
  const insts: InstrumentConfig[] = [];
  let id = 1;
  const add = (name: string, synthType: InstrumentConfig['synthType'], chipType: number, ops: number = 4) => {
    insts.push({
      id: id++, name, type: 'synth', synthType,
      furnace: { ...DEFAULT_FURNACE, chipType, ops } as FurnaceConfig,
    });
  };
  if (chips.ym2612)  add('OPN2 FM',  'FurnaceOPN',    1);
  if (chips.ym2151)  add('OPM FM',   'FurnaceOPM',    33);
  if (chips.ym2203)  add('OPN FM',   'FurnaceOPN2203', 1);
  if (chips.ym2608)  add('OPNA FM',  'FurnaceOPNA',   1);
  if (chips.ym2610)  add('OPNB FM',  'FurnaceOPNB',   1);
  if (chips.ym3812)  add('OPL2 FM',  'FurnaceOPL',    14, 2);
  if (chips.ymf262)  add('OPL3 FM',  'FurnaceOPL',    14, 2);
  if (chips.ym2413)  add('OPLL FM',  'FurnaceOPLL',   13, 2);
  if (chips.sn76489) add('SN PSG',   'FurnaceSN',     0,  2);
  if (chips.ay8910)  add('AY PSG',   'FurnaceAY',     6,  2);
  // Default if nothing detected
  if (insts.length === 0) add('FM', 'FurnaceOPN', 1);
  return insts;
}

// ── VGM Command Walker ────────────────────────────────────────────────────────

interface NoteEvent { tick: number; ch: number; note: number; on: boolean; instIdx: number; }

function walkCommands(buf: Uint8Array, dataStart: number, chips: VGMChips): NoteEvent[] {
  const events: NoteEvent[] = [];
  let pos = dataStart;
  let tick = 0;

  // YM2612 per-channel state (6 channels: 0-2 port0, 3-5 port1)
  const opn2FnumLo = new Uint8Array(6);
  const opn2FnumHi = new Uint8Array(6); // bits[2:0]=block, bits[5:0]=fnum hi
  const opn2KeyOn  = new Uint8Array(6);
  const opn2InstIdx = 0; // first instrument

  while (pos < buf.length) {
    const cmd = buf[pos++];
    if (cmd === 0x66) break; // end of data

    // Wait commands
    if (cmd === 0x62) { tick += 882; continue; }  // 50 Hz frame
    if (cmd === 0x63) { tick += 735; continue; }  // 60 Hz frame
    if (cmd === 0x61) {                             // wait N samples
      if (pos + 1 < buf.length) { tick += buf[pos] | (buf[pos+1] << 8); pos += 2; }
      continue;
    }
    if (cmd >= 0x70 && cmd <= 0x7F) { tick += (cmd & 0x0F) + 1; continue; }

    // 1-byte skip
    if (cmd === 0x4F) { pos++; continue; } // Game Gear stereo

    // SN76489 write (opcode + 1 data byte)
    if (cmd === 0x50) { pos++; continue; }

    // YM2612 port 0/1 write (opcode + reg + data)
    if (cmd === 0x52 || cmd === 0x53) {
      if (pos + 1 >= buf.length) break;
      const reg = buf[pos++];
      const val = buf[pos++];
      const portBase = (cmd === 0x53) ? 3 : 0;

      if (reg >= 0xA0 && reg <= 0xA2) { // F-number low
        opn2FnumLo[portBase + (reg - 0xA0)] = val;
      } else if (reg >= 0xA4 && reg <= 0xA6) { // Block + F-number high
        opn2FnumHi[portBase + (reg - 0xA4)] = val;
      } else if (reg === 0x28) { // Key on/off (only in port 0)
        // Channel mapping: bits[1:0] in {0,1,2,4,5,6} map to channels 0-5
        const rawCh = val & 0x07;
        const ch = rawCh < 4 ? rawCh : rawCh - 1; // skip gap at 3
        if (ch < 6) {
          const on = (val & 0xF0) !== 0;
          if (on !== (opn2KeyOn[ch] !== 0)) {
            const fnum  = opn2FnumLo[ch] | ((opn2FnumHi[ch] & 0x07) << 8);
            const block = (opn2FnumHi[ch] >> 3) & 0x07;
            events.push({ tick, ch, note: ym2612FnumToNote(fnum, block), on, instIdx: opn2InstIdx });
            opn2KeyOn[ch] = on ? 1 : 0;
          }
        }
      }
      continue;
    }

    // Other 3-byte register writes (reg + data after opcode)
    if ((cmd >= 0x51 && cmd <= 0x5F) || (cmd >= 0xA0 && cmd <= 0xBF)) {
      pos += 2; continue;
    }

    // Data block: 0x67 tt ss ss ss ss [data...]
    if (cmd === 0x67) {
      pos++; // block type
      if (pos + 4 > buf.length) break;
      const len = buf[pos] | (buf[pos+1] << 8) | (buf[pos+2] << 16) | (buf[pos+3] << 24);
      pos += 4 + len;
      continue;
    }

    // YM2612 DAC + wait: 0x80–0x8F
    if (cmd >= 0x80 && cmd <= 0x8F) { tick += cmd & 0x0F; continue; }

    // 2-byte commands (various chip writes with address+data)
    if (cmd >= 0xC0 && cmd <= 0xDF) { pos += 2; continue; }

    // 1-byte fallback for unknown single-byte opcodes
  }

  return events;
}

// ── Events → Pattern ──────────────────────────────────────────────────────────

const TICKS_PER_ROW = 735; // ~60 Hz (1 frame per row)
const MAX_ROWS = 256;

function eventsToPattern(events: NoteEvent[], numCh: number, numRows: number): Pattern {
  const pat = emptyPattern('p0', 'Pattern 1', numCh, numRows);
  for (const ev of events) {
    const row = Math.min(Math.floor(ev.tick / TICKS_PER_ROW), numRows - 1);
    const ch  = Math.min(ev.ch, numCh - 1);
    const cell = pat.channels[ch].rows[row];
    if (ev.on && cell.note === 0) {
      cell.note = ev.note;
      cell.instrument = ev.instIdx + 1;
    } else if (!ev.on && cell.note === 0) {
      cell.note = 97; // note off
    }
  }
  return pat;
}

// ── VGZ decompression ─────────────────────────────────────────────────────────

async function decompressGzip(buffer: ArrayBuffer): Promise<ArrayBuffer> {
  const ds = new DecompressionStream('gzip');
  const writer = ds.writable.getWriter();
  const reader = ds.readable.getReader();
  writer.write(new Uint8Array(buffer));
  writer.close();
  const chunks: Uint8Array[] = [];
  let done = false;
  while (!done) {
    const { value, done: d } = await reader.read();
    if (value) chunks.push(value);
    done = d;
  }
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) { out.set(c, off); off += c.length; }
  return out.buffer;
}

// ── Public API ────────────────────────────────────────────────────────────────

export function isVGMFormat(buffer: ArrayBuffer): boolean {
  const b = new Uint8Array(buffer);
  return b.length >= 4 && b[0] === 0x56 && b[1] === 0x67 && b[2] === 0x6D && b[3] === 0x20;
}

export async function parseVGMFile(buffer: ArrayBuffer, filename: string): Promise<TrackerSong> {
  // Decompress if .vgz or gzip-magic
  const lowerName = filename.toLowerCase();
  let raw = buffer;
  const firstBytes = new Uint8Array(buffer);
  if (lowerName.endsWith('.vgz') || (firstBytes[0] === 0x1F && firstBytes[1] === 0x8B)) {
    raw = await decompressGzip(buffer);
  }
  if (!isVGMFormat(raw)) throw new Error('Not a valid VGM file');

  const buf = new Uint8Array(raw);
  const dv  = new DataView(raw);

  const version    = dv.getUint32(0x08, true);
  const gd3RelOff  = dv.getUint32(0x14, true);
  const gd3AbsOff  = gd3RelOff > 0 ? 0x14 + gd3RelOff : 0;

  // VGM data start offset
  let dataStart: number;
  if (version >= 0x150 && buf.length > 0x38) {
    const relOff = dv.getUint32(0x34, true);
    dataStart = relOff > 0 ? 0x34 + relOff : 0x40;
  } else {
    dataStart = 0x40;
  }

  const gd3 = gd3AbsOff > 0 && gd3AbsOff < buf.length
    ? parseGd3(buf, gd3AbsOff)
    : { trackName: '', gameName: '', systemName: '', author: '', date: '' };

  const chips = detectChips(dv, version);
  const instruments = buildInstruments(chips);
  const numCh = Math.min(8, instruments.length > 0 ? 6 : 1);

  const events  = walkCommands(buf, dataStart, chips);
  const maxTick = events.length > 0 ? Math.max(...events.map(e => e.tick)) : 0;
  const numRows = Math.min(MAX_ROWS, Math.max(64, Math.ceil(maxTick / TICKS_PER_ROW) + 1));
  const pattern = eventsToPattern(events, numCh, numRows);

  const title = gd3.trackName || gd3.gameName || filename.replace(/\.(vgm|vgz)$/i, '');

  return {
    name: title + (gd3.author ? ` — ${gd3.author}` : ''),
    format: 'VGM' as TrackerFormat,
    patterns: [pattern],
    instruments,
    songPositions: [0],
    songLength: 1,
    restartPosition: 0,
    numChannels: numCh,
    initialSpeed: 6,
    initialBPM: 125,
  };
}
