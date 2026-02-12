/**
 * GYM (Genesis YM2612) Exporter
 * Converts captured register logs to GYM format
 *
 * GYM is a simple Genesis/Mega Drive music format supporting:
 * - YM2612 (OPN2) FM synthesizer
 * - SN76489 (PSG) for noise and square waves
 *
 * Format specification:
 * - No header, data starts immediately
 * - 0x00: Write to YM2612 port 0 (register, data follow)
 * - 0x01: Write to YM2612 port 1 (register, data follow)
 * - 0x02: Write to PSG (data byte follows)
 * - 0x03: Wait 1 frame (1/60 sec NTSC)
 * - 0x04+: Wait (byte - 0x03) frames
 *
 * Sample rate is implicitly 60Hz (NTSC Genesis)
 */

import { FurnaceChipType } from '../../engine/chips/FurnaceChipEngine';
import type { RegisterWrite } from './VGMExporter';

// GYM command bytes
const GYM_CMD = {
  YM2612_PORT0: 0x00,
  YM2612_PORT1: 0x01,
  PSG: 0x02,
  WAIT_1: 0x03,
} as const;

// Frame rate and samples per frame
const FRAME_RATE = 60;
const SAMPLES_PER_FRAME = 44100 / FRAME_RATE; // ~735 samples

export interface GYMExportOptions {
  title?: string;
  author?: string;
}

/**
 * Check if the register log can be exported to GYM format
 * GYM only supports YM2612 and SN76489 (PSG)
 */
export function canExportGYM(writes: RegisterWrite[]): boolean {
  const supportedChips: number[] = [FurnaceChipType.OPN2, FurnaceChipType.PSG];
  return writes.some(w => supportedChips.includes(w.chipType));
}

/**
 * Export register log to GYM format
 */
export function exportToGYM(
  writes: RegisterWrite[],
  options: GYMExportOptions = {}
): Uint8Array {
  void options;
  const commands: number[] = [];

  // Filter to only supported chips
  const filteredWrites = writes.filter(
    w => w.chipType === FurnaceChipType.OPN2 || w.chipType === FurnaceChipType.PSG
  );

  if (filteredWrites.length === 0) {
    // Return empty GYM (just end marker if any)
    return new Uint8Array(0);
  }

  // Sort writes by timestamp
  const sortedWrites = [...filteredWrites].sort((a, b) => a.timestamp - b.timestamp);

  let lastTimestamp = 0;

  for (const write of sortedWrites) {
    // Calculate frame delay
    const sampleDelta = write.timestamp - lastTimestamp;
    const frameDelta = Math.round(sampleDelta / SAMPLES_PER_FRAME);

    // Add wait commands for timing gaps
    if (frameDelta > 0) {
      let remaining = frameDelta;
      while (remaining > 0) {
        if (remaining === 1) {
          commands.push(GYM_CMD.WAIT_1);
          remaining = 0;
        } else {
          // Wait N frames (max 252 frames per command: 0xFF - 0x03 = 252)
          const waitFrames = Math.min(remaining, 252);
          commands.push(GYM_CMD.WAIT_1 + waitFrames);
          remaining -= waitFrames;
        }
      }
    }
    lastTimestamp = write.timestamp;

    // Emit register write command
    if (write.chipType === FurnaceChipType.OPN2) {
      // YM2612 uses two ports
      if (write.port < 0x100) {
        // Port 0 (registers 0x00-0xFF)
        commands.push(GYM_CMD.YM2612_PORT0, write.port & 0xFF, write.data);
      } else {
        // Port 1 (registers 0x100-0x1FF mapped to 0x00-0xFF)
        commands.push(GYM_CMD.YM2612_PORT1, (write.port - 0x100) & 0xFF, write.data);
      }
    } else if (write.chipType === FurnaceChipType.PSG) {
      // PSG direct data write
      commands.push(GYM_CMD.PSG, write.data);
    }
  }

  return new Uint8Array(commands);
}

/**
 * High-level export function
 */
export async function exportGYM(
  logData: Uint8Array,
  parseRegisterLog: (data: Uint8Array) => RegisterWrite[],
  options: GYMExportOptions = {}
): Promise<Blob> {
  const writes = parseRegisterLog(logData);
  const gymData = exportToGYM(writes, options);
  return new Blob([gymData.buffer as ArrayBuffer], { type: 'application/octet-stream' });
}
