/**
 * VGMParser.ts — Video Game Music format parser
 *
 * Supports VGM 1.00–1.71 and VGZ (gzip-compressed).
 * Detects chip type from header clocks, reconstructs note events from
 * YM2612 key-on/off + F-number writes, SN76489 tone/volume writes,
 * and YM2151 key-code/key-on writes. Builds a TrackerSong with
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

/** Convert SN76489 10-bit counter to MIDI note (1–96). */
function sn76489CounterToNote(counter: number, clock: number): number {
  if (counter <= 0) return 0;
  const freq = clock / (32 * counter);
  if (freq <= 0) return 0;
  const note = Math.round(12 * Math.log2(freq / 440) + 69);
  return Math.max(1, Math.min(96, note));
}

/** Convert YM2151 key code to MIDI note (1–96). */
function opmKeyCodeToNote(kc: number): number {
  const octave = (kc >> 4) & 0x07;
  const semi = Math.min(kc & 0x0F, 11);
  const midiNote = octave * 12 + semi + 12;
  return Math.max(1, Math.min(96, midiNote));
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

/**
 * Result of buildInstruments: instrument list plus per-chip starting channel
 * and instrument indices (or -1 if the chip is absent).
 */
interface InstrumentLayout {
  instruments: InstrumentConfig[];
  /** Starting output channel index for OPN2 (6 channels, 0-5). -1 if absent. */
  opn2ChStart: number;
  /** Starting output channel index for SN76489 (3 tone channels). -1 if absent. */
  snChStart: number;
  /** Starting output channel index for OPM (8 channels). -1 if absent. */
  opmChStart: number;
  /** Instrument index for OPN2 in the instruments array. -1 if absent. */
  opn2InstIdx: number;
  /** Instrument index for SN76489 in the instruments array. -1 if absent. */
  snInstIdx: number;
  /** Instrument index for OPM in the instruments array. -1 if absent. */
  opmInstIdx: number;
  /** Total number of output channels needed. */
  totalChannels: number;
}

function buildInstruments(chips: VGMChips): InstrumentLayout {
  const insts: InstrumentConfig[] = [];
  let id = 1;
  const add = (name: string, synthType: InstrumentConfig['synthType'], chipType: number, ops: number = 4) => {
    insts.push({
      id: id++, name, type: 'synth', synthType,
      furnace: { ...DEFAULT_FURNACE, chipType, ops } as FurnaceConfig,
    });
  };

  let opn2InstIdx = -1;
  let opmInstIdx  = -1;
  let snInstIdx   = -1;

  if (chips.ym2612)  { opn2InstIdx = insts.length; add('OPN2 FM',  'FurnaceOPN',    1); }
  if (chips.ym2151)  { opmInstIdx  = insts.length; add('OPM FM',   'FurnaceOPM',    33); }
  if (chips.ym2203)  add('OPN FM',   'FurnaceOPN2203', 1);
  if (chips.ym2608)  add('OPNA FM',  'FurnaceOPNA',   1);
  if (chips.ym2610)  add('OPNB FM',  'FurnaceOPNB',   1);
  if (chips.ym3812)  add('OPL2 FM',  'FurnaceOPL',    14, 2);
  if (chips.ymf262)  add('OPL3 FM',  'FurnaceOPL',    14, 2);
  if (chips.ym2413)  add('OPLL FM',  'FurnaceOPLL',   13, 2);
  if (chips.sn76489) { snInstIdx   = insts.length; add('SN PSG',   'FurnaceSN',     0,  2); }
  if (chips.ay8910)  add('AY PSG',   'FurnaceAY',     6,  2);
  // Default if nothing detected
  if (insts.length === 0) { opn2InstIdx = 0; add('FM', 'FurnaceOPN', 1); }

  // Assign output channel ranges:
  // OPN2: 6 channels (0-5)
  // OPM:  8 channels (after OPN2)
  // SN:   3 tone channels (after OPM, or after OPN2 if no OPM)
  let nextCh = 0;

  let opn2ChStart = -1;
  if (chips.ym2612 || opn2InstIdx >= 0) {
    opn2ChStart = nextCh;
    nextCh += 6;
  }

  let opmChStart = -1;
  if (chips.ym2151) {
    opmChStart = nextCh;
    nextCh += 8;
  }

  let snChStart = -1;
  if (chips.sn76489) {
    snChStart = nextCh;
    nextCh += 3; // channels 0-2 are tone; channel 3 (noise) is skipped
  }

  const totalChannels = Math.max(nextCh, 1);

  return {
    instruments: insts,
    opn2ChStart, opmChStart, snChStart,
    opn2InstIdx, opmInstIdx, snInstIdx,
    totalChannels,
  };
}

// ── VGM Command Walker ────────────────────────────────────────────────────────

interface NoteEvent { tick: number; ch: number; note: number; on: boolean; instIdx: number; }

interface WalkOptions {
  snClock: number;       // SN76489 clock in Hz (from header offset 0x0C)
  snChStart: number;     // output channel start for SN (or -1)
  snInstIdx: number;     // instrument index for SN (or -1)
  opmChStart: number;    // output channel start for OPM (or -1)
  opmInstIdx: number;    // instrument index for OPM (or -1)
  opn2ChStart: number;   // output channel start for OPN2 (or -1)
  opn2InstIdx: number;   // instrument index for OPN2 (or -1)
}

function walkCommands(buf: Uint8Array, dataStart: number, chips: VGMChips, opts: WalkOptions): NoteEvent[] {
  const events: NoteEvent[] = [];
  let pos = dataStart;
  let tick = 0;

  // ── OPN2 (YM2612) per-channel state ──────────────────────────────────────
  // 6 channels: 0-2 port0, 3-5 port1
  const opn2FnumLo  = new Uint8Array(6);
  const opn2FnumHi  = new Uint8Array(6); // bits[2:0]=block, bits[5:0]=fnum hi
  const opn2KeyOn   = new Uint8Array(6);
  const opn2ChStart = opts.opn2ChStart >= 0 ? opts.opn2ChStart : 0;
  const opn2InstIdx = opts.opn2InstIdx >= 0 ? opts.opn2InstIdx : 0;

  // ── SN76489 per-channel state ─────────────────────────────────────────────
  // 4 channels: 0-2 tone, 3 noise
  const snCounter  = new Uint16Array(4);  // 10-bit frequency counter per channel
  const snVolume   = new Uint8Array(4).fill(15); // 4-bit attenuation; 15=silent, 0=max
  const snPlaying  = new Uint8Array(4);   // whether a note-on has been emitted
  let   snLatchCh  = 0;                   // channel currently latched (for data bytes)
  let   snLatchTyp = 0;                   // latch type: 0=tone, 1=vol

  // ── OPM (YM2151) per-channel state ───────────────────────────────────────
  // 8 channels: 0-7
  const opmKeyCode = new Uint8Array(8);   // key code per channel
  const opmKeyOn   = new Uint8Array(8);   // 1 if channel is on

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

    // ── SN76489 write (opcode 0x50 + 1 data byte) ──────────────────────────
    if (cmd === 0x50) {
      if (pos >= buf.length) break;
      const data = buf[pos++];

      if (data & 0x80) {
        // Latch byte: bits[6:5]=channel, bit[4]=type (0=tone,1=vol), bits[3:0]=lo value
        snLatchCh  = (data >> 5) & 0x03;
        snLatchTyp = (data >> 4) & 0x01;
        const lo   = data & 0x0F;

        if (snLatchTyp === 1) {
          // Volume latch: lower 4 bits ARE the complete 4-bit attenuation
          const prevVol = snVolume[snLatchCh];
          snVolume[snLatchCh] = lo;

          if (chips.sn76489 && opts.snChStart >= 0 && snLatchCh < 3) {
            const outCh = opts.snChStart + snLatchCh;
            if (lo === 15 && snPlaying[snLatchCh]) {
              // Silence → note-off
              events.push({ tick, ch: outCh, note: 97, on: false, instIdx: opts.snInstIdx });
              snPlaying[snLatchCh] = 0;
            } else if (lo < 15 && prevVol === 15 && snCounter[snLatchCh] > 0) {
              // Was silent, now audible → note-on if we have a counter
              const note = sn76489CounterToNote(snCounter[snLatchCh], opts.snClock);
              if (note > 0) {
                events.push({ tick, ch: outCh, note, on: true, instIdx: opts.snInstIdx });
                snPlaying[snLatchCh] = 1;
              }
            }
          }
        } else {
          // Tone latch: lower nibble = bits[3:0] of counter
          snCounter[snLatchCh] = (snCounter[snLatchCh] & 0x3F0) | lo;
          // Note emission happens after data byte arrives (or immediately for single-nibble writes)
        }
      } else {
        // Data byte: bits[5:0] = upper 6 bits of frequency counter for latched tone channel
        if (snLatchTyp === 0 && snLatchCh < 3) {
          // Update upper 6 bits of counter
          snCounter[snLatchCh] = ((data & 0x3F) << 4) | (snCounter[snLatchCh] & 0x0F);

          if (chips.sn76489 && opts.snChStart >= 0) {
            const outCh = opts.snChStart + snLatchCh;
            // If channel is audible, emit note-on with new frequency
            if (snVolume[snLatchCh] < 15 && snCounter[snLatchCh] > 0) {
              const note = sn76489CounterToNote(snCounter[snLatchCh], opts.snClock);
              if (note > 0) {
                if (snPlaying[snLatchCh]) {
                  // Already playing — emit note-off then note-on for new pitch
                  events.push({ tick, ch: outCh, note: 97, on: false, instIdx: opts.snInstIdx });
                }
                events.push({ tick, ch: outCh, note, on: true, instIdx: opts.snInstIdx });
                snPlaying[snLatchCh] = 1;
              }
            }
          }
        }
        // For tone channels with snLatchTyp=1 (vol data byte), no extra action needed
      }
      continue;
    }

    // ── YM2612 port 0/1 write (opcode + reg + data) ────────────────────────
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
            const outCh = opn2ChStart + ch;
            events.push({ tick, ch: outCh, note: ym2612FnumToNote(fnum, block), on, instIdx: opn2InstIdx });
            opn2KeyOn[ch] = on ? 1 : 0;
          }
        }
      }
      continue;
    }

    // ── YM2151 (OPM) write (opcode 0x54 + reg + data) ─────────────────────
    if (cmd === 0x54) {
      if (pos + 1 >= buf.length) break;
      const reg = buf[pos++];
      const val = buf[pos++];

      if (chips.ym2151 && opts.opmChStart >= 0) {
        if (reg >= 0x28 && reg <= 0x2F) {
          // Key code register for channel (reg - 0x28)
          const ch = reg - 0x28;
          opmKeyCode[ch] = val;
        } else if (reg === 0x08) {
          // Key On/Off: bits[6:3] = operator enables, bits[2:0] = channel
          const ch = val & 0x07;
          const on = (val & 0x78) !== 0;
          if (on !== (opmKeyOn[ch] !== 0)) {
            const note  = opmKeyCodeToNote(opmKeyCode[ch]);
            const outCh = opts.opmChStart + ch;
            events.push({ tick, ch: outCh, note, on, instIdx: opts.opmInstIdx });
            opmKeyOn[ch] = on ? 1 : 0;
          }
        }
      }
      continue;
    }

    // Other 3-byte register writes (reg + data after opcode)
    // Skip 0x54 already handled above; exclude 0x52/0x53 already handled
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

  // SN76489 clock: header offset 0x0C, lower 30 bits
  const snClock = dv.byteLength > 0x10 ? dv.getUint32(0x0C, true) & 0x3FFFFFFF : 0;

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

  const chips  = detectChips(dv, version);
  const layout = buildInstruments(chips);

  const { instruments, opn2ChStart, opmChStart, snChStart,
          opn2InstIdx, opmInstIdx, snInstIdx, totalChannels } = layout;

  const numCh = totalChannels;

  const opts: WalkOptions = {
    snClock,
    snChStart, snInstIdx,
    opmChStart, opmInstIdx,
    opn2ChStart, opn2InstIdx,
  };

  const events  = walkCommands(buf, dataStart, chips, opts);
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
