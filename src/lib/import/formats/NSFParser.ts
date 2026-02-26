/**
 * NSFParser.ts — NES Sound Format parser
 *
 * Parses NSF (NESM\x1A) and NSFE (chunk-based) headers. Extracts metadata
 * (title, artist, song count, expansion chip flags) and creates instrument
 * stubs for all detected channels. Runs 6502 CPU emulation to extract
 * real note data from APU register writes.
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { Pattern, TrackerCell, ChannelData, InstrumentConfig } from '@/types';
import { DEFAULT_FURNACE } from '@/types/instrument';
import { Cpu6502, type MemoryMap } from '@/lib/import/cpu/Cpu6502';

// ── Helpers ───────────────────────────────────────────────────────────────────

function emptyCell(): TrackerCell {
  return { note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 };
}

function readStr(buf: Uint8Array, off: number, len: number): string {
  let s = '';
  for (let i = 0; i < len; i++) {
    const c = buf[off + i];
    if (c === 0) break;
    s += String.fromCharCode(c);
  }
  return s.trim();
}

// ── NES APU note extraction ────────────────────────────────────────────────────

const NES_CLOCK = 1789773;

function apuTimerToNote(timer: number, isTriangle = false): number {
  if (timer <= 0) return 0;
  const freq = NES_CLOCK / ((isTriangle ? 32 : 16) * (timer + 1));
  if (freq < 20 || freq > 20000) return 0;
  const note = Math.round(12 * Math.log2(freq / 440) + 69);
  return note >= 1 && note <= 96 ? note : 0;
}

// ── Instrument Builder ─────────────────────────────────────────────────────────

function buildNESInstruments(expansionByte: number): InstrumentConfig[] {
  const insts: InstrumentConfig[] = [];
  let id = 1;

  const nesBase = ['NES Pulse 1', 'NES Pulse 2', 'NES Triangle', 'NES Noise'];
  for (const name of nesBase) {
    insts.push({ id: id++, name, type: 'synth', synthType: 'FurnaceNES',
      furnace: { ...DEFAULT_FURNACE, chipType: 34, ops: 2 }, effects: [], volume: 0, pan: 0 });
  }

  if (expansionByte & 0x01) {
    for (const name of ['VRC6 Pulse 1', 'VRC6 Pulse 2', 'VRC6 Sawtooth']) {
      insts.push({ id: id++, name, type: 'synth', synthType: 'FurnaceNES',
        furnace: { ...DEFAULT_FURNACE, chipType: 34, ops: 2 }, effects: [], volume: 0, pan: 0 });
    }
  }
  if (expansionByte & 0x02) {
    for (let i = 0; i < 6; i++) {
      insts.push({ id: id++, name: `VRC7 FM ${i + 1}`, type: 'synth', synthType: 'FurnaceOPLL',
        furnace: { ...DEFAULT_FURNACE, chipType: 13, ops: 2 }, effects: [], volume: 0, pan: 0 });
    }
  }
  if (expansionByte & 0x04) {
    insts.push({ id: id++, name: 'FDS Wave', type: 'synth', synthType: 'FurnaceFDS',
      furnace: { ...DEFAULT_FURNACE, chipType: 15, ops: 2 }, effects: [], volume: 0, pan: 0 });
  }
  if (expansionByte & 0x08) {
    for (const name of ['MMC5 Pulse 1', 'MMC5 Pulse 2']) {
      insts.push({ id: id++, name, type: 'synth', synthType: 'FurnaceMMC5',
        furnace: { ...DEFAULT_FURNACE, chipType: 34, ops: 2 }, effects: [], volume: 0, pan: 0 });
    }
  }
  if (expansionByte & 0x10) {
    for (let i = 0; i < 8; i++) {
      insts.push({ id: id++, name: `N163 Wave ${i + 1}`, type: 'synth', synthType: 'FurnaceN163',
        furnace: { ...DEFAULT_FURNACE, chipType: 17, ops: 2 }, effects: [], volume: 0, pan: 0 });
    }
  }
  if (expansionByte & 0x20) {
    for (let i = 0; i < 3; i++) {
      insts.push({ id: id++, name: `5B AY ${i + 1}`, type: 'synth', synthType: 'FurnaceAY',
        furnace: { ...DEFAULT_FURNACE, chipType: 6, ops: 2 }, effects: [], volume: 0, pan: 0 });
    }
  }

  return insts;
}

// ── NSF Emulation ─────────────────────────────────────────────────────────────

interface FrameNotes { notes: (number | null)[]; }

function runNSFEmulation(
  buf: Uint8Array,
  loadAddr: number, initAddr: number, playAddr: number,
  isPAL: boolean, numCh: number
): FrameNotes[] {
  const FRAMES = 900; // ~15 seconds at 60fps — enough to capture the main theme

  // Set up 64KB RAM
  const ram = new Uint8Array(0x10000);
  const codeData = buf.subarray(128);
  const codeLen = Math.min(codeData.length, 0x10000 - loadAddr);
  ram.set(codeData.subarray(0, codeLen), loadAddr);
  // Sentinel RTS at commonly-used zero-page sentinel addresses
  ram[0xFFFF] = 0x60;

  // APU register shadow
  const apuRegs = new Uint8Array(0x20);

  const mem: MemoryMap = {
    read(addr) {
      if (addr >= 0x4000 && addr < 0x4020) return apuRegs[addr - 0x4000];
      return ram[addr & 0xFFFF];
    },
    write(addr, val) {
      ram[addr & 0xFFFF] = val;
      if (addr >= 0x4000 && addr < 0x4020) apuRegs[addr - 0x4000] = val;
    },
  };

  const cpu = new Cpu6502(mem);
  cpu.reset(initAddr);
  cpu.setA(0); // song 0
  cpu.setX(isPAL ? 1 : 0);
  cpu.callSubroutine(initAddr);

  const cyclesPerFrame = isPAL ? 35464 : 29780;
  const frameStates: FrameNotes[] = [];

  for (let f = 0; f < FRAMES; f++) {
    cpu.callSubroutine(playAddr, cyclesPerFrame);

    const notes: (number | null)[] = new Array(numCh).fill(null);

    // Pulse 1 (ch 0)
    if (apuRegs[0x15] & 1) {
      const timer = ((apuRegs[0x03] & 0x07) << 8) | apuRegs[0x02];
      const vol = apuRegs[0x00] & 0x0F;
      notes[0] = vol > 0 ? apuTimerToNote(timer) : null;
    }
    // Pulse 2 (ch 1)
    if (apuRegs[0x15] & 2) {
      const timer = ((apuRegs[0x07] & 0x07) << 8) | apuRegs[0x06];
      const vol = apuRegs[0x04] & 0x0F;
      notes[1] = vol > 0 ? apuTimerToNote(timer) : null;
    }
    // Triangle (ch 2)
    if (apuRegs[0x15] & 4) {
      const timer = ((apuRegs[0x0B] & 0x07) << 8) | apuRegs[0x0A];
      const linCnt = apuRegs[0x08] & 0x7F;
      notes[2] = linCnt > 0 ? apuTimerToNote(timer, true) : null;
    }
    // Noise (ch 3) — map period index to approximate pitch
    if (apuRegs[0x15] & 8) {
      const vol = apuRegs[0x0C] & 0x0F;
      notes[3] = vol > 0 ? 37 : null; // A2 — snare-ish mapping
    }

    frameStates.push({ notes });
  }

  return frameStates;
}

function framesToPattern(frameStates: FrameNotes[], instruments: InstrumentConfig[], numCh: number): Pattern {
  const MAX_ROWS = 256;
  const step = Math.max(1, Math.ceil(frameStates.length / MAX_ROWS));
  const rows = Math.min(MAX_ROWS, Math.ceil(frameStates.length / step));

  const channels: ChannelData[] = Array.from({ length: numCh }, (_, i): ChannelData => ({
    id: `ch${i}`, name: instruments[i]?.name || `CH ${i + 1}`,
    muted: false, solo: false, collapsed: false,
    volume: 100, pan: 0, instrumentId: null, color: null,
    rows: Array.from({ length: rows }, emptyCell),
  }));

  const lastNote = new Array(numCh).fill(0);
  for (let row = 0; row < rows; row++) {
    const fs = frameStates[Math.min(row * step, frameStates.length - 1)];
    for (let ch = 0; ch < numCh && ch < fs.notes.length; ch++) {
      const n = fs.notes[ch];
      const cell = channels[ch].rows[row];
      if (n !== null && n !== lastNote[ch]) {
        cell.note = n;
        cell.instrument = ch + 1;
        lastNote[ch] = n;
      } else if (n === null && lastNote[ch] > 0) {
        cell.note = 97; // note off
        lastNote[ch] = 0;
      }
    }
  }

  return { id: 'p0', name: 'Pattern 1', length: rows, channels };
}

// ── Public API ────────────────────────────────────────────────────────────────

export function isNSFFormat(buffer: ArrayBuffer): boolean {
  const b = new Uint8Array(buffer);
  return b.length >= 5 &&
    b[0] === 0x4E && b[1] === 0x45 && b[2] === 0x53 && b[3] === 0x4D && b[4] === 0x1A;
}

export function isNSFEFormat(buffer: ArrayBuffer): boolean {
  const b = new Uint8Array(buffer);
  return b.length >= 4 &&
    b[0] === 0x4E && b[1] === 0x53 && b[2] === 0x46 && b[3] === 0x45;
}

export async function parseNSFFile(buffer: ArrayBuffer, filename: string): Promise<TrackerSong> {
  const buf = new Uint8Array(buffer);
  let title = '', artist = '', songs = 1, expansion = 0;
  let loadAddr = 0x8000, initAddr = 0x8000, playAddr = 0x8000;
  let isPAL = false;

  if (isNSFFormat(buffer)) {
    title     = readStr(buf, 14, 34);
    artist    = readStr(buf, 48, 34);
    songs     = buf[6] || 1;
    expansion = buf[127];
    loadAddr  = buf[8]  | (buf[9]  << 8);
    initAddr  = buf[10] | (buf[11] << 8);
    playAddr  = buf[12] | (buf[13] << 8);
    isPAL     = (buf[0x70] & 1) !== 0;
  } else if (isNSFEFormat(buffer)) {
    const dv = new DataView(buffer);
    let off = 4;
    while (off + 8 <= buf.length) {
      const size = dv.getUint32(off, true);
      const id   = String.fromCharCode(buf[off+4], buf[off+5], buf[off+6], buf[off+7]);
      off += 8;
      if (id === 'INFO' && size >= 9) {
        loadAddr  = dv.getUint16(off, true);
        initAddr  = dv.getUint16(off + 2, true);
        playAddr  = dv.getUint16(off + 4, true);
        songs     = buf[off + 6] || 1;
        expansion = buf[off + 8];
      } else if (id === 'auth' && size > 0) {
        let s = off, field = 0;
        for (let i = off; i < off + size; i++) {
          if (buf[i] === 0 || i === off + size - 1) {
            const text = readStr(buf, s, i - s + 1);
            if (field === 0) title  = text;
            if (field === 1) artist = text;
            s = i + 1; field++;
          }
        }
      } else if (id === 'NEND') break;
      off += size;
    }
  } else {
    throw new Error('Not a valid NSF/NSFE file');
  }

  const instruments = buildNESInstruments(expansion);
  // Clamp to 4: only the 4 base APU channels are emulated below.
  // Expansion chip instruments are built for future use but not yet extracted.
  const numCh = 4;

  let pattern: Pattern;
  if (loadAddr > 0 && initAddr > 0 && playAddr > 0) {
    try {
      // Note: runNSFEmulation only extracts notes for the 4 base APU channels.
      // Expansion chip channel emulation (VRC6, VRC7, FDS, MMC5, N163, 5B) is not yet implemented.
      const frameStates = runNSFEmulation(buf, loadAddr, initAddr, playAddr, isPAL, numCh);
      pattern = framesToPattern(frameStates, instruments, numCh);
    } catch {
      // Emulation failed — fall back to empty pattern
      pattern = {
        id: 'p0', name: 'Pattern 1', length: 16,
        channels: Array.from({ length: numCh }, (_, i): ChannelData => ({
          id: `ch${i}`, name: instruments[i]?.name || `CH ${i + 1}`,
          muted: false, solo: false, collapsed: false,
          volume: 100, pan: 0, instrumentId: null, color: null,
          rows: Array.from({ length: 16 }, emptyCell),
        })),
      };
    }
  } else {
    pattern = {
      id: 'p0', name: 'Pattern 1', length: 16,
      channels: Array.from({ length: numCh }, (_, i): ChannelData => ({
        id: `ch${i}`, name: instruments[i]?.name || `CH ${i + 1}`,
        muted: false, solo: false, collapsed: false,
        volume: 100, pan: 0, instrumentId: null, color: null,
        rows: Array.from({ length: 16 }, emptyCell),
      })),
    };
  }

  return {
    name: (title || filename.replace(/\.nsfe?$/i, '')) + (artist ? ` — ${artist}` : ''),
    format: 'NSF' as TrackerFormat,
    patterns: [pattern],
    instruments,
    songPositions: [0],
    songLength: songs,
    restartPosition: 0,
    numChannels: numCh,
    initialSpeed: 1,
    initialBPM: isPAL ? 50 : 60,
  };
}
