/**
 * SunTronicParser.ts — SunTronic (The Sun Machine) Amiga music format parser
 *
 * SunTronic modules are 68k executables (NOT Amiga HUNK files — raw code).
 * The player code IS the module. Data pointers are found by scanning for
 * specific 68k opcode patterns in the binary.
 *
 * Detection (from DTP_Check2 in suntronic_mod.asm):
 *   - Offset 0:  0x48E7FFFE  (MOVEM.L D0-A6,-(SP))
 *   - Offset 4:  0x4DFA      (LEA (d16,PC),A6)
 *   - Offset 8:  0x4A2E0018  OR  0x4A2E0010  (TST.B ($18,A6) or ($10,A6))
 *
 * Variant detection (from initsound):
 *   - Byte at module offset 11 determines the variant:
 *     - 0x18: 4 channels, per-voice stride 0x130 (304 bytes)
 *     - 0x10 with data[0x10] != 0: 4 channels, per-voice stride 0x68 (104 bytes)
 *     - 0x10 with data[0x10] == 0: 4 channels, per-voice stride 0x62 (98 bytes)
 *
 * Data pointer resolution (from initplayer):
 *   1. Scan for 0x43EE → next word is displacement → ptrA = modBase + disp + module[6..7] + 6
 *   2. Scan for two 0x45EE patterns → same resolution → ptrB and ptrC
 *   3. These pointers give: sample data table (ptrA), sequence data (ptrB), related data (ptrC)
 *
 * Reference: third-party/uade-3.05/amigasrc/players/suntronic/suntronic_mod.asm
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { InstrumentConfig } from '@/types';
import type { UADEPatternLayout, UADEVariablePatternLayout } from '@/engine/uade/UADEPatternEncoder';
import { encodeMODCell, decodeMODCell } from '@/engine/uade/encoders/MODEncoder';
import { createSamplerInstrument } from './AmigaUtils';
import {
  isSunTronicV13Format,
  parseSunTronicV13Score,
  sunTronicV13Encoder,
  sunCommandLen,
  sunPitchToNote,
} from './SunTronicV13';
import type { SunV13Score } from './SunTronicV13';

// ── Binary helpers ──────────────────────────────────────────────────────────

function u16BE(buf: Uint8Array, off: number): number {
  return ((buf[off] << 8) | buf[off + 1]) >>> 0;
}

function u32BE(buf: Uint8Array, off: number): number {
  return (((buf[off] << 24) | (buf[off + 1] << 16) | (buf[off + 2] << 8) | buf[off + 3]) >>> 0);
}

function s16BE(buf: Uint8Array, off: number): number {
  const v = (buf[off] << 8) | buf[off + 1];
  return v < 0x8000 ? v : v - 0x10000;
}

// ── Format detection ────────────────────────────────────────────────────────

/**
 * Return true if the buffer is a SunTronic RAW-RIP module (headerless 68k
 * player code, .sun/.tsm).
 *
 * Mirrors DTP_Check2 from suntronic_mod.asm exactly:
 *   CMP.L #$48E7FFFE,(A0)    ; offset 0
 *   CMP.W #$4DFA,(4,A0)      ; offset 4
 *   CMP.L #$4A2E0018,(8,A0)  ; offset 8 variant A
 *   CMP.L #$4A2E0010,(8,A0)  ; offset 8 variant B
 */
export function isSunTronicRawRip(buffer: ArrayBuffer | Uint8Array): boolean {
  const buf = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (buf.length < 16) return false;

  if (u32BE(buf, 0) !== 0x48E7FFFE) return false;
  if (u16BE(buf, 4) !== 0x4DFA) return false;

  const off8 = u32BE(buf, 8);
  return off8 === 0x4A2E0018 || off8 === 0x4A2E0010;
}

/**
 * Return true for ANY SunTronic module: raw-rip (.sun/.tsm) OR V1.3
 * "Delirium" hunk executable (.src/.pc, SUNTronicTunes corpus).
 */
export function isSunTronicFormat(buffer: ArrayBuffer | Uint8Array): boolean {
  return isSunTronicRawRip(buffer) || isSunTronicV13Format(buffer);
}

// ── Data pointer resolution ─────────────────────────────────────────────────

/**
 * Resolve data pointers by scanning for 68k opcodes, mirroring initplayer.
 *
 * From the ASM:
 *   1. Read word at offset 6 (the LEA displacement from offset 4) → base displacement
 *   2. Scan for 0x43EE → read next signed word → ptrDA = modBase + disp + baseDisp + 6
 *   3. Scan for first 0x45EE → same formula → ptrE2
 *   4. Scan for second 0x45EE → same formula → ptrD6
 *
 * Returns { ptrDA, ptrE2, ptrD6 } as file offsets, or null if scanning fails.
 */
function resolveDataPointers(buf: Uint8Array): {
  ptrDA: number; ptrE2: number; ptrD6: number;
} | null {
  const len = buf.length;
  if (len < 8) return null;

  // Base displacement from the LEA at offset 4: word at offset 6
  // ASM: MOVE.W (6,A0),D7 — this is the 16-bit displacement from the LEA (d16,PC),A6
  const baseDisp = s16BE(buf, 6);

  // Scan limit: half the file length in words (ASM: LSR.W #1,D7 on file size)
  // But the file size D0 from GetListData isn't the buf length — it's stored at modptr+4.
  // For scanning purposes, we just use the buffer length.
  const maxWords = Math.min(Math.floor(len / 2), 0x8000);

  // Step 1: Scan for 0x43EE from the beginning
  let pos = 0;
  let found43EE = -1;
  for (let i = 0; i < maxWords && pos + 3 < len; i++, pos += 2) {
    if (u16BE(buf, pos) === 0x43EE) {
      found43EE = pos;
      break;
    }
  }
  if (found43EE < 0 || found43EE + 3 >= len) return null;

  // ptrDA: modBase + displacement_after_43EE + baseDisp + 6
  // ASM: MOVE.L modptr,A2; ADD.W (A0),A2; ADD.W (6,A1),A2; ADDQ.W #6,A2
  // A0 points to the word AFTER 0x43EE (the displacement word)
  // A1 = modBase (start of file)
  const disp43EE = s16BE(buf, found43EE + 2);
  const ptrDA = disp43EE + baseDisp + 6;
  if (ptrDA < 0 || ptrDA >= len) return null;

  // Step 2: Continue scanning for first 0x45EE
  // ASM resets A0 to A1 (start of file) and D0 to D7 (full scan range)
  pos = 0;
  let wordsLeft = maxWords;
  let found45EE_1 = -1;
  for (; wordsLeft >= 0 && pos + 3 < len; wordsLeft--, pos += 2) {
    if (u16BE(buf, pos) === 0x45EE) {
      found45EE_1 = pos;
      pos += 2;
      wordsLeft--;
      break;
    }
  }
  if (found45EE_1 < 0) return null;

  // Step 3: Continue scanning for second 0x45EE from current position
  // ASM: CMP.W #$45EE,(A0)+ ... reuses same D0 counter
  let found45EE_2 = -1;
  for (; wordsLeft >= 0 && pos + 3 < len; wordsLeft--, pos += 2) {
    if (u16BE(buf, pos) === 0x45EE) {
      found45EE_2 = pos;
      pos += 2;
      break;
    }
  }
  if (found45EE_2 < 0 || found45EE_2 + 3 >= len) return null;

  // ptrE2: same formula as ptrDA but using the displacement after second 0x45EE
  // ASM at lbC000170: ADD.W (A0),A2; ADD.W (6,A1),A2; ADDQ.W #6,A2
  const disp45EE_2 = s16BE(buf, found45EE_2 + 2);
  const ptrE2 = disp45EE_2 + baseDisp + 6;
  if (ptrE2 < 0 || ptrE2 >= len) return null;

  // Step 4: Continue scanning for third 0x45EE
  // ASM at lbC000182: scans for next 0x45EE → ptrD6
  let found45EE_3 = -1;
  for (; wordsLeft >= 0 && pos + 3 < len; wordsLeft--, pos += 2) {
    if (u16BE(buf, pos) === 0x45EE) {
      found45EE_3 = pos;
      break;
    }
  }
  if (found45EE_3 < 0 || found45EE_3 + 3 >= len) return null;

  const disp45EE_3 = s16BE(buf, found45EE_3 + 2);
  const ptrD6 = disp45EE_3 + baseDisp + 6;
  if (ptrD6 < 0 || ptrD6 >= len) return null;

  return { ptrDA, ptrE2, ptrD6 };
}

// ── Sample extraction ───────────────────────────────────────────────────────

/**
 * Extract sample instruments from the data table.
 *
 * From initsound:
 *   - ptrDA points to the sample data table: 4 longwords (sample pointers)
 *     followed by 4 bytes (per-voice parameters stored at offset 0x12E in each voice).
 *   - Each sample pointer is an ABSOLUTE address from the original compilation.
 *     To convert to file offset: fileOff = absPtr - origin.
 *   - The origin (base address) = first longword at ptrE2. This is the absolute
 *     address that corresponds to file offset 0 (verified across all test files).
 *
 * Sample boundaries are determined by sorting the file offsets: each sample runs
 * from its offset to the start of the next sample (or the earliest data table).
 */
function extractSamples(buf: Uint8Array, ptrDA: number, ptrE2: number, ptrD6: number): InstrumentConfig[] {
  const instruments: InstrumentConfig[] = [];

  // Origin = first longword at ptrE2 = absolute address of file offset 0
  // This is used by initplayer's relocation loop (SUB.L D1,(A1); ADD.L D0,(A1))
  if (ptrE2 + 3 >= buf.length) return makePlaceholderInstruments(4);
  const origin = u32BE(buf, ptrE2);

  // Read 4 sample pointers from ptrDA (longwords)
  // ASM: MOVE.L (A1)+,(A0) — 4 iterations (D0=3, DBRA)
  const samplePtrs: number[] = [];
  for (let i = 0; i < 4; i++) {
    const off = ptrDA + i * 4;
    if (off + 3 >= buf.length) break;
    const absPtr = u32BE(buf, off);
    samplePtrs.push(absPtr);
  }

  if (samplePtrs.length < 4) {
    return makePlaceholderInstruments(4);
  }

  // Convert absolute pointers to file offsets
  const fileOffsets = samplePtrs.map(p => p - origin);

  // Build sorted list of unique valid file offsets for boundary detection
  const validOffsets = [...new Set(fileOffsets.filter(o => o >= 0 && o < buf.length))].sort((a, b) => a - b);
  // Upper boundary: earliest data table offset (samples precede the data area)
  const upperBound = Math.min(ptrDA, ptrE2, ptrD6, buf.length);
  validOffsets.push(upperBound);

  for (let i = 0; i < 4; i++) {
    const fileOff = fileOffsets[i];
    if (fileOff < 0 || fileOff >= buf.length) {
      instruments.push({
        id: i + 1, name: `SunTronic ${i + 1}`, type: 'synth' as const,
        synthType: 'Synth' as const, effects: [], volume: 0, pan: 0,
      } as InstrumentConfig);
      continue;
    }

    // Find end of this sample: next boundary after fileOff
    const bIdx = validOffsets.indexOf(fileOff);
    const end = bIdx >= 0 && bIdx + 1 < validOffsets.length
      ? validOffsets[bIdx + 1]
      : Math.min(fileOff + 0x10000, buf.length);

    const pcmLength = end - fileOff;
    if (pcmLength > 0 && fileOff + pcmLength <= buf.length) {
      const pcm = buf.slice(fileOff, fileOff + pcmLength);
      instruments.push(createSamplerInstrument(
        i + 1, `SunTronic ${i + 1}`, pcm, 64, 8287, 0, 0,
      ));
    } else {
      instruments.push({
        id: i + 1, name: `SunTronic ${i + 1}`, type: 'synth' as const,
        synthType: 'Synth' as const, effects: [], volume: 0, pan: 0,
      } as InstrumentConfig);
    }
  }

  return instruments;
}

function makePlaceholderInstruments(count: number): InstrumentConfig[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i + 1, name: `SunTronic ${i + 1}`, type: 'synth' as const,
    synthType: 'Synth' as const, effects: [], volume: 0, pan: 0,
  } as InstrumentConfig));
}

// ── Main parser ─────────────────────────────────────────────────────────────

export function parseSunTronicFile(
  buffer: ArrayBuffer,
  filename: string,
  companionFiles?: Map<string, ArrayBuffer>,
): TrackerSong {
  const buf = new Uint8Array(buffer);

  // V1.3 "Delirium" generation (hunk executable, .src/.pc) — real score decode.
  if (isSunTronicV13Format(buf)) {
    return parseSunTronicV13File(buffer, filename, companionFiles);
  }

  if (!isSunTronicRawRip(buf)) {
    throw new Error('Not a SunTronic module');
  }

  // ── Module name from filename ─────────────────────────────────────────────
  const baseName = filename.split('/').pop() ?? filename;
  const moduleName = baseName.replace(/\.sun$/i, '').replace(/\.tsm$/i, '') || baseName;

  // ── Variant detection ─────────────────────────────────────────────────────
  // Byte at offset 11 determines variant (from Check2 / initsound)
  const variantByte = buf[11];

  // ── Resolve data pointers ─────────────────────────────────────────────────
  const ptrs = resolveDataPointers(buf);
  let instruments: InstrumentConfig[];

  if (ptrs) {
    const { ptrDA, ptrE2, ptrD6 } = ptrs;

    // Variant stride info (for future pattern decoding):
    // 0x18 → 0x130 (304 bytes), 0x10+nonzero → 0x68 (104), 0x10+zero → 0x62 (98)
    // Refine 0x10 variant: check if byte at (ptrDA + 0x10) is zero
    // ASM in initsound/lbC0003B6: MOVE.L (lbL0000DA,PC),A0; TST.B ($10,A0)
    if (variantByte === 0x10 && ptrDA + 0x10 < buf.length) {
      // voiceStride = buf[ptrDA + 0x10] !== 0 ? 0x68 : 0x62;
    }

    instruments = extractSamples(buf, ptrDA, ptrE2, ptrD6);
  } else {
    instruments = makePlaceholderInstruments(4);
  }

  if (instruments.length === 0) {
    instruments = makePlaceholderInstruments(4);
  }

  // ── Empty pattern (placeholder — UADE handles actual audio) ──────────────
  const emptyRows = Array.from({ length: 64 }, () => ({
    note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0,
  }));

  const pattern = {
    id: 'pattern-0',
    name: 'Pattern 0',
    length: 64,
    channels: Array.from({ length: 4 }, (_, ch) => ({
      id: `channel-${ch}`,
      name: `Channel ${ch + 1}`,
      muted: false,
      solo: false,
      collapsed: false,
      volume: 100,
      pan: ch === 0 || ch === 3 ? -50 : 50,
      instrumentId: null,
      color: null,
      rows: emptyRows,
    })),
    importMetadata: {
      sourceFormat: 'MOD' as const,
      sourceFile: filename,
      importedAt: new Date().toISOString(),
      originalChannelCount: 4,
      originalPatternCount: 1,
      originalInstrumentCount: instruments.length,
    },
  };

  // Smoke validation
  if (instruments.length === 0) console.warn('[SunTronic] no instruments extracted');

  const song: TrackerSong = {
    name: `${moduleName} [SunTronic]`,
    format: 'SunTronic' as TrackerFormat,
    patterns: [pattern],
    instruments,
    songPositions: [0],
    songLength: 1,
    restartPosition: 0,
    numChannels: 4,
    initialSpeed: 6,
    initialBPM: 125,
    linearPeriods: false,
    uadeEditableFileData: buffer.slice(0) as ArrayBuffer,
    uadeEditableFileName: filename,
    uadePatternLayout: {
      formatId: 'sunTronic',
      patternDataFileOffset: 0,
      bytesPerCell: 4,
      rowsPerPattern: 64,
      numChannels: 4,
      numPatterns: 1,
      moduleSize: buffer.byteLength,
      encodeCell: encodeMODCell,
      decodeCell: decodeMODCell,
    } as UADEPatternLayout,
  };

  // Smoke validation
  if (song.patterns.length === 0) console.warn('[SunTronic] no patterns extracted');
  if (song.instruments.length === 0) console.warn('[SunTronic] no instruments extracted');

  return song;
}

// ── SunTronic V1.3 (Delirium generation) ───────────────────────────────────
//
// Real score decode per thoughts/shared/research/2026-07-13_suntronic-v13-score-layout.md
// via the SunTronicV13 codec. Editable grid follows the Rob Hubbard recipe
// (docs/FORMAT_COMMAND_STREAM_GRID.md): carrier-less display patterns +
// off-grid blockRows/blockRawBytes carriers on the variable layout.

const V13_ROWS_PER_PATTERN = 64;
const V13_MAX_TOTAL_ROWS = 64 * 128;
const V13_SAMPLE_RATE = 8287;

interface V13DisplayCell {
  note: number; instrument: number; volume: number;
  effTyp: number; eff: number; effTyp2: number; eff2: number;
}

const emptyV13Cell = (): V13DisplayCell => ({
  note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0,
});

/** Case-insensitive basename lookup: try `name` then `name.x`. */
function findV13Companion(
  companionFiles: Map<string, ArrayBuffer> | undefined,
  name: string,
): ArrayBuffer | null {
  if (!companionFiles) return null;
  const want = new Set([name.toLowerCase(), `${name.toLowerCase()}.x`]);
  for (const [key, data] of companionFiles) {
    const base = (key.split('/').pop() ?? key).toLowerCase();
    if (want.has(base)) return data;
  }
  return null;
}

/** Build instruments: sampled records (companion PCM) then synth placeholders. */
function buildV13Instruments(
  score: SunV13Score,
  companionFiles: Map<string, ArrayBuffer> | undefined,
): InstrumentConfig[] {
  const instruments: InstrumentConfig[] = [];

  for (let i = 0; i < score.sampledInstruments.length; i++) {
    const rec = score.sampledInstruments[i];
    const name = score.instrumentNames[rec.slotIndex] ?? `Sample ${i + 1}`;
    const data = findV13Companion(companionFiles, name);
    const byteLen = rec.lengthWords * 2;
    if (data && data.byteLength > 0) {
      const pcm = new Uint8Array(data).slice(0, byteLen > 0 ? byteLen : undefined);
      const loopStart = rec.loopStartWords * 2;
      const loopEnd = rec.loopLenWords > 1 ? (rec.loopStartWords + rec.loopLenWords) * 2 : 0;
      instruments.push(createSamplerInstrument(
        i + 1, name, pcm, 64, V13_SAMPLE_RATE, loopStart, loopEnd,
      ));
    } else {
      console.warn(`[SunTronic V1.3] instrument file missing: ${name} (instr/ sidecar not provided)`);
      instruments.push({
        id: i + 1, name, type: 'synth' as const,
        synthType: 'Synth' as const, effects: [], volume: 0, pan: 0,
      } as InstrumentConfig);
    }
  }

  const numSampled = score.sampledInstruments.length;
  for (let i = 0; i < score.synthInstrumentCount; i++) {
    instruments.push({
      id: numSampled + i + 1, name: `Synth ${i + 1}`, type: 'synth' as const,
      synthType: 'Synth' as const, effects: [], volume: 0, pan: 0,
    } as InstrumentConfig);
  }

  return instruments.length > 0 ? instruments : makePlaceholderInstruments(4);
}

/**
 * Walk one voice through the subsong sequence, emitting one display cell per
 * grammar row + the covering file-pattern index per row.
 *
 * Display approximation (carriers unaffected): rows/position mutations via
 * 0x8C/0x8B apply to THIS voice immediately (the real 0x8C hits all voices at
 * its playback tick — cross-voice timing is not simulated for display).
 */
function walkV13Voice(
  score: SunV13Score,
  voice: number,
): { cells: V13DisplayCell[]; fpPerRow: number[] } {
  const h1 = score.h1;
  const cells: V13DisplayCell[] = [];
  const fpPerRow: number[] = [];
  let rowsPerPos = score.rowsPerPositionDefault;
  let curInstr = 0;
  const numSampled = score.sampledInstruments.length;
  const sub = score.subsongs[0];
  if (!sub) return { cells, fpPerRow };

  for (const entry of sub.entries) {
    const ptr = entry.trackPtrs[voice];
    const fp = score.blockIndexByOffset.get(ptr) ?? -1;
    if (fp < 0 || ptr >= h1.length) {
      for (let r = 0; r < rowsPerPos && cells.length < V13_MAX_TOTAL_ROWS; r++) {
        cells.push(emptyV13Cell());
        fpPerRow.push(-1);
      }
      continue;
    }
    let pos = ptr;
    for (let r = 0; r < rowsPerPos && cells.length < V13_MAX_TOTAL_ROWS; r++) {
      const cell = emptyV13Cell();
      // parse one grammar row
      for (;;) {
        if (pos >= h1.length) break;
        const b = h1[pos];
        const len = sunCommandLen(h1, pos);
        if (b === 0x00) { pos += len; break; }
        if (b >= 0xb8) {
          if (len >= 2) {
            const sel = h1[pos + 1];
            curInstr = sel >= 0x40 ? numSampled + (sel & 0x3f) + 1 : sel;
          }
          if (cell.note === 0) {
            cell.note = sunPitchToNote((~b) & 0xff);
            cell.instrument = curInstr;
          }
        } else if (b >= 0x01 && b <= 0x7f) {
          curInstr = b >= 0x40 ? numSampled + (b & 0x3f) + 1 : b;
        } else if (b === 0x8c || b === 0x8b) {
          const arg = h1[pos + 1];
          if (arg >= 1) rowsPerPos = arg;
        }
        pos += len;
      }
      cells.push(cell);
      fpPerRow.push(fp);
    }
  }
  return { cells, fpPerRow };
}

/** Parse a SunTronic V1.3 Delirium module into an editable TrackerSong. */
function parseSunTronicV13File(
  buffer: ArrayBuffer,
  filename: string,
  companionFiles?: Map<string, ArrayBuffer>,
): TrackerSong {
  const buf = new Uint8Array(buffer);
  const score = parseSunTronicV13Score(buf);

  const baseName = filename.split('/').pop() ?? filename;
  const moduleName = baseName.replace(/\.(src|pc|sun|tsm)$/i, '') || baseName;

  const instruments = buildV13Instruments(score, companionFiles);

  // ── display grid: independent per-voice walks of subsong 0 ──
  const voices = [0, 1, 2, 3].map((v) => walkV13Voice(score, v));
  const maxRows = Math.max(1, ...voices.map((v) => v.cells.length));
  const numPatterns = Math.max(1, Math.ceil(maxRows / V13_ROWS_PER_PATTERN));

  const patterns = Array.from({ length: numPatterns }, (_, p) => ({
    id: `pattern-${p}`,
    name: `Pattern ${p}`,
    length: V13_ROWS_PER_PATTERN,
    channels: Array.from({ length: 4 }, (_, ch) => ({
      id: `channel-${ch}`,
      name: `Channel ${ch + 1}`,
      muted: false,
      solo: false,
      collapsed: false,
      volume: 100,
      pan: ch === 0 || ch === 3 ? -50 : 50,
      instrumentId: null,
      color: null,
      rows: Array.from({ length: V13_ROWS_PER_PATTERN }, (_, r) =>
        voices[ch].cells[p * V13_ROWS_PER_PATTERN + r] ?? emptyV13Cell()),
    })),
    importMetadata: {
      sourceFormat: 'MOD' as const,
      sourceFile: filename,
      importedAt: new Date().toISOString(),
      originalChannelCount: 4,
      originalPatternCount: numPatterns,
      originalInstrumentCount: instruments.length,
    },
  }));

  // ── variable layout: honest REAL file offsets + byte-exact carriers ──
  const filePatternAddrs = score.blocks.map((b) => score.h1FileOffset + b.h1Offset);
  const filePatternSizes = score.blocks.map((b) => b.byteSize);
  const blockRows = score.blocks.map((b) => b.rows);
  const blockRawBytes = score.blocks.map((b) =>
    buf.slice(score.h1FileOffset + b.h1Offset, score.h1FileOffset + b.h1Offset + b.byteSize));
  const trackMap = Array.from({ length: numPatterns }, (_, p) =>
    [0, 1, 2, 3].map((ch) => voices[ch].fpPerRow[p * V13_ROWS_PER_PATTERN] ?? -1));

  const uadeVariableLayout: UADEVariablePatternLayout = {
    formatId: 'sunTronic',
    numChannels: 4,
    numFilePatterns: score.blocks.length,
    rowsPerPattern: V13_ROWS_PER_PATTERN,
    moduleSize: buffer.byteLength,
    encoder: sunTronicV13Encoder,
    filePatternAddrs,
    filePatternSizes,
    trackMap,
    blockRows,
    blockRawBytes,
  };

  const song: TrackerSong = {
    name: `${moduleName} [SunTronic V1.3]`,
    format: 'SunTronic' as TrackerFormat,
    patterns,
    instruments,
    songPositions: patterns.map((_, i) => i),
    songLength: patterns.length,
    restartPosition: 0,
    numChannels: 4,
    initialSpeed: 6,
    initialBPM: 125,
    linearPeriods: false,
    uadeEditableFileData: buffer.slice(0) as ArrayBuffer,
    uadeEditableFileName: filename,
    uadeVariableLayout,
  };

  if (song.patterns.length === 0) console.warn('[SunTronic V1.3] no patterns extracted');
  return song;
}
