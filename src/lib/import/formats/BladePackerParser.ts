/**
 * BladePackerParser.ts — Blade Packer Amiga music format native parser
 *
 * Blade Packer is an Amiga music format by Tord 'Blade' Jansson (1991-96),
 * supporting 8 voices. Files are typically prefixed with "UDS." by UADE.
 *
 * Detection (from DTP_Check2 in Blade Packer_v2.asm, line 442):
 *   u32BE(buf, 0) == 0x538F4E47  (bytes: 0x53, 0x8F, 0x4E, 0x47)
 *   buf[4] == 0x2E               (ASCII '.')
 *   Minimum file size: 5 bytes
 *
 * Single-file format: player code + music data in one binary.
 * Actual audio playback is delegated to UADE.
 *
 * Reference: Reference Code/uade-3.05/amigasrc/players/wanted_team/BladePacker/src/Blade Packer_v2.asm
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { InstrumentConfig } from '@/types';

// ── Constants ─────────────────────────────────────────────────────────────

/** Minimum file size to hold the Blade Packer magic bytes. */
const MIN_FILE_SIZE = 5;

/** Number of voices (channels) Blade Packer supports. */
const NUM_CHANNELS = 8;

// ── Binary helpers ─────────────────────────────────────────────────────────

function u32BE(buf: Uint8Array, off: number): number {
  return (
    ((buf[off] << 24) | (buf[off + 1] << 16) | (buf[off + 2] << 8) | buf[off + 3]) >>> 0
  );
}

// ── Format detection ───────────────────────────────────────────────────────

/**
 * Return true if the buffer is a Blade Packer module.
 *
 * Detection mirrors DTP_Check2 from Blade Packer_v2.asm:
 *   cmp.l #$538F4E47,(A0)+  → bytes[0..3] == 0x538F4E47
 *   cmp.b #$2E,(A0)         → byte[4] == 0x2E ('.')
 */
export function isBladePackerFormat(buffer: ArrayBuffer | Uint8Array): boolean {
  const buf = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (buf.length < MIN_FILE_SIZE) return false;
  return u32BE(buf, 0) === 0x538f4e47 && buf[4] === 0x2e;
}

// ── Main parser ─────────────────────────────────────────────────────────────

/**
 * Parse a Blade Packer module file into a TrackerSong.
 *
 * Returns a placeholder song with 8 channels reflecting the format's voice
 * count. Actual audio playback is always delegated to UADE.
 *
 * @param buffer   Raw file bytes (ArrayBuffer)
 * @param filename Original filename (used to derive the module name)
 */
export function parseBladePackerFile(buffer: ArrayBuffer, filename: string): TrackerSong {
  const buf = new Uint8Array(buffer);

  if (!isBladePackerFormat(buf)) {
    throw new Error('Not a Blade Packer module');
  }

  // ── Module name from filename ─────────────────────────────────────────────

  const baseName = filename.split('/').pop() ?? filename;
  // Strip "UDS." prefix (case-insensitive) or ".uds" extension
  const moduleName =
    baseName.replace(/^uds\./i, '').replace(/\.uds$/i, '') || baseName;

  // ── Instrument placeholders ──────────────────────────────────────────────

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
  //
  // 8-channel stereo panning layout matching Amiga Paula hardware convention:
  //   ch 0,1,6,7 → hard left  (-50)
  //   ch 2,3,4,5 → hard right (+50)

  const emptyRows = Array.from({ length: 64 }, () => ({
    note: 0,
    instrument: 0,
    volume: 0,
    effTyp: 0,
    eff: 0,
    effTyp2: 0,
    eff2: 0,
  }));

  const channelPan = (ch: number): number => {
    // Channels 0,1,6,7 → -50 (left); channels 2,3,4,5 → +50 (right)
    return ch === 0 || ch === 1 || ch === 6 || ch === 7 ? -50 : 50;
  };

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
      pan: channelPan(ch),
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

  return {
    name: `${moduleName} [Blade Packer]`,
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
  };
}
