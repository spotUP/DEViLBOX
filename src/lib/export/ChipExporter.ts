/**
 * ChipExporter - Unified interface for all chip music export formats
 *
 * Provides a single entry point for exporting captured hardware register logs
 * to various retro music formats (VGM, ZSM, SAP, TIunA).
 */

import { FurnaceChipEngine, FurnaceChipType } from '../../engine/chips/FurnaceChipEngine';
import { parseRegisterLog, exportToVGM, type VGMExportOptions, type RegisterWrite } from './VGMExporter';
import { exportToZSM, canExportZSM, type ZSMExportOptions } from './ZSMExporter';
import { exportToSAP, canExportSAP, type SAPExportOptions } from './SAPExporter';
import { exportToTIunA, canExportTIunA, type TIunAExportOptions } from './TIunAExporter';

export type ChipExportFormat = 'vgm' | 'zsm' | 'sap' | 'tiuna';

export interface ChipExportOptions {
  format: ChipExportFormat;
  title?: string;
  author?: string;
  loopPoint?: number;

  // Format-specific options
  vgm?: Partial<VGMExportOptions>;
  zsm?: Partial<ZSMExportOptions>;
  sap?: Partial<SAPExportOptions>;
  tiuna?: Partial<TIunAExportOptions>;
}

export interface ChipExportResult {
  data: Blob;
  filename: string;
  mimeType: string;
  format: ChipExportFormat;
}

/**
 * Chip names for human-readable output
 */
const CHIP_NAMES: Record<number, string> = {
  [FurnaceChipType.OPN2]: 'YM2612 (Genesis)',
  [FurnaceChipType.OPM]: 'YM2151 (Arcade)',
  [FurnaceChipType.OPL3]: 'YMF262 (OPL3)',
  [FurnaceChipType.PSG]: 'SN76489 (PSG)',
  [FurnaceChipType.NES]: 'NES APU',
  [FurnaceChipType.GB]: 'Game Boy DMG',
  [FurnaceChipType.PCE]: 'HuC6280 (PCE)',
  [FurnaceChipType.SCC]: 'K051649 (SCC)',
  [FurnaceChipType.AY]: 'AY-3-8910',
  [FurnaceChipType.OPLL]: 'YM2413 (OPLL)',
  [FurnaceChipType.SID]: 'SID',
  [FurnaceChipType.TIA]: 'TIA (Atari 2600)',
  [FurnaceChipType.VERA]: 'VERA (X16)',
  [FurnaceChipType.SNES]: 'SPC700 (SNES)',
};

/**
 * Format descriptions
 */
export const FORMAT_INFO: Record<ChipExportFormat, {
  name: string;
  extension: string;
  mimeType: string;
  description: string;
  supportedChips: number[];
}> = {
  vgm: {
    name: 'Video Game Music',
    extension: 'vgm',
    mimeType: 'application/octet-stream',
    description: 'Universal format supporting 40+ chips. Compatible with VGMPlay, foobar2000, and most retro players.',
    supportedChips: [
      FurnaceChipType.OPN2, FurnaceChipType.OPM, FurnaceChipType.OPL3,
      FurnaceChipType.PSG, FurnaceChipType.AY, FurnaceChipType.GB,
      FurnaceChipType.NES, FurnaceChipType.PCE, FurnaceChipType.SCC,
      FurnaceChipType.OPLL
    ]
  },
  zsm: {
    name: 'ZSound Music (Commander X16)',
    extension: 'zsm',
    mimeType: 'application/octet-stream',
    description: 'Native format for Commander X16. Supports YM2151 + VERA PSG/PCM.',
    supportedChips: [FurnaceChipType.OPM, FurnaceChipType.VERA]
  },
  sap: {
    name: 'Slight Atari Player',
    extension: 'sap',
    mimeType: 'application/octet-stream',
    description: 'Atari 8-bit music format for POKEY chip.',
    supportedChips: [FurnaceChipType.TIA] // We map TIA to POKEY
  },
  tiuna: {
    name: 'TIunA (Atari 2600)',
    extension: 'tia',
    mimeType: 'application/octet-stream',
    description: 'Simple format for Atari 2600 TIA chip.',
    supportedChips: [FurnaceChipType.TIA]
  }
};

/**
 * Analyze register log and determine available export formats
 */
export function getAvailableFormats(writes: RegisterWrite[]): ChipExportFormat[] {
  const formats: ChipExportFormat[] = [];

  // VGM supports almost everything
  const vgmChips = FORMAT_INFO.vgm.supportedChips;
  if (writes.some(w => vgmChips.includes(w.chipType))) {
    formats.push('vgm');
  }

  // ZSM requires OPM or VERA
  if (canExportZSM(writes)) {
    formats.push('zsm');
  }

  // SAP requires POKEY-compatible
  if (canExportSAP(writes)) {
    formats.push('sap');
  }

  // TIunA requires TIA
  if (canExportTIunA(writes)) {
    formats.push('tiuna');
  }

  return formats;
}

/**
 * Get statistics about the captured log
 */
export function getLogStatistics(writes: RegisterWrite[]): {
  totalWrites: number;
  duration: number;
  usedChips: { type: number; name: string; writes: number }[];
  frameRate: number;
} {
  const chipCounts = new Map<number, number>();

  for (const write of writes) {
    chipCounts.set(write.chipType, (chipCounts.get(write.chipType) || 0) + 1);
  }

  const usedChips = Array.from(chipCounts.entries())
    .map(([type, count]) => ({
      type,
      name: CHIP_NAMES[type] || `Unknown (${type})`,
      writes: count
    }))
    .sort((a, b) => b.writes - a.writes);

  const maxTimestamp = writes.reduce((max, w) => Math.max(max, w.timestamp), 0);
  const duration = maxTimestamp / 44100; // Assuming 44100Hz sample rate

  return {
    totalWrites: writes.length,
    duration,
    usedChips,
    frameRate: 60 // Default assumption
  };
}

/**
 * Export captured log to specified format
 */
export async function exportChipMusic(
  logData: Uint8Array,
  options: ChipExportOptions
): Promise<ChipExportResult> {
  const writes = parseRegisterLog(logData);

  if (writes.length === 0) {
    throw new Error('No register writes found in log data');
  }

  const formatInfo = FORMAT_INFO[options.format];
  let data: Uint8Array;

  switch (options.format) {
    case 'vgm':
      data = exportToVGM(writes, {
        title: options.title,
        author: options.author,
        loopPoint: options.loopPoint,
        ...options.vgm
      });
      break;

    case 'zsm':
      data = exportToZSM(writes, {
        loopPoint: options.loopPoint,
        ...options.zsm
      });
      break;

    case 'sap':
      data = exportToSAP(writes, {
        name: options.title,
        author: options.author,
        ...options.sap
      });
      break;

    case 'tiuna':
      data = exportToTIunA(writes, {
        title: options.title,
        author: options.author,
        loopFrame: options.loopPoint,
        ...options.tiuna
      });
      break;

    default:
      throw new Error(`Unsupported export format: ${options.format}`);
  }

  const filename = `${options.title || 'export'}.${formatInfo.extension}`;

  return {
    data: new Blob([data.buffer as ArrayBuffer], { type: formatInfo.mimeType }),
    filename,
    mimeType: formatInfo.mimeType,
    format: options.format
  };
}

/**
 * Recording session manager
 * Handles start/stop recording and export workflow
 */
export class ChipRecordingSession {
  private isRecording = false;
  private engine: FurnaceChipEngine;

  constructor() {
    this.engine = FurnaceChipEngine.getInstance();
  }

  /**
   * Start recording register writes
   */
  startRecording(): void {
    if (this.isRecording) {
      console.warn('[ChipRecordingSession] Already recording');
      return;
    }

    this.engine.setLogging(true);
    this.isRecording = true;
    console.log('[ChipRecordingSession] Recording started');
  }

  /**
   * Stop recording and return captured data
   */
  async stopRecording(): Promise<Uint8Array> {
    if (!this.isRecording) {
      console.warn('[ChipRecordingSession] Not recording');
      return new Uint8Array(0);
    }

    this.engine.setLogging(false);
    this.isRecording = false;

    const logData = await this.engine.getLog();
    console.log(`[ChipRecordingSession] Recording stopped. Captured ${logData.length} bytes`);

    return logData;
  }

  /**
   * Check if currently recording
   */
  getIsRecording(): boolean {
    return this.isRecording;
  }

  /**
   * Record, then export to specified format
   */
  async recordAndExport(
    durationMs: number,
    options: ChipExportOptions
  ): Promise<ChipExportResult> {
    this.startRecording();

    // Wait for specified duration
    await new Promise(resolve => setTimeout(resolve, durationMs));

    const logData = await this.stopRecording();

    return exportChipMusic(logData, options);
  }
}

// Re-export types and functions
export type { RegisterWrite, VGMExportOptions, ZSMExportOptions, SAPExportOptions, TIunAExportOptions };
export { parseRegisterLog };
