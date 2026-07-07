/**
 * TomyTrackerEncoder.ts — Tomy Tracker cell codec (chip-RAM / file layout).
 *
 * Tomy Tracker patterns are 1024-byte blocks (64 rows x 4 channels x 4 bytes/cell) starting
 * at file offset 704. Each 4-byte cell (from CONVERTNOTE in Tomy Tracker_v2.asm):
 *   byte0 = command << 2   (effect type; low 2 bits unused — verified 0 on real modules)
 *   byte1 = command arg    (effect value)
 *   byte2 = sample * 7      (instrument; ASM does `divu #7` to recover the sample)
 *   byte3 = note index      (0 = no note; else index into the Periods table)
 *
 * The codec is lossless for modules where byte0&3==0 and byte2%7==0 (all real fixtures);
 * the round-trip test asserts byte-identity over the full pattern region.
 *
 * Reference: third-party/uade-3.05/amigasrc/players/wanted_team/TomyTracker/src/Tomy Tracker_v2.asm
 */
import type { TrackerCell } from '@/types';

export const TOMY_BYTES_PER_CELL = 4;

/** Decode one 4-byte Tomy cell into a TrackerCell. */
export function decodeTomyCell(bytes: Uint8Array): TrackerCell {
  const b0 = bytes[0] ?? 0;
  const b1 = bytes[1] ?? 0;
  const b2 = bytes[2] ?? 0;
  const b3 = bytes[3] ?? 0;
  return {
    note: b3,                    // Tomy note index (0 = empty)
    instrument: Math.floor(b2 / 7),
    volume: 0,
    effTyp: b0 >> 2,
    eff: b1,
    effTyp2: 0,
    eff2: 0,
  };
}

/** Encode a TrackerCell back into 4 Tomy bytes (inverse of decodeTomyCell). */
export function encodeTomyCell(cell: TrackerCell): Uint8Array {
  const out = new Uint8Array(TOMY_BYTES_PER_CELL);
  out[0] = ((cell.effTyp ?? 0) << 2) & 0xff;
  out[1] = (cell.eff ?? 0) & 0xff;
  out[2] = ((cell.instrument ?? 0) * 7) & 0xff;
  out[3] = (cell.note ?? 0) & 0xff;
  return out;
}
