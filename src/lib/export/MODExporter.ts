/**
 * MOD Exporter - patterns + instruments to ProTracker MOD.
 *
 * A thin adapter onto the one MOD writer, `modExport.exportSongToMOD`. This
 * file used to be a second MOD writer with its own note table (sharps missed:
 * "C#-2" against "C#2" keys), its own effect source (the legacy string field,
 * so every effect was lost), a C00 written into every cell without an
 * effect, samples by list position, the song order written as 0, 1, 2...,
 * and a finetune nibble off by eight. One writer now; this keeps the
 * (patterns, instruments, options) call shape for Cinter4ModExporter.
 */

import type { Pattern } from '../../types/tracker';
import type { InstrumentConfig } from '../../types/instrument';
import type { TrackerSong } from '@engine/TrackerReplayer';
import { exportSongToMOD } from './modExport';

export interface MODExportOptions {
  channelCount?: number; // 4, 6, 8 channels (default: 4)
  moduleName?: string; // Module title (20 chars max)
  bakeSynthsToSamples?: boolean; // Warn on synth instruments without PCM (default: true)
  /** The song order; defaults to every pattern once, in order. */
  songPositions?: number[];
}

export interface MODExportResult {
  data: Blob;
  warnings: string[];
  filename: string;
}

/** Export patterns and instruments to MOD format. */
export async function exportAsMOD(
  patterns: Pattern[],
  instruments: InstrumentConfig[],
  options: MODExportOptions = {},
): Promise<MODExportResult> {
  const channelCount = options.channelCount ?? 4;
  if (channelCount !== 4 && channelCount !== 6 && channelCount !== 8) {
    throw new Error(`MOD supports 4, 6, or 8 channels (got ${channelCount})`);
  }
  const songPositions = options.songPositions ?? patterns.map((_, i) => i);
  const song = {
    name: options.moduleName ?? 'DEViLBOX Export',
    format: 'MOD',
    patterns,
    instruments,
    songPositions,
    songLength: songPositions.length,
    restartPosition: 0,
    numChannels: Math.max(0, ...patterns.map((p) => p.channels.length)),
    initialSpeed: 6,
    initialBPM: 125,
  } as TrackerSong;
  const res = await exportSongToMOD(song, {
    bakeSynths: options.bakeSynthsToSamples ?? true,
    channelCount,
    moduleName: song.name,
  });
  return { data: res.blob, warnings: res.warnings, filename: res.filename };
}
