/**
 * GBS (Game Boy Sound) Exporter
 * Converts captured register logs to GBS format
 *
 * GBS is the Game Boy music format supporting:
 * - Game Boy DMG sound hardware (4 channels)
 *   - 2 pulse wave channels
 *   - 1 programmable wave channel
 *   - 1 noise channel
 *
 * Format specification:
 * - 112-byte header with metadata
 * - Z80 machine code for INIT and PLAY routines
 * - GBS players call INIT once, then PLAY at ~59.7Hz
 *
 * This exporter uses a register-log playback approach similar to NSF.
 */

import { FurnaceChipType } from '../../engine/chips/FurnaceChipEngine';
import type { RegisterWrite } from './VGMExporter';

// GBS Header structure (112 bytes)
const GBS_HEADER_SIZE = 112;
const GBS_MAGIC = [0x47, 0x42, 0x53]; // "GBS"

// Game Boy audio register addresses (memory-mapped I/O)
const GB_AUDIO_REGS = {
  // Channel 1 (Pulse with sweep)
  NR10: 0xFF10, // Sweep
  NR11: 0xFF11, // Length/duty
  NR12: 0xFF12, // Volume envelope
  NR13: 0xFF13, // Frequency low
  NR14: 0xFF14, // Frequency high + trigger

  // Channel 2 (Pulse)
  NR21: 0xFF16, // Length/duty
  NR22: 0xFF17, // Volume envelope
  NR23: 0xFF18, // Frequency low
  NR24: 0xFF19, // Frequency high + trigger

  // Channel 3 (Wave)
  NR30: 0xFF1A, // DAC power
  NR31: 0xFF1B, // Length
  NR32: 0xFF1C, // Volume
  NR33: 0xFF1D, // Frequency low
  NR34: 0xFF1E, // Frequency high + trigger
  // Wave RAM: 0xFF30-0xFF3F

  // Channel 4 (Noise)
  NR41: 0xFF20, // Length
  NR42: 0xFF21, // Volume envelope
  NR43: 0xFF22, // Polynomial counter
  NR44: 0xFF23, // Trigger

  // Master control
  NR50: 0xFF24, // Master volume / VIN panning
  NR51: 0xFF25, // Sound panning
  NR52: 0xFF26, // Sound on/off
} as const;

// Frame rate (Game Boy runs at ~59.7Hz)
const FRAME_RATE = 60;
const SAMPLES_PER_FRAME = 44100 / FRAME_RATE;

export interface GBSExportOptions {
  title?: string;
  author?: string;
  copyright?: string;
  loadAddress?: number;  // Default: 0x4000
  initAddress?: number;  // Default: 0x4000
  playAddress?: number;  // Default: auto-calculated
  totalSongs?: number;   // Default: 1
  startingSong?: number; // Default: 1
  timerModulo?: number;  // Default: 0 (use VBlank)
  timerControl?: number; // Default: 0
}

/**
 * Check if the register log can be exported to GBS format
 * GBS only supports Game Boy DMG
 */
export function canExportGBS(writes: RegisterWrite[]): boolean {
  return writes.some(w => w.chipType === FurnaceChipType.GB);
}

/**
 * Create a minimal Z80 driver for register log playback
 *
 * Memory layout:
 * $4000: INIT routine (RST entry point compatibility)
 * $40xx: PLAY routine
 * $40yy: Register data
 *
 * Data format per frame:
 * - 0x00 = end of frame
 * - 0xFF = end of song
 * - Otherwise: register offset (from $FF10), value
 */
function createZ80Driver(): {
  initCode: number[];
  playCode: number[];
  baseAddress: number;
} {
  const baseAddress = 0x4000;

  // HRAM variables (FF80-FFFE)
  const HRAM_DATA_PTR_LO = 0xFF80;
  const HRAM_DATA_PTR_HI = 0xFF81;
  const HRAM_PLAYING = 0xFF82;

  // INIT routine: Initialize data pointer and enable audio
  const initCode = [
    // LD A, low_byte(data_start)
    0x3E, 0x00, // to be patched
    // LD ($FF80), A
    0xE0, 0x80,
    // LD A, high_byte(data_start)
    0x3E, 0x00, // to be patched
    // LD ($FF81), A
    0xE0, 0x81,
    // LD A, $01
    0x3E, 0x01,
    // LD ($FF82), A ; playing = true
    0xE0, 0x82,
    // LD A, $80 ; Enable audio
    0x3E, 0x80,
    // LD ($FF26), A ; NR52
    0xE0, 0x26,
    // LD A, $FF ; Max volume, all channels to both speakers
    0x3E, 0xFF,
    // LD ($FF25), A ; NR51
    0xE0, 0x25,
    // LD A, $77 ; Master volume max
    0x3E, 0x77,
    // LD ($FF24), A ; NR50
    0xE0, 0x24,
    // RET
    0xC9
  ];

  // PLAY routine: Process one frame of register data
  const playCode = [
    // LD A, ($FF82) ; check playing flag
    0xF0, 0x82,
    // OR A
    0xB7,
    // RET Z ; return if not playing
    0xC8,

    // LD A, ($FF80) ; get data ptr low
    0xF0, 0x80,
    // LD L, A
    0x6F,
    // LD A, ($FF81) ; get data ptr high
    0xF0, 0x81,
    // LD H, A
    0x67,

    // loop:
    // LD A, (HL) ; read command byte
    0x7E,
    // OR A
    // JR Z, frame_done ; 0x00 = end of frame
    0xB7,
    0x28, 0x14, // relative jump offset
    // CP $FF
    0xFE, 0xFF,
    // JR Z, song_done ; 0xFF = end of song
    0x28, 0x1A, // relative jump offset

    // LD C, A ; register offset in C (will write to $FF10 + offset)
    0x4F,
    // INC HL
    0x23,
    // LD A, (HL) ; read value
    0x7E,
    // INC HL
    0x23,
    // PUSH HL
    0xE5,
    // LD H, $FF
    0x26, 0xFF,
    // LD L, C ; HL = $FF00 + offset
    0x69,
    // LD (HL), A ; write to audio register
    0x77,
    // POP HL
    0xE1,
    // JR loop
    0x18, 0xE8, // relative jump back

    // frame_done:
    // INC HL ; advance past 0x00
    0x23,
    // LD A, L
    0x7D,
    // LD ($FF80), A
    0xE0, 0x80,
    // LD A, H
    0x7C,
    // LD ($FF81), A
    0xE0, 0x81,
    // RET
    0xC9,

    // song_done:
    // XOR A ; A = 0
    0xAF,
    // LD ($FF82), A ; playing = false
    0xE0, 0x82,
    // LD ($FF26), A ; disable audio
    0xE0, 0x26,
    // RET
    0xC9
  ];

  return { initCode, playCode, baseAddress };
}

/**
 * Convert register writes to GBS data format
 */
function encodeRegisterData(writes: RegisterWrite[]): number[] {
  const data: number[] = [];

  // Filter to only Game Boy writes
  const filteredWrites = writes.filter(w => w.chipType === FurnaceChipType.GB);

  if (filteredWrites.length === 0) {
    data.push(0xFF); // End of song marker
    return data;
  }

  // Sort by timestamp
  const sortedWrites = [...filteredWrites].sort((a, b) => a.timestamp - b.timestamp);

  let currentFrame = 0;

  for (const write of sortedWrites) {
    // Calculate which frame this write belongs to
    const writeFrame = Math.floor(write.timestamp / SAMPLES_PER_FRAME);

    // Emit end-of-frame markers for any gap
    while (currentFrame < writeFrame) {
      data.push(0x00); // End of frame
      currentFrame++;
    }

    // Convert port to register offset
    // GB audio registers are 0xFF10-0xFF3F
    // We store as offset from 0xFF00 so player can use LD ($FF00+C), A
    const regOffset = write.port & 0xFF;

    // Only include valid audio registers (0x10-0x3F range)
    if (regOffset < 0x10 || regOffset > 0x3F) continue;

    // Emit register write: offset, value
    data.push(regOffset, write.data);
  }

  // Final frame marker
  data.push(0x00);
  // End of song marker
  data.push(0xFF);

  return data;
}

/**
 * Create GBS header
 */
function createGBSHeader(
  options: GBSExportOptions,
  loadAddress: number,
  initAddress: number,
  playAddress: number,
  stackPointer: number
): Uint8Array {
  const header = new Uint8Array(GBS_HEADER_SIZE);
  const view = new DataView(header.buffer);

  // Magic number "GBS"
  header.set(GBS_MAGIC, 0);

  // Version (1)
  header[3] = 0x01;

  // Number of songs
  header[4] = options.totalSongs || 1;

  // First song (1-indexed)
  header[5] = options.startingSong || 1;

  // Load address (little-endian)
  view.setUint16(6, loadAddress, true);

  // Init address (little-endian)
  view.setUint16(8, initAddress, true);

  // Play address (little-endian)
  view.setUint16(10, playAddress, true);

  // Stack pointer (little-endian)
  view.setUint16(12, stackPointer, true);

  // Timer modulo (TMA)
  header[14] = options.timerModulo || 0;

  // Timer control (TAC)
  header[15] = options.timerControl || 0;

  // Title (32 bytes, null-padded)
  const title = options.title || 'DEViLBOX Export';
  for (let i = 0; i < Math.min(title.length, 31); i++) {
    header[16 + i] = title.charCodeAt(i);
  }

  // Author (32 bytes, null-padded)
  const author = options.author || '';
  for (let i = 0; i < Math.min(author.length, 31); i++) {
    header[48 + i] = author.charCodeAt(i);
  }

  // Copyright (32 bytes, null-padded)
  const copyright = options.copyright || new Date().getFullYear().toString();
  for (let i = 0; i < Math.min(copyright.length, 31); i++) {
    header[80 + i] = copyright.charCodeAt(i);
  }

  return header;
}

/**
 * Export register log to GBS format
 */
export function exportToGBS(
  writes: RegisterWrite[],
  options: GBSExportOptions = {}
): Uint8Array {
  // Create Z80 driver
  const driver = createZ80Driver();

  // Encode register data
  const regData = encodeRegisterData(writes);

  // Calculate addresses
  const loadAddress = options.loadAddress || 0x4000;
  const initAddress = options.initAddress || loadAddress;
  const playCodeOffset = driver.initCode.length;
  const playAddress = options.playAddress || (loadAddress + playCodeOffset);
  const dataOffset = playCodeOffset + driver.playCode.length;
  const dataAddress = loadAddress + dataOffset;
  const stackPointer = 0xFFFE; // Standard GB stack location

  // Patch init code with data address
  const initCode = [...driver.initCode];
  initCode[1] = dataAddress & 0xFF;        // Low byte of data address
  initCode[5] = (dataAddress >> 8) & 0xFF; // High byte of data address

  // Combine code and data
  const codeAndData = new Uint8Array(initCode.length + driver.playCode.length + regData.length);
  codeAndData.set(initCode, 0);
  codeAndData.set(driver.playCode, initCode.length);
  codeAndData.set(regData, initCode.length + driver.playCode.length);

  // Create header
  const header = createGBSHeader(options, loadAddress, initAddress, playAddress, stackPointer);

  // Combine header and data
  const gbs = new Uint8Array(header.length + codeAndData.length);
  gbs.set(header, 0);
  gbs.set(codeAndData, header.length);

  return gbs;
}

/**
 * High-level export function
 */
export async function exportGBS(
  logData: Uint8Array,
  parseRegisterLog: (data: Uint8Array) => RegisterWrite[],
  options: GBSExportOptions = {}
): Promise<Blob> {
  const writes = parseRegisterLog(logData);
  const gbsData = exportToGBS(writes, options);
  return new Blob([gbsData.buffer as ArrayBuffer], { type: 'application/octet-stream' });
}
