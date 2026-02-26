/**
 * InfogramesParser.ts — Infogrames (RobHubbard2) Amiga music format native parser
 *
 * The Infogrames music format (also called "RobHubbard2") was used in Amiga games
 * published by Infogrames, including Gobliins, Ween, and Horror Zombies.
 * The format requires an external sample file (e.g. "Gobliins.dum.set").
 *
 * Detection (from UADE Infogrames.asm, CheckFormat routine):
 *   1. u16BE(0) != 0, even (bit 0 == 0)
 *   2. fileSize > u16BE(0)  (the word at 0 is an offset that must be within file)
 *   3. Let off = u16BE(0). At that offset: let rel = u16BE(off + 2).
 *   4. buf[off + rel] == 0  (null terminator at offset+2-relative)
 *   5. buf[off + rel + 1] == 15 (0x0F) — version or tag byte
 *
 * File extension: .dum
 *
 * Two-file format: song data (.dum) + external sample data (.dum.set).
 * Actual audio playback is delegated to UADE.
 *
 * Reference: Reference Code/uade-3.05/amigasrc/players/infogrames/Infogrames.asm
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { InstrumentConfig } from '@/types';

// ── Binary helpers ─────────────────────────────────────────────────────────

function u16BE(buf: Uint8Array, off: number): number {
  return ((buf[off] << 8) | buf[off + 1]) >>> 0;
}

// ── Format detection ───────────────────────────────────────────────────────

/**
 * Return true if the buffer is an Infogrames DUM module.
 *
 * Detection mirrors the CheckFormat routine from Infogrames.asm.
 */
export function isInfogramesFormat(buffer: ArrayBuffer | Uint8Array): boolean {
  const buf = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (buf.length < 4) return false;

  // u16BE(0): non-zero, even (bit 0 clear)
  const headerOff = u16BE(buf, 0);
  if (headerOff === 0) return false;
  if (headerOff & 0x0001) return false; // must be even

  // fileSize must be strictly greater than headerOff
  if (buf.length <= headerOff) return false;

  // Need at least 4 bytes at headerOff for the relative offset read
  if (headerOff + 3 >= buf.length) return false;

  // rel = u16BE(headerOff + 2)
  const rel = u16BE(buf, headerOff + 2);

  // buf[headerOff + rel] must be 0 (null terminator)
  const nullPos = headerOff + rel;
  if (nullPos + 1 >= buf.length) return false;
  if (buf[nullPos] !== 0) return false;

  // buf[headerOff + rel + 1] must be 15 (0x0F) — version tag
  if (buf[nullPos + 1] !== 0x0f) return false;

  return true;
}

// ── Main parser ─────────────────────────────────────────────────────────────

/**
 * Parse an Infogrames DUM module file into a TrackerSong.
 *
 * Infogrames modules require an external sample file at runtime.
 * This parser creates a metadata-only TrackerSong.
 * Actual audio playback is always delegated to UADE.
 *
 * @param buffer   Raw file bytes (ArrayBuffer)
 * @param filename Original filename (used to derive the module name)
 */
export function parseInfogramesFile(buffer: ArrayBuffer, filename: string): TrackerSong {
  const buf = new Uint8Array(buffer);

  if (!isInfogramesFormat(buf)) {
    throw new Error('Not an Infogrames module');
  }

  // ── Module name from filename ─────────────────────────────────────────────

  const baseName = filename.split('/').pop() ?? filename;
  // Strip ".dum" extension
  const moduleName = baseName.replace(/\.dum$/i, '') || baseName;

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
    name: `${moduleName} [Infogrames]`,
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
