/**
 * ZSM (ZSound Music) Exporter
 * Commander X16 native music format supporting YM2151 + VERA PSG/PCM
 *
 * ZSM Format Specification:
 * - Header: 16 bytes
 * - Music data: Variable length command stream
 * - PCM data: Optional sample data at end
 *
 * Supported chips:
 * - YM2151 (OPM) - 8-channel FM synthesis
 * - VERA PSG - 16-channel wavetable/noise
 * - VERA PCM - Single-channel 8/16-bit sample playback
 */

import { FurnaceChipType } from '../../engine/chips/FurnaceChipEngine';
import type { RegisterWrite } from './VGMExporter';
import { parseRegisterLog } from './VGMExporter';

// ZSM Commands - exported for documentation
export const ZSM_CMD = {
  // YM2151 write: 0x40-0x7F (register in lower 6 bits, data follows)
  YM_BASE: 0x40,

  // VERA PSG write: 0x00-0x3F (register offset, data follows)
  VERA_PSG_BASE: 0x00,

  // VERA PCM control
  VERA_PCM_CTRL: 0x80,
  VERA_PCM_RATE: 0x81,
  VERA_PCM_DATA: 0x82,

  // Timing
  DELAY: 0x80,        // Delay N ticks (0x80 | (n-1) for 1-128 ticks)
  DELAY_LONG: 0x00,   // Extended delay (followed by 16-bit value)

  // Control
  END: 0x80,          // End of data (when followed by 0x00)
  LOOP: 0x81,         // Loop marker
  PCM_OFFSET: 0xC0,   // PCM data offset marker
} as const;

// ZSM Header structure (16 bytes)
const ZSM_HEADER_SIZE = 16;

export interface ZSMExportOptions {
  tickRate?: number;      // Playback rate in Hz (default: 60)
  loopPoint?: number;     // Tick position for loop (0 = no loop)
  pcmData?: Uint8Array;   // Optional PCM sample data
}

/**
 * Convert VERA PSG register to ZSM offset
 * VERA PSG has 64 registers: 4 per channel (16 channels)
 * 0x00-0x03: Channel 0 (Freq L, Freq H, L/R Vol, Waveform)
 * 0x04-0x07: Channel 1
 * ... etc
 */
function veraRegToZSM(reg: number): number {
  // VERA PSG base is 0x1F9C0 in VERA memory space
  // But for ZSM, we use simple 0-63 offset
  return reg & 0x3F;
}

/**
 * Convert YM2151 register write to ZSM command
 * @public Exported for external use in YM2151 tools
 */
export function ymRegToZSM(reg: number): number {
  // YM2151 has registers 0x00-0xFF
  // ZSM encodes as 0x40 | (reg >> 2), followed by ((reg & 3) << 6) | data
  // Actually simpler: just output raw register + data pairs
  return reg;
}

/**
 * Build ZSM header
 */
function buildHeader(
  tickRate: number,
  loopOffset: number,
  pcmOffset: number,
  usesYM: boolean,
  usesVERA: boolean
): Uint8Array {
  const header = new Uint8Array(ZSM_HEADER_SIZE);
  const view = new DataView(header.buffer);

  // Magic: "zm" (0x7A, 0x6D)
  header[0] = 0x7A;
  header[1] = 0x6D;

  // Version: 1
  header[2] = 0x01;

  // Tick rate (16-bit LE)
  view.setUint16(3, tickRate, true);

  // Loop point (24-bit LE, offset from start of music data)
  header[5] = loopOffset & 0xFF;
  header[6] = (loopOffset >> 8) & 0xFF;
  header[7] = (loopOffset >> 16) & 0xFF;

  // PCM offset (24-bit LE, 0 if no PCM)
  header[8] = pcmOffset & 0xFF;
  header[9] = (pcmOffset >> 8) & 0xFF;
  header[10] = (pcmOffset >> 16) & 0xFF;

  // Channel mask (YM channels used, 8 bits)
  header[11] = usesYM ? 0xFF : 0x00;

  // VERA PSG channel mask (16 bits)
  view.setUint16(12, usesVERA ? 0xFFFF : 0x0000, true);

  // VERA PCM channel (1 = PCM used)
  header[14] = pcmOffset > 0 ? 0x01 : 0x00;

  // Reserved
  header[15] = 0x00;

  return header;
}

/**
 * Export register log to ZSM format
 */
export function exportToZSM(
  writes: RegisterWrite[],
  options: ZSMExportOptions = {}
): Uint8Array {
  const tickRate = options.tickRate || 60;
  const samplesPerTick = 44100 / tickRate;

  const commands: number[] = [];
  let usesYM = false;
  let usesVERA = false;

  // Sort writes by timestamp
  const sortedWrites = [...writes].sort((a, b) => a.timestamp - b.timestamp);

  // Filter to only supported chips
  const supportedWrites = sortedWrites.filter(
    w => w.chipType === FurnaceChipType.OPM || w.chipType === FurnaceChipType.VERA
  );

  if (supportedWrites.length === 0) {
    console.warn('[ZSMExporter] No YM2151 or VERA writes found in log');
  }

  let lastTick = 0;
  let loopByteOffset = 0;

  for (const write of supportedWrites) {
    const currentTick = Math.floor(write.timestamp / samplesPerTick);

    // Add delay if needed
    const tickDelta = currentTick - lastTick;
    if (tickDelta > 0) {
      // Check for loop point
      if (options.loopPoint && lastTick < options.loopPoint && currentTick >= options.loopPoint) {
        loopByteOffset = commands.length;
      }

      // Encode delays
      let remaining = tickDelta;
      while (remaining > 0) {
        if (remaining <= 128) {
          // Short delay: 0x80 | (n-1)
          commands.push(0x80 | (remaining - 1));
          remaining = 0;
        } else {
          // Max short delay
          commands.push(0x80 | 127); // 128 ticks
          remaining -= 128;
        }
      }
      lastTick = currentTick;
    }

    // Encode chip writes
    if (write.chipType === FurnaceChipType.OPM) {
      usesYM = true;
      // YM2151 write: two bytes - register then data
      // ZSM format uses a compact encoding
      const reg = write.port & 0xFF;

      // Group register by type for efficiency
      // For simplicity, output raw: 0x40 + high nibble, then low nibble + data
      // Actually ZSM uses: byte 1 = 0x40 | (reg >> 1), byte 2 = ((reg & 1) << 7) | data
      // This allows 2 bytes per write instead of 3

      if (reg < 0x80) {
        // Registers 0x00-0x7F: single byte + data
        commands.push(0x40 | (reg >> 1));
        commands.push(((reg & 1) << 7) | (write.data & 0x7F));
      } else {
        // High registers need extended encoding
        commands.push(0x40 | 0x3F); // Extended marker
        commands.push(reg);
        commands.push(write.data);
      }
    } else if (write.chipType === FurnaceChipType.VERA) {
      usesVERA = true;
      // VERA PSG write: register offset (0-63) + data
      const reg = veraRegToZSM(write.port);
      commands.push(reg);
      commands.push(write.data);
    }
  }

  // End marker
  commands.push(0x80, 0x00);

  // Calculate offsets
  const musicDataSize = commands.length;
  const pcmOffset = options.pcmData ? ZSM_HEADER_SIZE + musicDataSize : 0;

  // Build header
  const header = buildHeader(
    tickRate,
    loopByteOffset,
    pcmOffset,
    usesYM,
    usesVERA
  );

  // Combine all data
  const totalSize = ZSM_HEADER_SIZE + musicDataSize + (options.pcmData?.length || 0);
  const zsm = new Uint8Array(totalSize);

  zsm.set(header, 0);
  zsm.set(commands, ZSM_HEADER_SIZE);

  if (options.pcmData) {
    zsm.set(options.pcmData, ZSM_HEADER_SIZE + musicDataSize);
  }

  return zsm;
}

/**
 * High-level export function
 */
export async function exportZSM(
  logData: Uint8Array,
  options: ZSMExportOptions = {}
): Promise<Blob> {
  const writes = parseRegisterLog(logData);
  const zsmData = exportToZSM(writes, options);
  return new Blob([zsmData.buffer as ArrayBuffer], { type: 'application/octet-stream' });
}

/**
 * Check if log contains ZSM-compatible chips
 */
export function canExportZSM(writes: RegisterWrite[]): boolean {
  return writes.some(
    w => w.chipType === FurnaceChipType.OPM || w.chipType === FurnaceChipType.VERA
  );
}
