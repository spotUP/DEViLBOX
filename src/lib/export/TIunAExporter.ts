/**
 * TIunA Exporter
 * Atari 2600 TIA music format
 *
 * TIunA is a simple tracker format for the Atari 2600's TIA sound chip.
 * The TIA has only 2 channels with limited frequency resolution.
 *
 * TIA Registers (relative to $15):
 * - AUDC0 ($15): Audio control channel 0 (distortion + volume)
 * - AUDC1 ($16): Audio control channel 1
 * - AUDF0 ($17): Audio frequency channel 0 (5-bit, 0-31)
 * - AUDF1 ($18): Audio frequency channel 1
 * - AUDV0 ($19): Audio volume channel 0 (4-bit, 0-15)
 * - AUDV1 ($1A): Audio volume channel 1
 *
 * Format: Simple frame-by-frame register dumps
 */

import { FurnaceChipType } from '../../engine/chips/FurnaceChipEngine';
import type { RegisterWrite } from './VGMExporter';
import { parseRegisterLog } from './VGMExporter';

// TIA Register offsets (relative to $15 or 0 for our purposes) - exported for documentation
export const TIA_REG = {
  AUDC0: 0,   // Distortion + volume CH0
  AUDC1: 1,   // Distortion + volume CH1
  AUDF0: 2,   // Frequency CH0 (0-31)
  AUDF1: 3,   // Frequency CH1 (0-31)
  AUDV0: 4,   // Volume CH0 (0-15)
  AUDV1: 5,   // Volume CH1 (0-15)
} as const;

// TIA Distortion types (upper 4 bits of AUDCx) - exported for documentation
export const TIA_DISTORTION = {
  SILENT: 0x00,
  BUZZ: 0x10,       // 4-bit poly
  RUMBLE: 0x20,     // div 15 -> 4-bit poly
  BUZZY: 0x30,      // 5-bit poly -> 4-bit poly
  PURE: 0x40,       // Pure tone (div 2)
  PURE_ALT: 0x50,   // Pure tone variant
  BASS: 0x60,       // div 31
  SAW: 0x70,        // 5-bit poly -> div 2
  POLY5: 0x80,      // 5-bit poly
  POLY5_ALT: 0x90,  // 5-bit poly variant
  METALLIC: 0xA0,   // div 31
  LOW_PURE: 0xC0,   // Pure tone div 6
  LOW_PURE_ALT: 0xD0,
  NOISE: 0xE0,      // div 93 (like noise)
  NOISE_ALT: 0xF0,
} as const;

export interface TIunAExportOptions {
  title?: string;
  author?: string;
  ntsc?: boolean;     // NTSC timing (60Hz), default PAL (50Hz)
  loopFrame?: number; // Frame to loop back to
}

/**
 * TIunA file header structure
 */
function buildTIunAHeader(
  options: TIunAExportOptions,
  frameCount: number,
  loopFrame: number
): Uint8Array {
  // TIunA header: 16 bytes
  // 0-3: Magic "TIuA"
  // 4-5: Version (1.0)
  // 6-7: Frame count (16-bit LE)
  // 8-9: Loop frame (16-bit LE, 0xFFFF = no loop)
  // 10: Timing (0 = PAL, 1 = NTSC)
  // 11-15: Reserved

  const header = new Uint8Array(16);
  const view = new DataView(header.buffer);

  // Magic
  header[0] = 0x54; // 'T'
  header[1] = 0x49; // 'I'
  header[2] = 0x75; // 'u'
  header[3] = 0x41; // 'A'

  // Version 1.0
  header[4] = 0x01;
  header[5] = 0x00;

  // Frame count
  view.setUint16(6, frameCount, true);

  // Loop frame (0xFFFF = no loop)
  view.setUint16(8, loopFrame >= 0 ? loopFrame : 0xFFFF, true);

  // Timing flag
  header[10] = options.ntsc ? 1 : 0;

  return header;
}

/**
 * Group writes by frame and convert to TIA format
 */
function buildTIAFrameData(
  writes: RegisterWrite[],
  options: TIunAExportOptions
): { data: Uint8Array; frameCount: number } {
  const fps = options.ntsc ? 60 : 50;
  const samplesPerFrame = 44100 / fps;

  // Filter to TIA writes
  const tiaWrites = writes.filter(w => w.chipType === FurnaceChipType.TIA);

  if (tiaWrites.length === 0) {
    console.warn('[TIunAExporter] No TIA writes found in log');
    return { data: new Uint8Array(0), frameCount: 0 };
  }

  // Group by frame
  const frameGroups = new Map<number, RegisterWrite[]>();
  for (const write of tiaWrites) {
    const frame = Math.floor(write.timestamp / samplesPerFrame);
    if (!frameGroups.has(frame)) {
      frameGroups.set(frame, []);
    }
    frameGroups.get(frame)!.push(write);
  }

  // Find max frame
  const maxFrame = Math.max(...frameGroups.keys(), 0);
  const frameCount = maxFrame + 1;

  // 6 bytes per frame: AUDC0, AUDC1, AUDF0, AUDF1, AUDV0, AUDV1
  const bytesPerFrame = 6;
  const data = new Uint8Array(frameCount * bytesPerFrame);

  // Current register state
  const currentState = new Uint8Array(6);

  for (let frame = 0; frame < frameCount; frame++) {
    const frameWrites = frameGroups.get(frame) || [];
    const frameOffset = frame * bytesPerFrame;

    // Apply writes for this frame
    for (const write of frameWrites) {
      // TIA registers are 0x15-0x1A, map to 0-5
      let reg = write.port;
      if (reg >= 0x15) {
        reg -= 0x15;
      }

      if (reg >= 0 && reg < 6) {
        currentState[reg] = write.data;
      }
    }

    // Copy current state to frame
    data.set(currentState, frameOffset);
  }

  return { data, frameCount };
}

/**
 * Export register log to TIunA format
 */
export function exportToTIunA(
  writes: RegisterWrite[],
  options: TIunAExportOptions = {}
): Uint8Array {
  // Sort writes by timestamp
  const sortedWrites = [...writes].sort((a, b) => a.timestamp - b.timestamp);

  // Build frame data
  const { data: frameData, frameCount } = buildTIAFrameData(sortedWrites, options);

  if (frameCount === 0) {
    throw new Error('No TIA data to export');
  }

  // Build header
  const header = buildTIunAHeader(options, frameCount, options.loopFrame ?? -1);

  // Combine header and data
  const totalSize = header.length + frameData.length;
  const tiuna = new Uint8Array(totalSize);

  tiuna.set(header, 0);
  tiuna.set(frameData, header.length);

  return tiuna;
}

/**
 * Export to simple text format (human-readable)
 * Useful for debugging and manual editing
 */
export function exportToTIunAText(
  writes: RegisterWrite[],
  options: TIunAExportOptions = {}
): string {
  const fps = options.ntsc ? 60 : 50;
  const samplesPerFrame = 44100 / fps;

  const tiaWrites = writes.filter(w => w.chipType === FurnaceChipType.TIA);

  const lines: string[] = [
    `; TIunA Export`,
    `; Title: ${options.title || 'Untitled'}`,
    `; Author: ${options.author || 'Unknown'}`,
    `; Timing: ${options.ntsc ? 'NTSC (60Hz)' : 'PAL (50Hz)'}`,
    `; Generated by DEViLBOX`,
    '',
    '; Frame AUDC0 AUDC1 AUDF0 AUDF1 AUDV0 AUDV1',
    ''
  ];

  // Group by frame
  const frameGroups = new Map<number, RegisterWrite[]>();
  for (const write of tiaWrites) {
    const frame = Math.floor(write.timestamp / samplesPerFrame);
    if (!frameGroups.has(frame)) {
      frameGroups.set(frame, []);
    }
    frameGroups.get(frame)!.push(write);
  }

  const currentState = new Uint8Array(6);
  const maxFrame = Math.max(...frameGroups.keys(), 0);

  for (let frame = 0; frame <= maxFrame; frame++) {
    const frameWrites = frameGroups.get(frame) || [];

    for (const write of frameWrites) {
      let reg = write.port >= 0x15 ? write.port - 0x15 : write.port;
      if (reg >= 0 && reg < 6) {
        currentState[reg] = write.data;
      }
    }

    // Only output frames with changes
    if (frameWrites.length > 0 || frame === 0) {
      const hex = (n: number) => n.toString(16).padStart(2, '0').toUpperCase();
      lines.push(
        `${String(frame).padStart(5)} ` +
        `$${hex(currentState[0])} $${hex(currentState[1])} ` +
        `$${hex(currentState[2])} $${hex(currentState[3])} ` +
        `$${hex(currentState[4])} $${hex(currentState[5])}`
      );
    }
  }

  if (options.loopFrame !== undefined && options.loopFrame >= 0) {
    lines.push('');
    lines.push(`; LOOP TO FRAME ${options.loopFrame}`);
  }

  return lines.join('\n');
}

/**
 * High-level export function (binary)
 */
export async function exportTIunA(
  logData: Uint8Array,
  options: TIunAExportOptions = {}
): Promise<Blob> {
  const writes = parseRegisterLog(logData);
  const tiunaData = exportToTIunA(writes, options);
  return new Blob([tiunaData.buffer as ArrayBuffer], { type: 'application/octet-stream' });
}

/**
 * High-level export function (text)
 */
export async function exportTIunAAsText(
  logData: Uint8Array,
  options: TIunAExportOptions = {}
): Promise<Blob> {
  const writes = parseRegisterLog(logData);
  const textData = exportToTIunAText(writes, options);
  return new Blob([textData], { type: 'text/plain' });
}

/**
 * Check if log contains TIA data
 */
export function canExportTIunA(writes: RegisterWrite[]): boolean {
  return writes.some(w => w.chipType === FurnaceChipType.TIA);
}
