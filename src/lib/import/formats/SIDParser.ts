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
import { parseSIDHeader } from '@/lib/sid/SIDHeaderParser';
import { DEFAULT_FURNACE } from '@/types/instrument/defaults';
import {
  segmentNotes, inferInstruments, fitGrid, rowOfFrame,
  type VoiceFrame, type DecodedNote,
} from '@/lib/import/formats/sidTraceDecode';

function emptyCell(): TrackerCell {
  return { note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 };
}

function readStr(buf: Uint8Array, off: number, len: number): string {
  let s = '';
  for (let i = 0; i < len && buf[off + i] !== 0; i++) s += String.fromCharCode(buf[off + i]);
  return s.trim();
}

/** Per-frame register snapshot of every voice (chips * 3). */
type FrameState = VoiceFrame[];

/** The per-frame register trace of a SID tune: what `traceSid` returns. */
export interface SidTrace {
  /** [voice][frame], voice = chip * 3 + voice-in-chip. */
  voices: VoiceFrame[][];
  /** [frame] = the 32 raw register bytes of every chip, chip after chip (chips * 32 bytes). */
  chipRegs: Uint8Array[];
  frameRate: number;
  chips: number;
  chipBases: number[];
  chipModels: string[];
  /** SID clock in Hz (PAL 985248, NTSC 1022727). */
  clock: number;
  frames: number;
}

interface SidSetup {
  loadAddrField: number; loadAddr: number; initAddr: number; playAddr: number;
  codeOffset: number; chipBases: number[]; chipModels: string[]; isNTSC: boolean;
}

/** Header fields the emulation and the song builder both need. */
function readSidSetup(buf: Uint8Array): SidSetup {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const dataOffset = dv.getUint16(6, false);
  const loadAddrField = dv.getUint16(8, false);
  const initAddr = dv.getUint16(10, false);
  const playAddr = dv.getUint16(12, false);
  const header = parseSIDHeader(buf);
  const chipModels = header?.chipModels ?? ['Unknown'];
  const chipBases = [0xD400];
  if (header?.secondSID) chipBases.push(0xD000 + buf[0x7A] * 16);
  if (header?.thirdSID) chipBases.push(0xD000 + buf[0x7B] * 16);
  let loadAddr = loadAddrField;
  if (loadAddr === 0 && buf.length > dataOffset + 1) loadAddr = buf[dataOffset] | (buf[dataOffset + 1] << 8);
  return {
    loadAddrField, loadAddr, initAddr, playAddr,
    codeOffset: loadAddrField === 0 ? dataOffset + 2 : dataOffset,
    chipBases, chipModels, isNTSC: header?.clockSpeed === 'NTSC',
  };
}

/**
 * Run the tune's 6502 code and return the per-frame SID register trace.
 * Pure: no cache, no song building. Null when the file is not a PSID/RSID or
 * has no init/play code to run. The one trace loop (parseSIDFile and the
 * GoatTracker builder both read it).
 */
export function traceSid(buffer: ArrayBuffer): SidTrace | null {
  if (!isSIDFormat(buffer)) return null;
  const buf = new Uint8Array(buffer);
  const st = readSidSetup(buf);
  if (!(st.loadAddr > 0 && st.initAddr > 0)) return null;
  const run = runSIDEmulation(buf, st.loadAddr, st.initAddr, st.playAddr, st.codeOffset, st.chipBases);
  if (run.frameStates.length === 0) return null;
  const numVoices = st.chipBases.length * 3;
  return {
    voices: Array.from({ length: numVoices }, (_, v) => run.frameStates.map((fs) => fs[v])),
    chipRegs: run.chipRegs,
    frameRate: st.isNTSC ? 60 : 50,
    chips: st.chipBases.length,
    chipBases: st.chipBases,
    chipModels: st.chipModels,
    clock: st.isNTSC ? 1022727 : 985248,
    frames: run.frameStates.length,
  };
}

function runSIDEmulation(
  buf: Uint8Array,
  loadAddr: number, initAddr: number, playAddr: number,
  dataOffset: number, chipBases: number[],
): { frameStates: FrameState[]; chipRegs: Uint8Array[] } {
  const numVoices = chipBases.length * 3;
  // 18000 frames ≈ 6 min PAL / 5 min NTSC — covers most SID tunes
  const FRAMES = 18000;
  const MAX_TOTAL_CYCLES = 80_000_000; // safety budget

  const ram = new Uint8Array(0x10000);
  const code = buf.subarray(dataOffset);
  const codeLen = Math.min(code.length, 0x10000 - loadAddr);
  ram.set(code.subarray(0, codeLen), loadAddr);

  // One 32-byte register window per chip, at the chip's base address.
  const sidRegs = new Uint8Array(0x20 * chipBases.length);
  const chipOf = (addr: number): number => chipBases.findIndex((b) => addr >= b && addr < b + 0x20);

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
      if ((addr >= 0xD400 && addr < 0xD800) || addr >= 0xDE00) { const c = chipOf(addr); if (c >= 0) return sidRegs[c * 0x20 + addr - chipBases[c]]; }
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
      if ((addr >= 0xD400 && addr < 0xD800) || addr >= 0xDE00) { const c = chipOf(addr); if (c >= 0) sidRegs[c * 0x20 + addr - chipBases[c]] = val; }
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
  if (effectivePlayAddr === 0) return { frameStates: [], chipRegs: [] };

  const frameStates: FrameState[] = [];
  const chipRegs: Uint8Array[] = [];
  let totalCycles = 0;

  for (let f = 0; f < FRAMES && totalCycles < MAX_TOTAL_CYCLES; f++) {
    ciaTimerACycles += 20000;
    cpu.callSubroutine(effectivePlayAddr);
    totalCycles += 5000; // approximate

    const voiceFrames: VoiceFrame[] = [];
    for (let v = 0; v < numVoices; v++) {
      const chip = Math.floor(v / 3) * 0x20;
      const base = chip + (v % 3) * 7;
      voiceFrames.push({
        freq: (sidRegs[base + 1] << 8) | sidRegs[base + 0],
        pulse: ((sidRegs[base + 3] & 0x0F) << 8) | sidRegs[base + 2],
        control: sidRegs[base + 4],
        ad: sidRegs[base + 5],
        sr: sidRegs[base + 6],
        cutoff: sidRegs[chip + 22],
        resRoute: sidRegs[chip + 23],
        modeVol: sidRegs[chip + 24],
      });
    }
    frameStates.push(voiceFrames);
    chipRegs.push(sidRegs.slice());
  }

  return { frameStates, chipRegs };
}

// ── Notes on the fitted row grid ──

/** Lay gate-segmented notes on rows of `framesPerRow` frames from `origin`. */
function notesToRows(
  notes: DecodedNote[], grid: { framesPerRow: number; origin: number },
  frameCount: number, numCh: number,
): TrackerCell[][] {
  const totalRows = rowOfFrame(grid, frameCount - 1) + 1;
  const rows: TrackerCell[][] = Array.from({ length: totalRows }, () =>
    Array.from({ length: numCh }, emptyCell));
  const byVoice: DecodedNote[][] = Array.from({ length: numCh }, () => []);
  for (const n of notes) if (n.voice < numCh) byVoice[n.voice].push(n);
  for (let v = 0; v < numCh; v++) {
    const list = byVoice[v];
    for (let i = 0; i < list.length; i++) {
      const n = list[i];
      const row = rowOfFrame(grid, n.start);
      if (row >= totalRows) continue;
      const cell = rows[row][v];
      cell.note = n.note;
      cell.instrument = n.instrument;
    }
    // Note-off at the gate fall, unless the next note starts within two
    // frames (hard restart) or its row is taken.
    for (let i = 0; i < list.length; i++) {
      const n = list[i];
      if (n.end === null) continue;
      const next = list[i + 1];
      if (next && next.start - n.end <= 2) continue;
      const row = rowOfFrame(grid, n.end);
      if (row < totalRows && rows[row][v].note === 0) rows[row][v].note = 97;
    }
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
  channelNames: string[],
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
        name: channelNames[ch] || `SID ${ch + 1}`,
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

function makeSidInstrument(id: number, n: DecodedNote, model: string): InstrumentConfig {
  const p = n.program;
  const wave = (bit: number) => p.waves.some((w) => (w & bit) !== 0);
  return {
    id,
    name: `Instrument ${id}`,
    type: 'synth', synthType: 'C64SID',
    effects: [], volume: 0, pan: 0,
    furnace: {
      ...DEFAULT_FURNACE,
      chipType: 3,
      c64: {
        triOn: wave(1), sawOn: wave(2), pulseOn: wave(4), noiseOn: wave(8),
        a: n.frame.ad >> 4, d: n.frame.ad & 15, s: n.frame.sr >> 4, r: n.frame.sr & 15,
        duty: p.pulseStart,
        ringMod: (p.ringSync & 4) !== 0, oscSync: (p.ringSync & 2) !== 0,
        toFilter: p.toFilter,
        filterLP: (p.filterMode & 1) !== 0, filterBP: (p.filterMode & 2) !== 0, filterHP: (p.filterMode & 4) !== 0,
        filterResonance: p.resonance,
        filterCutoff: n.frame.cutoff << 3,
      },
    },
    metadata: { sidModel: model },
  } as unknown as InstrumentConfig;
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

  const title      = readStr(buf, 22, 32);
  const author     = readStr(buf, 54, 32);
  // Chips, models and clock from the one header reader (SIDHeaderParser).
  const setup = readSidSetup(buf);
  const { chipModels, chipBases, isNTSC } = setup;
  const frameRate = isNTSC ? 60 : 50;

  const voiceInstruments: InstrumentConfig[] = [];
  const chips = chipBases.length;
  let id = 1;
  for (let chip = 0; chip < chips; chip++) {
    const model = chipModels[chip] === '8580' ? '8580' : '6581';
    const label = chip > 0 ? `SID${chip + 1}` : 'SID';
    for (let v = 1; v <= 3; v++) {
      voiceInstruments.push({
        id: id++,
        name: `${label} Voice ${v} (${model})`,
        type: 'synth', synthType: 'C64SID',
        effects: [], volume: 0, pan: 0,
      });
    }
  }

  const numCh = voiceInstruments.length;
  const channelNames = voiceInstruments.map((i) => i.name);
  let instruments: InstrumentConfig[] = voiceInstruments;
  const sidClock = isNTSC ? 1022727 : 985248;

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
    if (cached.instruments && cached.instruments.length > 0) instruments = cached.instruments;
    bpm = cached.bpm;
  } else {
    // ── Run 6502 emulation and build patterns ──
    const emptyPat = (): Pattern => ({
      id: 'p0', name: 'Pattern 1', length: 16,
      channels: Array.from({ length: numCh }, (_, i): ChannelData => ({
        id: `ch${i}`, name: channelNames[i] || `SID ${i + 1}`,
        muted: false, solo: false, collapsed: false,
        volume: 100, pan: 0, instrumentId: null, color: null,
        rows: Array.from({ length: 16 }, emptyCell),
      })),
    });

    if (setup.loadAddr > 0 && setup.initAddr > 0) {
      try {
        const trace = traceSid(buffer);

        if (trace) {
          bpm = Math.round(frameRate * 5 / 2);

          // Gate-segmented notes, one instrument per distinct sound, rows fitted to the note starts.
          const voices = trace.voices;
          const decoded = segmentNotes(voices, sidClock);
          const reps = inferInstruments(decoded);
          if (reps.length > 0) {
            instruments = reps.map((n, i) => makeSidInstrument(i + 1, n, chipModels[Math.floor(n.voice / 3)] === '8580' ? '8580' : '6581'));
          }
          const grid = fitGrid(decoded);
          speed = grid.framesPerRow;

          let rows = notesToRows(decoded, grid, trace.frames, numCh);
          rows = trimTrailingSilence(rows);

          if (rows.length > 0) {
            const patLen = chooseBestPatternLength(rows.length);
            const result = splitIntoPatterns(rows, numCh, channelNames, patLen);
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
    void cachePatterns(buffer, patterns, songPositions, restartPosition, speed, bpm, instruments);
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
