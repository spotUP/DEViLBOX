/**
 * SIDParser.ts — Commodore 64 SID file format parser (PSID/RSID)
 *
 * Parses the 124–128 byte header to extract metadata and runs 6502 CPU
 * emulation to intercept SID chip register writes for real note extraction.
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { Pattern, TrackerCell, ChannelData, InstrumentConfig } from '@/types';
import { DEFAULT_FURNACE } from '@/types/instrument';
import { Cpu6502, type MemoryMap } from '@/lib/import/cpu/Cpu6502';

function emptyCell(): TrackerCell {
  return { note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 };
}

function readStr(buf: Uint8Array, off: number, len: number): string {
  let s = '';
  for (let i = 0; i < len && buf[off + i] !== 0; i++) s += String.fromCharCode(buf[off + i]);
  return s.trim();
}

/** Map SID model bits to SynthType. bits[1:0]: 01=6581, 10=8580, 11=both, 00=unknown. */
function sidModelType(flags: number, shift: number): 'FurnaceSID6581' | 'FurnaceSID8580' {
  const model = (flags >> shift) & 0x03;
  return model === 0x02 ? 'FurnaceSID8580' : 'FurnaceSID6581';
}

// SID frequency: freq_hz = freqReg * clock / 16777216
function sidFreqToNote(freqReg: number, clock = 985248): number {
  if (freqReg === 0) return 0;
  const freq = freqReg * clock / 16777216;
  if (freq < 20 || freq > 20000) return 0;
  const note = Math.round(12 * Math.log2(freq / 440) + 69);
  return note >= 1 && note <= 96 ? note : 0;
}

interface FrameNotes { notes: (number | null)[]; }

function runSIDEmulation(
  buf: Uint8Array,
  loadAddr: number, initAddr: number, playAddr: number,
  dataOffset: number, numVoices: number, sidClock: number
): FrameNotes[] {
  const FRAMES = 900;

  const ram = new Uint8Array(0x10000);
  const code = buf.subarray(dataOffset);
  const codeLen = Math.min(code.length, 0x10000 - loadAddr);
  ram.set(code.subarray(0, codeLen), loadAddr);

  // SID register shadow at $D400
  const sidRegs = new Uint8Array(0x20);

  const mem: MemoryMap = {
    read(addr) {
      if (addr >= 0xD400 && addr < 0xD420) return sidRegs[addr - 0xD400];
      return ram[addr & 0xFFFF];
    },
    write(addr, val) {
      ram[addr & 0xFFFF] = val;
      if (addr >= 0xD400 && addr < 0xD420) sidRegs[addr - 0xD400] = val;
    },
  };

  const cpu = new Cpu6502(mem);
  cpu.reset(initAddr);
  cpu.setA(0); // song 0
  cpu.callSubroutine(initAddr);

  const frameStates: FrameNotes[] = [];

  for (let f = 0; f < FRAMES; f++) {
    cpu.callSubroutine(playAddr);

    const notes: (number | null)[] = new Array(numVoices).fill(null);

    // Extract notes for each voice (7 regs per voice)
    for (let v = 0; v < Math.min(numVoices, 3); v++) {
      const base = v * 7;
      const freqLo   = sidRegs[base + 0];
      const freqHi   = sidRegs[base + 1];
      const control  = sidRegs[base + 4];
      const gate     = (control & 0x01) !== 0;
      const freqReg  = (freqHi << 8) | freqLo;
      notes[v] = gate && freqReg > 0 ? sidFreqToNote(freqReg, sidClock) : null;
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
    id: `ch${i}`, name: instruments[i]?.name || `SID ${i + 1}`,
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
        cell.note = 97;
        lastNote[ch] = 0;
      }
    }
  }

  return { id: 'p0', name: 'Pattern 1', length: rows, channels };
}

export function isSIDFormat(buffer: ArrayBuffer): boolean {
  const b = new Uint8Array(buffer);
  return b.length >= 4 &&
    ((b[0] === 0x50 && b[1] === 0x53 && b[2] === 0x49 && b[3] === 0x44) ||
     (b[0] === 0x52 && b[1] === 0x53 && b[2] === 0x49 && b[3] === 0x44));
}

export async function parseSIDFile(buffer: ArrayBuffer, filename: string): Promise<TrackerSong> {
  if (!isSIDFormat(buffer)) throw new Error('Not a valid SID file');
  const buf = new Uint8Array(buffer);
  const dv  = new DataView(buffer);

  const version    = dv.getUint16(4, false);
  const dataOffset = dv.getUint16(6, false);   // offset to C64 data
  const loadAddrField = dv.getUint16(8, false); // 0 = read from first 2 bytes of data
  const initAddr   = dv.getUint16(10, false);
  const playAddr   = dv.getUint16(12, false);
  const title      = readStr(buf, 22, 32);
  const author     = readStr(buf, 54, 32);
  const flags      = version >= 2 && buf.length > 119 ? dv.getUint16(118, false) : 0;
  const has2ndSID  = version >= 2 && buf.length > 120 && buf[120] !== 0;
  const has3rdSID  = version >= 3 && buf.length > 121 && buf[121] !== 0;

  // Resolve load address
  let loadAddr = loadAddrField;
  if (loadAddr === 0 && buf.length > dataOffset + 1) {
    loadAddr = buf[dataOffset] | (buf[dataOffset + 1] << 8);
  }

  const st1 = sidModelType(flags, 2);
  const st2 = has2ndSID ? sidModelType(flags, 6) : st1;

  const instruments: InstrumentConfig[] = [];
  const chips = 1 + (has2ndSID ? 1 : 0) + (has3rdSID ? 1 : 0);
  let id = 1;
  for (let chip = 0; chip < chips; chip++) {
    const st = chip === 0 ? st1 : st2;
    const label = chip > 0 ? `SID${chip + 1}` : 'SID';
    for (let v = 1; v <= 3; v++) {
      instruments.push({
        id: id++,
        name: `${label} Voice ${v}`,
        type: 'synth', synthType: st,
        furnace: { ...DEFAULT_FURNACE, chipType: 3, ops: 2 },
      });
    }
  }

  const numCh = instruments.length;

  // SID PAL clock (default). Could detect from flags if needed.
  const sidClock = 985248;

  // Determine actual data offset for code (skip the load address prefix if loadAddr was 0)
  const codeOffset = loadAddrField === 0 ? dataOffset + 2 : dataOffset;

  let pattern: Pattern;
  if (loadAddr > 0 && initAddr > 0 && playAddr > 0) {
    try {
      const frameStates = runSIDEmulation(buf, loadAddr, initAddr, playAddr, codeOffset, numCh, sidClock);
      pattern = framesToPattern(frameStates, instruments, numCh);
    } catch {
      pattern = {
        id: 'p0', name: 'Pattern 1', length: 16,
        channels: Array.from({ length: numCh }, (_, i): ChannelData => ({
          id: `ch${i}`, name: instruments[i]?.name || `SID ${i + 1}`,
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
        id: `ch${i}`, name: instruments[i]?.name || `SID ${i + 1}`,
        muted: false, solo: false, collapsed: false,
        volume: 100, pan: 0, instrumentId: null, color: null,
        rows: Array.from({ length: 16 }, emptyCell),
      })),
    };
  }

  return {
    name: (title || filename.replace(/\.sid$/i, '')) + (author ? ` — ${author}` : ''),
    format: 'SID' as TrackerFormat,
    patterns: [pattern],
    instruments,
    songPositions: [0],
    songLength: 1,
    restartPosition: 0,
    numChannels: numCh,
    initialSpeed: 1,
    initialBPM: 50,
  };
}
