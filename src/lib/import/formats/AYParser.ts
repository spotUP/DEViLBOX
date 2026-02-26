/**
 * AYParser.ts — ZX Spectrum AY/YM format parser (ZXAYEMUL / AY-emul)
 *
 * Parses the ZXAYEMUL header for song metadata, loads Z80 memory blocks,
 * runs the init and interrupt routines via Z80 CPU emulation, intercepts
 * AY chip register writes via OUT port hooks, and reconstructs 3-channel
 * patterns from the resulting register frame snapshots.
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { Pattern, TrackerCell, ChannelData, InstrumentConfig } from '@/types';
import { DEFAULT_FURNACE } from '@/types/instrument';
import { CpuZ80, type Z80MemoryMap } from '@/lib/import/cpu/CpuZ80';

// ── Helpers ───────────────────────────────────────────────────────────────────

function emptyCell(): TrackerCell {
  return { note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 };
}

function emptyPattern(numCh: number): Pattern {
  return {
    id: 'p0', name: 'Pattern 1', length: 16,
    channels: Array.from({ length: numCh }, (_, i): ChannelData => ({
      id: `ch${i}`, name: `AY ${String.fromCharCode(65 + i)}`, muted: false, solo: false,
      collapsed: false, volume: 100, pan: 0, instrumentId: null, color: null,
      rows: Array.from({ length: 16 }, emptyCell),
    })),
  };
}

/**
 * Read a null-terminated string via a signed big-endian offset pointer at `ptrOff`.
 * The pointer is relative to its own position in the file.
 */
function readRelStr(buf: Uint8Array, ptrOff: number): string {
  if (ptrOff + 2 > buf.length) return '';
  const dv  = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const rel = dv.getInt16(ptrOff, false); // big-endian signed
  if (rel === 0) return '';
  const abs = ptrOff + rel;
  if (abs < 0 || abs >= buf.length) return '';
  let s = '', i = abs;
  while (i < buf.length && buf[i] !== 0) s += String.fromCharCode(buf[i++]);
  return s.trim();
}

// ── AY chip emulation ────────────────────────────────────────────────────────

/** ZX Spectrum PAL AY clock frequency */
const AY_CLOCK = 1773400;

/** Convert a 12-bit AY tone period to a MIDI note number (1–96), or 0 if out of range. */
function ayPeriodToNote(period: number): number {
  if (period <= 0) return 0;
  const freq = AY_CLOCK / (16 * period);
  if (freq < 20 || freq > 20000) return 0;
  const note = Math.round(12 * Math.log2(freq / 440) + 69);
  return note >= 1 && note <= 96 ? note : 0;
}

interface MemBlock {
  addr: number;
  data: Uint8Array;
}

interface SongDescriptor {
  initAddr: number;
  intrAddr: number;
  stackAddr: number;
  memBlocks: MemBlock[];
}

/**
 * Parse AY format song descriptor starting at offset `songDescOff` in `buf`.
 *
 * The per-song entry layout (each 4 bytes at songDescOff):
 *   [0-1]  i16 BE: relative offset to song name string (relative to this field)
 *   [2-3]  i16 BE: relative offset to song data block  (relative to this field)
 *
 * The song data block:
 *   [0-1]  u16 BE: unused (channel count or flags)
 *   [2-3]  u16 BE: init address
 *   [4-5]  u16 BE: interrupt (play) address
 *   [6-7]  u16 BE: stack pointer initial value
 *   [8-9]  u16 BE: additional register (usually 0)
 *   [10+]  memory block descriptors, each:
 *            [0-1]  u16 BE: Z80 target address
 *            [2-3]  u16 BE: data length (0 means 65536 bytes)
 *            [4+]   raw data bytes
 *          terminated by two consecutive 0x0000 words
 */
function parseSongDescriptor(buf: Uint8Array, songDescOff: number): SongDescriptor {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);

  // Read the data-block relative pointer at songDescOff+2
  const dataRel = dv.getInt16(songDescOff + 2, false);
  const dataOff = songDescOff + 2 + dataRel;

  if (dataOff < 0 || dataOff + 10 > buf.length) {
    throw new Error(`AY song data block out of range: dataOff=${dataOff}`);
  }

  // Song data block fields
  const initAddr  = dv.getUint16(dataOff + 2, false);
  const intrAddr  = dv.getUint16(dataOff + 4, false);
  const stackAddr = dv.getUint16(dataOff + 6, false);

  // Parse memory block descriptors starting at dataOff + 10
  let blockOff = dataOff + 10;
  const memBlocks: MemBlock[] = [];

  while (blockOff + 4 <= buf.length) {
    const targetAddr = dv.getUint16(blockOff, false);
    const rawLen     = dv.getUint16(blockOff + 2, false);

    // Terminator: both words are 0
    if (targetAddr === 0 && rawLen === 0) break;

    const dataLen = rawLen === 0 ? 65536 : rawLen;
    blockOff += 4;

    const end = Math.min(blockOff + dataLen, buf.length);
    const data = buf.slice(blockOff, end);
    memBlocks.push({ addr: targetAddr, data });
    blockOff += dataLen;
  }

  return { initAddr, intrAddr, stackAddr, memBlocks };
}

/**
 * Run Z80 emulation to extract AY register frames.
 * Runs init once then calls the interrupt routine FRAMES times, capturing
 * a 16-byte AY register snapshot after each interrupt call.
 */
function runAYEmulation(desc: SongDescriptor): Uint8Array[] {
  const FRAMES = 300;
  const STACK  = (desc.stackAddr > 0 && desc.stackAddr <= 0xFFFF) ? desc.stackAddr : 0xF000;

  const ram = new Uint8Array(0x10000);

  // Load all memory blocks into Z80 RAM
  for (const block of desc.memBlocks) {
    const len = Math.min(block.data.length, 0x10000 - block.addr);
    ram.set(block.data.subarray(0, len), block.addr);
  }

  // Guard: verify that initAddr and intrAddr are covered by at least one
  // loaded memory block so we don't silently burn cycles on uncovered addresses.
  function isCovered(addr: number): boolean {
    return desc.memBlocks.some(b => addr >= b.addr && addr < b.addr + b.data.length);
  }
  if (!isCovered(desc.initAddr) || !isCovered(desc.intrAddr)) {
    return [];
  }

  const ayRegs = new Uint8Array(16);
  let selectedReg = 0;

  const mem: Z80MemoryMap = {
    read:  (addr)       => ram[addr & 0xFFFF],
    write: (addr, val)  => { ram[addr & 0xFFFF] = val & 0xFF; },
    outPort: (port, val) => {
      const p16 = port & 0xFFFF;
      // AY register select:  OUT ($FFFD), A  or  OUT (C),A with BC=$FFFD
      if (p16 === 0xFFFD) {
        selectedReg = val & 0x0F;
      }
      // AY register write:   OUT ($BFFD), A  or  OUT (C),A with BC=$BFFD
      else if (p16 === 0xBFFD) {
        ayRegs[selectedReg] = val & 0xFF;
      }
    },
  };

  const cpu = new CpuZ80(mem);
  cpu.reset(desc.initAddr, STACK);

  // Run init routine once
  cpu.callSubroutine(desc.initAddr);

  // Run interrupt routine FRAMES times, snapshotting registers each frame
  const frames: Uint8Array[] = [];
  for (let f = 0; f < FRAMES; f++) {
    cpu.callSubroutine(desc.intrAddr);
    frames.push(new Uint8Array(ayRegs)); // snapshot (copy current state)
  }

  return frames;
}

// ── Frames → Pattern ─────────────────────────────────────────────────────────

const MAX_ROWS = 256;

/**
 * Convert AY register frame snapshots to a tracker pattern.
 * Mirrors YMParser.ts::framesToPattern, using ZX Spectrum AY clock.
 */
function framesToPattern(frames: Uint8Array[]): Pattern {
  const step = Math.max(1, Math.ceil(frames.length / MAX_ROWS));
  const rows = Math.min(MAX_ROWS, Math.ceil(frames.length / step));

  const pat: Pattern = {
    id: 'p0', name: 'Pattern 1', length: rows,
    channels: Array.from({ length: 3 }, (_, i): ChannelData => ({
      id: `ch${i}`, name: `AY ${String.fromCharCode(65 + i)}`, muted: false, solo: false,
      collapsed: false, volume: 100, pan: 0, instrumentId: null, color: null,
      rows: Array.from({ length: rows }, emptyCell),
    })),
  };

  const lastNote = [0, 0, 0];
  const lastVol  = [-1, -1, -1];

  for (let row = 0; row < rows; row++) {
    const f     = frames[Math.min(row * step, frames.length - 1)];
    const mixer = f[7] ?? 0xFF;

    for (let ch = 0; ch < 3; ch++) {
      const periodLo = f[ch * 2]      ?? 0;
      const periodHi = (f[ch * 2 + 1] ?? 0) & 0x0F;
      const period   = (periodHi << 8) | periodLo;
      const vol      = (f[8 + ch]     ?? 0) & 0x0F;
      const toneOn   = !((mixer >> ch) & 1); // bit 0 = tone A enable (0 = enabled)

      const note = (toneOn && vol > 0 && period > 0) ? ayPeriodToNote(period) : 0;
      const cell = pat.channels[ch].rows[row];

      if (note !== lastNote[ch]) {
        cell.note = note > 0 ? note : (lastNote[ch] > 0 ? 97 : 0);
        if (note > 0) cell.instrument = 1;
        lastNote[ch] = note;
      }
      if (vol !== lastVol[ch]) {
        cell.volume = vol > 0 ? Math.round((vol / 15) * 64) : 0;
        lastVol[ch] = vol;
      }
    }
  }

  return pat;
}

// ── Public API ────────────────────────────────────────────────────────────────

export function isAYFormat(buffer: ArrayBuffer): boolean {
  const b = new Uint8Array(buffer);
  if (b.length < 8) return false;
  return String.fromCharCode(b[0], b[1], b[2], b[3], b[4], b[5], b[6], b[7]) === 'ZXAYEMUL';
}

export async function parseAYFile(buffer: ArrayBuffer, filename: string): Promise<TrackerSong> {
  if (!isAYFormat(buffer)) throw new Error('Not a valid AY file');
  const buf = new Uint8Array(buffer);

  // buf[8]: type (0=AY, 1=YM)
  const isYM    = buf[8] === 1;
  // buf[18]: number of songs minus 1
  const numSongs = (buf[18] ?? 0) + 1;

  // Offset 14: signed BE pointer to author string (relative to offset 14)
  // Offset 16: signed BE pointer to misc string   (relative to offset 16)
  const author = readRelStr(buf, 14);
  const misc   = readRelStr(buf, 16);

  const chipLabel = isYM ? 'YM' : 'AY';
  const instruments: InstrumentConfig[] = Array.from({ length: 3 }, (_, i) => ({
    id: i + 1,
    name: `${chipLabel} ${String.fromCharCode(65 + i)}`,
    type: 'synth' as const,
    synthType: 'FurnaceAY' as const,
    furnace: { ...DEFAULT_FURNACE, chipType: 6, ops: 2 },
    effects: [] as [],
    volume: 0,
    pan: 0,
  }));

  const name = misc || filename.replace(/\.ay$/i, '');

  // ── Z80 emulation: attempt to extract real pattern data ──────────────────
  //
  // Song descriptor array starts at offset 20.
  // Each entry is 4 bytes: [nameRel i16 BE] [dataRel i16 BE]
  // We use the first song (index 0) at offset 20.
  //
  // Wrap in try/catch and fall back to stub pattern on any parse failure.

  let pattern: Pattern;

  try {
    const songDescOff = 20; // first song descriptor in the array
    const desc = parseSongDescriptor(buf, songDescOff);

    if (desc.initAddr === 0 || desc.intrAddr === 0) {
      throw new Error('AY init/interrupt address is zero — cannot emulate');
    }
    if (desc.memBlocks.length === 0) {
      throw new Error('AY file has no memory blocks');
    }

    const frames = runAYEmulation(desc);
    pattern = framesToPattern(frames);
  } catch {
    // Emulation not possible for this file — produce a stub pattern
    pattern = emptyPattern(3);
  }

  return {
    name: name + (author ? ` — ${author}` : ''),
    format: 'AY' as TrackerFormat,
    patterns: [pattern],
    instruments,
    songPositions: [0],
    songLength: numSongs > 1 ? numSongs : 1,
    restartPosition: 0,
    numChannels: 3,
    initialSpeed: 6,
    initialBPM: 125,
  };
}
