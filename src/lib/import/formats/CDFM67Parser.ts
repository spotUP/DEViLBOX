/**
 * CDFM67Parser.ts — C67 / CDFM Composer module loader
 *
 * CDFM Composer (Composer 670) is a PC DOS tracker by Edward Schlunder that
 * supports 4 PCM channels and 9 OPL FM channels.
 * File extension: .c67  (670 files can be converted back to .c67 with the bundled tool).
 *
 * Binary layout:
 *   C67FileHeader (1954 bytes):
 *     +0    speed (uint8)                — initial speed (1-15)
 *     +1    restartPos (uint8)           — order restart position
 *     +2    sampleNames[32][13]          — 32 × 13-byte null-terminated PCM names
 *     +418  samples[32]                  — 32 × C67SampleHeader (16 bytes each = 512 bytes)
 *           C67SampleHeader: unknown(4) length(4) loopStart(4) loopEnd(4)
 *     +930  fmInstrNames[32][13]         — 32 × 13-byte null-terminated OPL names
 *     +1346 fmInstr[32][11]              — 32 × 11-byte OPL2 register dump
 *     +1698 orders[256]                  — order list (0xFF = end)
 *
 *   After header (at offset 1954):
 *     patOffsets[128] × uint32LE         — pattern data offsets (from offset 2978)
 *     patLengths[128] × uint32LE         — pattern data lengths
 *     Pattern data at 2978 + patOffsets[i]
 *
 *   Pattern cell commands:
 *     cmd 0x00-0x0C: note/instrument/volume on channel (cmd = channel index)
 *       bytes: [note, instrVol]
 *       channel < 4 = PCM; 4-12 = FM
 *       note: bits[3:0] = semitone, bits[6:4] = octave, bit[7] = instrument bit 4
 *       instrVol: bits[7:4] = instrument low 4 bits, bits[3:0] = volume
 *     cmd 0x20-0x2C: volume only on channel (cmd - 0x20 = channel)
 *       byte: instrVol (bits[3:0] = volume, bits[7:4] ignored)
 *     cmd 0x40: delay (advance rows)
 *       byte: numRows to advance
 *     cmd 0x60: end of pattern
 *
 * PCM channels: 4, panned alternating L/R (pan 64/192)
 * FM channels:  9 (OPL2)
 * Total:        13 channels
 * Default BPM:  143
 * Rows per pattern: 64
 *
 * Reference: OpenMPT soundlib/Load_c67.cpp
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { Pattern, ChannelData, TrackerCell, InstrumentConfig } from '@/types';
import { createSamplerInstrument } from './AmigaUtils';

// ── Binary helpers ────────────────────────────────────────────────────────────

function u8(bytes: Uint8Array, off: number): number {
  return bytes[off] ?? 0;
}
function u32le(bytes: Uint8Array, off: number): number {
  return (((bytes[off] ?? 0) | ((bytes[off + 1] ?? 0) << 8)
         | ((bytes[off + 2] ?? 0) << 16) | ((bytes[off + 3] ?? 0) << 24)) >>> 0);
}

function readString(bytes: Uint8Array, off: number, len: number): string {
  let s = '';
  for (let i = 0; i < len; i++) {
    const c = bytes[off + i] ?? 0;
    if (c === 0) break;
    s += String.fromCharCode(c);
  }
  return s.trim();
}

// ── Constants ─────────────────────────────────────────────────────────────────

const HDR_SIZE           = 1954;   // sizeof(C67FileHeader)
const PAT_OFFSETS_SIZE   = 128 * 4;
const PAT_LENGTHS_SIZE   = 128 * 4;
const PAT_DATA_BASE      = 2978;   // 1954 + 512 + 512 = 2978
const NUM_PCM_CHANNELS   = 4;
const NUM_FM_CHANNELS    = 9;
const NUM_CHANNELS       = NUM_PCM_CHANNELS + NUM_FM_CHANNELS; // 13
const NUM_PCM_INSTRS     = 32;
const NUM_FM_INSTRS      = 32;
const ROWS_PER_PATTERN   = 64;
const NUM_PATTERNS       = 128;
const DEFAULT_BPM        = 143;
const C5_SPEED_PCM       = 8287;   // OpenMPT uses 8287 for CDFM PCM

// Volume translation tables (mirrors OpenMPT TranslateVolume)
const FM_VOLUME_TABLE: number[] = [
  0x08, 0x10, 0x18, 0x20, 0x28, 0x2C, 0x30, 0x34,
  0x36, 0x38, 0x3A, 0x3C, 0x3D, 0x3E, 0x3F, 0x40,
];

// Alternating L/R pan for PCM channels
const PCM_CHANNEL_PAN = [64, 192, 64, 192] as const;

// ── Format detection ──────────────────────────────────────────────────────────

export function isCDFM67Format(bytes: Uint8Array): boolean {
  if (bytes.length < PAT_DATA_BASE) return false;

  // speed must be 1-15
  const speed = u8(bytes, 0);
  if (speed < 1 || speed > 15) return false;

  // All order entries must be < 128 or 0xFF
  for (let i = 0; i < 256; i++) {
    const ord = u8(bytes, 1698 + i);
    if (ord >= 128 && ord !== 0xFF) return false;
  }

  // Validate sample headers and instrument data
  let anyNonSilent = false;
  for (let smp = 0; smp < 32; smp++) {
    // sampleNames[smp][12] must be 0 (null-terminated, last byte must be null)
    if (u8(bytes, 2 + smp * 13 + 12) !== 0) return false;

    // samples[smp].unknown must be 0
    const smpBase = 418 + smp * 16;
    if (u32le(bytes, smpBase) !== 0) return false;

    const length    = u32le(bytes, smpBase + 4);
    const loopStart = u32le(bytes, smpBase + 8);
    const loopEnd   = u32le(bytes, smpBase + 12);

    if (length > 0xFFFFF) return false;

    // fmInstrNames[smp][12] must be 0
    if (u8(bytes, 930 + smp * 13 + 12) !== 0) return false;

    // OPL2 check: no OPL3 bits
    const fmBase = 1346 + smp * 11;
    if (u8(bytes, fmBase) & 0xF0) return false;    // fmInstr[0] high nibble must be 0
    if (u8(bytes, fmBase + 5) & 0xFC) return false;  // fmInstr[5] upper 6 bits must be 0
    if (u8(bytes, fmBase + 10) & 0xFC) return false; // fmInstr[10] upper 6 bits must be 0

    // Loop sanity
    if (length !== 0 && loopEnd < 0xFFFFF) {
      if (loopEnd > length) return false;
      if (loopStart > loopEnd) return false;
    }

    // Check for any non-silent instruments
    if (!anyNonSilent) {
      if (length !== 0) { anyNonSilent = true; continue; }
      // Check if any FM byte is non-zero
      let fmNonZero = false;
      for (let b = 0; b < 11; b++) {
        if (u8(bytes, fmBase + b) !== 0) { fmNonZero = true; break; }
      }
      if (fmNonZero) anyNonSilent = true;
    }
  }

  return anyNonSilent;
}

// ── Volume helper ─────────────────────────────────────────────────────────────

/** Convert C67 volume nibble (0-15) to tracker volume (0-64). */
function translateVolume(rawVol: number, isFM: boolean): number {
  const v = rawVol & 0x0F;
  if (isFM) {
    return FM_VOLUME_TABLE[v] ?? 0x40;
  }
  return 4 + v * 4;
}

// ── Parser ────────────────────────────────────────────────────────────────────

export function parseCDFM67File(bytes: Uint8Array, filename: string): TrackerSong | null {
  try {
    return parseInternal(bytes, filename);
  } catch {
    return null;
  }
}

function parseInternal(bytes: Uint8Array, filename: string): TrackerSong | null {
  if (!isCDFM67Format(bytes)) return null;

  const speed      = u8(bytes, 0);
  const restartPos = u8(bytes, 1);

  // Read order list
  const orderList: number[] = [];
  for (let i = 0; i < 256; i++) {
    const ord = u8(bytes, 1698 + i);
    if (ord === 0xFF) break;
    orderList.push(ord);
  }
  if (orderList.length === 0) orderList.push(0);

  // Read pattern offsets and lengths
  const patOffsets: number[] = [];
  const patLengths: number[] = [];
  for (let i = 0; i < NUM_PATTERNS; i++) {
    patOffsets.push(u32le(bytes, HDR_SIZE + i * 4));
    patLengths.push(u32le(bytes, HDR_SIZE + PAT_OFFSETS_SIZE + i * 4));
  }

  // ── Patterns ──────────────────────────────────────────────────────────────

  const patterns: Pattern[] = [];

  for (let pat = 0; pat < NUM_PATTERNS; pat++) {
    const patStart = PAT_DATA_BASE + patOffsets[pat];
    const patLen   = patLengths[pat];

    if (patLen < 3 || patLen > 0x1000 || patStart + patLen > bytes.length) {
      patterns.push(makeEmptyPattern(pat, filename));
      continue;
    }

    // Build channel row data
    const channelRows: TrackerCell[][] = Array.from(
      { length: NUM_CHANNELS },
      () => Array.from({ length: ROWS_PER_PATTERN }, () => emptyCell()),
    );

    let row = 0;
    let pos = patStart;
    const patEnd = patStart + patLen;

    while (row < ROWS_PER_PATTERN && pos < patEnd) {
      const cmd = u8(bytes, pos++);

      if (cmd <= 0x0C) {
        // Note + instrument + volume on channel cmd
        if (pos + 2 > patEnd) break;
        const note     = u8(bytes, pos++);
        const instrVol = u8(bytes, pos++);
        const isFM     = cmd >= NUM_PCM_CHANNELS;

        const cell = channelRows[cmd]?.[row];
        if (!cell) continue;

        // Note decode:
        //   bits[3:0] = semitone (0-based), bits[6:4] = octave, bit[7] = instr bit 4
        const semitone = note & 0x0F;
        const octave   = (note >> 4) & 0x07;
        const instrBit = (note & 0x80) >> 3; // shifts bit 7 → bit 4 of instrument

        const instrLo = (instrVol >> 4) & 0x0F;
        const instrHi = instrBit; // bit 4
        const instr   = instrLo | instrHi;

        // XM note: OpenMPT maps as NOTE_MIN + (fmChn ? 12 : 36) + semitone + octave * 12
        const noteBase = isFM ? 12 : 36;
        const xmNote   = 1 + noteBase + semitone + octave * 12;

        // Instrument index: PCM uses range 1-32, FM uses 33-64 (1-based)
        const instrBase = isFM ? NUM_PCM_INSTRS : 0;
        cell.note       = (xmNote >= 1 && xmNote <= 120) ? xmNote : 0;
        cell.instrument = instrBase + instr + 1;
        cell.volume     = translateVolume(instrVol & 0x0F, isFM);

      } else if (cmd >= 0x20 && cmd <= 0x2C) {
        // Volume only on channel (cmd - 0x20)
        if (pos + 1 > patEnd) break;
        const instrVol = u8(bytes, pos++);
        const ch       = cmd - 0x20;
        const isFM     = ch >= NUM_PCM_CHANNELS;
        const cell     = channelRows[ch]?.[row];
        if (cell) {
          cell.volume = translateVolume(instrVol & 0x0F, isFM);
        }

      } else if (cmd === 0x40) {
        // Delay: advance rows
        if (pos + 1 > patEnd) break;
        row += u8(bytes, pos++);

      } else if (cmd === 0x60) {
        // End of pattern — write pattern break on last non-empty row
        if (row > 0) {
          const cell = channelRows[0]?.[row - 1];
          if (cell) {
            cell.effTyp = 0x0D; // pattern break
            cell.eff    = 0;
          }
        }
        break;

      } else {
        // Unknown command — abort this pattern
        break;
      }
    }

    const channels: ChannelData[] = channelRows.map((rows, ch) => ({
      id:           `channel-${ch}`,
      name:         ch < NUM_PCM_CHANNELS ? `PCM ${ch + 1}` : `FM ${ch - NUM_PCM_CHANNELS + 1}`,
      muted:        false,
      solo:         false,
      collapsed:    false,
      volume:       100,
      pan:          ch < NUM_PCM_CHANNELS ? (PCM_CHANNEL_PAN[ch] ?? 128) - 128 : 0,
      instrumentId: null,
      color:        null,
      rows,
    }));

    patterns.push({
      id:      `pattern-${pat}`,
      name:    `Pattern ${pat}`,
      length:  ROWS_PER_PATTERN,
      channels,
      importMetadata: {
        sourceFormat:            'C67',
        sourceFile:              filename,
        importedAt:              new Date().toISOString(),
        originalChannelCount:    NUM_CHANNELS,
        originalPatternCount:    NUM_PATTERNS,
        originalInstrumentCount: NUM_PCM_INSTRS + NUM_FM_INSTRS,
      },
    });
  }

  // ── Instruments ───────────────────────────────────────────────────────────

  const instruments: InstrumentConfig[] = [];

  // PCM instruments (1-32)
  // Sample data is appended after all pattern data, sequentially.
  // We find the start of sample data by scanning to the last pattern.
  let sampleDataStart = PAT_DATA_BASE;
  for (let i = 0; i < NUM_PATTERNS; i++) {
    const end = PAT_DATA_BASE + patOffsets[i] + patLengths[i];
    if (end > sampleDataStart) sampleDataStart = end;
  }

  let sampleCursor = sampleDataStart;

  for (let smp = 0; smp < NUM_PCM_INSTRS; smp++) {
    const smpNameBase = 2 + smp * 13;
    const smpHdrBase  = 418 + smp * 16;
    const smpName     = readString(bytes, smpNameBase, 13) || `PCM ${smp + 1}`;
    const length      = u32le(bytes, smpHdrBase + 4);
    const loopStart   = u32le(bytes, smpHdrBase + 8);
    const loopEnd     = u32le(bytes, smpHdrBase + 12);

    if (length === 0 || sampleCursor + length > bytes.length) {
      instruments.push(silentInstrument(smp + 1, smpName));
      sampleCursor += length;
      continue;
    }

    // Loop: active if loopEnd <= length (CDFM uses loopEnd 0xFFFFF to indicate no loop)
    const hasLoop = loopEnd <= length;
    const loopS   = hasLoop ? loopStart : 0;
    const loopE   = hasLoop ? loopEnd   : 0;

    // PCM is 8-bit unsigned (SampleIO::unsignedPCM in OpenMPT)
    // createSamplerInstrument expects unsigned 8-bit — pass directly
    const rawPcm = bytes.subarray(sampleCursor, sampleCursor + length);
    sampleCursor += length;

    instruments.push(
      createSamplerInstrument(smp + 1, smpName, rawPcm, 64, C5_SPEED_PCM, loopS, loopE),
    );
  }

  // FM instruments (33-64) — OPL2 instruments, no sample data
  // We create silent placeholders so instrument indices work correctly in patterns
  for (let smp = 0; smp < NUM_FM_INSTRS; smp++) {
    const fmNameBase = 930 + smp * 13;
    const fmName     = readString(bytes, fmNameBase, 13) || `FM ${smp + 1}`;
    instruments.push(silentInstrument(NUM_PCM_INSTRS + smp + 1, fmName));
  }

  // ── Assemble TrackerSong ──────────────────────────────────────────────────

  const songName = filename.replace(/\.[^/.]+$/, '');

  return {
    name:            songName,
    format:          'S3M' as TrackerFormat,
    patterns,
    instruments,
    songPositions:   orderList,
    songLength:      orderList.length,
    restartPosition: restartPos < orderList.length ? restartPos : 0,
    numChannels:     NUM_CHANNELS,
    initialSpeed:    speed,
    initialBPM:      DEFAULT_BPM,
    linearPeriods:   false,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function emptyCell(): TrackerCell {
  return { note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 };
}

function makeEmptyPattern(idx: number, filename: string): Pattern {
  const channels: ChannelData[] = Array.from({ length: NUM_CHANNELS }, (_, ch) => ({
    id:           `channel-${ch}`,
    name:         ch < NUM_PCM_CHANNELS ? `PCM ${ch + 1}` : `FM ${ch - NUM_PCM_CHANNELS + 1}`,
    muted:        false,
    solo:         false,
    collapsed:    false,
    volume:       100,
    pan:          ch < NUM_PCM_CHANNELS ? (PCM_CHANNEL_PAN[ch] ?? 128) - 128 : 0,
    instrumentId: null,
    color:        null,
    rows:         Array.from({ length: ROWS_PER_PATTERN }, () => emptyCell()),
  }));
  return {
    id:      `pattern-${idx}`,
    name:    `Pattern ${idx}`,
    length:  ROWS_PER_PATTERN,
    channels,
    importMetadata: {
      sourceFormat:            'C67',
      sourceFile:              filename,
      importedAt:              new Date().toISOString(),
      originalChannelCount:    NUM_CHANNELS,
      originalPatternCount:    NUM_PATTERNS,
      originalInstrumentCount: NUM_PCM_INSTRS + NUM_FM_INSTRS,
    },
  };
}

function silentInstrument(id: number, name: string): InstrumentConfig {
  return {
    id,
    name,
    type:      'sample' as const,
    synthType: 'Sampler' as const,
    effects:   [],
    volume:    0,
    pan:       0,
  } as InstrumentConfig;
}
