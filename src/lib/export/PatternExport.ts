/**
 * PatternExport - FT2-style pattern export/import (.xp format)
 *
 * Handles exporting and importing individual patterns
 */

import type { Pattern, TrackerCell } from '@typedefs';

interface XPFileFormat {
  version: number;       // Format version (1)
  name: string;          // Pattern name
  rows: number;          // Pattern length
  channels: number;      // Number of channels
  data: TrackerCell[][]; // [channel][row]
}

/**
 * Export a pattern to .xp format (JSON blob)
 * @param pattern - Pattern to export
 * @returns Blob containing JSON data
 */
export function exportPattern(pattern: Pattern): Blob {
  const xpData: XPFileFormat = {
    version: 1,
    name: pattern.name,
    rows: pattern.length,
    channels: pattern.channels.length,
    data: pattern.channels.map(ch => ch.rows),
  };

  const json = JSON.stringify(xpData, null, 2);
  return new Blob([json], { type: 'application/json' });
}

/**
 * Import a pattern from .xp format
 * @param file - File object containing .xp data
 * @returns Promise resolving to XPFileFormat
 */
export async function importPattern(file: File): Promise<XPFileFormat> {
  const text = await file.text();
  const data = JSON.parse(text) as XPFileFormat;

  // Validate format
  if (data.version !== 1) {
    throw new Error(`Unsupported .xp format version: ${data.version}`);
  }

  if (!data.data || !Array.isArray(data.data)) {
    throw new Error('Invalid .xp format: missing or invalid data');
  }

  if (data.channels !== data.data.length) {
    throw new Error('Invalid .xp format: channel count mismatch');
  }

  return data;
}

/**
 * Convert XPFileFormat to Pattern object
 * @param xpData - Imported .xp data
 * @returns Pattern object
 */
export function xpToPattern(xpData: XPFileFormat): Omit<Pattern, 'id'> {
  return {
    name: xpData.name || 'Imported Pattern',
    length: xpData.rows,
    channels: xpData.data.map((rows, index) => ({
      id: `imported-channel-${index}`,
      name: `Channel ${index + 1}`,
      rows: rows.slice(0, xpData.rows), // Ensure correct length
      muted: false,
      solo: false,
      collapsed: false,
      volume: 80,
      pan: 0,
      instrumentId: null,
      color: null,
    })),
  };
}

/**
 * Download pattern as .xp file
 * @param pattern - Pattern to download
 * @param filename - Optional filename (defaults to pattern name)
 */
export function downloadPattern(pattern: Pattern, filename?: string): void {
  const blob = exportPattern(pattern);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || `${pattern.name}.xp`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
