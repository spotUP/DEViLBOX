/**
 * MedleyParser.ts — Medley Amiga music format native parser
 *
 * Medley (also known as "PV Synth") is an Amiga music format by Paul van der Valk.
 * The UADE replay was adapted by mld (Andreas da Silva / Andi Silva).
 * Files are named with "MSO." prefix.
 *
 * Detection (from UADE amifilemagic.c line 83 and Medley.s DTP_Check2 routine):
 *   1. Bytes 0..3 must equal the ASCII string "MSOB" (4 bytes)
 *   2. The 68k player additionally follows a relative pointer at offset 4:
 *      addq.l #4,a0      ; a0 now points to buf+4
 *      add.l  (a0),a0    ; a0 = (buf+4) + u32BE(buf,4)  → targetOffset = 4 + relPtr
 *      move.w -2(a0),d0  ; subsong count word at (targetOffset - 2)
 *
 * From amifilemagic.c (line 83):
 *   "MSOB", "MSO",   / * Medley * /
 *
 * The "MSOB" magic is unique and sufficient for reliable detection.
 *
 * File prefix: "MSO."
 *
 * Single-file format: music data binary.
 * Actual audio playback is delegated to UADE.
 *
 * References:
 *   third-party/uade-3.05/src/frontends/common/amifilemagic.c (line 83)
 *   third-party/uade-3.05/amigasrc/players/medley/Medley.s (lines 39-52)
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { InstrumentConfig } from '@/types';
import type { UADEVariablePatternLayout } from '@/engine/uade/UADEPatternEncoder';
import { medleyEncoder } from '@/engine/uade/encoders/MedleyEncoder';
import { buildMedleyGrid, medleyInstrumentList, MEDLEY_ROWS_PER_PATTERN, MEDLEY_FIRST_TUNE, medleySubsongCount, medleyTables, medleyInstrumentType } from './medleyGrid';
import { chooseFileSubsong, fileSubsongFormatByKey, fileSubsongsField, type FileSubsongs } from '../fileSubsongs';

// ── Binary helpers ─────────────────────────────────────────────────────────

function u32BE(buf: Uint8Array, off: number): number {
  return (
    ((buf[off] << 24) | (buf[off + 1] << 16) | (buf[off + 2] << 8) | buf[off + 3]) >>> 0
  );
}

function u16BE(buf: Uint8Array, off: number): number {
  return ((buf[off] << 8) | buf[off + 1]) >>> 0;
}

// ── Format detection ───────────────────────────────────────────────────────

/**
 * Return true if the buffer is a Medley module.
 *
 * Detection mirrors the DTP_Check2 routine from Medley.s and the
 * offset_0000_patterns entry from UADE amifilemagic.c:
 *   "MSOB" matched at byte offset 0
 *
 * The "MSOB" four-byte magic is the primary check. UADE's amifilemagic.c
 * uses only the four-byte magic; the assembly routine additionally follows
 * a relative pointer to read the subsong count, but format identification
 * requires only the magic match.
 */
export function isMedleyFormat(buffer: ArrayBuffer | Uint8Array): boolean {
  const buf = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (buf.length < 8) return false;

  // bytes[0..3] == "MSOB" (0x4D 0x53 0x4F 0x42)
  return (
    buf[0] === 0x4d &&
    buf[1] === 0x53 &&
    buf[2] === 0x4f &&
    buf[3] === 0x42
  );
}

// ── Main parser ────────────────────────────────────────────────────────────

/**
 * Parse a Medley module file into a TrackerSong.
 *
 * Medley uses a proprietary binary format with an "MSOB" header followed by
 * a relative pointer (at offset 4) that the player resolves to locate the
 * subsong table.  The assembly performs:
 *   addq.l #4,a0      (advance past magic to offset 4)
 *   add.l  (a0),a0    (a0 = 4 + u32BE(buf,4) = targetOffset)
 *   move.w -2(a0),d0  (subsong count at targetOffset - 2)
 *
 * This parser extracts the subsong count where possible and creates a
 * metadata-only TrackerSong.  Actual audio playback is always delegated
 * to UADE.
 *
 * @param buffer   Raw file bytes (ArrayBuffer)
 * @param filename Original filename (used to derive the module name)
 * @param subsong  Tune to draw (0-based registry index = song table entry - 1); absent, the first that sounds
 */
export async function parseMedleyFile(buffer: ArrayBuffer, filename: string, subsong?: number): Promise<TrackerSong> {
  const buf = new Uint8Array(buffer);

  if (!isMedleyFormat(buf)) {
    throw new Error('Not a Medley module');
  }

  // ── Module name from filename ─────────────────────────────────────────────

  const baseName = filename.split('/').pop() ?? filename;
  // Strip "MSO." prefix (case-insensitive) or ".ml" extension
  const moduleName =
    baseName.replace(/^mso\./i, '').replace(/\.ml$/i, '') || baseName;

  // ── Subsong count extraction ──────────────────────────────────────────────

  const subsongCount = Math.max(medleySubsongCount(buf), 1);

  // ── Scan for sample/instrument data ────────────────────────────────────────
  //
  // Medley (PV Synth) modules store instrument data after the header.
  // Scan for plausible instrument entries in the data region.

  let sampleCount = 1;
  try {
    // The target offset from the relPtr points to the subsong table area.
    // Instrument data is typically between the header and that offset.
    const relPtr = u32BE(buf, 4);
    const dataRegion = 4 + relPtr;
    const scanStart = 8;
    const scanEnd = Math.min(dataRegion, buf.length - 4, 4096);

    // Look for a block of u16 values that could be sample lengths (word-aligned, reasonable sizes)
    for (let off = scanStart; off < scanEnd; off += 2) {
      const val = u16BE(buf, off);
      // Potential sample count stored as u16
      if (val >= 2 && val <= 32) {
        // Check if the next N u16 values look like sample lengths or periods
        let valid = true;
        for (let i = 1; i <= Math.min(val, 8); i++) {
          if (off + i * 2 + 2 > buf.length) { valid = false; break; }
          const next = u16BE(buf, off + i * 2);
          if (next === 0) { valid = false; break; }
        }
        if (valid) {
          sampleCount = val;
          break;
        }
      }
    }
  } catch {
    // Fall back to default
  }

  // ── Song positions (one per subsong) ──────────────────────────────────────

  const songPositions = Array.from({ length: Math.max(subsongCount, 1) }, (_, i) => i % 1);

  // ── Empty pattern (placeholder — UADE handles actual audio) ──────────────

  const emptyRows = Array.from({ length: 64 }, () => ({
    note: 0,
    instrument: 0,
    volume: 0,
    effTyp: 0,
    eff: 0,
    effTyp2: 0,
    eff2: 0,
  }));

  const tunes: FileSubsongs = {
    ...(await chooseFileSubsong(fileSubsongFormatByKey('medley')!, buffer, filename, subsong)
      .catch((): FileSubsongs => ({ count: 1, current: 0, fileName: filename }))),
    engineFirst: MEDLEY_FIRST_TUNE,
  };
  const grid = buildMedleyGrid(buf, filename, tunes.current + MEDLEY_FIRST_TUNE);

  const pattern = {
    id: 'pattern-0',
    name: 'Pattern 0',
    length: 64,
    channels: Array.from({ length: 4 }, (_, ch) => ({
      id: `channel-${ch}`,
      name: `Channel ${ch + 1}`,
      muted: false,
      solo: false,
      collapsed: false,
      volume: 100,
      pan: (ch === 0 || ch === 3) ? -50 : 50,
      instrumentId: null,
      color: null,
      rows: emptyRows,
    })),
    importMetadata: {
      sourceFormat: 'MOD' as const,
      sourceFile: filename,
      importedAt: new Date().toISOString(),
      originalChannelCount: 4,
      originalPatternCount: 1,
      originalInstrumentCount: sampleCount,
      subsongCount,
    },
  };

  // One entry per filled instrument-table slot; id = the table index the stream's Instrument command and the grid cells use.
  // MedleySynth: the key plays the instrument on nuade's medley player itself (nuade-wasm patch 0002).
  const tables = medleyTables(buf);
  const instruments: InstrumentConfig[] = medleyInstrumentList(buf).map(({ number, name }) => ({
    id: number,
    name,
    type: 'synth' as const,
    synthType: 'MedleySynth' as const,
    metadata: { medleyInstrument: number, medleyInstrumentType: tables ? medleyInstrumentType(buf, tables, number) : null },
    effects: [],
    volume: 0,
    pan: 0,
  } as InstrumentConfig));
  if (instruments.length === 0) {
    for (let i = 0; i < sampleCount; i++) {
      instruments.push({ id: i + 1, name: '', type: 'synth' as const, synthType: 'Synth' as const, effects: [], volume: 0, pan: 0 } as InstrumentConfig);
    }
  }

  return {
    name: `${moduleName} [Medley]${subsongCount > 1 ? ` (${subsongCount} subsongs)` : ''}`,
    format: 'MOD' as TrackerFormat,
    patterns: grid ? grid.patterns : [pattern],
    instruments,
    songPositions,
    songLength: songPositions.length,
    restartPosition: 0,
    numChannels: 4,
    initialSpeed: 1,
    initialBPM: 125,
    linearPeriods: false,
    uadeEditableFileData: buffer.slice(0) as ArrayBuffer,
    uadeEditableFileName: filename,
    ...fileSubsongsField(tunes),
    ...(grid ? {
      uadePlayerTickGrid: true,
      uadeVariableLayout: {
        formatId: 'medley',
        numChannels: grid.voices,
        numFilePatterns: grid.blockRows.length,
        rowsPerPattern: MEDLEY_ROWS_PER_PATTERN,
        moduleSize: buffer.byteLength,
        encoder: medleyEncoder,
        filePatternAddrs: grid.filePatternAddrs,
        filePatternSizes: grid.filePatternSizes,
        trackMap: grid.trackMap,
        blockRows: grid.blockRows,
        propagateSharedCells: true,
        noteBytes: grid.placements.map(pl => ({
          pattern: Math.floor(pl.tick / MEDLEY_ROWS_PER_PATTERN), channel: pl.voice,
          row: pl.tick % MEDLEY_ROWS_PER_PATTERN, offset: pl.offset, note: pl.note, base: pl.delta,
        })),
      } as UADEVariablePatternLayout,
    } : {}),
  };
}
