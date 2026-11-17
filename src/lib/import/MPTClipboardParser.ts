/**
 * MPTClipboardParser: parse the OpenMPT text clipboard (Furnace "paste special" accepts the same).
 *
 * OpenMPT rows are fixed width, one `|` before every channel and no separators inside a channel:
 *   ModPlug Tracker  XM
 *   |C-501v64A01|---..........|
 * Per channel: note (3 chars), instrument (2), volume (3: symbol + 2 digits), effect (3: letter + 2 hex).
 * Layout copied from Furnace src/gui/editing.cpp doPasteMPT. Furnace's own clipboard format is not handled here.
 */

import { EMPTY_CELL, type ClipboardData, type TrackerCell } from '@/types/tracker';

const NOTE_NAMES: Record<string, number> = {
  'C-': 0, 'C#': 1, 'D-': 2, 'D#': 3, 'E-': 4, 'F-': 5,
  'F#': 6, 'G-': 7, 'G#': 8, 'A-': 9, 'A#': 10, 'B-': 11,
};

/** Header prefixes Furnace accepts (modPlugFormatHeaders). */
const HEADERS = ['ModPlug Tracker MOD', 'ModPlug Tracker S3M', 'ModPlug Tracker  XM', 'ModPlug Tracker XM', 'ModPlug Tracker  IT', 'ModPlug Tracker IT', 'ModPlug Tracker MPT'];

/** XM volume column: symbol -> high nibble (the 'v' set-volume range is 0x10 + 0..64). */
const VOLUME_SYMBOL: Record<string, number> = { d: 0x60, c: 0x70, b: 0x80, a: 0x90, u: 0xA0, h: 0xB0, p: 0xC0, l: 0xD0, r: 0xE0, g: 0xF0 };

const isBlank = (s: string): boolean => /^[. ]*$/.test(s);

export interface MPTClipboardData {
  channels: number;
  /** Row-major: rows[row][channel]. */
  rows: TrackerCell[][];
}

/** One note field; undefined = invalid, null = empty. */
function parseNote(s: string): number | null | undefined {
  if (isBlank(s) || s === '---') return null;
  if (s === '===' || s === '^^^' || s === '~~~') return 97;
  const semitone = NOTE_NAMES[s.substring(0, 2)];
  const octave = parseInt(s[2], 10);
  if (semitone === undefined || isNaN(octave)) return undefined;
  return octave * 12 + semitone + 1; // C-0 = 1, same numbering as OpenMPT and XM
}

/** Parse OpenMPT clipboard text; null when the header or any row is not OpenMPT data. */
export function parseMPTClipboard(text: string): MPTClipboardData | null {
  const lines = text.split(/\r?\n/);
  const header = lines[0] ?? '';
  const format = HEADERS.find((h) => header.startsWith(h));
  if (!format || lines.length < 2) return null;
  const letterBase1 = /S3M|IT|MPT/.test(format); // XM/MOD effect letters are base 36 from '0'; S3M/IT letters start at A = 1

  const rows: TrackerCell[][] = [];
  let channels = 0;
  for (const line of lines.slice(1)) {
    if (!line.startsWith('|')) continue;
    const cells: TrackerCell[] = [];
    // each channel is 11 chars followed by '|'
    for (let pos = 1; pos + 11 <= line.length; pos += 12) {
      const f = line.substring(pos, pos + 11);
      const note = parseNote(f.substring(0, 3));
      if (note === undefined) return null;
      const cell: TrackerCell = { ...EMPTY_CELL };
      if (note !== null) cell.note = note;
      const ins = f.substring(3, 5);
      if (!isBlank(ins)) { const v = parseInt(ins, 10); if (isNaN(v)) return null; cell.instrument = v; }
      const vol = f.substring(5, 8);
      if (!isBlank(vol)) {
        const n = parseInt(vol.substring(1), vol[0] === 'v' ? 10 : 16);
        if (isNaN(n)) return null;
        if (vol[0] === 'v') cell.volume = 0x10 + Math.min(n, 64);
        else if (VOLUME_SYMBOL[vol[0]] !== undefined) cell.volume = VOLUME_SYMBOL[vol[0]] + (n & 0xF);
        else return null;
      }
      const eff = f.substring(8, 11);
      if (!isBlank(eff)) {
        const letter = parseInt(eff[0], 36);
        const param = parseInt(eff.substring(1), 16);
        if (isNaN(letter) || isNaN(param)) return null;
        cell.effTyp = letterBase1 ? letter - 9 : letter;
        cell.eff = param;
      }
      cells.push(cell);
    }
    if (cells.length === 0) return null;
    channels = Math.max(channels, cells.length);
    rows.push(cells);
  }
  return rows.length ? { channels, rows } : null;
}

/** Channel-major clipboard, ready for pasteHelper. */
export function mptToClipboard(mpt: MPTClipboardData): ClipboardData {
  return {
    channels: mpt.channels,
    rows: mpt.rows.length,
    data: Array.from({ length: mpt.channels }, (_, ch) => mpt.rows.map((r) => r[ch] ?? { ...EMPTY_CELL })),
  };
}
