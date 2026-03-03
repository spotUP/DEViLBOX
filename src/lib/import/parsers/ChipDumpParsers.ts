/**
 * ChipDumpParsers — Chip-dump format dispatchers (VGM, YM, NSF, SAP, AY)
 *
 * These are native-only formats with no UADE fallback — they each have
 * dedicated parsers that handle the chip register dump playback.
 */

import type { TrackerSong } from '@/engine/TrackerReplayer';

/**
 * Try to parse a chip-dump format. Returns TrackerSong or null if not matched.
 */
export async function tryChipDumpParse(
  buffer: ArrayBuffer,
  filename: string,
  originalFileName: string,
): Promise<TrackerSong | null> {

  // ── VGM/VGZ — Video Game Music chip-dump ─────────────────────────────────
  if (/\.(vgm|vgz)$/.test(filename)) {
    const { parseVGMFile } = await import('@lib/import/formats/VGMParser');
    return parseVGMFile(buffer, originalFileName);
  }

  // ── YM — Atari ST AY/YM2149 register dumps ────────────────────────────────
  if (/\.ym$/.test(filename)) {
    const { parseYMFile } = await import('@lib/import/formats/YMParser');
    return parseYMFile(buffer, originalFileName);
  }

  // ── NSF/NSFE — NES Sound Format ───────────────────────────────────────────
  if (/\.nsfe?$/.test(filename)) {
    const { parseNSFFile } = await import('@lib/import/formats/NSFParser');
    return parseNSFFile(buffer, originalFileName);
  }

  // ── SAP — Atari 8-bit POKEY ───────────────────────────────────────────────
  if (/\.sap$/.test(filename)) {
    const { parseSAPFile } = await import('@lib/import/formats/SAPParser');
    return parseSAPFile(buffer, originalFileName);
  }

  // ── AY — ZX Spectrum AY (ZXAYEMUL) ───────────────────────────────────────
  if (/\.ay$/.test(filename)) {
    const { parseAYFile } = await import('@lib/import/formats/AYParser');
    return parseAYFile(buffer, originalFileName);
  }

  return null;
}
