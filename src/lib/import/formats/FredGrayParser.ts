/**
 * FredGrayParser.ts — Fred Gray format detection and stub parser
 *
 * Detection (from eagleplayer.conf: FredGray  prefixes=gray):
 *   Magic: "FREDGRAY" (8 bytes) at byte offset 0x24 (36 decimal).
 *   Files are prefixed: gray.songname
 *
 * Minimum file size: 0x24 + 8 = 44 bytes.
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { InstrumentConfig } from '@/types';
import type { UADEPatternLayout } from '@/engine/uade/UADEPatternEncoder';
import { encodeMODCell, decodeMODCell } from '@/engine/uade/encoders/MODEncoder';

const MAGIC_OFFSET = 0x24; // 36
const MAGIC = 'FREDGRAY';
const MIN_FILE_SIZE = MAGIC_OFFSET + MAGIC.length; // 44

function u16BE(buf: Uint8Array, off: number): number {
  return ((buf[off] << 8) | buf[off + 1]) >>> 0;
}

function u32BE(buf: Uint8Array, off: number): number {
  return (((buf[off] << 24) | (buf[off + 1] << 16) | (buf[off + 2] << 8) | buf[off + 3]) >>> 0);
}

/**
 * Detect Fred Gray format.
 * Primary check: 8 bytes at offset 0x24 == "FREDGRAY".
 * Secondary check: prefix gray.* for files without the magic.
 */
export function isFredGrayFormat(
  buffer: ArrayBuffer | Uint8Array,
  filename?: string,
): boolean {
  const buf = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);

  if (buf.length >= MIN_FILE_SIZE) {
    let match = true;
    for (let i = 0; i < MAGIC.length; i++) {
      if (buf[MAGIC_OFFSET + i] !== MAGIC.charCodeAt(i)) { match = false; break; }
    }
    if (match) return true;
  }

  // Prefix fallback
  if (!filename) return false;
  const base = (filename.split('/').pop() ?? filename).split('\\').pop()!.toLowerCase();
  return base.startsWith('gray.');
}

export function parseFredGrayFile(buffer: ArrayBuffer, filename: string): TrackerSong {
  const buf = new Uint8Array(buffer);
  if (!isFredGrayFormat(buf, filename)) throw new Error('Not a Fred Gray module');

  const baseName = filename.split('/').pop() ?? filename;
  const moduleName = baseName.replace(/^gray\./i, '').replace(/\.gray$/i, '') || baseName;

  // ── Header field extraction ─────────────────────────────────────────────
  //
  // The header before the FREDGRAY magic (offsets 0..0x23) contains metadata.
  // Try to extract sample count and other useful fields.

  const instruments: InstrumentConfig[] = [];
  let sampleCount = 0;

  try {
    // Bytes 0..3 often contain a module size or offset pointer
    // Bytes 4..7 may contain another pointer (song data)
    // Scan after the magic for sample table-like structures
    const postMagic = MAGIC_OFFSET + MAGIC.length; // offset 44

    // Look for a sample table: entries with plausible length (u16/u32) and period values.
    // Fred Gray uses 8-byte or 12-byte sample entries following the header.
    if (buf.length > postMagic + 8) {
      // Try 8-byte sample entry scan (offset, length as u16 pairs or u32)
      let off = postMagic;
      for (let i = 0; i < 32 && off + 8 <= buf.length; i++) {
        const val0 = u32BE(buf, off);
        const val1 = u32BE(buf, off + 4);

        // A valid sample entry: first u32 is an offset (< file size),
        // second u32 is length (> 0, < 256KB, reasonable for Amiga)
        if (val0 < buf.length && val1 > 0 && val1 < 0x40000 && val1 % 2 === 0) {
          sampleCount++;
          off += 8;
        } else {
          break;
        }
      }

      // Create instruments for found samples
      for (let i = 0; i < sampleCount; i++) {
        const sLen = u32BE(buf, postMagic + i * 8 + 4);
        instruments.push({
          id: i + 1,
          name: `Sample ${i + 1} (${sLen} bytes)`,
          type: 'synth' as const,
          synthType: 'Synth' as const,
          effects: [],
          volume: 0,
          pan: 0,
        } as InstrumentConfig);
      }
    }

    // If no sample table found, try extracting count from header fields
    if (sampleCount === 0 && buf.length >= 8) {
      // u16 at offset 0 or 2 might be number of samples/patterns
      const candidate = u16BE(buf, 0);
      if (candidate > 0 && candidate <= 64) {
        sampleCount = candidate;
        for (let i = 0; i < sampleCount; i++) {
          instruments.push({
            id: i + 1,
            name: `Sample ${i + 1}`,
            type: 'synth' as const,
            synthType: 'Synth' as const,
            effects: [],
            volume: 0,
            pan: 0,
          } as InstrumentConfig);
        }
      }
    }
  } catch {
    // Binary scan failed — fall back to default
  }

  // Fallback: single placeholder
  if (instruments.length === 0) {
    instruments.push({
      id: 1, name: 'Sample 1', type: 'synth' as const,
      synthType: 'Synth' as const, effects: [], volume: 0, pan: 0,
    } as InstrumentConfig);
    sampleCount = 1;
  }

  const emptyRows = Array.from({ length: 64 }, () => ({
    note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0,
  }));

  const pattern = {
    id: 'pattern-0', name: 'Pattern 0', length: 64,
    channels: Array.from({ length: 4 }, (_, ch) => ({
      id: `channel-${ch}`, name: `Channel ${ch + 1}`, muted: false,
      solo: false, collapsed: false, volume: 100,
      pan: ch === 0 || ch === 3 ? -50 : 50,
      instrumentId: null, color: null, rows: emptyRows,
    })),
    importMetadata: {
      sourceFormat: 'MOD' as const, sourceFile: filename,
      importedAt: new Date().toISOString(),
      originalChannelCount: 4, originalPatternCount: 1,
      originalInstrumentCount: sampleCount,
    },
  };

  return {
    name: `${moduleName} [Fred Gray]`, format: 'MOD' as TrackerFormat,
    patterns: [pattern], instruments, songPositions: [0],
    songLength: 1, restartPosition: 0, numChannels: 4,
    initialSpeed: 6, initialBPM: 125, linearPeriods: false,
    uadeEditableFileData: buffer.slice(0) as ArrayBuffer,
    uadeEditableFileName: filename,
    uadePatternLayout: {
      formatId: 'fredGray',
      patternDataFileOffset: 0,
      bytesPerCell: 4,
      rowsPerPattern: 64,
      numChannels: 4,
      numPatterns: 1,
      moduleSize: buffer.byteLength,
      encodeCell: encodeMODCell,
      decodeCell: decodeMODCell,
    } as UADEPatternLayout,
  };
}
