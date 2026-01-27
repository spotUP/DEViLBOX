/**
 * NSF (NES Sound Format) Exporter
 * Converts captured register logs to NSF format
 *
 * NSF is the NES music format supporting:
 * - 2A03 APU (pulse, triangle, noise, DPCM)
 * - Optional expansion audio (VRC6, VRC7, FDS, MMC5, N163, S5B)
 *
 * Format specification:
 * - 128-byte header with metadata
 * - 6502 machine code for INIT and PLAY routines
 * - NSF players call INIT once, then PLAY at 60Hz
 *
 * This exporter uses a register-log playback approach:
 * - Data is stored as timestamped register writes
 * - A minimal 6502 driver plays them back at the correct timing
 */

import { FurnaceChipType } from '../../engine/chips/FurnaceChipEngine';
import type { RegisterWrite } from './VGMExporter';

// NSF Header structure (128 bytes)
const NSF_HEADER_SIZE = 128;
const NSF_MAGIC = [0x4E, 0x45, 0x53, 0x4D, 0x1A]; // "NESM\x1A"

// Frame rate
const FRAME_RATE = 60;
const SAMPLES_PER_FRAME = 44100 / FRAME_RATE;

export interface NSFExportOptions {
  title?: string;
  artist?: string;
  copyright?: string;
  loadAddress?: number;  // Default: 0x8000
  initAddress?: number;  // Default: 0x8000
  playAddress?: number;  // Default: auto-calculated
  totalSongs?: number;   // Default: 1
  startingSong?: number; // Default: 1
  ntscSpeed?: number;    // Default: 16666 (60Hz)
  palSpeed?: number;     // Default: 20000 (50Hz)
  region?: 'ntsc' | 'pal' | 'dual'; // Default: 'ntsc'
}

/**
 * Check if the register log can be exported to NSF format
 * NSF only supports NES APU (and expansion chips, which we don't support yet)
 */
export function canExportNSF(writes: RegisterWrite[]): boolean {
  return writes.some(w => w.chipType === FurnaceChipType.NES);
}

/**
 * Create a minimal 6502 driver for register log playback
 *
 * Memory layout:
 * $8000: INIT routine
 * $80xx: PLAY routine
 * $80yy: Register data
 *
 * Data format per frame:
 * - 0x00 = end of frame
 * - 0xFF = end of song
 * - Otherwise: register offset (from $4000), value
 */
function create6502Driver(): {
  initCode: number[];
  playCode: number[];
  baseAddress: number;
} {
  // Base addresses
  const baseAddress = 0x8000;

  // Zero-page variables
  const ZP_DATA_PTR_LO = 0x00;
  const ZP_DATA_PTR_HI = 0x01;
  const ZP_PLAYING = 0x02;

  // INIT routine: Initialize data pointer and enable APU
  // Sets up the data pointer to the start of register data
  const initCode = [
    // LDA #<data_start (to be patched)
    0xA9, 0x00,
    // STA ZP_DATA_PTR_LO
    0x85, ZP_DATA_PTR_LO,
    // LDA #>data_start (to be patched)
    0xA9, 0x00,
    // STA ZP_DATA_PTR_HI
    0x85, ZP_DATA_PTR_HI,
    // LDA #$01
    0xA9, 0x01,
    // STA ZP_PLAYING
    0x85, ZP_PLAYING,
    // LDA #$0F ; Enable all APU channels
    0xA9, 0x0F,
    // STA $4015
    0x8D, 0x15, 0x40,
    // LDA #$40 ; Disable frame IRQ
    0xA9, 0x40,
    // STA $4017
    0x8D, 0x17, 0x40,
    // RTS
    0x60
  ];

  // PLAY routine: Process one frame of register data
  const playCode = [
    // LDA ZP_PLAYING
    0xA5, ZP_PLAYING,
    // BEQ done
    0xF0, 0x2A, // branch offset (to RTS)

    // loop:
    // LDY #$00
    0xA0, 0x00,
    // LDA (ZP_DATA_PTR_LO),Y
    0xB1, ZP_DATA_PTR_LO,
    // BEQ frame_done ; 0x00 = end of frame
    0xF0, 0x1D,
    // CMP #$FF
    0xC9, 0xFF,
    // BEQ song_done ; 0xFF = end of song
    0xF0, 0x20,

    // TAX ; register offset in X
    0xAA,
    // INY
    0xC8,
    // LDA (ZP_DATA_PTR_LO),Y ; value
    0xB1, ZP_DATA_PTR_LO,
    // STA $4000,X ; write to APU register
    0x9D, 0x00, 0x40,

    // Advance pointer by 2
    // CLC
    0x18,
    // LDA ZP_DATA_PTR_LO
    0xA5, ZP_DATA_PTR_LO,
    // ADC #$02
    0x69, 0x02,
    // STA ZP_DATA_PTR_LO
    0x85, ZP_DATA_PTR_LO,
    // BCC loop
    0x90, 0xE3,
    // INC ZP_DATA_PTR_HI
    0xE6, ZP_DATA_PTR_HI,
    // JMP loop
    0x4C, 0x04, 0x80, // address to be patched

    // frame_done: advance pointer by 1
    // INC ZP_DATA_PTR_LO
    0xE6, ZP_DATA_PTR_LO,
    // BNE done
    0xD0, 0x02,
    // INC ZP_DATA_PTR_HI
    0xE6, ZP_DATA_PTR_HI,
    // done: RTS
    0x60,

    // song_done: stop playing
    // LDA #$00
    0xA9, 0x00,
    // STA ZP_PLAYING
    0x85, ZP_PLAYING,
    // STA $4015 ; silence APU
    0x8D, 0x15, 0x40,
    // RTS
    0x60
  ];

  return { initCode, playCode, baseAddress };
}

/**
 * Convert register writes to NSF data format
 */
function encodeRegisterData(writes: RegisterWrite[]): number[] {
  const data: number[] = [];

  // Filter to only NES APU writes
  const filteredWrites = writes.filter(w => w.chipType === FurnaceChipType.NES);

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

    // Convert port to APU register offset (0x4000-0x4017 -> 0x00-0x17)
    const regOffset = write.port & 0x1F;

    // Skip invalid registers
    if (regOffset > 0x17) continue;

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
 * Create NSF header
 */
function createNSFHeader(
  options: NSFExportOptions,
  loadAddress: number,
  initAddress: number,
  playAddress: number,
  _dataLength: number
): Uint8Array {
  const header = new Uint8Array(NSF_HEADER_SIZE);
  const view = new DataView(header.buffer);

  // Magic number "NESM\x1A"
  header.set(NSF_MAGIC, 0);

  // Version (1)
  header[5] = 0x01;

  // Total songs
  header[6] = options.totalSongs || 1;

  // Starting song (1-indexed)
  header[7] = options.startingSong || 1;

  // Load address (little-endian)
  view.setUint16(8, loadAddress, true);

  // Init address (little-endian)
  view.setUint16(10, initAddress, true);

  // Play address (little-endian)
  view.setUint16(12, playAddress, true);

  // Song name (32 bytes, null-padded)
  const title = options.title || 'DEViLBOX Export';
  for (let i = 0; i < Math.min(title.length, 31); i++) {
    header[14 + i] = title.charCodeAt(i);
  }

  // Artist name (32 bytes, null-padded)
  const artist = options.artist || '';
  for (let i = 0; i < Math.min(artist.length, 31); i++) {
    header[46 + i] = artist.charCodeAt(i);
  }

  // Copyright (32 bytes, null-padded)
  const copyright = options.copyright || new Date().getFullYear().toString();
  for (let i = 0; i < Math.min(copyright.length, 31); i++) {
    header[78 + i] = copyright.charCodeAt(i);
  }

  // NTSC speed (little-endian, in 1/1000000th second units)
  // 16666 = 60Hz (1000000 / 60)
  view.setUint16(110, options.ntscSpeed || 16666, true);

  // Bankswitch init values (8 bytes, all 0 = no banking)
  // Already zeroed

  // PAL speed (little-endian)
  // 20000 = 50Hz (1000000 / 50)
  view.setUint16(120, options.palSpeed || 20000, true);

  // PAL/NTSC flags
  // 0 = NTSC, 1 = PAL, 2 = dual compatible
  const region = options.region || 'ntsc';
  header[122] = region === 'ntsc' ? 0 : region === 'pal' ? 1 : 2;

  // Expansion audio flags (0 = none)
  header[123] = 0;

  // Reserved (4 bytes)
  // Already zeroed

  return header;
}

/**
 * Export register log to NSF format
 */
export function exportToNSF(
  writes: RegisterWrite[],
  options: NSFExportOptions = {}
): Uint8Array {
  // Create 6502 driver
  const driver = create6502Driver();

  // Encode register data
  const regData = encodeRegisterData(writes);

  // Calculate addresses
  const loadAddress = options.loadAddress || 0x8000;
  const initAddress = options.initAddress || loadAddress;
  const playCodeOffset = driver.initCode.length;
  const playAddress = options.playAddress || (loadAddress + playCodeOffset);
  const dataOffset = playCodeOffset + driver.playCode.length;
  const dataAddress = loadAddress + dataOffset;

  // Patch init code with data address
  const initCode = [...driver.initCode];
  initCode[1] = dataAddress & 0xFF;        // Low byte of data address
  initCode[5] = (dataAddress >> 8) & 0xFF; // High byte of data address

  // Patch play code with loop address
  const playCode = [...driver.playCode];
  const loopJmpOffset = playCode.indexOf(0x4C); // Find JMP instruction
  if (loopJmpOffset !== -1) {
    const loopTarget = loadAddress + playCodeOffset + 4; // loop label
    playCode[loopJmpOffset + 1] = loopTarget & 0xFF;
    playCode[loopJmpOffset + 2] = (loopTarget >> 8) & 0xFF;
  }

  // Combine code and data
  const codeAndData = new Uint8Array(initCode.length + playCode.length + regData.length);
  codeAndData.set(initCode, 0);
  codeAndData.set(playCode, initCode.length);
  codeAndData.set(regData, initCode.length + playCode.length);

  // Create header
  const header = createNSFHeader(options, loadAddress, initAddress, playAddress, codeAndData.length);

  // Combine header and data
  const nsf = new Uint8Array(header.length + codeAndData.length);
  nsf.set(header, 0);
  nsf.set(codeAndData, header.length);

  return nsf;
}

/**
 * High-level export function
 */
export async function exportNSF(
  logData: Uint8Array,
  parseRegisterLog: (data: Uint8Array) => RegisterWrite[],
  options: NSFExportOptions = {}
): Promise<Blob> {
  const writes = parseRegisterLog(logData);
  const nsfData = exportToNSF(writes, options);
  return new Blob([nsfData.buffer as ArrayBuffer], { type: 'application/octet-stream' });
}
