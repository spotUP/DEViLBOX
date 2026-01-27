/**
 * VGM (Video Game Music) Exporter
 * Converts captured register logs to standard VGM 1.71 format
 *
 * VGM is a universal format supporting 40+ sound chips including:
 * - YM2612 (Genesis/Mega Drive)
 * - YM2151 (Arcade)
 * - SN76489 (SMS/Genesis PSG)
 * - YM2413 (OPLL)
 * - YM3812 (OPL2)
 * - YMF262 (OPL3)
 * - AY-3-8910
 * - Game Boy DMG
 * - NES APU
 * - And many more...
 */

import { FurnaceChipType } from '../../engine/chips/FurnaceChipEngine';

// VGM Command bytes for each chip
const VGM_CMD = {
  // YM2612 (OPN2)
  YM2612_PORT0: 0x52,
  YM2612_PORT1: 0x53,

  // YM2151 (OPM)
  YM2151: 0x54,

  // YM2413 (OPLL)
  YM2413: 0x51,

  // YM3812 (OPL2)
  YM3812: 0x5A,

  // YMF262 (OPL3)
  YMF262_PORT0: 0x5E,
  YMF262_PORT1: 0x5F,

  // SN76489 (PSG)
  SN76489: 0x50,

  // AY-3-8910
  AY8910: 0xA0,

  // Game Boy DMG
  GB_DMG: 0xB3,

  // NES APU
  NES_APU: 0xB4,

  // HuC6280 (PCE)
  HUC6280: 0xB9,

  // SID
  SID: 0xD4, // Extended command

  // K051649 (SCC)
  K051649: 0xD2,

  // POKEY
  POKEY: 0xBB,

  // VERA (Commander X16)
  VERA: 0xD6, // Custom extension

  // Wait commands
  WAIT_735: 0x62, // Wait 735 samples (1/60 sec NTSC)
  WAIT_882: 0x63, // Wait 882 samples (1/50 sec PAL)
  WAIT_N: 0x61,   // Wait n samples (16-bit)
  WAIT_1: 0x70,   // Wait 1-16 samples (0x70-0x7F)

  END: 0x66
} as const;

// VGM header offsets
const VGM_HEADER = {
  IDENT: 0x00,           // "Vgm "
  EOF_OFFSET: 0x04,      // Relative offset to end of file
  VERSION: 0x08,         // VGM version (0x171 = 1.71)
  SN76489_CLOCK: 0x0C,
  YM2413_CLOCK: 0x10,
  GD3_OFFSET: 0x14,
  TOTAL_SAMPLES: 0x18,
  LOOP_OFFSET: 0x1C,
  LOOP_SAMPLES: 0x20,
  RATE: 0x24,            // Recording rate (usually 60 or 50)
  SN76489_FLAGS: 0x28,
  YM2612_CLOCK: 0x2C,
  YM2151_CLOCK: 0x30,
  DATA_OFFSET: 0x34,     // Relative offset to VGM data (from 0x34)
  // Extended header (v1.51+)
  SEGA_PCM_CLOCK: 0x38,
  SEGA_PCM_IF: 0x3C,
  // More clocks follow...
  YM3812_CLOCK: 0x50,
  YMF262_CLOCK: 0x5C,
  AY8910_CLOCK: 0x74,
  GB_DMG_CLOCK: 0x80,
  NES_APU_CLOCK: 0x84,
  HUC6280_CLOCK: 0x94,
  K051649_CLOCK: 0x9C,
  POKEY_CLOCK: 0xD4,
} as const;

// Standard chip clocks
const CHIP_CLOCKS: Record<number, number> = {
  [FurnaceChipType.OPN2]: 7670453,    // Genesis NTSC
  [FurnaceChipType.OPM]: 3579545,     // Standard YM2151
  [FurnaceChipType.PSG]: 3579545,     // SMS PSG
  [FurnaceChipType.OPLL]: 3579545,
  [FurnaceChipType.OPL3]: 14318180,
  [FurnaceChipType.AY]: 1789773,
  [FurnaceChipType.GB]: 4194304,
  [FurnaceChipType.NES]: 1789773,
  [FurnaceChipType.PCE]: 3579545,
  [FurnaceChipType.SCC]: 3579545,
  [FurnaceChipType.SID]: 1000000,     // PAL
};

export interface RegisterWrite {
  timestamp: number;  // In samples
  chipType: number;
  port: number;
  data: number;
}

export interface VGMExportOptions {
  title?: string;
  author?: string;
  game?: string;
  system?: string;
  releaseDate?: string;
  sampleRate?: number;
  loopPoint?: number;  // Sample position for loop
}

/**
 * Parse raw log data from the WASM engine
 *
 * C++ struct layout (with standard alignment):
 * struct RegisterWrite {
 *     uint32_t timestamp;  // offset 0, size 4
 *     uint8_t chipType;    // offset 4, size 1
 *     // 3 bytes padding   // offset 5-7
 *     uint32_t port;       // offset 8, size 4
 *     uint8_t data;        // offset 12, size 1
 *     // 3 bytes padding   // offset 13-15
 * };
 * Total: 16 bytes per entry
 */
export function parseRegisterLog(data: Uint8Array): RegisterWrite[] {
  const writes: RegisterWrite[] = [];

  if (data.length === 0) {
    return writes;
  }

  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const STRUCT_SIZE = 16; // C++ struct with standard alignment

  for (let i = 0; i + STRUCT_SIZE <= data.length; i += STRUCT_SIZE) {
    const timestamp = view.getUint32(i, true);      // offset 0
    const chipType = view.getUint8(i + 4);          // offset 4
    // 3 bytes padding at offset 5-7
    const port = view.getUint32(i + 8, true);       // offset 8
    const regData = view.getUint8(i + 12);          // offset 12

    writes.push({ timestamp, chipType, port, data: regData });
  }

  return writes;
}

/**
 * Create a GD3 tag block
 */
function createGD3Tag(options: VGMExportOptions): Uint8Array {
  const strings = [
    options.title || 'DEViLBOX Export',      // Track name (English)
    '',                                        // Track name (Japanese)
    options.game || '',                        // Game name (English)
    '',                                        // Game name (Japanese)
    options.system || 'Furnace Chips',         // System name (English)
    '',                                        // System name (Japanese)
    options.author || '',                      // Author (English)
    '',                                        // Author (Japanese)
    options.releaseDate || new Date().toISOString().slice(0, 10), // Release date
    'DEViLBOX Tracker',                        // VGM ripper
    ''                                         // Notes
  ];

  // Encode as UTF-16LE with null terminators
  const encoded: number[] = [];
  for (const str of strings) {
    for (let i = 0; i < str.length; i++) {
      const code = str.charCodeAt(i);
      encoded.push(code & 0xFF, (code >> 8) & 0xFF);
    }
    encoded.push(0, 0); // Null terminator
  }

  // GD3 header: "Gd3 " + version + size + data
  const gd3 = new Uint8Array(12 + encoded.length);
  const gd3View = new DataView(gd3.buffer);

  gd3View.setUint32(0, 0x20336447, true); // "Gd3 "
  gd3View.setUint32(4, 0x00000100, true); // Version 1.00
  gd3View.setUint32(8, encoded.length, true);
  gd3.set(encoded, 12);

  return gd3;
}

/**
 * Convert chip type to VGM command
 */
function getVGMCommand(chipType: number, port: number): { cmd: number; adjustedPort: number } | null {
  switch (chipType) {
    case FurnaceChipType.OPN2:
      return port < 0x100
        ? { cmd: VGM_CMD.YM2612_PORT0, adjustedPort: port }
        : { cmd: VGM_CMD.YM2612_PORT1, adjustedPort: port - 0x100 };

    case FurnaceChipType.OPM:
      return { cmd: VGM_CMD.YM2151, adjustedPort: port };

    case FurnaceChipType.OPLL:
      return { cmd: VGM_CMD.YM2413, adjustedPort: port };

    case FurnaceChipType.OPL3:
      return port < 0x100
        ? { cmd: VGM_CMD.YMF262_PORT0, adjustedPort: port }
        : { cmd: VGM_CMD.YMF262_PORT1, adjustedPort: port - 0x100 };

    case FurnaceChipType.PSG:
      return { cmd: VGM_CMD.SN76489, adjustedPort: 0 }; // PSG is data-only

    case FurnaceChipType.AY:
      return { cmd: VGM_CMD.AY8910, adjustedPort: port };

    case FurnaceChipType.GB:
      return { cmd: VGM_CMD.GB_DMG, adjustedPort: port };

    case FurnaceChipType.NES:
      return { cmd: VGM_CMD.NES_APU, adjustedPort: port };

    case FurnaceChipType.PCE:
      return { cmd: VGM_CMD.HUC6280, adjustedPort: port };

    case FurnaceChipType.SCC:
      return { cmd: VGM_CMD.K051649, adjustedPort: port };

    default:
      return null; // Unsupported chip
  }
}

/**
 * Export register log to VGM format
 */
export function exportToVGM(
  writes: RegisterWrite[],
  options: VGMExportOptions = {}
): Uint8Array {
  // Note: VGM format always uses 44100Hz sample rate
  // The sampleRate option is reserved for future use
  const commands: number[] = [];

  // Determine which chips are used
  const usedChips = new Set<number>();
  for (const write of writes) {
    usedChips.add(write.chipType);
  }

  // Sort writes by timestamp
  const sortedWrites = [...writes].sort((a, b) => a.timestamp - b.timestamp);

  let lastTimestamp = 0;
  let totalSamples = 0;

  for (const write of sortedWrites) {
    // Add wait commands for timing gaps
    const waitSamples = write.timestamp - lastTimestamp;
    if (waitSamples > 0) {
      totalSamples += waitSamples;

      // Use optimal wait commands
      let remaining = waitSamples;
      while (remaining > 0) {
        if (remaining >= 882 && remaining < 735 * 2) {
          commands.push(VGM_CMD.WAIT_882);
          remaining -= 882;
        } else if (remaining >= 735) {
          commands.push(VGM_CMD.WAIT_735);
          remaining -= 735;
        } else if (remaining >= 16) {
          const waitN = Math.min(remaining, 65535);
          commands.push(VGM_CMD.WAIT_N, waitN & 0xFF, (waitN >> 8) & 0xFF);
          remaining -= waitN;
        } else {
          // Wait 1-16 samples
          commands.push(VGM_CMD.WAIT_1 + (remaining - 1));
          remaining = 0;
        }
      }
    }
    lastTimestamp = write.timestamp;

    // Convert to VGM command
    const vgmCmd = getVGMCommand(write.chipType, write.port);
    if (vgmCmd) {
      if (write.chipType === FurnaceChipType.PSG) {
        // PSG only needs command + data
        commands.push(vgmCmd.cmd, write.data);
      } else {
        // Most chips need command + register + data
        commands.push(vgmCmd.cmd, vgmCmd.adjustedPort & 0xFF, write.data);
      }
    }
  }

  // End of data
  commands.push(VGM_CMD.END);

  // Create GD3 tag
  const gd3 = createGD3Tag(options);

  // Calculate header size (0x100 for VGM 1.71)
  const headerSize = 0x100;
  const dataOffset = headerSize - 0x34; // Relative to offset 0x34
  const gd3Offset = headerSize + commands.length - 0x14; // Relative to offset 0x14
  const eofOffset = headerSize + commands.length + gd3.length - 0x04; // Relative to offset 0x04

  // Build final file
  const totalSize = headerSize + commands.length + gd3.length;
  const vgm = new Uint8Array(totalSize);
  const view = new DataView(vgm.buffer);

  // Write header
  view.setUint32(VGM_HEADER.IDENT, 0x206D6756, true); // "Vgm "
  view.setUint32(VGM_HEADER.EOF_OFFSET, eofOffset, true);
  view.setUint32(VGM_HEADER.VERSION, 0x171, true); // Version 1.71
  view.setUint32(VGM_HEADER.GD3_OFFSET, gd3Offset, true);
  view.setUint32(VGM_HEADER.TOTAL_SAMPLES, totalSamples, true);
  view.setUint32(VGM_HEADER.RATE, 60, true); // 60 Hz
  view.setUint32(VGM_HEADER.DATA_OFFSET, dataOffset, true);

  // Set chip clocks
  if (usedChips.has(FurnaceChipType.OPN2)) {
    view.setUint32(VGM_HEADER.YM2612_CLOCK, CHIP_CLOCKS[FurnaceChipType.OPN2], true);
  }
  if (usedChips.has(FurnaceChipType.OPM)) {
    view.setUint32(VGM_HEADER.YM2151_CLOCK, CHIP_CLOCKS[FurnaceChipType.OPM], true);
  }
  if (usedChips.has(FurnaceChipType.PSG)) {
    view.setUint32(VGM_HEADER.SN76489_CLOCK, CHIP_CLOCKS[FurnaceChipType.PSG], true);
  }
  if (usedChips.has(FurnaceChipType.OPLL)) {
    view.setUint32(VGM_HEADER.YM2413_CLOCK, CHIP_CLOCKS[FurnaceChipType.OPLL], true);
  }
  if (usedChips.has(FurnaceChipType.OPL3)) {
    view.setUint32(VGM_HEADER.YMF262_CLOCK, CHIP_CLOCKS[FurnaceChipType.OPL3], true);
  }
  if (usedChips.has(FurnaceChipType.AY)) {
    view.setUint32(VGM_HEADER.AY8910_CLOCK, CHIP_CLOCKS[FurnaceChipType.AY], true);
  }
  if (usedChips.has(FurnaceChipType.GB)) {
    view.setUint32(VGM_HEADER.GB_DMG_CLOCK, CHIP_CLOCKS[FurnaceChipType.GB], true);
  }
  if (usedChips.has(FurnaceChipType.NES)) {
    view.setUint32(VGM_HEADER.NES_APU_CLOCK, CHIP_CLOCKS[FurnaceChipType.NES], true);
  }
  if (usedChips.has(FurnaceChipType.PCE)) {
    view.setUint32(VGM_HEADER.HUC6280_CLOCK, CHIP_CLOCKS[FurnaceChipType.PCE], true);
  }
  if (usedChips.has(FurnaceChipType.SCC)) {
    view.setUint32(VGM_HEADER.K051649_CLOCK, CHIP_CLOCKS[FurnaceChipType.SCC], true);
  }

  // Handle loop point
  if (options.loopPoint !== undefined && options.loopPoint > 0) {
    // Find the byte offset for the loop point by tracking samples
    let loopByteOffset = -1;
    let sampleCount = 0;

    for (let i = 0; i < commands.length; ) {
      // Check if we've reached the loop point
      if (sampleCount >= options.loopPoint && loopByteOffset < 0) {
        loopByteOffset = i;
        break;
      }

      const cmd = commands[i];

      // Track wait commands to accumulate sample count
      if (cmd === VGM_CMD.WAIT_735) {
        sampleCount += 735;
        i += 1;
      } else if (cmd === VGM_CMD.WAIT_882) {
        sampleCount += 882;
        i += 1;
      } else if (cmd === VGM_CMD.WAIT_N) {
        sampleCount += commands[i + 1] | (commands[i + 2] << 8);
        i += 3;
      } else if (cmd >= VGM_CMD.WAIT_1 && cmd <= 0x7F) {
        sampleCount += (cmd - VGM_CMD.WAIT_1) + 1;
        i += 1;
      } else if (cmd === VGM_CMD.END) {
        i += 1;
      } else if (cmd === VGM_CMD.SN76489) {
        // PSG: 1 byte command + 1 byte data
        i += 2;
      } else {
        // Most chip commands: 1 byte command + 1 byte register + 1 byte data
        i += 3;
      }
    }

    if (loopByteOffset > 0) {
      view.setUint32(VGM_HEADER.LOOP_OFFSET, headerSize + loopByteOffset - 0x1C, true);
      view.setUint32(VGM_HEADER.LOOP_SAMPLES, totalSamples - options.loopPoint, true);
    }
  }

  // Write command data
  vgm.set(commands, headerSize);

  // Write GD3 tag
  vgm.set(gd3, headerSize + commands.length);

  return vgm;
}

/**
 * High-level export function
 */
export async function exportVGM(
  logData: Uint8Array,
  options: VGMExportOptions = {}
): Promise<Blob> {
  const writes = parseRegisterLog(logData);
  const vgmData = exportToVGM(writes, options);
  return new Blob([vgmData.buffer as ArrayBuffer], { type: 'application/octet-stream' });
}
