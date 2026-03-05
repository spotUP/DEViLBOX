/**
 * S98 (Sound Format 98) Exporter
 * Converts captured register logs to S98 v3 format
 *
 * S98 is a Japanese standard supporting Yamaha FM and PSG chips:
 * - YM2149 (Atari ST, MSX)
 * - YM2203/OPN (PC-88/98)
 * - YM2612/OPN2 (Genesis/Mega Drive)
 * - YM2608/OPNA (PC-88/98)
 * - YM2151/OPM (Arcade)
 * - YM2413/OPLL (MSX)
 * - YMF262/OPL3 (Sound Blaster)
 * - AY-3-8910 (ZX Spectrum)
 * - SN76489 (SMS/Genesis PSG)
 */

import { type RegisterWrite, parseRegisterLog } from './VGMExporter';
import { FurnaceChipType } from '../../engine/chips/FurnaceChipEngine';

// S98 device type constants
const S98_DEVICE = {
  NONE: 0,          // End of device table
  YM2149: 1,        // AY-compatible (Atari ST)
  YM2203: 2,        // OPN
  YM2612: 3,        // OPN2
  YM2608: 4,        // OPNA
  YM2151: 5,        // OPM
  YM2413: 6,        // OPLL
  YM3526: 7,        // OPL
  YM3812: 8,        // OPL2
  YMF262: 9,        // OPL3
  AY8910: 15,       // AY-3-8910
  SN76489: 16,      // SN76489 PSG
} as const;

// Standard chip clocks for S98
const S98_CLOCKS: Record<number, number> = {
  [S98_DEVICE.YM2149]: 2000000,
  [S98_DEVICE.YM2203]: 3993600,
  [S98_DEVICE.YM2612]: 7670454,
  [S98_DEVICE.YM2608]: 7987200,
  [S98_DEVICE.YM2151]: 3579545,
  [S98_DEVICE.YM2413]: 3579545,
  [S98_DEVICE.YM3526]: 3579545,
  [S98_DEVICE.YM3812]: 3579545,
  [S98_DEVICE.YMF262]: 14318180,
  [S98_DEVICE.AY8910]: 1789773,
  [S98_DEVICE.SN76489]: 3579545,
};

// FurnaceChipType → S98 device type mapping
const CHIP_TO_S98: Record<number, number> = {
  [FurnaceChipType.AY]: S98_DEVICE.YM2149,
  [FurnaceChipType.OPN2]: S98_DEVICE.YM2612,
  [FurnaceChipType.OPM]: S98_DEVICE.YM2151,
  [FurnaceChipType.OPLL]: S98_DEVICE.YM2413,
  [FurnaceChipType.OPL3]: S98_DEVICE.YMF262,
  [FurnaceChipType.PSG]: S98_DEVICE.SN76489,
};

// Chips that support S98 export
const S98_SUPPORTED_CHIPS = new Set(Object.keys(CHIP_TO_S98).map(Number));

// S98 data command bytes
const S98_CMD = {
  SYNC: 0xFF,       // Wait 1 tick
  WAIT_N: 0xFE,     // Wait n+2 ticks (followed by LE uint32)
  END: 0xFD,        // End of data / loop back
} as const;

// Samples per tick: 44100 / 60 = 735 (NTSC frame rate)
const SAMPLES_PER_TICK = 735;

export interface S98ExportOptions {
  title?: string;
  artist?: string;
  game?: string;
  year?: string;
  loopPoint?: number;  // Sample position for loop
}

/**
 * Check if register writes can be exported to S98 format
 */
export function canExportS98(writes: RegisterWrite[]): boolean {
  return writes.some(w => S98_SUPPORTED_CHIPS.has(w.chipType));
}

/**
 * Create PSF tag block
 */
function createPSFTag(options: S98ExportOptions): Uint8Array {
  const lines: string[] = ['[S98]'];

  if (options.title) lines.push(`title=${options.title}`);
  if (options.artist) lines.push(`artist=${options.artist}`);
  if (options.game) lines.push(`game=${options.game}`);
  if (options.year) lines.push(`year=${options.year}`);
  lines.push('comment=Created by DEViLBOX');

  const tagStr = lines.join('\n') + '\n';
  const encoder = new TextEncoder();
  return encoder.encode(tagStr);
}

/**
 * Build the S98 device info table from used chips
 */
function buildDeviceTable(usedChips: Set<number>): {
  table: Uint8Array;
  chipIndexMap: Map<number, number>;
} {
  const devices: { s98Type: number; furnaceType: number }[] = [];
  const chipIndexMap = new Map<number, number>();

  // Collect devices, sorted by S98 type for deterministic order
  Array.from(usedChips).forEach(chipType => {
    const s98Type = CHIP_TO_S98[chipType];
    if (s98Type !== undefined) {
      devices.push({ s98Type, furnaceType: chipType });
    }
  });
  devices.sort((a, b) => a.s98Type - b.s98Type);

  // Map FurnaceChipType → device index
  for (let i = 0; i < devices.length; i++) {
    chipIndexMap.set(devices[i].furnaceType, i);
  }

  // 16 bytes per device entry + 16 bytes for terminator (type 0)
  const tableSize = (devices.length + 1) * 16;
  const table = new Uint8Array(tableSize);
  const view = new DataView(table.buffer);

  for (let i = 0; i < devices.length; i++) {
    const offset = i * 16;
    const s98Type = devices[i].s98Type;
    view.setUint32(offset, s98Type, true);                  // Device type
    view.setUint32(offset + 4, S98_CLOCKS[s98Type], true);  // Clock Hz
    view.setUint32(offset + 8, 0, true);                    // Pan
    view.setUint32(offset + 12, 0, true);                   // Reserved
  }

  // Terminator entry (all zeros)
  const termOffset = devices.length * 16;
  view.setUint32(termOffset, 0, true);
  view.setUint32(termOffset + 4, 0, true);
  view.setUint32(termOffset + 8, 0, true);
  view.setUint32(termOffset + 12, 0, true);

  return { table, chipIndexMap };
}

/**
 * Emit S98 wait commands for a given number of ticks
 */
function emitWait(commands: number[], ticks: number): void {
  let remaining = ticks;
  while (remaining > 0) {
    if (remaining >= 6) {
      // WAIT_N: waits n+2 ticks (5 bytes, more compact than 6+ SYNC bytes)
      const n = remaining - 2;
      commands.push(
        S98_CMD.WAIT_N,
        n & 0xFF,
        (n >> 8) & 0xFF,
        (n >> 16) & 0xFF,
        (n >> 24) & 0xFF
      );
      remaining = 0;
    } else {
      // 1-5 ticks: individual SYNC commands (1 byte each)
      commands.push(S98_CMD.SYNC);
      remaining--;
    }
  }
}

/**
 * Get the S98 command byte for a register write
 */
function getS98CommandByte(
  chipType: number,
  port: number,
  chipIndexMap: Map<number, number>
): number | null {
  const deviceIndex = chipIndexMap.get(chipType);
  if (deviceIndex === undefined) return null;

  // Dual-port chips: port >= 0x100 maps to port 1
  if (chipType === FurnaceChipType.OPN2 || chipType === FurnaceChipType.OPL3) {
    const portBit = port >= 0x100 ? 1 : 0;
    return deviceIndex * 2 + portBit;
  }

  // Single-port chips always use port 0
  return deviceIndex * 2;
}

/**
 * Export register writes to S98 v3 format
 */
export function exportToS98(
  writes: RegisterWrite[],
  options: S98ExportOptions = {}
): Uint8Array {
  const commands: number[] = [];

  // Determine which chips are used (only S98-supported ones)
  const usedChips = new Set<number>();
  for (const write of writes) {
    if (S98_SUPPORTED_CHIPS.has(write.chipType)) {
      usedChips.add(write.chipType);
    }
  }

  // Build device table and chip → device index map
  const { table: deviceTable, chipIndexMap } = buildDeviceTable(usedChips);

  // Header layout: 32 bytes fixed + device table, then data starts
  const headerSize = 32;
  const dataDumpOffset = headerSize + deviceTable.length;

  // Sort writes by timestamp
  const sortedWrites = [...writes].sort((a, b) => a.timestamp - b.timestamp);

  // Loop point tracking
  const loopTickTarget = options.loopPoint !== undefined && options.loopPoint > 0
    ? Math.floor(options.loopPoint / SAMPLES_PER_TICK)
    : -1;
  let loopByteOffset = 0;
  let loopFound = false;
  let lastTick = 0;

  for (const write of sortedWrites) {
    // Skip unsupported chips
    if (!S98_SUPPORTED_CHIPS.has(write.chipType)) continue;

    // Convert sample timestamp to tick count
    const tick = Math.floor(write.timestamp / SAMPLES_PER_TICK);

    // Add wait commands for timing gaps
    const waitTicks = tick - lastTick;
    if (waitTicks > 0) {
      // Check if loop point falls within this gap
      if (!loopFound && loopTickTarget >= 0 && lastTick <= loopTickTarget && tick > loopTickTarget) {
        const preLoopWait = loopTickTarget - lastTick;
        if (preLoopWait > 0) emitWait(commands, preLoopWait);
        loopByteOffset = commands.length;
        loopFound = true;
        const postLoopWait = tick - loopTickTarget;
        if (postLoopWait > 0) emitWait(commands, postLoopWait);
      } else {
        emitWait(commands, waitTicks);
      }
    }
    lastTick = tick;

    // Check for loop point at this exact tick
    if (!loopFound && loopTickTarget >= 0 && tick >= loopTickTarget) {
      loopByteOffset = commands.length;
      loopFound = true;
    }

    // Get S98 command byte (encodes device index + port)
    const cmdByte = getS98CommandByte(write.chipType, write.port, chipIndexMap);
    if (cmdByte === null) continue;

    // Encode register write: command_byte, register, data (3 bytes)
    if (write.chipType === FurnaceChipType.PSG) {
      // SN76489 is data-only (no register addressing)
      commands.push(cmdByte, 0x00, write.data);
    } else if (write.chipType === FurnaceChipType.OPN2 || write.chipType === FurnaceChipType.OPL3) {
      // Dual-port: strip high port bit from register address
      const reg = write.port >= 0x100 ? (write.port - 0x100) & 0xFF : write.port & 0xFF;
      commands.push(cmdByte, reg, write.data);
    } else {
      // Single-port chips
      commands.push(cmdByte, write.port & 0xFF, write.data);
    }
  }

  // End of data
  commands.push(S98_CMD.END);

  // Create PSF tag
  const psfTag = createPSFTag(options);
  const tagOffset = dataDumpOffset + commands.length;

  // Calculate loop offset (absolute file offset, 0 if no loop)
  const loopOffset = loopFound ? dataDumpOffset + loopByteOffset : 0;

  // Build final file
  const totalSize = dataDumpOffset + commands.length + psfTag.length;
  const s98 = new Uint8Array(totalSize);
  const view = new DataView(s98.buffer);

  // Write header (bytes 0-31)
  s98[0] = 0x53; // 'S'
  s98[1] = 0x39; // '9'
  s98[2] = 0x38; // '8'
  s98[3] = 0x33; // '3' (version)

  view.setUint32(4, SAMPLES_PER_TICK, true);   // Timer numerator (735)
  view.setUint32(8, 44100, true);              // Timer denominator
  view.setUint32(12, 0, true);                 // Compression (none)
  view.setUint32(16, tagOffset, true);         // Tag offset
  view.setUint32(20, dataDumpOffset, true);    // Data dump offset
  view.setUint32(24, loopOffset, true);        // Loop point offset

  // Write device table (starts at byte 32)
  s98.set(deviceTable, headerSize);

  // Write command data
  s98.set(commands, dataDumpOffset);

  // Write PSF tag
  s98.set(psfTag, tagOffset);

  return s98;
}

/**
 * High-level export function
 */
export async function exportS98(
  logData: Uint8Array,
  options: S98ExportOptions = {}
): Promise<Blob> {
  const writes = parseRegisterLog(logData);
  const s98Data = exportToS98(writes, options);
  return new Blob([s98Data.buffer as ArrayBuffer], { type: 'application/octet-stream' });
}
