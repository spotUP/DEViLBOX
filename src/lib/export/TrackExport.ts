/**
 * TrackExport - FT2-style track export/import (.xt format)
 *
 * Handles exporting and importing single channels (tracks)
 */

import type { Pattern, TrackerCell } from '@typedefs';

interface XTFileFormat {
  version: number;      // Format version (1)
  name: string;         // Track/channel name
  rows: number;         // Number of rows
  data: TrackerCell[];  // Single channel data
}

/**
 * Export a track (single channel) to .xt format (JSON blob)
 * @param channelIndex - Channel index to export
 * @param pattern - Pattern containing the channel
 * @returns Blob containing JSON data
 */
export function exportTrack(channelIndex: number, pattern: Pattern): Blob {
  const channel = pattern.channels[channelIndex];
  if (!channel) {
    throw new Error(`Channel ${channelIndex} not found in pattern`);
  }

  const xtData: XTFileFormat = {
    version: 1,
    name: channel.name,
    rows: pattern.length,
    data: channel.rows,
  };

  const json = JSON.stringify(xtData, null, 2);
  return new Blob([json], { type: 'application/json' });
}

/**
 * Import a track from .xt format
 * @param file - File object containing .xt data
 * @returns Promise resolving to XTFileFormat
 */
export async function importTrack(file: File): Promise<XTFileFormat> {
  const text = await file.text();
  const data = JSON.parse(text) as XTFileFormat;

  // Validate format
  if (data.version !== 1) {
    throw new Error(`Unsupported .xt format version: ${data.version}`);
  }

  if (!data.data || !Array.isArray(data.data)) {
    throw new Error('Invalid .xt format: missing or invalid data');
  }

  if (data.rows !== data.data.length) {
    throw new Error('Invalid .xt format: row count mismatch');
  }

  return data;
}

/**
 * Download track as .xt file
 * @param channelIndex - Channel index to download
 * @param pattern - Pattern containing the channel
 * @param filename - Optional filename (defaults to channel name)
 */
export function downloadTrack(
  channelIndex: number,
  pattern: Pattern,
  filename?: string
): void {
  const channel = pattern.channels[channelIndex];
  if (!channel) {
    throw new Error(`Channel ${channelIndex} not found in pattern`);
  }

  const blob = exportTrack(channelIndex, pattern);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || `${channel.name}.xt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
