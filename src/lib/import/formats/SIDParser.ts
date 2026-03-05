/**
 * SIDParser.ts — Commodore 64 SID file format parser (PSID/RSID)
 *
 * Parses the 124–128 byte header to extract metadata and runs 6502 CPU
 * emulation to intercept SID chip register writes for real note extraction.
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { Pattern, TrackerCell, ChannelData, InstrumentConfig } from '@/types';
import { Cpu6502, type MemoryMap } from '@/lib/import/cpu/Cpu6502';
import { getCachedPatterns, cachePatterns } from '@/lib/import/formats/SIDPatternCache';

function emptyCell(): TrackerCell {
  return { note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 };
}

function readStr(buf: Uint8Array, off: number, len: number): string {
  let s = '';
  for (let i = 0; i < len && buf[off + i] !== 0; i++) s += String.fromCharCode(buf[off + i]);
  return s.trim();
}

/** Detect SID model from flags for display purposes (not used for synthesis). */
function sidModelLabel(flags: number, shift: number): string {
  const model = (flags >> shift) & 0x03;
  return model === 0x02 ? '8580' : '6581';
}

// SID frequency: freq_hz = freqReg * clock / 16777216
function sidFreqToNote(freqReg: number, clock = 985248): number {
  if (freqReg === 0) return 0;
  const freq = freqReg * clock / 16777216;
  if (freq < 20 || freq > 20000) return 0;
  const note = Math.round(12 * Math.log2(freq / 440) + 69);
  return note >= 1 && note <= 96 ? note : 0;
}

interface FrameState {
  notes: (number | null)[];
  regs: number[]; // 21 SID register values for change detection
}

function runSIDEmulation(
  buf: Uint8Array,
  loadAddr: number, initAddr: number, playAddr: number,
  dataOffset: number, numVoices: number, sidClock: number
): FrameState[] {
  // 18000 frames ≈ 6 min PAL / 5 min NTSC — covers most SID tunes
  const FRAMES = 18000;
  const MAX_TOTAL_CYCLES = 80_000_000; // safety budget

  const ram = new Uint8Array(0x10000);
  const code = buf.subarray(dataOffset);
  const codeLen = Math.min(code.length, 0x10000 - loadAddr);
  ram.set(code.subarray(0, codeLen), loadAddr);

  const sidRegs = new Uint8Array(0x20);

  let ciaTimerA = 0x4025; // PAL default
  let ciaTimerACycles = 0;

  // KERNAL ROM stubs — RTS at common entry points
  const KERNAL_STUBS = [
    0xEA31, 0xEA81, 0xFE47, 0xFF48, 0xFF81, 0xFF84, 0xFF87,
    0xFFE1, 0xFFE4, 0xFFD2, 0xFFCF, 0xFFC0, 0xFFC3, 0xFFC6, 0xFFC9, 0xFFCC,
  ];
  for (const addr of KERNAL_STUBS) ram[addr] = 0x60;

  ram[0xFFFA] = 0x48; ram[0xFFFB] = 0xFF; // NMI
  ram[0xFFFC] = 0x00; ram[0xFFFD] = 0x00; // RESET
  ram[0xFFFE] = 0x47; ram[0xFFFF] = 0xFE; // IRQ

  ram[0x0314] = 0x31; ram[0x0315] = 0xEA; // IRQ → $EA31
  ram[0x0316] = 0x66; ram[0x0317] = 0xFE;
  ram[0x0318] = 0x47; ram[0x0319] = 0xFE;

  const mem: MemoryMap = {
    read(addr) {
      addr &= 0xFFFF;
      if (addr >= 0xD400 && addr < 0xD420) return sidRegs[addr - 0xD400];
      if (addr === 0xDC04) return ciaTimerA & 0xFF;
      if (addr === 0xDC05) return (ciaTimerA >> 8) & 0xFF;
      if (addr === 0xDC0D) return 0x01;
      if (addr === 0xD012) return (ciaTimerACycles >> 6) & 0xFF;
      if (addr === 0xD011) return 0x1B;
      return ram[addr];
    },
    write(addr, val) {
      addr &= 0xFFFF;
      ram[addr] = val;
      if (addr >= 0xD400 && addr < 0xD420) sidRegs[addr - 0xD400] = val;
      if (addr === 0xDC04) ciaTimerA = (ciaTimerA & 0xFF00) | val;
      if (addr === 0xDC05) ciaTimerA = (ciaTimerA & 0x00FF) | (val << 8);
    },
  };

  const cpu = new Cpu6502(mem);
  cpu.reset(initAddr);
  cpu.setA(0);
  cpu.callSubroutine(initAddr);

  // Resolve play address for RSID files (playAddr === 0)
  let effectivePlayAddr = playAddr;
  if (effectivePlayAddr === 0) {
    const irqAddr = ram[0x0314] | (ram[0x0315] << 8);
    if (irqAddr !== 0xEA31 && irqAddr >= loadAddr && irqAddr < loadAddr + codeLen) {
      effectivePlayAddr = irqAddr;
    }
  }
  if (effectivePlayAddr === 0) return [];

  const frameStates: FrameState[] = [];
  let totalCycles = 0;

  for (let f = 0; f < FRAMES && totalCycles < MAX_TOTAL_CYCLES; f++) {
    ciaTimerACycles += 20000;
    const beforePC = cpu.getPC();
    cpu.callSubroutine(effectivePlayAddr);
    totalCycles += 5000; // approximate

    const notes: (number | null)[] = new Array(numVoices).fill(null);
    const regs: number[] = [];

    for (let v = 0; v < Math.min(numVoices, 3); v++) {
      const base = v * 7;
      const freqLo  = sidRegs[base + 0];
      const freqHi  = sidRegs[base + 1];
      const control = sidRegs[base + 4];
      const gate    = (control & 0x01) !== 0;
      const freqReg = (freqHi << 8) | freqLo;
      notes[v] = gate && freqReg > 0 ? sidFreqToNote(freqReg, sidClock) : null;
    }

    // Snapshot first 21 SID registers for change detection
    for (let r = 0; r < 21; r++) regs.push(sidRegs[r]);

    frameStates.push({ notes, regs });
  }

  return frameStates;
}

// ── Speed detection ──

function gcd(a: number, b: number): number {
  a = Math.abs(a); b = Math.abs(b);
  while (b) { [a, b] = [b, a % b]; }
  return a;
}

/** Detect frames-per-row by analyzing SID register change intervals */
function detectSpeed(frames: FrameState[]): number {
  // Find frames where ANY SID register changed from previous frame
  const changeFrames: number[] = [];
  for (let f = 1; f < frames.length; f++) {
    for (let r = 0; r < 21; r++) {
      if (frames[f].regs[r] !== frames[f - 1].regs[r]) {
        changeFrames.push(f);
        break;
      }
    }
  }

  if (changeFrames.length < 3) return 6;

  // Compute intervals between consecutive register-change frames
  const intervals: number[] = [];
  for (let i = 1; i < changeFrames.length; i++) {
    const iv = changeFrames[i] - changeFrames[i - 1];
    if (iv > 0 && iv <= 24) intervals.push(iv);
  }
  if (intervals.length === 0) return 6;

  // GCD of first ~200 intervals (sufficient sample, avoids outlier noise)
  let g = intervals[0];
  for (let i = 1; i < Math.min(intervals.length, 200); i++) {
    g = gcd(g, intervals[i]);
    if (g === 1) break;
  }
  if (g >= 2 && g <= 12) return g;

  // GCD was 1 (noise) — fall back to most common interval
  const hist = new Map<number, number>();
  for (const iv of intervals) hist.set(iv, (hist.get(iv) || 0) + 1);
  let bestIv = 6, bestCount = 0;
  for (const [iv, count] of hist) {
    if (iv >= 2 && iv <= 12 && count > bestCount) {
      bestCount = count; bestIv = iv;
    }
  }
  return bestIv;
}

// ── Frame → Row conversion ──

function framesToRows(frames: FrameState[], speed: number, numCh: number): TrackerCell[][] {
  const totalRows = Math.floor(frames.length / speed);
  const rows: TrackerCell[][] = [];
  const lastNote = new Array(numCh).fill(0);

  for (let row = 0; row < totalRows; row++) {
    const fs = frames[row * speed];
    const cells: TrackerCell[] = [];
    for (let ch = 0; ch < numCh; ch++) {
      const cell = emptyCell();
      const n = ch < fs.notes.length ? fs.notes[ch] : null;
      if (n !== null && n > 0 && n !== lastNote[ch]) {
        cell.note = n;
        cell.instrument = ch + 1;
        lastNote[ch] = n;
      } else if (n === null && lastNote[ch] > 0) {
        cell.note = 97; // note-off
        lastNote[ch] = 0;
      }
      cells.push(cell);
    }
    rows.push(cells);
  }
  return rows;
}

// ── Trim trailing silence ──

function trimTrailingSilence(rows: TrackerCell[][]): TrackerCell[][] {
  let lastActive = rows.length - 1;
  while (lastActive > 0) {
    if (rows[lastActive].some(c => c.note > 0 && c.note < 97)) break;
    lastActive--;
  }
  return rows.slice(0, Math.min(lastActive + 8, rows.length));
}

// ── Pattern length selection ──

function chooseBestPatternLength(totalRows: number): number {
  for (const len of [64, 32, 16]) {
    const n = Math.ceil(totalRows / len);
    if (n >= 2 && n <= 128) return len;
  }
  return totalRows <= 16 ? 16 : 64;
}

// ── Pattern splitting + deduplication ──

function rowFingerprint(row: TrackerCell[]): string {
  return row.map(c => c.note > 0 ? `${c.note}:${c.instrument}` : '_').join(',');
}

function splitIntoPatterns(
  allRows: TrackerCell[][],
  numCh: number,
  instruments: InstrumentConfig[],
  patternLength: number,
): { patterns: Pattern[]; songPositions: number[] } {
  const numChunks = Math.ceil(allRows.length / patternLength);
  const chunks: TrackerCell[][][] = [];

  for (let p = 0; p < numChunks; p++) {
    const start = p * patternLength;
    const chunk: TrackerCell[][] = [];
    for (let r = start; r < start + patternLength; r++) {
      chunk.push(r < allRows.length
        ? allRows[r]
        : Array.from({ length: numCh }, emptyCell));
    }
    chunks.push(chunk);
  }

  // Fingerprint each chunk for dedup
  const chunkFPs = chunks.map(chunk =>
    chunk.map(rowFingerprint).join('|'));

  const uniquePatterns: Pattern[] = [];
  const fpToIdx = new Map<string, number>();
  const songPositions: number[] = [];

  for (let p = 0; p < chunks.length; p++) {
    const fp = chunkFPs[p];
    if (fpToIdx.has(fp)) {
      songPositions.push(fpToIdx.get(fp)!);
    } else {
      const idx = uniquePatterns.length;
      fpToIdx.set(fp, idx);
      const channels: ChannelData[] = Array.from({ length: numCh }, (_, ch): ChannelData => ({
        id: `ch${ch}`,
        name: instruments[ch]?.name || `SID ${ch + 1}`,
        muted: false, solo: false, collapsed: false,
        volume: 100, pan: 0, instrumentId: null, color: null,
        rows: chunks[p].map(row => ({ ...row[ch] })),
      }));
      uniquePatterns.push({
        id: `p${idx}`, name: `Pattern ${idx + 1}`,
        length: patternLength, channels,
      });
      songPositions.push(idx);
    }
  }
  return { patterns: uniquePatterns, songPositions };
}

// ── Loop detection — trim repeating tail, find restart position ──

function detectLoop(positions: number[]): { trimEnd: number; restartPos: number } {
  const len = positions.length;
  if (len < 6) return { trimEnd: len, restartPos: 0 };

  for (let loopLen = 2; loopLen <= Math.floor(len / 3); loopLen++) {
    const tailStart = len - loopLen * 2;
    if (tailStart < 0) continue;

    // Check if last 2×loopLen form a repeating block
    let isLoop = true;
    for (let j = 0; j < loopLen; j++) {
      if (positions[tailStart + j] !== positions[tailStart + loopLen + j]) {
        isLoop = false; break;
      }
    }
    if (!isLoop) continue;

    // Walk backwards to find where this loop body starts
    let loopStart = tailStart;
    while (loopStart >= loopLen) {
      let matches = true;
      for (let j = 0; j < loopLen; j++) {
        if (positions[loopStart - loopLen + j] !== positions[loopStart + j]) {
          matches = false; break;
        }
      }
      if (matches) loopStart -= loopLen;
      else break;
    }

    // Keep intro + one full loop iteration
    return { trimEnd: loopStart + loopLen, restartPos: loopStart };
  }
  return { trimEnd: len, restartPos: 0 };
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
  const dataOffset = dv.getUint16(6, false);
  const loadAddrField = dv.getUint16(8, false);
  const initAddr   = dv.getUint16(10, false);
  const playAddr   = dv.getUint16(12, false);
  const title      = readStr(buf, 22, 32);
  const author     = readStr(buf, 54, 32);
  const flags      = version >= 2 && buf.length > 119 ? dv.getUint16(118, false) : 0;
  const has2ndSID  = version >= 2 && buf.length > 120 && buf[120] !== 0;
  const has3rdSID  = version >= 3 && buf.length > 121 && buf[121] !== 0;

  // PAL/NTSC detection from flags bits 2-3
  const clockFlag = (flags >> 2) & 0x03;
  const isNTSC = clockFlag === 2;
  const frameRate = isNTSC ? 60 : 50;

  let loadAddr = loadAddrField;
  if (loadAddr === 0 && buf.length > dataOffset + 1) {
    loadAddr = buf[dataOffset] | (buf[dataOffset + 1] << 8);
  }

  const model1 = sidModelLabel(flags, 2);
  const model2 = has2ndSID ? sidModelLabel(flags, 6) : model1;

  const instruments: InstrumentConfig[] = [];
  const chips = 1 + (has2ndSID ? 1 : 0) + (has3rdSID ? 1 : 0);
  let id = 1;
  for (let chip = 0; chip < chips; chip++) {
    const model = chip === 0 ? model1 : model2;
    const label = chip > 0 ? `SID${chip + 1}` : 'SID';
    for (let v = 1; v <= 3; v++) {
      instruments.push({
        id: id++,
        name: `${label} Voice ${v} (${model})`,
        type: 'synth', synthType: 'C64SID',
        effects: [], volume: 0, pan: 0,
      });
    }
  }

  const numCh = instruments.length;
  const sidClock = isNTSC ? 1022727 : 985248;
  const codeOffset = loadAddrField === 0 ? dataOffset + 2 : dataOffset;

  // ── Try cache first ──
  let patterns: Pattern[];
  let songPositions: number[];
  let restartPosition = 0;
  let speed = 6;
  let bpm = Math.round(frameRate * 5 / 2); // PAL→125, NTSC→150

  const cached = await getCachedPatterns(buffer);
  if (cached) {
    patterns = cached.patterns;
    songPositions = cached.songPositions;
    restartPosition = cached.restartPosition;
    speed = cached.speed;
    bpm = cached.bpm;
  } else {
    // ── Run 6502 emulation and build patterns ──
    const emptyPat = (): Pattern => ({
      id: 'p0', name: 'Pattern 1', length: 16,
      channels: Array.from({ length: numCh }, (_, i): ChannelData => ({
        id: `ch${i}`, name: instruments[i]?.name || `SID ${i + 1}`,
        muted: false, solo: false, collapsed: false,
        volume: 100, pan: 0, instrumentId: null, color: null,
        rows: Array.from({ length: 16 }, emptyCell),
      })),
    });

    if (loadAddr > 0 && initAddr > 0) {
      try {
        const frameStates = runSIDEmulation(buf, loadAddr, initAddr, playAddr, codeOffset, numCh, sidClock);

        if (frameStates.length > 0) {
          speed = detectSpeed(frameStates);
          bpm = Math.round(frameRate * 5 / 2);

          let rows = framesToRows(frameStates, speed, numCh);
          rows = trimTrailingSilence(rows);

          if (rows.length > 0) {
            const patLen = chooseBestPatternLength(rows.length);
            const result = splitIntoPatterns(rows, numCh, instruments, patLen);
            patterns = result.patterns;
            songPositions = result.songPositions;

            // Detect and trim loop
            const loop = detectLoop(songPositions);
            songPositions = songPositions.slice(0, loop.trimEnd);
            restartPosition = loop.restartPos;

            // Add Fxx speed command in first row of first pattern
            if (patterns.length > 0 && patterns[0].channels.length > 0) {
              patterns[0].channels[0].rows[0].effTyp = 0xF;
              patterns[0].channels[0].rows[0].eff = speed;
            }
          } else {
            patterns = [emptyPat()];
            songPositions = [0];
          }
        } else {
          patterns = [emptyPat()];
          songPositions = [0];
        }
      } catch {
        patterns = [emptyPat()];
        songPositions = [0];
      }
    } else {
      patterns = [emptyPat()];
      songPositions = [0];
    }

    // Fire-and-forget cache write
    void cachePatterns(buffer, patterns, songPositions, restartPosition, speed, bpm);
  }

  // Add import metadata to all patterns
  const meta = {
    sourceFormat: 'SID',
    sourceFile: filename,
    importedAt: new Date().toISOString(),
    originalChannelCount: numCh,
    originalPatternCount: patterns.length,
    originalInstrumentCount: instruments.length,
  };
  for (const p of patterns) p.importMetadata = meta;

  return {
    name: (title || filename.replace(/\.sid$/i, '')) + (author ? ` — ${author}` : ''),
    format: 'SID' as TrackerFormat,
    patterns,
    instruments,
    songPositions,
    songLength: songPositions.length,
    restartPosition,
    numChannels: numCh,
    initialSpeed: speed,
    initialBPM: bpm,
    c64SidFileData: new Uint8Array(buffer),
  };
}
