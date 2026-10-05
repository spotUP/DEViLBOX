/**
 * ChipDumpParsers — Chip-dump format dispatchers
 *
 * These are native-only formats with no UADE fallback — they each have
 * dedicated parsers that handle the chip register dump playback.
 *
 * Supported: VGM, YM, NSF, SAP, AY, KSS, HES, GBS, SPC, GYM, MDX, PiyoPiyo, TFM, PMD, S98, QSF
 *
 * Console game music (NSF/NSFE, GBS, HES, KSS, SPC, GYM, and VGM for the
 * chips game-music-emu emulates) plays on GmeEngine: GameMusicParser reads
 * the header and the song opens in the scope view.
 */

import type { TrackerSong } from '@/engine/TrackerReplayer';

/**
 * Try to parse a chip-dump format. Returns TrackerSong or null if not matched.
 */
export async function tryChipDumpParse(
  buffer: ArrayBuffer,
  filename: string,
  originalFileName: string,
  subsong = 0,
): Promise<TrackerSong | null> {

  // ── VGM/VGZ — Video Game Music register logs ─────────────────────────────
  // parseModuleToSong has already inflated a VGZ. SN76489 / YM2413 / YM2612
  // logs (Master System, Game Gear, Mega Drive) play on game-music-emu; logs
  // for other chips (YM2151, OPL, ...) keep VGMParser's Furnace rebuild.
  if (/\.(vgm|vgz)$/.test(filename)) {
    const { isGmeVgm, parseGameMusicFile } = await import('@lib/import/formats/GameMusicParser');
    if (isGmeVgm(buffer)) return parseGameMusicFile(buffer, originalFileName, subsong);
    const { parseVGMFile } = await import('@lib/import/formats/VGMParser');
    return parseVGMFile(buffer, originalFileName);
  }

  // ── Console game music on game-music-emu: NSF/NSFE, GBS, HES, KSS, SPC, GYM ──
  if (/\.(nsfe?|gbs|hes|kss|spc|gym)$/.test(filename)) {
    const { gameMusicType, parseGameMusicFile } = await import('@lib/import/formats/GameMusicParser');
    if (gameMusicType(buffer, filename)) return parseGameMusicFile(buffer, originalFileName, subsong);
  }

  // ── YM — Atari ST AY/YM2149 register dumps (YM2-YM6, LHA-packed or raw) ──
  // Played by the ZXTune engine's YM player (zxtune-wasm, ayumi YM2149).
  if (/\.ym$/.test(filename)) {
    const { parseZxtuneFile } = await import('@lib/import/formats/ZxtuneParser');
    return parseZxtuneFile(originalFileName, buffer);
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

  // ── AY — ZX Spectrum AY (ZXAY EMUL) ───────────────────────────────────────
  // `.emul` too: the corpus names these files after the ZXAY SUBTYPE instead
  // of the container, and `ay-emul/spring.emul` begins with the bytes
  // `ZXAYEMUL`. Playback is aylet in wasm (AyletEngine); the parser draws the
  // grid and carries the file as `ayFileData`.
  //
  // NOTE: this extension test duplicates the one in FORMAT_REGISTRY, which is
  // why registering `.emul` there was not enough on its own. Every branch in
  // this file re-decides what the registry already knows; deriving them from
  // the registry is the fix, and it is bigger than this change.
  if (/\.(ay|emul)$/.test(filename)) {
    const { parseAYFile } = await import('@lib/import/formats/AYParser');
    return parseAYFile(buffer, originalFileName);
  }

  // ── AY STRC / AMAD — same container, host-side replayer payload ─────────
  // No available player implements these replayers; the parser throws the
  // reason (thoughts/shared/research/2026-10-04_ay-strc-amad.md).
  if (/\.(strc|amad)$/.test(filename)) {
    const { parseAYStructuredFile } = await import('@lib/import/formats/AYParser');
    return parseAYStructuredFile(buffer, originalFileName);
  }

  // ── MDX — Sharp X68000 (YM2151 + ADPCM) ─────────────────────────────────
  if (/\.mdx$/.test(filename)) {
    const { parseMDXFile } = await import('@lib/import/formats/MDXParser');
    return parseMDXFile(buffer);
  }

  // ── PiyoPiyo — Studio Pixel .pmd ('PMD' magic), before PC-98 PMD claims the extension ──
  if (/\.pmd$/.test(filename)) {
    const { isPiyoPiyoFormat, parsePiyoPiyoFile } = await import('@lib/import/formats/PiyoPiyoParser');
    if (isPiyoPiyoFormat(new Uint8Array(buffer))) return parsePiyoPiyoFile(buffer, originalFileName);
  }

  // ── TFM Music Maker — ZX Spectrum TurboFM .tfe (2x YM2203), TFMEngine plays the file ──
  if (/\.tfe$/.test(filename)) {
    const { parseTfmMusicMakerFile } = await import('@lib/import/formats/TFMMusicMakerParser');
    return parseTfmMusicMakerFile(buffer, originalFileName);
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

  // ── QSF — Capcom QSound (CPS1/CPS2 arcade) ───────────────────────────────
  if (/\.(qsf|miniqsf)$/.test(filename)) {
    const { isQsfFormat, parseQsfFile } = await import('@lib/import/formats/QsfParser');
    if (isQsfFormat(filename, buffer)) {
      return parseQsfFile(buffer, filename);
    }
  }

  return null;
}
