/**
 * SAP (Slight Atari Player) Exporter
 * Atari 8-bit POKEY music format
 *
 * SAP Format Types:
 * - Type B: Binary load format (requires 6502 player routine)
 * - Type C: CMC (Chaos Music Composer) format
 * - Type D: Digitized sample format
 * - Type R: Raw register dump (our target - pure POKEY writes)
 * - Type S: SoftSynth format
 *
 * We export Type R (raw) which is the simplest and most direct:
 * - Header with metadata
 * - Raw POKEY register dumps per frame
 */

import { FurnaceChipType } from '../../engine/chips/FurnaceChipEngine';
import type { RegisterWrite } from './VGMExporter';
import { parseRegisterLog } from './VGMExporter';

/**
 * POKEY Register addresses (relative to $D200)
 * Exported for documentation and potential UI use
 */
export const POKEY_REG = {
  AUDF1: 0x00,  // Audio frequency 1
  AUDC1: 0x01,  // Audio control 1
  AUDF2: 0x02,  // Audio frequency 2
  AUDC2: 0x03,  // Audio control 2
  AUDF3: 0x04,  // Audio frequency 3
  AUDC3: 0x05,  // Audio control 3
  AUDF4: 0x06,  // Audio frequency 4
  AUDC4: 0x07,  // Audio control 4
  AUDCTL: 0x08, // Audio control (global)
  STIMER: 0x09, // Start timers
  SKREST: 0x0A, // Reset serial status
  POTGO: 0x0B,  // Start pot scan
  // 0x0C-0x0D unused
  SEROUT: 0x0D, // Serial output
  IRQEN: 0x0E,  // IRQ enable
  SKCTLS: 0x0F, // Serial control
} as const;

/**
 * Standard POKEY clock rates
 * Exported for documentation and potential UI use
 */
export const POKEY_CLOCKS = {
  NTSC: 1789773,  // NTSC (North America)
  PAL: 1773447,   // PAL (Europe)
} as const;

export interface SAPExportOptions {
  author?: string;
  name?: string;
  date?: string;
  songs?: number;       // Number of subsongs (default: 1)
  defaultSong?: number; // Default subsong to play
  stereo?: boolean;     // Dual POKEY (stereo)
  ntsc?: boolean;       // NTSC timing (default: PAL)
  fastplay?: number;    // Lines per frame (default: 312 PAL, 262 NTSC)
  loopPoint?: number;   // Frame number for loop
}

/**
 * Build SAP text header
 */
function buildSAPHeader(
  options: SAPExportOptions,
  frameCount: number
): string {
  const lines: string[] = ['SAP'];

  // Required fields
  lines.push(`AUTHOR "${options.author || 'DEViLBOX'}"`);
  lines.push(`NAME "${options.name || 'Untitled'}"`);
  lines.push(`DATE "${options.date || new Date().getFullYear()}"`);

  // Type R (raw register dump)
  lines.push('TYPE R');

  // Timing
  if (options.ntsc) {
    lines.push('NTSC');
  }

  // Stereo (dual POKEY)
  if (options.stereo) {
    lines.push('STEREO');
  }

  // Fastplay (frames per interrupt)
  if (options.fastplay) {
    lines.push(`FASTPLAY ${options.fastplay}`);
  }

  // Number of subsongs
  if (options.songs && options.songs > 1) {
    lines.push(`SONGS ${options.songs}`);
    if (options.defaultSong) {
      lines.push(`DEFSONG ${options.defaultSong}`);
    }
  }

  // Duration in frames (for players that support it)
  lines.push(`TIME ${formatTime(frameCount, options.ntsc ? 60 : 50)}`);

  // Empty line before binary data
  lines.push('');

  return lines.join('\r\n');
}

/**
 * Format time as MM:SS.mmm
 */
function formatTime(frames: number, fps: number): string {
  const totalSeconds = frames / fps;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  const ms = Math.floor((totalSeconds % 1) * 1000);
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
}

/**
 * Group writes by frame
 */
function groupWritesByFrame(
  writes: RegisterWrite[],
  samplesPerFrame: number
): Map<number, RegisterWrite[]> {
  const frames = new Map<number, RegisterWrite[]>();

  for (const write of writes) {
    const frame = Math.floor(write.timestamp / samplesPerFrame);
    if (!frames.has(frame)) {
      frames.set(frame, []);
    }
    frames.get(frame)!.push(write);
  }

  return frames;
}

/**
 * Build raw POKEY data for Type R
 * Each frame is 9 bytes (AUDF1-4, AUDC1-4, AUDCTL)
 * For stereo, 18 bytes per frame
 */
function buildRawPOKEYData(
  writes: RegisterWrite[],
  options: SAPExportOptions
): { data: Uint8Array; frameCount: number } {
  const fps = options.ntsc ? 60 : 50;
  const samplesPerFrame = 44100 / fps;

  // Filter to POKEY writes only
  const pokeyWrites = writes.filter(
    w => w.chipType === FurnaceChipType.TIA // TIA maps to POKEY in our enum
    // Note: If there's a dedicated POKEY type, use that instead
  );

  // Check for any writes at all
  // If no direct POKEY writes, try generic approach
  const allWrites = pokeyWrites.length > 0 ? pokeyWrites : writes;

  // Group by frame
  const frameGroups = groupWritesByFrame(allWrites, samplesPerFrame);

  // Find max frame (handle empty case)
  const frameKeys = Array.from(frameGroups.keys());
  const maxFrame = frameKeys.length > 0 ? Math.max(...frameKeys) : 0;
  const frameCount = maxFrame + 1;

  // Bytes per frame: 9 for mono, 18 for stereo
  const bytesPerFrame = options.stereo ? 18 : 9;
  const data = new Uint8Array(frameCount * bytesPerFrame);

  // Initialize all frames with silence
  // AUDC1-4 = 0 (volume 0, pure tone)
  // AUDF1-4 = 0
  // AUDCTL = 0

  // Current register state (for smooth playback)
  const currentState = new Uint8Array(options.stereo ? 18 : 9);

  for (let frame = 0; frame < frameCount; frame++) {
    const frameWrites = frameGroups.get(frame) || [];
    const frameOffset = frame * bytesPerFrame;

    // Apply writes for this frame
    for (const write of frameWrites) {
      const reg = write.port & 0x0F; // POKEY register 0-15
      if (reg <= 8) {
        // Map to our 9-byte frame format
        // Reorder: AUDF1, AUDC1, AUDF2, AUDC2, AUDF3, AUDC3, AUDF4, AUDC4, AUDCTL
        // Original: 0,1,2,3,4,5,6,7,8 maps directly
        currentState[reg] = write.data;

        // For stereo, writes to $D210-$D218 go to second chip
        if (options.stereo && write.port >= 0x10) {
          currentState[9 + (reg)] = write.data;
        }
      }
    }

    // Copy current state to frame
    data.set(currentState, frameOffset);
  }

  return { data, frameCount };
}

/**
 * Export register log to SAP format (Type R)
 */
export function exportToSAP(
  writes: RegisterWrite[],
  options: SAPExportOptions = {}
): Uint8Array {
  // Sort writes by timestamp
  const sortedWrites = [...writes].sort((a, b) => a.timestamp - b.timestamp);

  // Build raw POKEY data
  const { data: rawData, frameCount } = buildRawPOKEYData(sortedWrites, options);

  // Build header
  const header = buildSAPHeader(options, frameCount);
  const headerBytes = new TextEncoder().encode(header);

  // Combine header and data
  // SAP Type R format: text header + 0xFF 0xFF + raw data
  const totalSize = headerBytes.length + 2 + rawData.length;
  const sap = new Uint8Array(totalSize);

  sap.set(headerBytes, 0);
  sap[headerBytes.length] = 0xFF;     // Binary data marker
  sap[headerBytes.length + 1] = 0xFF;
  sap.set(rawData, headerBytes.length + 2);

  return sap;
}

/**
 * High-level export function
 */
export async function exportSAP(
  logData: Uint8Array,
  options: SAPExportOptions = {}
): Promise<Blob> {
  const writes = parseRegisterLog(logData);
  const sapData = exportToSAP(writes, options);
  return new Blob([sapData.buffer as ArrayBuffer], { type: 'application/octet-stream' });
}

/**
 * Check if log contains POKEY-compatible data
 */
export function canExportSAP(writes: RegisterWrite[]): boolean {
  // Check for TIA (which we use for POKEY) or any writes that look like POKEY
  return writes.some(
    w => w.chipType === FurnaceChipType.TIA ||
         (w.port >= 0xD200 && w.port <= 0xD21F) // Direct POKEY address
  );
}
