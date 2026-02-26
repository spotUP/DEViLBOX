/**
 * SteveTurnerParser.ts — Steve Turner Amiga music format native parser
 *
 * Steve Turner composed music for many classic Amiga games using a custom
 * proprietary format. The files are compiled 68k executables with
 * a distinctive instruction pattern at fixed offsets.
 *
 * Detection (from UADE Steve Turner_v4.asm, DTP_Check2 routine):
 *   1. u16BE(0x00) == 0x2B7C   (MOVE.L #...,D(An) — channel 0 init)
 *   2. u16BE(0x08) == 0x2B7C   (channel 1 init)
 *   3. u16BE(0x10) == 0x2B7C   (channel 2 init)
 *   4. u16BE(0x18) == 0x2B7C   (channel 3 init)
 *   5. u32BE(0x20) == 0x303C00FF  (MOVE.W #$00FF,D0 — voice count)
 *   6. u32BE(0x24) == 0x32004EB9  (MOVE.W D0,D1; JSR abs.l — combined instructions)
 *   7. u16BE(0x2C) == 0x4E75   (RTS — end of setup routine)
 *
 * File extension: .jpo, .jpold  (prefix "JPO.")
 *
 * Single-file format: compiled 68k executable.
 * Actual audio playback is delegated to UADE.
 *
 * Reference: Reference Code/uade-3.05/amigasrc/players/wanted_team/SteveTurner/src/Steve Turner_v4.asm
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { InstrumentConfig } from '@/types';

// ── Constants ─────────────────────────────────────────────────────────────

/** Minimum file size to contain all detection offsets (0x2E = 46 bytes). */
const MIN_FILE_SIZE = 0x2e;

// ── Binary helpers ─────────────────────────────────────────────────────────

function u16BE(buf: Uint8Array, off: number): number {
  return ((buf[off] << 8) | buf[off + 1]) >>> 0;
}

function u32BE(buf: Uint8Array, off: number): number {
  return (
    ((buf[off] << 24) | (buf[off + 1] << 16) | (buf[off + 2] << 8) | buf[off + 3]) >>> 0
  );
}

// ── Format detection ───────────────────────────────────────────────────────

/**
 * Return true if the buffer is a Steve Turner format module.
 *
 * Detection mirrors DTP_Check2 from Steve Turner_v4.asm.
 * The format is identified by a series of 68k instruction patterns
 * at fixed byte offsets in the compiled executable.
 */
export function isSteveTurnerFormat(buffer: ArrayBuffer | Uint8Array): boolean {
  const buf = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (buf.length < MIN_FILE_SIZE) return false;

  // Four MOVE.L #...,D(An) instructions (0x2B7C) at offsets 0, 8, 16, 24
  if (u16BE(buf, 0x00) !== 0x2b7c) return false;
  if (u16BE(buf, 0x08) !== 0x2b7c) return false;
  if (u16BE(buf, 0x10) !== 0x2b7c) return false;
  if (u16BE(buf, 0x18) !== 0x2b7c) return false;

  // MOVE.W #$00FF,D0 at offset 0x20
  if (u32BE(buf, 0x20) !== 0x303c00ff) return false;

  // MOVE.W D0,D1; JSR abs.l at offsets 0x24-0x27
  if (u32BE(buf, 0x24) !== 0x32004eb9) return false;

  // RTS at offset 0x2C
  if (u16BE(buf, 0x2c) !== 0x4e75) return false;

  return true;
}

// ── Main parser ─────────────────────────────────────────────────────────────

/**
 * Parse a Steve Turner module file into a TrackerSong.
 *
 * The format is a compiled 68k executable; only minimal metadata can be
 * extracted. Actual audio playback is always delegated to UADE.
 *
 * @param buffer   Raw file bytes (ArrayBuffer)
 * @param filename Original filename (used to derive the module name)
 */
export function parseSteveTurnerFile(buffer: ArrayBuffer, filename: string): TrackerSong {
  const buf = new Uint8Array(buffer);

  if (!isSteveTurnerFormat(buf)) {
    throw new Error('Not a Steve Turner module');
  }

  // ── Module name from filename ─────────────────────────────────────────────

  const baseName = filename.split('/').pop() ?? filename;
  // Strip "JPO." prefix (case-insensitive) or .jpo/.jpold extension
  const moduleName =
    baseName.replace(/^jpo\./i, '').replace(/\.jpold?$/i, '') || baseName;

  // ── Instrument placeholder ────────────────────────────────────────────────

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
      pan: ch === 0 || ch === 3 ? -50 : 50,
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
      originalInstrumentCount: 0,
    },
  };

  return {
    name: `${moduleName} [Steve Turner]`,
    format: 'MOD' as TrackerFormat,
    patterns: [pattern],
    instruments,
    songPositions: [0],
    songLength: 1,
    restartPosition: 0,
    numChannels: 4,
    initialSpeed: 6,
    initialBPM: 125,
    linearPeriods: false,
  };
}
