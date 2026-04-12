/**
 * GlueMonParser.ts — GlueMon Amiga music format native parser
 *
 * GlueMon is an Amiga music format by "GlueMaster / Northstar" (version 1.13,
 * 17-Nov-96). Files are named with "glue." prefix (or occasionally "gm.").
 *
 * Detection (from UADE amifilemagic.c line 77 and GlueMon player):
 *   bytes[0..3] == "GLUE" (0x47 0x4C 0x55 0x45)
 *   Minimum file size: 12 bytes
 *
 * File header layout (observed from sample files):
 *   Offset  Size  Description
 *   ------  ----  -----------
 *   0x00    4     Magic: "GLUE"
 *   0x04    4     Unknown header data (b8 b3 aa ba in test file)
 *   0x08    8     Song name (null/space padded ASCII string)
 *
 * Notes are stored as MIDI-style note numbers (0x3C = middle C = MIDI 60).
 * 0xFF indicates a rest. Notes appear to be in 5-byte cells (note + 4 bytes
 * of instrument/effect data).
 *
 * 4-channel Amiga format (LRRL panning).
 * Actual audio playback is delegated to UADE.
 *
 * References:
 *   third-party/uade-3.05/src/frontends/common/amifilemagic.c (line 77)
 *   third-party/uade-3.05/players/GlueMon (player binary)
 *   third-party/uade-3.05/eagleplayer.conf (prefixes=glue,gm)
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { InstrumentConfig } from '@/types';
import type { UADEPatternLayout } from '@/engine/uade/UADEPatternEncoder';
import { encodeMODCell, decodeMODCell } from '@/engine/uade/encoders/MODEncoder';

// ── Constants ──────────────────────────────────────────────────────────────

/** Minimum file size (magic 4 + header 4 + name 8 = 16). */
const MIN_FILE_SIZE = 16;

/** Number of audio channels (4-channel Amiga format). */
const NUM_CHANNELS = 4;

/** LRRL stereo panning (standard Amiga hardware channel assignment). */
const CHANNEL_PANS = [-50, 50, 50, -50];

// ── Binary helpers ─────────────────────────────────────────────────────────

function readAsciiTrimmed(buf: Uint8Array, off: number, len: number): string {
  let end = off + len;
  while (end > off && (buf[end - 1] === 0x00 || buf[end - 1] === 0x20)) end--;
  return Array.from(buf.subarray(off, end))
    .map(b => (b >= 0x20 && b < 0x7f ? String.fromCharCode(b) : '?'))
    .join('');
}

// ── Format detection ───────────────────────────────────────────────────────

/**
 * Return true if the buffer is a GlueMon module.
 *
 * Detection: bytes[0..3] == "GLUE" (per UADE amifilemagic.c line 77).
 * The four-byte magic is unique and sufficient for reliable identification.
 */
export function isGlueMonFormat(buffer: ArrayBuffer | Uint8Array): boolean {
  const buf = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (buf.length < MIN_FILE_SIZE) return false;
  return (
    buf[0] === 0x47 && // G
    buf[1] === 0x4c && // L
    buf[2] === 0x55 && // U
    buf[3] === 0x45    // E
  );
}

// ── Main parser ────────────────────────────────────────────────────────────

/**
 * Parse a GlueMon module file into a TrackerSong.
 *
 * Extracts the song name from the 8-byte field at offset 0x08.
 * Actual audio playback is always delegated to UADE.
 *
 * @param buffer   Raw file bytes (ArrayBuffer)
 * @param filename Original filename (used to derive the module name fallback)
 */
export function parseGlueMonFile(buffer: ArrayBuffer, filename: string): TrackerSong {
  const buf = new Uint8Array(buffer);

  if (!isGlueMonFormat(buf)) {
    throw new Error('Not a GlueMon module');
  }

  // ── Song name ─────────────────────────────────────────────────────────────

  // 8-byte ASCII name at offset 0x08 (padded with spaces/nulls)
  const rawName = readAsciiTrimmed(buf, 0x08, 8);

  // Fall back to the filename if the name field is empty
  const baseName = filename.split('/').pop() ?? filename;
  const fileBaseName = baseName.replace(/^glue\./i, '').replace(/^gm\./i, '') || baseName;

  const moduleName = rawName || fileBaseName;

  // ── Stub pattern (UADE handles audio) ─────────────────────────────────────

  const emptyRows = Array.from({ length: 64 }, () => ({
    note: 0,
    instrument: 0,
    volume: 0,
    effTyp: 0,
    eff: 0,
    effTyp2: 0,
    eff2: 0,
  }));

  const pattern = {
    id: 'pattern-0',
    name: 'Pattern 0',
    length: 64,
    channels: Array.from({ length: NUM_CHANNELS }, (_, ch) => ({
      id: `channel-${ch}`,
      name: `Channel ${ch + 1}`,
      muted: false,
      solo: false,
      collapsed: false,
      volume: 100,
      pan: CHANNEL_PANS[ch],
      instrumentId: null,
      color: null,
      rows: emptyRows,
    })),
    importMetadata: {
      sourceFormat: 'MOD' as const,
      sourceFile: filename,
      importedAt: new Date().toISOString(),
      originalChannelCount: NUM_CHANNELS,
      originalPatternCount: 1,
      originalInstrumentCount: 0,
    },
  };

  const instruments: InstrumentConfig[] = [
    {
      id: 1,
      name: 'Sample 1',
      type: 'synth' as const,
      synthType: 'Synth' as const,
      effects: [],
      volume: 0,
      pan: 0,
    } as InstrumentConfig,
  ];

  return {
    name: `${moduleName} [GlueMon]`,
    format: 'MOD' as TrackerFormat,
    patterns: [pattern],
    instruments,
    songPositions: [0],
    songLength: 1,
    restartPosition: 0,
    numChannels: NUM_CHANNELS,
    initialSpeed: 6,
    initialBPM: 125,
    linearPeriods: false,
    uadeEditableFileData: buffer.slice(0) as ArrayBuffer,
    uadeEditableFileName: filename,
    uadePatternLayout: {
      formatId: 'glueMon',
      patternDataFileOffset: 0,
      bytesPerCell: 4,
      rowsPerPattern: 64,
      numChannels: NUM_CHANNELS,
      numPatterns: 1,
      moduleSize: buffer.byteLength,
      encodeCell: encodeMODCell,
      decodeCell: decodeMODCell,
    } as UADEPatternLayout,
  };
}
