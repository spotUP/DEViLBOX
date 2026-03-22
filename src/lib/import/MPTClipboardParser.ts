/**
 * MPTClipboardParser — Parse OpenMPT / Furnace clipboard text format.
 *
 * OpenMPT format (pipe-separated):
 *   ModPlug Tracker  XM
 *   |C-5|01|v64|A01|
 *   |---|..|...|...|
 *
 * Furnace format (pipe-separated, variable effect columns):
 *   org.tildearrow.furnace - Pattern Data (1 channel(s), 64 row(s))
 *   C-4|00|..|01FF|
 *   ...|..|..|....|
 *
 * Returns null if the text doesn't match either format.
 */

import type { TrackerCell } from '@/types/tracker';

const NOTE_NAMES: Record<string, number> = {
  'C-': 0, 'C#': 1, 'D-': 2, 'D#': 3, 'E-': 4, 'F-': 5,
  'F#': 6, 'G-': 7, 'G#': 8, 'A-': 9, 'A#': 10, 'B-': 11,
};

function parseNote(s: string): number {
  if (!s || s === '---' || s === '...' || s === '...') return 0;
  if (s === '===' || s === '===') return 97; // note off (XM convention)
  const name = s.substring(0, 2);
  const octave = parseInt(s[2], 10);
  const semitone = NOTE_NAMES[name];
  if (semitone === undefined || isNaN(octave)) return 0;
  return semitone + (octave + 1) * 12; // XM note format: C-0 = 12
}

function parseHex(s: string): number {
  if (!s || s === '..' || s === '--') return 0;
  const v = parseInt(s, 16);
  return isNaN(v) ? 0 : v;
}

export interface MPTClipboardData {
  channels: number;
  rows: TrackerCell[][];
}

/**
 * Try to parse clipboard text as MPT/Furnace pattern data.
 * Returns null if the text doesn't match the expected format.
 */
export function parseMPTClipboard(text: string): MPTClipboardData | null {
  const lines = text.trim().split('\n');
  if (lines.length < 2) return null;

  // Detect format by header
  const header = lines[0].trim();
  const isMPT = header.startsWith('ModPlug Tracker') || header.startsWith('OpenMPT');
  const isFurnace = header.startsWith('org.tildearrow.furnace');

  if (!isMPT && !isFurnace) {
    // Try heuristic: first data line starts with | or contains pipe-separated note
    const firstData = lines[0];
    if (!firstData.includes('|')) return null;
  }

  const dataLines = isMPT || isFurnace ? lines.slice(1) : lines;
  if (dataLines.length === 0) return null;

  // Count channels from first data line
  // MPT format: |C-5|01|v64|A01| — each channel is 4 fields between pipes
  // We'll parse each row as pipe-separated fields
  const rows: TrackerCell[][] = [];
  let maxChannels = 0;

  for (const line of dataLines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    // Split by pipe, removing empty leading/trailing entries
    const fields = trimmed.split('|').filter(f => f.length > 0);
    if (fields.length < 1) continue;

    // Group fields into channels (4 fields per channel: note, inst, vol, effect)
    const channelCount = Math.floor(fields.length / 4) || 1;
    maxChannels = Math.max(maxChannels, channelCount);

    const rowCells: TrackerCell[] = [];
    for (let ch = 0; ch < channelCount; ch++) {
      const base = ch * 4;
      const noteStr = fields[base]?.trim() || '---';
      const insStr = fields[base + 1]?.trim() || '..';
      const volStr = fields[base + 2]?.trim() || '..';
      const effStr = fields[base + 3]?.trim() || '....';

      // Parse volume — MPT uses 'v64' format, Furnace uses hex
      let volume = 0;
      if (volStr.startsWith('v')) {
        volume = parseInt(volStr.slice(1), 10) || 0;
      } else {
        volume = parseHex(volStr);
      }

      // Parse effect — can be 2-char cmd + 2-char val or 4-char combined
      let effTyp = 0;
      let eff = 0;
      if (effStr.length >= 3) {
        effTyp = parseHex(effStr.substring(0, effStr.length === 4 ? 2 : 1));
        eff = parseHex(effStr.substring(effStr.length === 4 ? 2 : 1));
      }

      rowCells.push({
        note: parseNote(noteStr),
        instrument: parseHex(insStr),
        volume,
        effTyp,
        eff,
        effTyp2: 0,
        eff2: 0,
      } as TrackerCell);
    }
    rows.push(rowCells);
  }

  if (rows.length === 0) return null;

  return { channels: maxChannels, rows };
}
