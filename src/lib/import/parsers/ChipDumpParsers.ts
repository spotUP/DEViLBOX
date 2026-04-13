/**
 * ChipDumpParsers — Chip-dump format dispatchers
 *
 * These are native-only formats with no UADE fallback — they each have
 * dedicated parsers that handle the chip register dump playback.
 *
 * Supported: VGM, YM, NSF, SAP, AY, KSS, HES, GBS, SPC, MDX, PMD, S98, SNDH, QSF
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

  // ── SAP — Atari 8-bit POKEY (via ASAP WASM engine) ────────────────────────
  if (/\.sap$/.test(filename)) {
    const { parseSAPFile } = await import('@lib/import/formats/SAPParser');
    return parseSAPFile(buffer, originalFileName);
  }

  // ── ASAP non-SAP formats — CMC, RMT, TMC, DLT, MPT etc. ────────────────
  if (/\.(cmc|cm3|cmr|cms|dmc|dlt|mpt|mpd|rmt|tmc|tm8|tm2|fc)$/.test(filename)) {
    const { parseAsapFile } = await import('@lib/import/formats/AsapParser');
    return parseAsapFile(buffer, originalFileName);
  }

  // ── AY — ZX Spectrum AY (ZXAYEMUL) ───────────────────────────────────────
  if (/\.ay$/.test(filename)) {
    const { parseAYFile } = await import('@lib/import/formats/AYParser');
    return parseAYFile(buffer, originalFileName);
  }

  // ── KSS — MSX music (AY/SCC/FM) ──────────────────────────────────────────
  if (/\.kss$/.test(filename)) {
    const { parseKSSFile } = await import('@lib/import/formats/KSSParser');
    return parseKSSFile(buffer, originalFileName);
  }

  // ── HES — PC Engine / TurboGrafx-16 ──────────────────────────────────────
  if (/\.hes$/.test(filename)) {
    const { parseHESFile } = await import('@lib/import/formats/HESParser');
    return parseHESFile(buffer, originalFileName);
  }

  // ── GBS — Game Boy Sound System ──────────────────────────────────────────
  if (/\.gbs$/.test(filename)) {
    const { parseGBSFile } = await import('@lib/import/formats/GBSParser');
    return parseGBSFile(buffer);
  }

  // ── SPC — Super Nintendo SPC700 ──────────────────────────────────────────
  if (/\.spc$/.test(filename)) {
    const { parseSPCFile } = await import('@lib/import/formats/SPCParser');
    return parseSPCFile(buffer);
  }

  // ── MDX — Sharp X68000 (YM2151 + ADPCM) ─────────────────────────────────
  if (/\.mdx$/.test(filename)) {
    const { parseMDXFile } = await import('@lib/import/formats/MDXParser');
    return parseMDXFile(buffer);
  }

  // ── PMD — PC-98 Professional Music Driver (YM2608) ───────────────────────
  if (/\.(m|m2|mz|pmd)$/.test(filename)) {
    const { parsePMDFile } = await import('@lib/import/formats/PMDParser');
    return parsePMDFile(buffer);
  }

  // ── FMP (PLAY6) — PC-98 FMP music driver (YM2608 OPNA) ─────────────────
  if (/\.(opi|ovi|ozi)$/.test(filename)) {
    const { parseFmplayerFile } = await import('@lib/import/formats/FmplayerParser');
    return parseFmplayerFile(buffer, filename);
  }

  // ── S98 — Japanese computer FM register dumps ────────────────────────────
  if (/\.s98$/.test(filename)) {
    const { parseS98File } = await import('@lib/import/formats/S98Parser');
    return parseS98File(buffer);
  }

  // ── SNDH — Atari ST (routed here as fallback; SC68 container handled in AmigaFormatParsers)
  if (/\.sndh$/.test(filename)) {
    const { parseSNDHFile } = await import('@lib/import/formats/SNDHParser');
    return parseSNDHFile(buffer);
  }

  // ── QSF — Capcom QSound (CPS1/CPS2 arcade) ───────────────────────────────
  if (/\.(qsf|miniqsf)$/.test(filename)) {
    const { isQsfFormat, parseQsfFile } = await import('@lib/import/formats/QsfParser');
    if (isQsfFormat(filename, buffer)) {
      return parseQsfFile(buffer, filename);
    }
  }

  return null;
}
