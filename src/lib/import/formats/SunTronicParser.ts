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
import type { UADEPatternLayout } from '@/engine/uade/UADEPatternEncoder';
import { encodeMODCell, decodeMODCell } from '@/engine/uade/encoders/MODEncoder';
import { createSamplerInstrument } from './AmigaUtils';

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
 * Return true if the buffer is a SunTronic format module.
 *
 * Mirrors DTP_Check2 from suntronic_mod.asm exactly:
 *   CMP.L #$48E7FFFE,(A0)    ; offset 0
 *   CMP.W #$4DFA,(4,A0)      ; offset 4
 *   CMP.L #$4A2E0018,(8,A0)  ; offset 8 variant A
 *   CMP.L #$4A2E0010,(8,A0)  ; offset 8 variant B
 */
export function isSunTronicFormat(buffer: ArrayBuffer | Uint8Array): boolean {
  const buf = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (buf.length < 16) return false;

  if (u32BE(buf, 0) !== 0x48E7FFFE) return false;
  if (u16BE(buf, 4) !== 0x4DFA) return false;

  const off8 = u32BE(buf, 8);
  return off8 === 0x4A2E0018 || off8 === 0x4A2E0010;
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

export function parseSunTronicFile(buffer: ArrayBuffer, filename: string): TrackerSong {
  const buf = new Uint8Array(buffer);

  if (!isSunTronicFormat(buf)) {
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
