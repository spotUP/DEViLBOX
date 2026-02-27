/**
 * DaveLoweParser.ts — Dave Lowe Amiga music format (.dl / DL.*) native parser
 *
 * Dave Lowe (Uncle Tom) is an Amiga composer who wrote music for many famous games
 * including Lure of the Temptress, Worlds of Legend, and Flight of the Amazon Queen.
 * The module file is a compiled 68k executable where the player code and music data
 * are combined into a single self-contained file.
 *
 * Detection (from UADE DaveLoweRipp1 in EagleRipper):
 *   bytes[0..3]  = 0x21590032  (MOVE.L A1,($32,A0))
 *   bytes[4..7]  = 0x21590036  (MOVE.L A1,($36,A0))
 *   bytes[8..11] = 0x2159003A  (MOVE.L A1,($3A,A0))
 * These are specific 68k MOVE.L instructions that appear at the start of all
 * Dave Lowe modules. They are unique enough to serve as reliable magic bytes.
 *
 * Single-file format: all data (player + music + samples) in one file.
 * This parser extracts basic metadata; UADE handles actual audio playback.
 *
 * Reference: Reference Code/uade-3.05/amigasrc/players/wanted_team/DaveLowe/src/Dave Lowe.s
 * Reference: Reference Code/uade-3.05/amigasrc/players/wanted_team/DaveLowe/src/Dave Lowe_v3.asm
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { InstrumentConfig } from '@/types';

// ── Binary helpers ─────────────────────────────────────────────────────────

function u32BE(buf: Uint8Array, off: number): number {
  return (
    ((buf[off] << 24) | (buf[off + 1] << 16) | (buf[off + 2] << 8) | buf[off + 3]) >>> 0
  );
}

// ── Format detection ───────────────────────────────────────────────────────

/**
 * Return true if the buffer is a Dave Lowe format module.
 *
 * Detection mirrors the UADE Dave Lowe_v3.asm DTP_Check2 routine:
 *   cmp.l  #$000003F3,(A0)      ; Delitracker custom player magic at offset 0
 *   cmp.l  #$70FF4E75,32(A0)   ; moveq #-1,d0 + rts sequence at offset 32
 *   cmp.l  #'UNCL',36(A0)      ; bytes 36-39 = 'UNCL'
 *   cmp.l  #'EART',40(A0)      ; bytes 40-43 = 'EART'  (together: "UNCLEARТ" = "UNCLEARТ")
 *
 * All Dave Lowe modules identified by UADE share this binary signature.
 */
export function isDaveLoweFormat(buf: Uint8Array): boolean {
  if (buf.length < 44) return false;

  // Delitracker custom player magic at offset 0
  if (u32BE(buf, 0) !== 0x000003F3) return false;

  // moveq #-1,d0 (0x70FF) + rts (0x4E75) at offset 32
  if (u32BE(buf, 32) !== 0x70FF4E75) return false;

  // 'UNCL' at bytes 36-39
  if (
    buf[36] !== 0x55 || buf[37] !== 0x4E || buf[38] !== 0x43 || buf[39] !== 0x4C
  ) return false;

  // 'EART' at bytes 40-43
  if (
    buf[40] !== 0x45 || buf[41] !== 0x41 || buf[42] !== 0x52 || buf[43] !== 0x54
  ) return false;

  return true;
}

// ── Main parser ────────────────────────────────────────────────────────────

/**
 * Parse a Dave Lowe module file into a TrackerSong.
 *
 * The format is a compiled 68k executable containing both player code and
 * music data; there is no well-documented public specification of the internal
 * layout beyond what EagleRipper uses for detection. This parser therefore
 * creates a metadata-only TrackerSong with placeholder instruments.
 * Actual audio playback is always delegated to UADE.
 *
 * @param buffer   Raw file bytes (ArrayBuffer)
 * @param filename Original filename (used to derive the module name)
 */
export async function parseDaveLoweFile(
  buffer: ArrayBuffer,
  filename: string,
): Promise<TrackerSong> {
  const buf = new Uint8Array(buffer);

  if (!isDaveLoweFormat(buf)) {
    throw new Error('Not a Dave Lowe module');
  }

  // ── Module name from filename ─────────────────────────────────────────────

  const baseName = filename.split('/').pop() ?? filename;
  // Strip "DL." prefix (case-insensitive) or ".dl" / ".dl_deli" suffix
  const moduleName =
    baseName.replace(/^dl\./i, '').replace(/\.(dl|dl_deli)$/i, '') || baseName;

  // ── Instrument placeholders ──────────────────────────────────────────────

  // Dave Lowe modules typically contain 4–8 samples. Since the internal
  // sample table layout is not publicly documented, create 8 placeholders.
  const NUM_PLACEHOLDER_INSTRUMENTS = 8;
  const instruments: InstrumentConfig[] = [];

  for (let i = 0; i < NUM_PLACEHOLDER_INSTRUMENTS; i++) {
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
      originalInstrumentCount: NUM_PLACEHOLDER_INSTRUMENTS,
    },
  };

  return {
    name: `${moduleName} [Dave Lowe]`,
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
