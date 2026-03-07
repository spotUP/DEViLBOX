/**
 * AmigaFormatParsers — Format-specific routing for Amiga, Furnace, and exotic formats
 *
 * Contains format detection and dispatch for HivelyTracker/AHX, Oktalyzer,
 * OctaMED, Future Composer, DigiBooster, TFMX, SID, and 100+ other Amiga
 * formats with UADE fallback.
 *
 * Delegates to family-specific dispatchers:
 * - ChipDumpParsers.ts — VGM, YM, NSF, SAP, AY
 * - PCTrackerParsers.ts — S3M, IT, XM, MOD (native → libopenmpt)
 * - UADEPrefixParsers.ts — 60+ prefix-based UADE-only formats + catch-all
 *
 * All format definitions live in FormatRegistry.ts (single source of truth).
 */

import type { TrackerSong } from '@/engine/TrackerReplayer';
import type { UADEMetadata } from '@/engine/uade/UADEEngine';
import type { FormatEnginePreferences } from '@/stores/useSettingsStore';
import { withNativeDefault, withNativeThenUADE, getBasename, type FallbackContext } from './withFallback';
import { tryChipDumpParse } from './ChipDumpParsers';
import { tryUADEPrefixParse } from './UADEPrefixParsers';
import { tryPCTrackerParse } from './PCTrackerParsers';

/**
 * Check if a basename matches a prefix in either direction:
 * 'hst.mysong' (prefix form) or 'mysong.hst' (extension form)
 */
function matchesPrefix(base: string, prefix: string): boolean {
  if (base.startsWith(prefix)) return true;
  const ext = base.slice(base.lastIndexOf('.') + 1);
  return prefix === `${ext}.`;
}

/** Check if a filename matches Future Composer extensions */
function isFCFormat(filename: string): boolean {
  return /\.(fc|fc2|fc3|fc4|fc13|fc14|sfc|smod|bfc|bsi)$/.test(filename);
}

/**
 * Try to route a file to a format-specific parser.
 * Returns a TrackerSong if a matching format was found, or null if no format matched.
 * Covers HVL/AHX, DMF/X-Tracker, Furnace, OKT, MED, FC, UADE formats,
 * S3M, IT, XM, MOD native parsers, and UADE catch-all.
 */
export async function tryRouteFormat(
  buffer: ArrayBuffer,
  filename: string,
  originalFileName: string,
  prefs: FormatEnginePreferences,
  subsong: number,
  preScannedMeta?: UADEMetadata,
  companionFiles?: Map<string, ArrayBuffer>,
): Promise<TrackerSong | null> {
  const ctx: FallbackContext = { buffer, originalFileName, prefs, subsong, preScannedMeta };

  // ── HivelyTracker / AHX ─────────────────────────────────────────────────
  if (filename.endsWith('.hvl') || filename.endsWith('.ahx')) {
    const { parseHivelyFile } = await import('@lib/import/formats/HivelyParser');
    return withNativeDefault('hvl', ctx, (buf: Uint8Array | ArrayBuffer, name: string) => parseHivelyFile(buf as ArrayBuffer, name));
  }

  // ── Klystrack (.kt / .ki) ──────────────────────────────────────────────
  if (filename.endsWith('.kt') || filename.endsWith('.ki')) {
    const { parseKlystrack, isKlystrack } = await import('@lib/import/formats/KlysParser');
    return withNativeDefault('kt', ctx, (buf: Uint8Array | ArrayBuffer, _name: string) => {
      const ab = buf instanceof ArrayBuffer ? buf : (buf.buffer as ArrayBuffer).slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
      if (!isKlystrack(ab)) throw new Error('Not a valid klystrack file');
      return parseKlystrack(ab);
    });
  }

  // ── X-Tracker DMF (.dmf only — magic "DDMF"; version 1–10) ─────────────
  // Must come BEFORE Furnace/DefleMask because both use .dmf extension.
  // DefleMask DMF starts with a different magic; X-Tracker starts with "DDMF".
  if (filename.endsWith('.dmf')) {
    const bytes = new Uint8Array(buffer);
    if (prefs.xTracker === 'native') {
      try {
        const { isXTrackerFormat, parseXTrackerFile } = await import('@lib/import/formats/XTrackerParser');
        if (isXTrackerFormat(bytes)) {
          const result = parseXTrackerFile(bytes, originalFileName);
          if (result) return result;
        }
      } catch (err) {
        console.warn(`[XTrackerParser] Native parse failed for ${filename}, falling back to UADE:`, err);
      }
    }
    // DefleMask DMF (non-DDMF magic) falls through to Furnace parser
    if (!bytes[0] || !(bytes[0] === 0x44 && bytes[1] === 0x44 && bytes[2] === 0x4D && bytes[3] === 0x46)) {
      { const { parseFurnaceFile } = await import('./FurnaceToSong'); return parseFurnaceFile(buffer, originalFileName, subsong); }
    }
    // X-Tracker DMF that wasn't handled above → UADE fallback
    const { parseUADEFile: parseUADE_dmf } = await import('@lib/import/formats/UADEParser');
    return parseUADE_dmf(buffer, originalFileName, prefs.uade ?? 'enhanced', subsong, preScannedMeta);
  }

  // ── Furnace / DefleMask ─────────────────────────────────────────────────
  if (filename.endsWith('.fur')) {
    { const { parseFurnaceFile } = await import('./FurnaceToSong'); return parseFurnaceFile(buffer, originalFileName, subsong); }
  }

  // ── Oktalyzer ────────────────────────────────────────────────────────────
  if (filename.endsWith('.okt')) {
    const { parseOktalyzerFile } = await import('@lib/import/formats/OktalyzerParser');
    return withNativeDefault('okt', ctx, (buf: Uint8Array | ArrayBuffer, name: string) => parseOktalyzerFile(buf as ArrayBuffer, name));
  }

  // ── OctaMED / MED ────────────────────────────────────────────────────────
  if (filename.endsWith('.med') || filename.endsWith('.mmd0') || filename.endsWith('.mmd1')
    || filename.endsWith('.mmd2') || filename.endsWith('.mmd3')) {
    const { parseMEDFile } = await import('@lib/import/formats/MEDParser');
    return withNativeDefault('med', ctx, (buf: Uint8Array | ArrayBuffer, name: string) => parseMEDFile(buf as ArrayBuffer, name));
  }

  // ── DigiBooster ──────────────────────────────────────────────────────────
  if (filename.endsWith('.digi')) {
    const { parseDigiBoosterFile } = await import('@lib/import/formats/DigiBoosterParser');
    return withNativeDefault('digi', ctx, (buf: Uint8Array | ArrayBuffer, name: string) => parseDigiBoosterFile(buf as ArrayBuffer, name));
  }

  // ── Delta Music 2.0 ──────────────────────────────────────────────────────
  // DM2Parser handles .dm2 files (magic ".FNL" at 0xBC6).
  // .dm and .dm1 are Delta Music 1.x — different format, handled by UADE.
  if (filename.endsWith('.dm2')) {
    const { isDeltaMusic2Format, parseDeltaMusic2File } = await import('@lib/import/formats/DeltaMusic2Parser');
    return withNativeThenUADE('deltaMusic2', ctx,
      (bytes: Uint8Array | ArrayBuffer, name: string) => parseDeltaMusic2File(bytes as Uint8Array, name),
      'DeltaMusic2Parser', { isFormat: isDeltaMusic2Format, usesBytes: true });
  }

  // ── Future Composer ──────────────────────────────────────────────────────
  // FCParser handles FC 1.3 (magic "FC13"/"SMOD") and FC 1.4 (magic "FC14").
  // Future Composer 2 and other FC variants have different magic bytes and
  // fall through to UADE automatically when the native parser rejects them.
  if (isFCFormat(filename)) {
    const { parseFCFile } = await import('@lib/import/formats/FCParser');
    return withNativeThenUADE('fc', ctx, (buf: Uint8Array | ArrayBuffer, name: string) => parseFCFile(buf as ArrayBuffer, name), 'FCParser');
  }

  // ── SoundMon (Brian Postma) ─────────────────────────────────────────────
  if (/\.(bp|bp3|sndmon)$/.test(filename)) {
    const { parseSoundMonFile } = await import('@lib/import/formats/SoundMonParser');
    return withNativeThenUADE('soundmon', ctx, (buf: Uint8Array | ArrayBuffer, name: string) => parseSoundMonFile(buf as ArrayBuffer, name), 'SoundMonParser');
  }

  // ── SidMon 1.0 / SidMon II (.smn can be either) ─────────────────────────
  if (/\.smn$/.test(filename)) {
        // Try SidMon1 magic first
    if (prefs.sidmon1 !== 'uade') {
      try {
        const { isSidMon1Format, parseSidMon1File } = await import('@lib/import/formats/SidMon1Parser');
        if (isSidMon1Format(buffer)) {
          return parseSidMon1File(buffer, originalFileName);
        }
      } catch (err) {
        console.warn(`[SidMon1Parser] Native parse failed for ${filename}, falling back:`, err);
      }
    }
    // Then try SidMon2
    if (prefs.sidmon2 === 'native') {
      try {
        const { parseSidMon2File } = await import('@lib/import/formats/SidMon2Parser');
        return parseSidMon2File(buffer, originalFileName);
      } catch (err) {
        console.warn(`[SidMon2Parser] Native parse failed for ${filename}, falling back to UADE:`, err);
      }
    }
    const { parseUADEFile } = await import('@lib/import/formats/UADEParser');
    return parseUADEFile(buffer, originalFileName, prefs.uade ?? 'enhanced', subsong, preScannedMeta);
  }

  // ── SidMon II (.sid2 — unambiguous SidMon 2) ─────────────────────────────
  if (/\.sid2$/.test(filename)) {
    const { parseSidMon2File } = await import('@lib/import/formats/SidMon2Parser');
    return withNativeThenUADE('sidmon2', ctx, (buf: Uint8Array | ArrayBuffer, name: string) => parseSidMon2File(buf as ArrayBuffer, name), 'SidMon2Parser');
  }

  // ── Fred Editor ───────────────────────────────────────────────────────────
  if (/\.fred$/.test(filename)) {
    const { parseFredEditorFile } = await import('@lib/import/formats/FredEditorParser');
    return withNativeThenUADE('fred', ctx, (buf: Uint8Array | ArrayBuffer, name: string) => parseFredEditorFile(buf as ArrayBuffer, name), 'FredEditorParser');
  }

  // ── Sound-FX ──────────────────────────────────────────────────────────────
  if (/\.(sfx|sfx2|sfx13)$/.test(filename)) {
    const { parseSoundFXFile } = await import('@lib/import/formats/SoundFXParser');
    return withNativeThenUADE('soundfx', ctx, (buf: Uint8Array | ArrayBuffer, name: string) => parseSoundFXFile(buf as ArrayBuffer, name), 'SoundFXParser');
  }

  // ── JamCracker ────────────────────────────────────────────────────────────
  if (/\.(jam|jc)$/.test(filename)) {
    try {
      const { isJamCrackerFormat, parseJamCrackerFile } = await import('@lib/import/formats/JamCrackerParser');
      if (isJamCrackerFormat(buffer)) {
        return parseJamCrackerFile(buffer, originalFileName);
      }
    } catch (err) {
      console.warn(`[JamCrackerParser] Native parse failed for ${filename}, falling back to UADE:`, err);
    }
    const { parseUADEFile } = await import('@lib/import/formats/UADEParser');
    return parseUADEFile(buffer, originalFileName, prefs.uade ?? 'enhanced', subsong, preScannedMeta);
  }

  // ── Quadra Composer ───────────────────────────────────────────────────────
  if (/\.(emod|qc)$/.test(filename)) {
    try {
      const { isQuadraComposerFormat, parseQuadraComposerFile } = await import('@lib/import/formats/QuadraComposerParser');
      if (isQuadraComposerFormat(buffer)) {
        return parseQuadraComposerFile(buffer, originalFileName);
      }
    } catch (err) {
      console.warn(`[QuadraComposerParser] Native parse failed for ${filename}, falling back to UADE:`, err);
    }
    const { parseUADEFile } = await import('@lib/import/formats/UADEParser');
    return parseUADEFile(buffer, originalFileName, prefs.uade ?? 'enhanced', subsong, preScannedMeta);
  }

  // ── AMOS Music Bank ───────────────────────────────────────────────────────
  if (/\.abk$/.test(filename)) {
    try {
      const { isAMOSMusicBankFormat, parseAMOSMusicBankFile } = await import('@lib/import/formats/AMOSMusicBankParser');
      if (isAMOSMusicBankFormat(buffer)) {
        return parseAMOSMusicBankFile(buffer, originalFileName);
      }
    } catch (err) {
      console.warn(`[AMOSMusicBankParser] Native parse failed for ${filename}, falling back to UADE:`, err);
    }
    const { parseUADEFile } = await import('@lib/import/formats/UADEParser');
    return parseUADEFile(buffer, originalFileName, prefs.uade ?? 'enhanced', subsong, preScannedMeta);
  }

  // ── Sonic Arranger ────────────────────────────────────────────────────────
  // Magic "SOARV1.0" at offset 0. "@OARV1.0" is LH-compressed — falls to UADE.
  if (/\.(sa|sonic)$/.test(filename)) {
        if (prefs.sonicArranger === 'native') {
      try {
        const { isSonicArrangerFormat, parseSonicArrangerFile } = await import('@lib/import/formats/SonicArrangerParser');
        if (isSonicArrangerFormat(buffer)) {
          const result = parseSonicArrangerFile(buffer, originalFileName);
          if (result) return result;
        }
      } catch (err) {
        console.warn(`[SonicArrangerParser] Native parse failed for ${filename}, falling back to UADE:`, err);
      }
    }
    const { parseUADEFile } = await import('@lib/import/formats/UADEParser');
    return parseUADEFile(buffer, originalFileName, prefs.uade ?? 'enhanced', subsong, preScannedMeta);
  }

  // ── InStereo! 2.0 (.is20 — unambiguous) ──────────────────────────────────
  // Magic "IS20DF10" at offset 0.
  if (/\.is20$/.test(filename)) {
    const { isInStereo2Format, parseInStereo2File } = await import('@lib/import/formats/InStereo2Parser');
    return withNativeThenUADE('inStereo2', ctx,
      (bytes: Uint8Array | ArrayBuffer, name: string) => parseInStereo2File(bytes as Uint8Array, name),
      'InStereo2Parser', { isFormat: isInStereo2Format, usesBytes: true });
  }

  // ── InStereo! 1.0 (.is10 — unambiguous) ──────────────────────────────────
  // Magic "ISM!V1.2" at offset 0.
  if (/\.is10$/.test(filename)) {
    const { isInStereo1Format, parseInStereo1File } = await import('@lib/import/formats/InStereo1Parser');
    return withNativeThenUADE('inStereo1', ctx,
      (bytes: Uint8Array | ArrayBuffer, name: string) => parseInStereo1File(bytes as Uint8Array, name),
      'InStereo1Parser', { isFormat: isInStereo1Format, usesBytes: true });
  }

  // ── InStereo! (.is — ambiguous: detect by magic) ─────────────────────────
  if (/\.is$/.test(filename)) {
        const bytes = new Uint8Array(buffer);
    if (prefs.inStereo2 === 'native') {
      try {
        const { isInStereo2Format, parseInStereo2File } = await import('@lib/import/formats/InStereo2Parser');
        if (isInStereo2Format(bytes)) {
          const result = parseInStereo2File(bytes, originalFileName);
          if (result) return result;
        }
      } catch (err) {
        console.warn(`[InStereo2Parser] failed for ${filename}, trying IS10:`, err);
      }
    }
    if (prefs.inStereo1 === 'native') {
      try {
        const { isInStereo1Format, parseInStereo1File } = await import('@lib/import/formats/InStereo1Parser');
        if (isInStereo1Format(bytes)) {
          const result = parseInStereo1File(bytes, originalFileName);
          if (result) return result;
        }
      } catch (err) {
        console.warn(`[InStereo1Parser] Native parse failed for ${filename}, falling back to UADE:`, err);
      }
    }
    const { parseUADEFile } = await import('@lib/import/formats/UADEParser');
    return parseUADEFile(buffer, originalFileName, prefs.uade ?? 'enhanced', subsong, preScannedMeta);
  }

  // ── PreTracker ───────────────────────────────────────────────────────────
  if (/\.prt$/.test(filename)) {
    try {
      const { isPreTrackerFormat, parsePreTrackerFile } = await import('@lib/import/formats/PreTrackerParser');
      if (isPreTrackerFormat(buffer)) {
        return parsePreTrackerFile(buffer, originalFileName);
      }
    } catch (err) {
      console.warn(`[PreTrackerParser] Native parse failed for ${filename}, falling back to UADE:`, err);
    }
    const { parseUADEFile } = await import('@lib/import/formats/UADEParser');
    return parseUADEFile(buffer, originalFileName, prefs.uade ?? 'enhanced', subsong, preScannedMeta);
  }

  // ── Jochen Hippel CoSo ────────────────────────────────────────────────────
  if (/\.(hipc|soc|coso)$/.test(filename)) {
        if (prefs.hippelCoso !== 'uade') {
      try {
        const { isHippelCoSoFormat, parseHippelCoSoFile } = await import('@lib/import/formats/HippelCoSoParser');
        if (isHippelCoSoFormat(buffer)) {
          return parseHippelCoSoFile(buffer, originalFileName);
        }
      } catch (err) {
        console.warn(`[HippelCoSoParser] Native parse failed for ${filename}, falling back to UADE:`, err);
      }
    }
    const { parseUADEFile } = await import('@lib/import/formats/UADEParser');
    return parseUADEFile(buffer, originalFileName, prefs.uade ?? 'enhanced', subsong, preScannedMeta);
  }

  // ── Rob Hubbard ───────────────────────────────────────────────────────────
  // RobHubbardParser is metadata-only (compiled 68k executable, no parseable
  // instrument data). UADE always handles audio; native parse is not used.
  if (/\.(rh|rhp)$/.test(filename)) {
    const { parseUADEFile } = await import('@lib/import/formats/UADEParser');
    return parseUADEFile(buffer, originalFileName, prefs.uade ?? 'enhanced', subsong, preScannedMeta);
  }

  // ── TFMX (Jochen Hippel) ─────────────────────────────────────────────────
  if (/\.(tfmx|mdat|tfx)$/.test(filename)) {
        if (prefs.tfmx === 'native') {
      try {
        const { parseTFMXFile } = await import('@lib/import/formats/TFMXParser');
        return parseTFMXFile(buffer, originalFileName, subsong);
      } catch (err) {
        console.warn(`[TFMXParser] Native parse failed for ${filename}, falling back to UADE:`, err);
      }
    }
    const { parseUADEFile } = await import('@lib/import/formats/UADEParser');
    return parseUADEFile(buffer, originalFileName, prefs.uade ?? 'enhanced', subsong, preScannedMeta);
  }

  // ── Digital Mugician ──────────────────────────────────────────────────────
  if (/\.(dmu|dmu2|mug|mug2)$/.test(filename)) {
    const { parseDigitalMugicianFile } = await import('@lib/import/formats/DigitalMugicianParser');
    return withNativeThenUADE('mugician', ctx, (buf: Uint8Array | ArrayBuffer, name: string) => parseDigitalMugicianFile(buf as ArrayBuffer, name), 'DigitalMugicianParser');
  }

  // ── Chip-dump formats (VGM, YM, NSF, SAP, AY) ───────────────────────────
  { const chipResult = await tryChipDumpParse(buffer, filename, originalFileName);
    if (chipResult) return chipResult; }

  // ── SidMon 1.0 (.sid1) ───────────────────────────────────────────────────
  // .sid1 files may be SidMon 1.0 or Commodore 64 SID — try magic detection first.
  if (/\.sid1$/.test(filename)) {
    if (prefs.sidmon1 !== 'uade') {
      try {
        const { isSidMon1Format, parseSidMon1File } = await import('@lib/import/formats/SidMon1Parser');
        if (isSidMon1Format(buffer)) {
          return parseSidMon1File(buffer, originalFileName);
        }
      } catch (err) {
        console.warn(`[SidMon1Parser] Native parse failed for ${filename}, falling back to SID:`, err);
      }
    }
    // Fallback: try C64 SID parser
    const { parseSIDFile } = await import('@lib/import/formats/SIDParser');
    return parseSIDFile(buffer, originalFileName);
  }

  // ── SID files (.sid) — Ambiguous: could be SidMon 1.0 (Amiga) or C64 PSID/RSID
  // Try magic detection: C64 SID has "PSID"/"RSID" at offset 0, SidMon has signature string
  if (/\.sid$/.test(filename)) {
    // First check if it's C64 SID (PSID/RSID magic at offset 0)
    const { isSIDFormat, parseSIDFile } = await import('@lib/import/formats/SIDParser');
    if (isSIDFormat(buffer)) {
      // It's a C64 SID - use dedicated C64SIDEngine (never fall back to UADE)
      return parseSIDFile(buffer, originalFileName);
    }
    
    // Not C64 SID — try SidMon 1.0 (if not disabled)
    if (prefs.sidmon1 !== 'uade') {
      try {
        const { isSidMon1Format, parseSidMon1File } = await import('@lib/import/formats/SidMon1Parser');
        if (isSidMon1Format(buffer)) {
          return parseSidMon1File(buffer, originalFileName);
        }
      } catch (err) {
        console.warn(`[SidMon1Parser] Native parse failed for ${filename}, falling back to UADE:`, err);
      }
    }
    
    // Last resort: UADE (handles obscure Amiga formats with .sid extension)
    const { parseUADEFile } = await import('@lib/import/formats/UADEParser');
    return parseUADEFile(buffer, originalFileName, prefs.uade ?? 'enhanced', subsong, preScannedMeta);
  }

  // ── David Whittaker (.dw / .dwold) ───────────────────────────────────────
  if (/\.(dw|dwold)$/.test(filename)) {
        if (prefs.davidWhittaker !== 'uade') {
      try {
        const { parseDavidWhittakerFile } = await import('@lib/import/formats/DavidWhittakerParser');
        return parseDavidWhittakerFile(buffer, originalFileName);
      } catch (err) {
        console.warn(`[DavidWhittakerParser] Native parse failed for ${filename}, falling back to UADE:`, err);
      }
    }
    const { parseUADEFile: parseUADE } = await import('@lib/import/formats/UADEParser');
    return parseUADE(buffer, originalFileName, prefs.uade ?? 'enhanced', subsong, preScannedMeta);
  }

  // ── Art of Noise ──────────────────────────────────────────────────────────
  // AON4 (.aon) and AON8 (.aon8) — identified by "AON4"/"AON8" magic bytes at offset 0.
  if (/\.(aon|aon8)$/.test(filename)) {
    const { isArtOfNoiseFormat, parseArtOfNoiseFile } = await import('@lib/import/formats/ArtOfNoiseParser');
    return withNativeThenUADE('artOfNoise', ctx,
      (bytes: Uint8Array | ArrayBuffer, name: string) => parseArtOfNoiseFile(bytes as Uint8Array, name),
      'ArtOfNoiseParser', { isFormat: isArtOfNoiseFormat, usesBytes: true });
  }

  // ── Digital Symphony ──────────────────────────────────────────────────────
  // .dsym files — identified by 8-byte magic \x02\x01\x13\x13\x14\x12\x01\x0B at offset 0.
  if (/\.dsym$/.test(filename)) {
    const { isDigitalSymphonyFormat, parseDigitalSymphonyFile } = await import('@lib/import/formats/DigitalSymphonyParser');
    return withNativeThenUADE('digitalSymphony', ctx,
      (bytes: Uint8Array | ArrayBuffer, name: string) => parseDigitalSymphonyFile(bytes as Uint8Array, name),
      'DigitalSymphonyParser', { isFormat: isDigitalSymphonyFormat, usesBytes: true });
  }

  // ── Graoumf Tracker 1/2 ───────────────────────────────────────────────────
  // .gt2 files (GT2 format) and .gtk files (GTK format) — identified by "GT2" / "GTK" magic.
  if (/\.(gt2|gtk)$/.test(filename)) {
    const { isGraoumfTracker2Format, parseGraoumfTracker2File } = await import('@lib/import/formats/GraoumfTracker2Parser');
    return withNativeThenUADE('graoumfTracker2', ctx,
      (bytes: Uint8Array | ArrayBuffer, name: string) => parseGraoumfTracker2File(bytes as Uint8Array, name),
      'GraoumfTracker2Parser', { isFormat: isGraoumfTracker2Format, usesBytes: true });
  }

  // ── Symphonie Pro ─────────────────────────────────────────────────────────
  // .symmod files — identified by "SymM" magic at offset 0.
  if (/\.symmod$/i.test(filename)) {
        if (prefs.symphoniePro === 'native') {
      try {
        const { isSymphonieProFormat, parseSymphonieProFile } = await import('@lib/import/formats/SymphonieProParser');
        const bytes = new Uint8Array(buffer);
        if (isSymphonieProFormat(bytes)) {
          const result = await parseSymphonieProFile(bytes, originalFileName);
          if (result) return result;
        }
      } catch (err) {
        console.warn(`[SymphonieProParser] Native parse failed for ${filename}, falling back to UADE:`, err);
      }
    }
    const { parseUADEFile } = await import('@lib/import/formats/UADEParser');
    return parseUADEFile(buffer, originalFileName, prefs.uade ?? 'enhanced', subsong, preScannedMeta);
  }

  // ── DigiBooster Pro ───────────────────────────────────────────────────────
  // .dbm files — identified by "DBM0" magic at offset 0.
  // NOTE: .digi (DigiBooster 1.x) is handled separately above; this is DBM Pro only.
  if (/\.dbm$/i.test(filename)) {
    const { isDigiBoosterProFormat, parseDigiBoosterProFile } = await import('@lib/import/formats/DigiBoosterProParser');
    return withNativeThenUADE('digiBoosterPro', ctx,
      (bytes: Uint8Array | ArrayBuffer, name: string) => parseDigiBoosterProFile(bytes as Uint8Array, name),
      'DigiBoosterProParser', { isFormat: isDigiBoosterProFormat, usesBytes: true });
  }

  // ── PumaTracker ───────────────────────────────────────────────────────────
  // .puma files — no magic bytes; heuristic header validation (mirrors OpenMPT).
  if (/\.puma$/.test(filename)) {
        if (prefs.pumaTracker === 'native') {
      try {
        const { isPumaTrackerFormat, parsePumaTrackerFile } = await import('@lib/import/formats/PumaTrackerParser');
        if (isPumaTrackerFormat(buffer)) {
          return parsePumaTrackerFile(buffer, originalFileName);
        }
      } catch (err) {
        console.warn(`[PumaTrackerParser] Native parse failed for ${filename}, falling back to UADE:`, err);
      }
    }
    const { parseUADEFile } = await import('@lib/import/formats/UADEParser');
    return parseUADEFile(buffer, originalFileName, prefs.uade ?? 'enhanced', subsong, preScannedMeta);
  }

  // ── Synthesis ─────────────────────────────────────────────────────────────
  // .syn files — identified by "Synth4.0" at offset 0 or "Synth4.2" at 0x1f0e.
  if (/\.syn$/.test(filename)) {
    const { isSynthesisFormat, parseSynthesisFile } = await import('@lib/import/formats/SynthesisParser');
    return withNativeThenUADE('synthesis', ctx,
      (bytes: Uint8Array | ArrayBuffer, name: string) => parseSynthesisFile(bytes as Uint8Array, name),
      'SynthesisParser', { isFormat: isSynthesisFormat, usesBytes: true });
  }

  // ── Digital Sound Studio ──────────────────────────────────────────────────
  // .dss files — identified by "MMU2" magic at offset 0.
  if (/\.dss$/.test(filename)) {
    const { isDigitalSoundStudioFormat, parseDigitalSoundStudioFile } = await import('@lib/import/formats/DigitalSoundStudioParser');
    return withNativeThenUADE('digitalSoundStudio', ctx,
      (bytes: Uint8Array | ArrayBuffer, name: string) => parseDigitalSoundStudioFile(bytes as Uint8Array, name),
      'DigitalSoundStudioParser', { isFormat: isDigitalSoundStudioFormat, usesBytes: true });
  }

  // ── Music Assembler ────────────────────────────────────────────────────────
  // .ma files — identified by M68k player bytecode scanning (no magic bytes).
  if (/\.ma$/.test(filename)) {
    const { isMusicAssemblerFormat, parseMusicAssemblerFile } = await import('@lib/import/formats/MusicAssemblerParser');
    return withNativeThenUADE('musicAssembler', ctx,
      (bytes: Uint8Array | ArrayBuffer, name: string) => parseMusicAssemblerFile(bytes as Uint8Array, name),
      'MusicAssemblerParser', { isFormat: isMusicAssemblerFormat, usesBytes: true });
  }

  // ── Composer 667 ─────────────────────────────────────────────────────────
  // ── Composer 667 (.667) ───────────────────────────────────────────────────
  // OPL FM tracker (PC format). No PCM samples; instruments are FM patches.
  // Falls through to libopenmpt on failure. (UADE is Amiga-only, cannot play OPL.)
  if (/\.667$/.test(filename)) {
    if (prefs.composer667 === 'native') {
      try {
        const { isComposer667Format, parseComposer667File } = await import('@lib/import/formats/Composer667Parser');
        const bytes = new Uint8Array(buffer);
        if (isComposer667Format(bytes)) {
          const result = parseComposer667File(bytes, originalFileName);
          if (result) return result;
        }
      } catch (err) {
        console.warn(`[Composer667Parser] Native parse failed for ${filename}, falling back to libopenmpt:`, err);
      }
    }
    // Fall through to libopenmpt
  }

  // ── Chuck Biscuits / Black Artist ────────────────────────────────────────
  // .cba files — identified by 'CBA\xF9' magic at offset 0.
  if (/\.cba$/.test(filename)) {
    const { isChuckBiscuitsFormat, parseChuckBiscuitsFile } = await import('@lib/import/formats/ChuckBiscuitsParser');
    return withNativeThenUADE('chuckBiscuits', ctx,
      (bytes: Uint8Array | ArrayBuffer, name: string) => parseChuckBiscuitsFile(bytes as Uint8Array, name),
      'ChuckBiscuitsParser', { isFormat: isChuckBiscuitsFormat, usesBytes: true });
  }

  // ── Ben Daglish (bd.* prefix) ────────────────────────────────────────────
  // Compiled 68k Amiga music format. Magic: Amiga HUNK header at offset 0.
  {
    const _bdBase = getBasename(filename);
    if (matchesPrefix(_bdBase, 'bd.')) {
      if (prefs.benDaglish === 'native') {
        try {
          const { isBenDaglishFormat, parseBenDaglishFile } = await import('@lib/import/formats/BenDaglishParser');
          if (isBenDaglishFormat(buffer, originalFileName)) return await parseBenDaglishFile(buffer, originalFileName);
        } catch (err) {
          console.warn(`[BenDaglishParser] Native parse failed for ${filename}, falling back to UADE:`, err);
        }
      }
      const { parseUADEFile: parseUADE_bd } = await import('@lib/import/formats/UADEParser');
      return parseUADE_bd(buffer, originalFileName, prefs.uade ?? 'enhanced', subsong, preScannedMeta);
    }
  }

  // ── Images Music System (.ims) ────────────────────────────────────────────
  if (/\.ims$/.test(filename)) {
    try {
      const { isIMSFormat, parseIMSFile } = await import('@lib/import/formats/IMSParser');
      if (isIMSFormat(buffer)) return parseIMSFile(buffer, originalFileName);
    } catch (err) {
      console.warn(`[IMSParser] Native parse failed for ${filename}, falling back to UADE:`, err);
    }
    const { parseUADEFile: parseUADE_ims } = await import('@lib/import/formats/UADEParser');
    return parseUADE_ims(buffer, originalFileName, prefs.uade ?? 'enhanced', subsong, preScannedMeta);
  }

  // ── ICE Tracker / SoundTracker 2.6 (.ice) ────────────────────────────────
  if (/\.ice$/.test(filename)) {
    try {
      const { isICEFormat, parseICEFile } = await import('@lib/import/formats/ICEParser');
      if (isICEFormat(buffer)) return parseICEFile(buffer, originalFileName);
    } catch (err) {
      console.warn(`[ICEParser] Native parse failed for ${filename}, falling back to UADE:`, err);
    }
    const { parseUADEFile: parseUADE_ice } = await import('@lib/import/formats/UADEParser');
    return parseUADE_ice(buffer, originalFileName, prefs.uade ?? 'enhanced', subsong, preScannedMeta);
  }

  // ── ChipTracker (.kris) ───────────────────────────────────────────────────
  if (/\.kris$/.test(filename)) {
    try {
      const { isKRISFormat, parseKRISFile } = await import('@lib/import/formats/KRISParser');
      if (isKRISFormat(buffer)) return parseKRISFile(buffer, originalFileName);
    } catch (err) {
      console.warn(`[KRISParser] Native parse failed for ${filename}, falling back to UADE:`, err);
    }
    const { parseUADEFile: parseUADE_kris } = await import('@lib/import/formats/UADEParser');
    return parseUADE_kris(buffer, originalFileName, prefs.uade ?? 'enhanced', subsong, preScannedMeta);
  }

  // ── MusicLine Editor (.ml) ───────────────────────────────────────────────
  // Magic "MLEDMODL" at offset 0. Falls through to Medley handler if magic doesn't match.
  if (/\.ml$/i.test(filename)) {
    const bytes = new Uint8Array(buffer);
    try {
      const { isMusicLineFile, parseMusicLineFile } = await import('@lib/import/formats/MusicLineParser');
      if (isMusicLineFile(bytes)) {
        const result = parseMusicLineFile(bytes);
        if (result) return result;
      }
    } catch (err) {
      console.warn(`[MusicLineParser] Native parse failed for ${filename}:`, err);
    }
    // Not a MusicLine file — fall through to Medley handler below
  }

  // ── Game Music Creator (.gmc) ─────────────────────────────────────────────
  // No magic bytes — identified by structural heuristics (mirrors OpenMPT).
  // GMCParser is the OpenMPT-faithful implementation; GameMusicCreatorParser
  // is the legacy alternative — both extract PCM, try GMC first.
  if (/\.gmc$/.test(filename)) {
        if (prefs.gameMusicCreator === 'native') {
      try {
        const { isGMCFormat, parseGMCFile } = await import('@lib/import/formats/GMCParser');
        if (isGMCFormat(buffer)) return await parseGMCFile(buffer, originalFileName);
      } catch (err) {
        console.warn(`[GMCParser] Native parse failed for ${filename}, trying GameMusicCreatorParser:`, err);
      }
      try {
        const { isGameMusicCreatorFormat, parseGameMusicCreatorFile } = await import('@lib/import/formats/GameMusicCreatorParser');
        const bytes = new Uint8Array(buffer);
        if (isGameMusicCreatorFormat(bytes)) {
          const result = parseGameMusicCreatorFile(bytes, originalFileName);
          if (result) return result;
        }
      } catch (err) {
        console.warn(`[GameMusicCreatorParser] Native parse failed for ${filename}, falling back to UADE:`, err);
      }
    }
    const { parseUADEFile: parseUADE_gmc } = await import('@lib/import/formats/UADEParser');
    return parseUADE_gmc(buffer, originalFileName, prefs.uade ?? 'enhanced', subsong, preScannedMeta);
  }

  // ── Face The Music (.ftm) ─────────────────────────────────────────────────
  // Magic "FTMN" at offset 0; embedded-sample variant only.
  if (/\.ftm$/.test(filename)) {
    const { isFaceTheMusicFormat, parseFaceTheMusicFile } = await import('@lib/import/formats/FaceTheMusicParser');
    return withNativeThenUADE('faceTheMusic', ctx,
      (bytes: Uint8Array | ArrayBuffer, name: string) => parseFaceTheMusicFile(bytes as Uint8Array, name),
      'FaceTheMusicParser', { isFormat: isFaceTheMusicFormat, usesBytes: true });
  }

  // ── Sawteeth (.st — magic "SWTD" required to disambiguate) ───────────────
  // Fully synthesized format (no PCM samples). Native parser available (metadata only).
  if (/\.st$/.test(filename)) {
        if (prefs.sawteeth === 'native') {
      try {
        const { isSawteethFormat, parseSawteethFile } = await import('@lib/import/formats/SawteethParser');
        const _stBytes = new Uint8Array(buffer);
        if (isSawteethFormat(_stBytes)) {
          const result = parseSawteethFile(_stBytes, originalFileName);
          if (result) return result;
        }
      } catch (err) {
        console.warn(`[SawteethParser] Native parse failed for ${filename}, falling back to UADE:`, err);
      }
    }
    const { parseUADEFile: parseUADE_st } = await import('@lib/import/formats/UADEParser');
    return parseUADE_st(buffer, originalFileName, prefs.uade ?? 'enhanced', subsong, preScannedMeta);
  }

  // ── Sound Control (.sc, .sct) ─────────────────────────────────────────────
  if (/\.(sc|sct)$/.test(filename)) {
    const { isSoundControlFormat, parseSoundControlFile } = await import('@lib/import/formats/SoundControlParser');
    return withNativeThenUADE('soundControl', ctx,
      (bytes: Uint8Array | ArrayBuffer, name: string) => parseSoundControlFile(bytes as Uint8Array, name),
      'SoundControlParser', { isFormat: isSoundControlFormat, usesBytes: true });
  }

  // ── Sound Factory (.psf) ──────────────────────────────────────────────────
  if (/\.psf$/.test(filename)) {
    const { isSoundFactoryFormat, parseSoundFactoryFile } = await import('@lib/import/formats/SoundFactoryParser');
    return withNativeThenUADE('soundFactory', ctx,
      (bytes: Uint8Array | ArrayBuffer, name: string) => parseSoundFactoryFile(bytes as Uint8Array, name),
      'SoundFactoryParser', { isFormat: isSoundFactoryFormat, usesBytes: true });
  }

  // ── Actionamics (.act) ────────────────────────────────────────────────────
  // Identified by "ACTIONAMICS SOUND TOOL" signature at offset 62.
  if (/\.act$/.test(filename)) {
    const { isActionamicsFormat, parseActionamicsFile } = await import('@lib/import/formats/ActionamicsParser');
    return withNativeThenUADE('actionamics', ctx,
      (bytes: Uint8Array | ArrayBuffer, name: string) => parseActionamicsFile(bytes as Uint8Array, name),
      'ActionamicsParser', { isFormat: isActionamicsFormat, usesBytes: true });
  }

  // ── Activision Pro / Martin Walker (.avp, .mw) ────────────────────────────
  // Identified by scanning first 4096 bytes for M68k init pattern (0x48 0xe7 0xfc 0xfe).
  if (/\.(avp|mw)$/.test(filename)) {
    const { isActivisionProFormat, parseActivisionProFile } = await import('@lib/import/formats/ActivisionProParser');
    return withNativeThenUADE('activisionPro', ctx,
      (bytes: Uint8Array | ArrayBuffer, name: string) => parseActivisionProFile(bytes as Uint8Array, name),
      'ActivisionProParser', { isFormat: isActivisionProFormat, usesBytes: true });
  }

  // ── Ron Klaren (.rk, .rkb) ────────────────────────────────────────────────
  // Identified by Amiga HUNK magic (0x3F3) at offset 0 and "RON_KLAREN_SOUNDMODULE!" at offset 40.
  if (/\.(rk|rkb)$/.test(filename)) {
    const { isRonKlarenFormat, parseRonKlarenFile } = await import('@lib/import/formats/RonKlarenParser');
    return withNativeThenUADE('ronKlaren', ctx,
      (bytes: Uint8Array | ArrayBuffer, name: string) => parseRonKlarenFile(bytes as Uint8Array, name),
      'RonKlarenParser', { isFormat: isRonKlarenFormat, usesBytes: true });
  }

  // ── UNIC Tracker (.unic) ─────────────────────────────────────────────────
  if (/\.unic$/.test(filename)) {
    try {
      const { isUNICFormat, parseUNICFile } = await import('@lib/import/formats/UNICParser');
      if (isUNICFormat(buffer)) return parseUNICFile(buffer, originalFileName);
    } catch (err) {
      console.warn(`[UNICParser] Native parse failed for ${filename}, falling back to OpenMPT:`, err);
    }
    // Fall through to libopenmpt
  }

  // ── MultiTracker (.mtm) ──────────────────────────────────────────────────
  if (/\.mtm$/.test(filename)) {
    try {
      const { isMTMFormat, parseMTMFile } = await import('@lib/import/formats/MTMParser');
      if (isMTMFormat(buffer)) return parseMTMFile(buffer, originalFileName);
    } catch (err) {
      console.warn(`[MTMParser] Native parse failed for ${filename}, falling back to OpenMPT:`, err);
    }
    // Fall through to libopenmpt
  }

  // ── Composer 669 (.669) ──────────────────────────────────────────────────
  if (/\.669$/.test(filename)) {
    try {
      const { is669Format, parse669File } = await import('@lib/import/formats/Format669Parser');
      if (is669Format(buffer)) return parse669File(buffer, originalFileName);
    } catch (err) {
      console.warn(`[Format669Parser] Native parse failed for ${filename}, falling back to OpenMPT:`, err);
    }
    // Fall through to libopenmpt
  }

  // ── Farandole Composer (.far) ─────────────────────────────────────────────
  if (/\.far$/.test(filename)) {
    try {
      const { isFARFormat, parseFARFile } = await import('@lib/import/formats/FARParser');
      if (isFARFormat(buffer)) return parseFARFile(buffer, originalFileName);
    } catch (err) {
      console.warn(`[FARParser] Native parse failed for ${filename}, falling back to OpenMPT:`, err);
    }
    // Fall through to libopenmpt
  }

  // ── Disorder Tracker 2 (.plm) ─────────────────────────────────────────────
  if (/\.plm$/.test(filename)) {
    try {
      const { isPLMFormat, parsePLMFile } = await import('@lib/import/formats/PLMParser');
      if (isPLMFormat(buffer)) return parsePLMFile(buffer, originalFileName);
    } catch (err) {
      console.warn(`[PLMParser] Native parse failed for ${filename}, falling back to OpenMPT:`, err);
    }
    // Fall through to libopenmpt
  }

  // ── Ultra Tracker (.ult) ──────────────────────────────────────────────────
  if (/\.ult$/.test(filename)) {
    try {
      const { isULTFormat, parseULTFile } = await import('@lib/import/formats/ULTParser');
      if (isULTFormat(buffer)) return parseULTFile(buffer, originalFileName);
    } catch (err) {
      console.warn(`[ULTParser] Native parse failed for ${filename}, falling back to OpenMPT:`, err);
    }
    // Fall through to libopenmpt
  }

  // ── Reality Tracker (.rtm) ────────────────────────────────────────────────
  if (/\.rtm$/.test(filename)) {
    try {
      const { isRTMFormat, parseRTMFile } = await import('@lib/import/formats/RTMParser');
      if (isRTMFormat(buffer)) return parseRTMFile(buffer, originalFileName);
    } catch (err) {
      console.warn(`[RTMParser] Native parse failed for ${filename}, falling back to OpenMPT:`, err);
    }
    // Fall through to libopenmpt
  }

  // ── DSIK Sound Module (.dsm) ──────────────────────────────────────────────
  if (/\.dsm$/.test(filename)) {
    try {
      const { isDSMFormat, parseDSMFile } = await import('@lib/import/formats/DSMParser');
      if (isDSMFormat(buffer)) return parseDSMFile(buffer, originalFileName);
    } catch (err) {
      console.warn(`[DSMParser] Native parse failed for ${filename}, falling back to OpenMPT:`, err);
    }
    // Fall through to libopenmpt
  }

  // ── Digital Tracker (.dtm) ────────────────────────────────────────────────
  if (/\.dtm$/.test(filename)) {
    try {
      const { isDTMFormat, parseDTMFile } = await import('@lib/import/formats/DTMParser');
      if (isDTMFormat(buffer)) return parseDTMFile(buffer, originalFileName);
    } catch (err) {
      console.warn(`[DTMParser] Native parse failed for ${filename}, falling back to OpenMPT:`, err);
    }
    // Fall through to libopenmpt
  }

  // ── ScreamTracker 2 (.stm) ────────────────────────────────────────────────
  if (/\.stm$/.test(filename)) {
    try {
      const { isSTMFormat, parseSTMFile } = await import('@lib/import/formats/STMParser');
      if (isSTMFormat(buffer)) return parseSTMFile(buffer, originalFileName);
    } catch (err) {
      console.warn(`[STMParser] Native parse failed for ${filename}, falling back to OpenMPT:`, err);
    }
    // Fall through to libopenmpt
  }

  // ── ScreamTracker STMIK (.stx) ────────────────────────────────────────────
  if (/\.stx$/i.test(filename)) {
    try {
      const { isSTXFormat, parseSTXFile } = await import('@lib/import/formats/STXParser');
      if (isSTXFormat(buffer)) return parseSTXFile(buffer, originalFileName);
    } catch (err) {
      console.warn(`[STXParser] Native parse failed for ${filename}, falling back to OpenMPT:`, err);
    }
    // Fall through to libopenmpt
  }

  // ── NoiseRunner (.nru) ────────────────────────────────────────────────────
  if (/\.nru$/.test(filename)) {
    try {
      const { isNRUFormat, parseNRUFile } = await import('@lib/import/formats/NRUParser');
      if (isNRUFormat(buffer)) return parseNRUFile(buffer, originalFileName);
    } catch (err) {
      console.warn(`[NRUParser] Native parse failed for ${filename}, falling back to OpenMPT:`, err);
    }
    // Fall through to libopenmpt
  }

  // ── PolyTracker (.ptm) ────────────────────────────────────────────────────
  if (/\.ptm$/.test(filename)) {
    try {
      const { isPTMFormat, parsePTMFile } = await import('@lib/import/formats/PTMParser');
      if (isPTMFormat(buffer)) return parsePTMFile(buffer, originalFileName);
    } catch (err) {
      console.warn(`[PTMParser] Native parse failed for ${filename}, falling back to OpenMPT:`, err);
    }
    // Fall through to libopenmpt
  }

  // ── General DigiMusic (.gdm) ──────────────────────────────────────────────
  if (/\.gdm$/.test(filename)) {
    try {
      const { isGDMFormat, parseGDMFile } = await import('@lib/import/formats/GDMParser');
      if (isGDMFormat(buffer)) return parseGDMFile(buffer, originalFileName);
    } catch (err) {
      console.warn(`[GDMParser] Native parse failed for ${filename}, falling back to OpenMPT:`, err);
    }
    // Fall through to libopenmpt
  }

  // ── Ultimate SoundTracker (.stk) ──────────────────────────────────────────
  if (/\.stk$/.test(filename)) {
    try {
      const { isSTKFormat, parseSTKFile } = await import('@lib/import/formats/STKParser');
      if (isSTKFormat(buffer)) return parseSTKFile(buffer, originalFileName);
    } catch (err) {
      console.warn(`[STKParser] Native parse failed for ${filename}, falling back to OpenMPT:`, err);
    }
    // Fall through to libopenmpt
  }

  // ── SoundTracker Pro II (.stp) ─────────────────────────────────────────────
  if (/\.stp$/.test(filename)) {
    try {
      const { isSTPFormat, parseSTPFile } = await import('@lib/import/formats/STPParser');
      if (isSTPFormat(buffer)) return parseSTPFile(buffer, originalFileName);
    } catch (err) {
      console.warn(`[STPParser] Native parse failed for ${filename}, falling back to OpenMPT:`, err);
    }
    // Fall through to libopenmpt
  }

  // ── DigiTrakker (.mdl) ────────────────────────────────────────────────────
  if (/\.mdl$/i.test(filename)) {
    try {
      const { isMDLFormat, parseMDLFile } = await import('@lib/import/formats/MDLParser');
      if (isMDLFormat(buffer)) return parseMDLFile(buffer, originalFileName);
    } catch (err) {
      console.warn(`[MDLParser] Native parse failed for ${filename}, falling back to OpenMPT:`, err);
    }
    // Fall through to libopenmpt
  }

  // ── Advanced Music Format (.amf) ──────────────────────────────────────────
  if (/\.amf$/i.test(filename)) {
    try {
      const { isAMFFormat, parseAMFFile } = await import('@lib/import/formats/AMFParser');
      if (isAMFFormat(buffer)) return parseAMFFile(buffer, originalFileName);
    } catch (err) {
      console.warn(`[AMFParser] Native parse failed for ${filename}, falling back to OpenMPT:`, err);
    }
    // Fall through to libopenmpt
  }

  // ── Imago Orpheus (.imf) ──────────────────────────────────────────────────
  if (/\.imf$/.test(filename)) {
    if (prefs.imagoOrpheus === 'native') {
      try {
        const { isImagoOrpheusFormat, parseImagoOrpheusFile } = await import('@lib/import/formats/ImagoOrpheusParser');
        const bytes = new Uint8Array(buffer);
        if (isImagoOrpheusFormat(bytes)) {
          const result = parseImagoOrpheusFile(bytes, originalFileName);
          if (result) return result;
        }
      } catch (err) {
        console.warn(`[ImagoOrpheusParser] Native parse failed for ${filename}, falling back to OpenMPT:`, err);
      }
    }
    // Fall through to libopenmpt
  }

  // ── CDFM Composer 670 (.c67) ──────────────────────────────────────────────
  if (/\.c67$/.test(filename)) {
    if (prefs.cdfm67 === 'native') {
      try {
        const { isCDFM67Format, parseCDFM67File } = await import('@lib/import/formats/CDFM67Parser');
        const bytes = new Uint8Array(buffer);
        if (isCDFM67Format(bytes)) {
          const result = parseCDFM67File(bytes, originalFileName);
          if (result) return result;
        }
      } catch (err) {
        console.warn(`[CDFM67Parser] Native parse failed for ${filename}, falling back to OpenMPT:`, err);
      }
    }
    // Fall through to libopenmpt
  }

  // ── EasyTrax (.etx) ──────────────────────────────────────────────────────
  if (/\.etx$/.test(filename)) {
    if (prefs.easyTrax === 'native') {
      try {
        const { isEasyTraxFormat, parseEasyTraxFile } = await import('@lib/import/formats/EasyTraxParser');
        const bytes = new Uint8Array(buffer);
        if (isEasyTraxFormat(bytes)) {
          const result = parseEasyTraxFile(bytes, originalFileName);
          if (result) return result;
        }
      } catch (err) {
        console.warn(`[EasyTraxParser] Native parse failed for ${filename}, falling back to OpenMPT:`, err);
      }
    }
    // Fall through to libopenmpt
  }

  // ── Karl Morton Music Format (.mus) ───────────────────────────────────────
  // Note: .mus is also used by UFO/MicroProse format (DDAT magic, checked later).
  if (/\.mus$/.test(filename) && prefs.karlMorton === 'native') {
    try {
      const { isKarlMortonFormat, parseKarlMortonFile } = await import('@lib/import/formats/KarlMortonParser');
      const bytes = new Uint8Array(buffer);
      if (isKarlMortonFormat(bytes)) {
        const result = parseKarlMortonFile(bytes, originalFileName);
        if (result) return result;
      }
    } catch (err) {
      console.warn(`[KarlMortonParser] Native parse failed for ${filename}:`, err);
    }
    // Don't fall through to libopenmpt yet - let UFO/MicroProse handler try it
  }

  // ── UFO / MicroProse (.ufo, .mus with DDAT magic) ─────────────────────────
  // IFF-based 4-channel Amiga format from UFO: Enemy Unknown (1994).
  // Magic: "DDAT" at offset 0 (IFF-like chunk marker).
  if (/\.(ufo|mus)$/i.test(filename)) {
    const { isUFOFormat, parseUFOFile } = await import('@lib/import/formats/UFOParser');
    return withNativeThenUADE('ufo', ctx,
      (buf: Uint8Array | ArrayBuffer, name: string) => { if (isUFOFormat(buf as ArrayBuffer)) return parseUFOFile(buf as ArrayBuffer, name); return null; },
      'UFOParser');
  }

  // ── Astroidea XMF / Imperium Galactica (.xmf) ────────────────────────────
  if (/\.xmf$/i.test(filename)) {
    if (prefs.xmf === 'native') {
      try {
        const { isXMFFormat, parseXMFFile } = await import('@lib/import/formats/XMFParser');
        const bytes = new Uint8Array(buffer);
        if (isXMFFormat(bytes)) {
          const result = parseXMFFile(bytes, originalFileName);
          if (result) return result;
        }
      } catch (err) {
        console.warn(`[XMFParser] Native parse failed for ${filename}, falling back to OpenMPT:`, err);
      }
    }
    // Fall through to libopenmpt
  }

  // ── Unreal Audio Package (.uax) ───────────────────────────────────────────
  if (/\.uax$/i.test(filename)) {
    if (prefs.uax === 'native') {
      try {
        const { isUAXFormat, parseUAXFile } = await import('@lib/import/formats/UAXParser');
        const bytes = new Uint8Array(buffer);
        if (isUAXFormat(bytes)) {
          const result = parseUAXFile(bytes, originalFileName);
          if (result) return result;
        }
      } catch (err) {
        throw new Error(`[UAXParser] Failed to parse ${filename}: ${err}`);
      }
    }
    throw new Error(`[UAXParser] ${filename}: no native parser available or format not recognised`);
  }

  // ── FM Tracker (.fmt) ─────────────────────────────────────────────────────
  // PC format — OPL-based tracker, magic "FMT" at offset 0. Falls through to libopenmpt.
  if (/\.fmt$/i.test(filename)) {
    if (prefs.fmTracker === 'native') {
      try {
        const { isFMTrackerFormat, parseFMTrackerFile } = await import('@lib/import/formats/FMTrackerParser');
        const bytes = new Uint8Array(buffer);
        if (isFMTrackerFormat(bytes)) {
          const result = parseFMTrackerFile(bytes, originalFileName);
          if (result) return result;
        }
      } catch (err) {
        console.warn(`[FMTrackerParser] Native parse failed for ${filename}, falling back to libopenmpt:`, err);
      }
    }
    // Fall through to libopenmpt
  }

  // ── MadTracker 2 (.mt2) ───────────────────────────────────────────────────
  // PC format — identified by "MT20" magic at offset 0. Falls through to libopenmpt.
  if (/\.mt2$/i.test(filename)) {
    if (prefs.madTracker2 === 'native') {
      try {
        const { isMadTracker2Format, parseMadTracker2File } = await import('@lib/import/formats/MadTracker2Parser');
        const bytes = new Uint8Array(buffer);
        if (isMadTracker2Format(bytes)) {
          const result = parseMadTracker2File(bytes, originalFileName);
          if (result) return result;
        }
      } catch (err) {
        console.warn(`[MadTracker2Parser] Native parse failed for ${filename}, falling back to libopenmpt:`, err);
      }
    }
    // Fall through to libopenmpt
  }

  // ── PSM / PSM16 (Epic MegaGames MASI) (.psm) ─────────────────────────────
  // Handles both new PSM ("PSM " magic) and PSM16 ("PSM\xFE" magic).
  // Falls through to libopenmpt on failure.
  if (/\.psm$/i.test(filename)) {
    if (prefs.psm === 'native') {
      try {
        const { isPSMFormat, parsePSMFile } = await import('@lib/import/formats/PSMParser');
        const bytes = new Uint8Array(buffer);
        if (isPSMFormat(bytes)) {
          const result = parsePSMFile(bytes, originalFileName);
          if (result) return result;
        }
      } catch (err) {
        console.warn(`[PSMParser] Native parse failed for ${filename}, falling back to libopenmpt:`, err);
      }
    }
    // Fall through to libopenmpt
  }

  // ── AMS (Extreme's Tracker / Velvet Studio) ───────────────────────────────
  // PC format — no UADE fallback.  Two magic variants:
  //   "Extreme"    → AMS 1.x (Extreme's Tracker)
  //   "AMShdr\x1A" → AMS 2.x (Velvet Studio 2.00–2.02)
  if (/\.ams$/i.test(filename)) {
    if (prefs.ams === 'native') {
      try {
        const { isAMSFormat, parseAMSFile } = await import('@lib/import/formats/AMSParser');
        const bytes = new Uint8Array(buffer);
        if (isAMSFormat(bytes)) {
          const result = parseAMSFile(bytes, originalFileName);
          if (result) return result;
        }
      } catch (err) {
        console.warn(`[AMSParser] Native parse failed for ${filename}, falling back to UADE:`, err);
      }
    }
    // PC format — fall back to UADE
    const { parseUADEFile: parseUADE_ams } = await import('@lib/import/formats/UADEParser');
    return parseUADE_ams(buffer, originalFileName, prefs.uade ?? 'enhanced', subsong, preScannedMeta);
  }

  // ── IFF SMUS / Sonix Music Driver (.smus, .snx, .tiny) ───────────────────
  // IFF SMUS format: "FORM" + "SMUS" IFF structure. Binary SNX/TINY sub-formats
  // are handled by SonixMusicDriverParser when IffSmusParser does not detect IFF.
  if (/\.(smus|snx|tiny)$/i.test(filename)) {
        if (prefs.iffSmus === 'native') {
      try {
        const { isIffSmusFormat, parseIffSmusFile } = await import('@lib/import/formats/IffSmusParser');
        if (isIffSmusFormat(buffer)) return await parseIffSmusFile(buffer, originalFileName, companionFiles);
      } catch (err) {
        console.warn(`[IffSmusParser] Native parse failed for ${filename}, falling back to UADE:`, err);
      }
      try {
        const { isSonixFormat, parseSonixFile } = await import('@lib/import/formats/SonixMusicDriverParser');
        if (isSonixFormat(buffer)) return await parseSonixFile(buffer, originalFileName);
      } catch (err) {
        console.warn(`[SonixMusicDriverParser] Native parse failed for ${filename}, falling back to UADE:`, err);
      }
    }
    const { parseUADEFile: parseUADE_smus } = await import('@lib/import/formats/UADEParser');
    return parseUADE_smus(buffer, originalFileName, prefs.uade ?? 'enhanced', subsong, preScannedMeta);
  }

  // ── Magnetic Fields Packer (.mfp / mfp.*) ────────────────────────────────
  // Two-file format: song data in .mfp, PCM samples in companion smp.* file.
  // Native parser extracts structure; UADE provides full audio with samples.
  if (/\.mfp$/i.test(filename) || /^mfp\./i.test((filename.split('/').pop() ?? filename).split('\\').pop() ?? filename)) {
        if (prefs.magneticFieldsPacker === 'native') {
      try {
        const { isMFPFormat, parseMFPFile } = await import('@lib/import/formats/MFPParser');
        if (isMFPFormat(buffer, originalFileName)) return await parseMFPFile(buffer, originalFileName);
      } catch (err) {
        console.warn(`[MFPParser] Native parse failed for ${filename}, falling back to MagneticFieldsPackerParser:`, err);
      }
      try {
        const { isMagneticFieldsPackerFormat, parseMagneticFieldsPackerFile } = await import('@lib/import/formats/MagneticFieldsPackerParser');
        if (isMagneticFieldsPackerFormat(buffer, originalFileName)) return await parseMagneticFieldsPackerFile(buffer, originalFileName);
      } catch (err) {
        console.warn(`[MagneticFieldsPackerParser] Native parse failed for ${filename}, falling back to UADE:`, err);
      }
    }
    const { parseUADEFile: parseUADE_mfp } = await import('@lib/import/formats/UADEParser');
    return parseUADE_mfp(buffer, originalFileName, prefs.uade ?? 'enhanced', subsong, preScannedMeta);
  }

  // ── Delta Music 1.0 (.dm, .dm1) — identified by "ALL " magic ──────────────
  if (/\.dm1?$/i.test(filename)) {
        if (prefs.deltaMusic1 === 'native') {
      try {
        const { isDeltaMusic1Format, parseDeltaMusic1File } = await import('@lib/import/formats/DeltaMusic1Parser');
        if (isDeltaMusic1Format(buffer)) {
          const result = await parseDeltaMusic1File(buffer, originalFileName);
          if (result) return result;
        }
      } catch (err) {
        console.warn(`[DeltaMusic1Parser] Native parse failed for ${filename}, falling back to UADE:`, err);
      }
    }
    const { parseUADEFile: parseUADE_dm1 } = await import('@lib/import/formats/UADEParser');
    return parseUADE_dm1(buffer, originalFileName, prefs.uade ?? 'enhanced', subsong, preScannedMeta);
  }

  // ── Richard Joseph Player (.rjp, RJP.*, .sng with RJP magic) ─────────────
  // Two-file format: song data (RJP.* / *.SNG) + samples (SMP.* / *.INS).
  // Magic: bytes[0..2]="RJP", bytes[4..7]="SMOD", bytes[12..15]=0.
  {
    const _rjpBase = (filename.split('/').pop() ?? filename).toLowerCase();
    const _mightBeRJP =
      /\.rjp$/i.test(filename) ||
      matchesPrefix(_rjpBase, 'rjp.') ||
      (/\.sng$/i.test(filename) && buffer.byteLength >= 16 &&
        new Uint8Array(buffer)[0] === 0x52 &&   // 'R'
        new Uint8Array(buffer)[1] === 0x4a &&   // 'J'
        new Uint8Array(buffer)[2] === 0x50);    // 'P'
    if (_mightBeRJP) {
            if (prefs.richardJoseph === 'native') {
        try {
          const { isRJPFormat, parseRJPFile } = await import('@lib/import/formats/RichardJosephParser');
          const _rjpBuf = new Uint8Array(buffer);
          if (isRJPFormat(_rjpBuf)) return await parseRJPFile(buffer, originalFileName);
        } catch (err) {
          console.warn(`[RichardJosephParser] Native parse failed for ${filename}, falling back to UADE:`, err);
        }
      }
      const { parseUADEFile: parseUADE_rjp } = await import('@lib/import/formats/UADEParser');
      return parseUADE_rjp(buffer, originalFileName, prefs.uade ?? 'enhanced', subsong, preScannedMeta);
    }
  }

  // ── ProTracker 3.6 IFF wrapper (FORM/MODL magic) ──────────────────────────
  // No dedicated extension — detected by FORM+MODL IFF magic bytes at offsets 0 and 8.
  // PT36Parser unwraps the PTDT chunk and parses it as a standard 31-sample MOD.
  if (prefs.pt36 === 'native' && buffer.byteLength >= 12) {
    const _pt36 = new Uint8Array(buffer);
    if (_pt36[0] === 0x46 && _pt36[1] === 0x4F && _pt36[2] === 0x52 && _pt36[3] === 0x4D &&
        _pt36[8] === 0x4D && _pt36[9] === 0x4F && _pt36[10] === 0x44 && _pt36[11] === 0x4C) {
      try {
        const { parsePT36File } = await import('@lib/import/formats/PT36Parser');
        return await parsePT36File(buffer, originalFileName);
      } catch (err) {
        console.warn(`[PT36Parser] Native parse failed for ${filename}, falling through to OpenMPT:`, err);
      }
    }
  }

  // ── SpeedySystem / SoundSmith (.ss) ───────────────────────────────────────
  // Apple IIgs SoundSmith/MegaTracker. External DOC RAM samples required;
  // UADE is preferred (bundles samples in module archives), but native is available.
  if (/\.ss$/i.test(filename)) {
        if (prefs.speedySystem === 'native') {
      try {
        const { isSpeedySystemFormat, parseSpeedySystemFile } = await import('@lib/import/formats/SpeedySystemParser');
        if (isSpeedySystemFormat(buffer)) return await parseSpeedySystemFile(buffer, originalFileName);
      } catch (err) {
        console.warn(`[SpeedySystemParser] Native parse failed for ${filename}, falling back to UADE:`, err);
      }
    }
    const { parseUADEFile: parseUADE_ss } = await import('@lib/import/formats/UADEParser');
    return parseUADE_ss(buffer, originalFileName, prefs.uade ?? 'enhanced', subsong, preScannedMeta);
  }

  // ── Tronic (.trc/.dp/.tro/.tronic) ───────────────────────────────────────
  // Amiga tracker by Stefan Hartmann. Native parser available.
  if (/\.(trc|dp|tro|tronic)$/i.test(filename)) {
        if (prefs.tronic === 'native') {
      try {
        const { isTronicFormat, parseTronicFile } = await import('@lib/import/formats/TronicParser');
        if (isTronicFormat(buffer)) return await parseTronicFile(buffer, originalFileName);
      } catch (err) {
        console.warn(`[TronicParser] Native parse failed for ${filename}, falling back to UADE:`, err);
      }
    }
    const { parseUADEFile: parseUADE_trc } = await import('@lib/import/formats/UADEParser');
    return parseUADE_trc(buffer, originalFileName, prefs.uade ?? 'enhanced', subsong, preScannedMeta);
  }

  // ── Dave Lowe (.dl / DL.* prefix) ─────────────────────────────────────────
  // Compiled 68k Amiga music format. Two variants: old and new. Both detected
  // by opcode patterns at offsets 0/4/8.
  {
    const _dlBase = (filename.split('/').pop() ?? filename).toLowerCase();
    const _mightBeDL = /\.dl$/i.test(filename) || /\.dl_deli$/i.test(filename) || matchesPrefix(_dlBase, 'dl.');
    if (_mightBeDL) {
            if (prefs.daveLowe === 'native') {
        try {
          const { isDaveLoweFormat, parseDaveLoweFile } = await import('@lib/import/formats/DaveLoweParser');
          const _dlBuf = new Uint8Array(buffer);
          if (isDaveLoweFormat(_dlBuf)) return await parseDaveLoweFile(buffer, originalFileName);
        } catch (err) {
          console.warn(`[DaveLoweParser] Native parse failed for ${filename}, trying DaveLoweNew:`, err);
        }
        try {
          const { isDaveLoweNewFormat, parseDaveLoweNewFile } = await import('@lib/import/formats/DaveLoweNewParser');
          if (isDaveLoweNewFormat(buffer)) return parseDaveLoweNewFile(buffer, originalFileName);
        } catch (err) {
          console.warn(`[DaveLoweNewParser] Native parse failed for ${filename}, falling back to UADE:`, err);
        }
      }
      const { parseUADEFile: parseUADE_dl } = await import('@lib/import/formats/UADEParser');
      return parseUADE_dl(buffer, originalFileName, prefs.uade ?? 'enhanced', subsong, preScannedMeta);
    }
  }

  // ── Leggless Music Editor (.lme / LME.*) ────────────────────────────────────
  // Amiga 4-channel format (Leggless Music Editor). Magic: "LME" at offset 0.
  {
    const _lmeBase = (filename.split('/').pop() ?? filename).split('\\').pop() ?? filename;
    const _mightBeLME = /\.lme$/i.test(filename) || matchesPrefix(_lmeBase.toLowerCase(), 'lme.');
    if (_mightBeLME) {
      const { isLMEFormat, parseLMEFile } = await import('@lib/import/formats/LMEParser');
      return withNativeThenUADE('lme', ctx,
        (buf: Uint8Array | ArrayBuffer, name: string) => { if (isLMEFormat(buf as ArrayBuffer)) return parseLMEFile(buf as ArrayBuffer, name); return null; },
        'LMEParser');
    }
  }

  // ── Medley (.ml) ─────────────────────────────────────────────────────────
  // Amiga 4-channel format (Medley tracker). Magic: "MSOB" at bytes[0..3].
  if (/\.ml$/i.test(filename)) {
    if (prefs.medley === 'native') {
      try {
        const { isMedleyFormat, parseMedleyFile } = await import('@lib/import/formats/MedleyParser');
        if (isMedleyFormat(buffer)) return parseMedleyFile(buffer, originalFileName);
      } catch (err) {
        console.warn(`[MedleyParser] Native parse failed for ${filename}, falling back to UADE:`, err);
      }
    }
    const { parseUADEFile: parseUADE_ml } = await import('@lib/import/formats/UADEParser');
    return parseUADE_ml(buffer, originalFileName, prefs.uade ?? 'enhanced', subsong, preScannedMeta);
  }

  // ── Mark Cooksey / Don Adan (mc.* / mcr.* / mco.* prefix) ─────────────────
  // Compiled 68k Amiga music format. Three sub-variants: Old (D040D040 magic),
  // New/Medium (601A + 48E780F0), and Rare (4DFA + DFF000 hardware register).
  {
    const _mcBase = getBasename(filename);
    const _mightBeMC = matchesPrefix(_mcBase, 'mc.') || matchesPrefix(_mcBase, 'mcr.') || matchesPrefix(_mcBase, 'mco.');
    if (_mightBeMC) {
      if (prefs.markCooksey === 'native') {
        try {
          const { isMarkCookseyFormat, parseMarkCookseyFile } = await import('@lib/import/formats/MarkCookseyParser');
          if (isMarkCookseyFormat(buffer, originalFileName)) return parseMarkCookseyFile(buffer, originalFileName);
        } catch (err) {
          console.warn(`[MarkCookseyParser] Native parse failed for ${filename}, falling back to UADE:`, err);
        }
      }
      const { parseUADEFile: parseUADE_mc } = await import('@lib/import/formats/UADEParser');
      return parseUADE_mc(buffer, originalFileName, prefs.uade ?? 'enhanced', subsong, preScannedMeta);
    }
  }

  // ── Jeroen Tel (jt.* / mon_old.* prefix) ────────────────────────────────────
  // Compiled 68k Amiga music format (Maniacs of Noise / Jeroen Tel).
  // Detection: scan first 40 bytes for 0x02390001 + structural checks.
  {
    const _jtBase = getBasename(filename);
    const _mightBeJT = matchesPrefix(_jtBase, 'jt.') || matchesPrefix(_jtBase, 'mon_old.');
    if (_mightBeJT) {
      if (prefs.jeroenTel === 'native') {
        try {
          const { isJeroenTelFormat, parseJeroenTelFile } = await import('@lib/import/formats/JeroenTelParser');
          if (isJeroenTelFormat(buffer, originalFileName)) return parseJeroenTelFile(buffer, originalFileName);
        } catch (err) {
          console.warn(`[JeroenTelParser] Native parse failed for ${filename}, falling back to UADE:`, err);
        }
      }
      const { parseUADEFile: parseUADE_jt } = await import('@lib/import/formats/UADEParser');
      return parseUADE_jt(buffer, originalFileName, prefs.uade ?? 'enhanced', subsong, preScannedMeta);
    }
  }

  // ── Quartet / Quartet PSG / Quartet ST (qpa.* / sqt.* / qts.* prefix) ──────
  {
    const _qBase = getBasename(filename);
    const _mightBeQuartet = matchesPrefix(_qBase, 'qpa.') || matchesPrefix(_qBase, 'sqt.') || matchesPrefix(_qBase, 'qts.');
    if (_mightBeQuartet) {
      if (prefs.quartet === 'native') {
        try {
          const { isQuartetFormat, parseQuartetFile } = await import('@lib/import/formats/QuartetParser');
          if (isQuartetFormat(buffer, originalFileName)) return parseQuartetFile(buffer, originalFileName);
        } catch (err) {
          console.warn(`[QuartetParser] Native parse failed for ${filename}, falling back to UADE:`, err);
        }
      }
      const { parseUADEFile: parseUADE_quartet } = await import('@lib/import/formats/UADEParser');
      return parseUADE_quartet(buffer, originalFileName, prefs.uade ?? 'enhanced', subsong, preScannedMeta);
    }
  }

  // ── Sound Master (sm.* / sm1.* / sm2.* / sm3.* / smpro.* prefix) ───────────
  {
    const _smBase = getBasename(filename);
    const _mightBeSM =
      matchesPrefix(_smBase, 'sm.') || matchesPrefix(_smBase, 'sm1.') ||
      matchesPrefix(_smBase, 'sm2.') || matchesPrefix(_smBase, 'sm3.') ||
      matchesPrefix(_smBase, 'smpro.');
    if (_mightBeSM) {
      if (prefs.soundMaster === 'native') {
        try {
          const { isSoundMasterFormat, parseSoundMasterFile } = await import('@lib/import/formats/SoundMasterParser');
          if (isSoundMasterFormat(buffer, originalFileName)) return parseSoundMasterFile(buffer, originalFileName);
        } catch (err) {
          console.warn(`[SoundMasterParser] Native parse failed for ${filename}, falling back to UADE:`, err);
        }
      }
      const { parseUADEFile: parseUADE_sm } = await import('@lib/import/formats/UADEParser');
      return parseUADE_sm(buffer, originalFileName, prefs.uade ?? 'enhanced', subsong, preScannedMeta);
    }
  }

  // ── ZoundMonitor (sng.* prefix OR *.sng extension) ──────────────────────────
  // Amiga 4-channel PCM tracker by A.J. van Dongen.
  // Matched by: "sng." prefix (UADE convention) OR ".sng" extension (non-RJP files;
  // Richard Joseph .sng files are caught earlier by the RJP magic check).
  // Detection: computed offset from bytes[0..1], then "df?:" or "?amp" tag check.
  {
    const _zBase = getBasename(filename);
    if (matchesPrefix(_zBase, 'sng.') || _zBase.endsWith('.sng')) {
      if (prefs.zoundMonitor === 'native') {
        try {
          const { isZoundMonitorFormat, parseZoundMonitorFile } = await import('@lib/import/formats/ZoundMonitorParser');
          if (isZoundMonitorFormat(buffer, originalFileName)) return parseZoundMonitorFile(buffer, originalFileName, companionFiles);
        } catch (err) {
          console.warn(`[ZoundMonitorParser] Native parse failed for ${filename}, falling back to UADE:`, err);
        }
      }
      const { parseUADEFile: parseUADE_sng } = await import('@lib/import/formats/UADEParser');
      return parseUADE_sng(buffer, originalFileName, prefs.uade ?? 'enhanced', subsong, preScannedMeta);
    }
  }

  // ── Future Player (.fp / FP.*) ───────────────────────────────────────────────
  // Amiga 4-channel format (Future Player). Magic: 0x000003F3 + "F.PLAYER" at offsets 32-39.
  if (
    /\.fp$/i.test(filename) ||
    /^fp\./i.test((filename.split('/').pop() ?? filename).split('\\').pop() ?? filename)
  ) {
    const { isFuturePlayerFormat, parseFuturePlayerFile } = await import('@lib/import/formats/FuturePlayerParser');
    return withNativeThenUADE('futurePlayer', ctx,
      (buf: Uint8Array | ArrayBuffer, name: string) => { if (isFuturePlayerFormat(buf as ArrayBuffer)) return parseFuturePlayerFile(buf as ArrayBuffer, name); return null; },
      'FuturePlayerParser');
  }

  // ── TCB Tracker (tcb.*) ──────────────────────────────────────────────────────
  {
    const _tcbBase = getBasename(filename);
    if (matchesPrefix(_tcbBase, 'tcb.')) {
      if (prefs.tcbTracker === 'native') {
        try {
          const { isTCBTrackerFormat, parseTCBTrackerFile } = await import('@lib/import/formats/TCBTrackerParser');
          if (isTCBTrackerFormat(buffer, originalFileName)) return parseTCBTrackerFile(buffer, originalFileName);
        } catch (err) {
          console.warn(`[TCBTrackerParser] Native parse failed for ${filename}, falling back to UADE:`, err);
        }
      }
      const { parseUADEFile: parseUADE_tcb } = await import('@lib/import/formats/UADEParser');
      return parseUADE_tcb(buffer, originalFileName, prefs.uade ?? 'enhanced', subsong, preScannedMeta);
    }
  }

  // ── Jason Page (jpn.* / jpnd.* / jp.*) ──────────────────────────────────────
  // Amiga 4-channel format. Three sub-variants (old/new/raw binary).
  {
    const _jpBase = (filename.split('/').pop() ?? filename).split('\\').pop() ?? filename;
    const _mightBeJP =
      matchesPrefix(_jpBase.toLowerCase(), 'jpn.') ||
      matchesPrefix(_jpBase.toLowerCase(), 'jpnd.') ||
      matchesPrefix(_jpBase.toLowerCase(), 'jp.');
    if (_mightBeJP) {
            if (prefs.jasonPage === 'native') {
        try {
          const { isJasonPageFormat, parseJasonPageFile } = await import('@lib/import/formats/JasonPageParser');
          if (isJasonPageFormat(buffer, originalFileName)) return await parseJasonPageFile(buffer, originalFileName);
        } catch (err) {
          console.warn(`[JasonPageParser] Native parse failed for ${filename}, falling back to UADE:`, err);
        }
      }
      const { parseUADEFile: parseUADE_jp } = await import('@lib/import/formats/UADEParser');
      return parseUADE_jp(buffer, originalFileName, prefs.uade ?? 'enhanced', subsong, preScannedMeta);
    }
  }

  // ── MMDC / MED Packer (mmdc.*) ───────────────────────────────────────────────
  {
    const _mmdcBase = getBasename(filename);
    if (matchesPrefix(_mmdcBase, 'mmdc.')) {
      if (prefs.mmdc === 'native') {
        try {
          const { isMMDCFormat, parseMMDCFile } = await import('@lib/import/formats/MMDCParser');
          if (isMMDCFormat(buffer)) return parseMMDCFile(buffer, originalFileName);
        } catch (err) {
          console.warn(`[MMDCParser] Native parse failed for ${filename}, falling back to UADE:`, err);
        }
      }
      const { parseUADEFile: parseUADE_mmdc } = await import('@lib/import/formats/UADEParser');
      return parseUADE_mmdc(buffer, originalFileName, prefs.uade ?? 'enhanced', subsong, preScannedMeta);
    }
  }

  // ── Professional Sound Artists (psa.*) ───────────────────────────────────────
  {
    const _psaBase = getBasename(filename);
    if (matchesPrefix(_psaBase, 'psa.')) {
      if (prefs.psa === 'native') {
        try {
          const { isPSAFormat, parsePSAFile } = await import('@lib/import/formats/PSAParser');
          if (isPSAFormat(buffer)) return parsePSAFile(buffer, originalFileName);
        } catch (err) {
          console.warn(`[PSAParser] Native parse failed for ${filename}, falling back to UADE:`, err);
        }
      }
      const { parseUADEFile: parseUADE_psa } = await import('@lib/import/formats/UADEParser');
      return parseUADE_psa(buffer, originalFileName, prefs.uade ?? 'enhanced', subsong, preScannedMeta);
    }
  }

  // ── Steve Turner (jpo.* / jpold.*) ───────────────────────────────────────────
  {
    const _jpoBase = getBasename(filename);
    if (matchesPrefix(_jpoBase, 'jpo.') || matchesPrefix(_jpoBase, 'jpold.')) {
      if (prefs.steveTurner === 'native') {
        try {
          const { isSteveTurnerFormat, parseSteveTurnerFile } = await import('@lib/import/formats/SteveTurnerParser');
          if (isSteveTurnerFormat(buffer)) return parseSteveTurnerFile(buffer, originalFileName);
        } catch (err) {
          console.warn(`[SteveTurnerParser] Native parse failed for ${filename}, falling back to UADE:`, err);
        }
      }
      const { parseUADEFile: parseUADE_jpo } = await import('@lib/import/formats/UADEParser');
      return parseUADE_jpo(buffer, originalFileName, prefs.uade ?? 'enhanced', subsong, preScannedMeta);
    }
  }

  // ── TME (.tme / TME.*) ───────────────────────────────────────────────────────
  {
    const _tmeBase = getBasename(filename);
    if (/\.tme$/i.test(filename) || matchesPrefix(_tmeBase, 'tme.')) {
      if (prefs.tme === 'native') {
        try {
          const { isTMEFormat, parseTMEFile } = await import('@lib/import/formats/TMEParser');
          if (isTMEFormat(buffer)) return parseTMEFile(buffer, originalFileName);
        } catch (err) {
          console.warn(`[TMEParser] Native parse failed for ${filename}, falling back to UADE:`, err);
        }
      }
      const { parseUADEFile: parseUADE_tme } = await import('@lib/import/formats/UADEParser');
      return parseUADE_tme(buffer, originalFileName, prefs.uade ?? 'enhanced', subsong, preScannedMeta);
    }
  }

  // ── Infogrames DUM (.dum) ────────────────────────────────────────────────────
  // Infogrames music format used in Gobliins, Ween, etc. Two-file format
  // with external .dum.set sample data. Detection: header offset at u16BE(0).
  if (/\.dum$/i.test(filename)) {
    const { isInfogramesFormat, parseInfogramesFile } = await import('@lib/import/formats/InfogramesParser');
    return withNativeThenUADE('infogrames', ctx,
      (buf: Uint8Array | ArrayBuffer, name: string) => { if (isInfogramesFormat(buf as ArrayBuffer)) return parseInfogramesFile(buf as ArrayBuffer, name); return null; },
      'InfogramesParser');
  }

  // ── PSA (.psa / PSA.*) ───────────────────────────────────────────────────────
  // Professional Sound Artists format. Magic: bytes[0..3] == 0x50534100 ("PSA\0").
  if (
    /\.psa$/i.test(filename) ||
    /^psa\./i.test((filename.split('/').pop() ?? filename).split('\\').pop() ?? filename)
  ) {
    const { isPSAFormat, parsePSAFile } = await import('@lib/import/formats/PSAParser');
    return withNativeThenUADE('psa', ctx,
      (buf: Uint8Array | ArrayBuffer, name: string) => { if (isPSAFormat(buf as ArrayBuffer)) return parsePSAFile(buf as ArrayBuffer, name); return null; },
      'PSAParser');
  }

  // ── MMDC (.mmdc / MMDC.*) ────────────────────────────────────────────────────
  // MED Packer format by Antony "Ratt" Crowther. Magic: bytes[0..3] == 'MMDC'.
  if (
    /\.mmdc$/i.test(filename) ||
    /^mmdc\./i.test((filename.split('/').pop() ?? filename).split('\\').pop() ?? filename)
  ) {
    const { isMMDCFormat, parseMMDCFile } = await import('@lib/import/formats/MMDCParser');
    return withNativeThenUADE('mmdc', ctx,
      (buf: Uint8Array | ArrayBuffer, name: string) => { if (isMMDCFormat(buf as ArrayBuffer)) return parseMMDCFile(buf as ArrayBuffer, name); return null; },
      'MMDCParser');
  }

  // ── Steve Turner (.jpo / .jpold / JPO.*) ────────────────────────────────────
  // Amiga compiled 68k format (JPO. prefix). Detection: 4x 0x2B7C at offsets
  // 0/8/16/24, 0x303C00FF at 0x20, 0x32004EB9 at 0x24, 0x4E75 at 0x2C.
  if (
    /\.jpold?$/i.test(filename) ||
    /^jpo\./i.test((filename.split('/').pop() ?? filename).split('\\').pop() ?? filename)
  ) {
    const { isSteveTurnerFormat, parseSteveTurnerFile } = await import('@lib/import/formats/SteveTurnerParser');
    return withNativeThenUADE('steveTurner', ctx,
      (buf: Uint8Array | ArrayBuffer, name: string) => { if (isSteveTurnerFormat(buf as ArrayBuffer)) return parseSteveTurnerFile(buf as ArrayBuffer, name); return null; },
      'SteveTurnerParser');
  }

  // ── TimeTracker (TMK.* prefix) ───────────────────────────────────────────
  // Amiga format by BrainWasher & FireBlade. UADE prefix: TMK.
  {
    const _tmkBase = getBasename(filename);
    if (matchesPrefix(_tmkBase, 'tmk.')) {
      const { isTimeTrackerFormat, parseTimeTrackerFile } = await import('@lib/import/formats/TimeTrackerParser');
      return withNativeThenUADE('timeTracker', ctx,
        (buf: Uint8Array | ArrayBuffer, name: string) => { if (isTimeTrackerFormat(buf as ArrayBuffer)) return parseTimeTrackerFile(buf as ArrayBuffer, name); return null; },
        'TimeTrackerParser');
    }
  }

  // ── ChipTracker (KRIS.* prefix) ──────────────────────────────────────────
  // Amiga format identified by 'KRIS' at offset 952. UADE prefix: KRIS.
  {
    const _krisBase = getBasename(filename);
    if (matchesPrefix(_krisBase, 'kris.')) {
            if (prefs.kris === 'native') {
        try {
          const { isKRISFormat, parseKRISFile } = await import('@lib/import/formats/KRISParser');
          if (isKRISFormat(buffer)) return await parseKRISFile(buffer, originalFileName);
        } catch (err) {
          console.warn(`[KRISParser] Native parse failed for ${filename}, falling back to UADE:`, err);
        }
      }
      const { parseUADEFile: parseUADE_kris } = await import('@lib/import/formats/UADEParser');
      return parseUADE_kris(buffer, originalFileName, prefs.uade ?? 'enhanced', subsong, preScannedMeta);
    }
  }

  // ── Cinemaware (CIN.* prefix) ─────────────────────────────────────────────
  // Amiga format with 'IBLK'+'ASEQ' magic. UADE prefix: CIN.
  {
    const _cinBase = getBasename(filename);
    if (matchesPrefix(_cinBase, 'cin.')) {
      const { isCinemawareFormat, parseCinemawareFile } = await import('@lib/import/formats/CinemawareParser');
      return withNativeThenUADE('cinemaware', ctx,
        (buf: Uint8Array | ArrayBuffer, name: string) => { if (isCinemawareFormat(buf as ArrayBuffer)) return parseCinemawareFile(buf as ArrayBuffer, name); return null; },
        'CinemawareParser');
    }
  }

  // ── NovoTrade Packer (NTP.* prefix) ──────────────────────────────────────
  // Amiga chunked format: MODU/BODY/SAMP chunks. UADE prefix: NTP.
  {
    const _ntpBase = getBasename(filename);
    if (matchesPrefix(_ntpBase, 'ntp.')) {
      const { isNovoTradePackerFormat, parseNovoTradePackerFile } = await import('@lib/import/formats/NovoTradePackerParser');
      return withNativeThenUADE('novoTradePacker', ctx,
        (buf: Uint8Array | ArrayBuffer, name: string) => { if (isNovoTradePackerFormat(buf as ArrayBuffer)) return parseNovoTradePackerFile(buf as ArrayBuffer, name); return null; },
        'NovoTradePackerParser');
    }
  }

  // ── Alcatraz Packer (ALP.* prefix) ───────────────────────────────────────
  // Amiga format with 'PAn\x10' magic. UADE prefix: ALP.
  {
    const _alpBase = getBasename(filename);
    if (matchesPrefix(_alpBase, 'alp.')) {
      const { isAlcatrazPackerFormat, parseAlcatrazPackerFile } = await import('@lib/import/formats/AlcatrazPackerParser');
      return withNativeThenUADE('alcatrazPacker', ctx,
        (buf: Uint8Array | ArrayBuffer, name: string) => { if (isAlcatrazPackerFormat(buf as ArrayBuffer)) return parseAlcatrazPackerFile(buf as ArrayBuffer, name); return null; },
        'AlcatrazPackerParser');
    }
  }

  // ── Blade Packer (UDS.* prefix) ──────────────────────────────────────────
  // Amiga 8-channel format with 0x538F4E47 magic. UADE prefix: UDS.
  {
    const _udsBase = getBasename(filename);
    if (matchesPrefix(_udsBase, 'uds.')) {
      const { isBladePackerFormat, parseBladePackerFile } = await import('@lib/import/formats/BladePackerParser');
      return withNativeThenUADE('bladePacker', ctx,
        (buf: Uint8Array | ArrayBuffer, name: string) => { if (isBladePackerFormat(buf as ArrayBuffer)) return parseBladePackerFile(buf as ArrayBuffer, name); return null; },
        'BladePackerParser');
    }
  }

  // ── Tomy Tracker (SG.* prefix) ────────────────────────────────────────────
  // Amiga format with size-based structural detection. UADE prefix: SG.
  {
    const _sgBase = getBasename(filename);
    if (matchesPrefix(_sgBase, 'sg.')) {
      const { isTomyTrackerFormat, parseTomyTrackerFile } = await import('@lib/import/formats/TomyTrackerParser');
      return withNativeThenUADE('tomyTracker', ctx,
        (buf: Uint8Array | ArrayBuffer, name: string) => { if (isTomyTrackerFormat(buf as ArrayBuffer)) return parseTomyTrackerFile(buf as ArrayBuffer, name); return null; },
        'TomyTrackerParser');
    }
  }

  // ── Images Music System (IMS.* prefix) ────────────────────────────────────
  // Amiga format with offset-arithmetic detection. UADE prefix: IMS.
  // Note: .ims extension files are handled earlier with native IMSParser.
  {
    const _imspBase = getBasename(filename);
    if (matchesPrefix(_imspBase, 'ims.')) {
      const { isImagesMusicSystemFormat, parseImagesMusicSystemFile } = await import('@lib/import/formats/ImagesMusicSystemParser');
      return withNativeThenUADE('imagesMusicSystem', ctx,
        (buf: Uint8Array | ArrayBuffer, name: string) => { if (isImagesMusicSystemFormat(buf as ArrayBuffer)) return parseImagesMusicSystemFile(buf as ArrayBuffer, name); return null; },
        'ImagesMusicSystemParser');
    }
  }

  // ── Fashion Tracker (EX.* prefix) ────────────────────────────────────────
  {
    const _exBase = getBasename(filename);
    if (matchesPrefix(_exBase, 'ex.')) {
      const { isFashionTrackerFormat, parseFashionTrackerFile } = await import('@lib/import/formats/FashionTrackerParser');
      return withNativeThenUADE('fashionTracker', ctx,
        (buf: Uint8Array | ArrayBuffer, name: string) => { if (isFashionTrackerFormat(buf as ArrayBuffer)) return parseFashionTrackerFile(buf as ArrayBuffer, name); return null; },
        'FashionTrackerParser');
    }
  }

  // ── MultiMedia Sound (MMS.* / SFX20.* prefix) ────────────────────────────
  {
    const _mmsBase = getBasename(filename);
    if (matchesPrefix(_mmsBase, 'mms.') || matchesPrefix(_mmsBase, 'sfx20.')) {
      const { isMultiMediaSoundFormat, parseMultiMediaSoundFile } = await import('@lib/import/formats/MultiMediaSoundParser');
      return withNativeThenUADE('multiMediaSound', ctx,
        (buf: Uint8Array | ArrayBuffer, name: string) => { if (isMultiMediaSoundFormat(buf as ArrayBuffer)) return parseMultiMediaSoundFile(buf as ArrayBuffer, name); return null; },
        'MultiMediaSoundParser');
    }
  }

  // ── Sean Conran (SCR.* prefix) ───────────────────────────────────────────
  // Compiled 68k Amiga music. Three detection paths with specific 68k opcodes + scan.
  {
    const _scrBase = getBasename(filename);
    if (matchesPrefix(_scrBase, 'scr.')) {
            if (prefs.seanConran === 'native') {
        try {
          const { isSeanConranFormat, parseSeanConranFile } = await import('@lib/import/formats/SeanConranParser');
          const _scrBuf = new Uint8Array(buffer);
          if (isSeanConranFormat(_scrBuf)) return await parseSeanConranFile(buffer, originalFileName);
        } catch (err) {
          console.warn(`[SeanConranParser] Native parse failed for ${filename}, falling back to UADE:`, err);
        }
      }
      const { parseUADEFile: parseUADE_scr } = await import('@lib/import/formats/UADEParser');
      return parseUADE_scr(buffer, originalFileName, prefs.uade ?? 'enhanced', subsong, preScannedMeta);
    }
  }

  // ── Thomas Hermann (THM.* prefix) ────────────────────────────────────────
  // Compiled 68k Amiga music. Relocation table structure with arithmetic checks.
  {
    const _thmBase = getBasename(filename);
    if (matchesPrefix(_thmBase, 'thm.')) {
            if (prefs.thomasHermann === 'native') {
        try {
          const { isThomasHermannFormat, parseThomasHermannFile } = await import('@lib/import/formats/ThomasHermannParser');
          const _thmBuf = new Uint8Array(buffer);
          if (isThomasHermannFormat(_thmBuf)) return await parseThomasHermannFile(buffer, originalFileName);
        } catch (err) {
          console.warn(`[ThomasHermannParser] Native parse failed for ${filename}, falling back to UADE:`, err);
        }
      }
      const { parseUADEFile: parseUADE_thm } = await import('@lib/import/formats/UADEParser');
      return parseUADE_thm(buffer, originalFileName, prefs.uade ?? 'enhanced', subsong, preScannedMeta);
    }
  }

  // ── Titanics Packer (TITS.* prefix) ──────────────────────────────────────
  // Amiga packed music format. Detection: 128 words at offset 180 (even, non-zero).
  {
    const _titsBase = getBasename(filename);
    if (matchesPrefix(_titsBase, 'tits.')) {
      const { isTitanicsPackerFormat, parseTitanicsPackerFile } = await import('@lib/import/formats/TitanicsPackerParser');
      return withNativeThenUADE('titanicsPacker', ctx,
        (buf: Uint8Array | ArrayBuffer, name: string) => { if (isTitanicsPackerFormat(buf as ArrayBuffer)) return parseTitanicsPackerFile(buf as ArrayBuffer, name); return null; },
        'TitanicsPackerParser');
    }
  }

  // ── Kris Hatlelid (KH.* prefix) ──────────────────────────────────────────
  // Compiled 68k Amiga music. Fixed-offset pattern with 0x000003F3 header.
  {
    const _khBase = getBasename(filename);
    if (matchesPrefix(_khBase, 'kh.')) {
      const { isKrisHatlelidFormat, parseKrisHatlelidFile } = await import('@lib/import/formats/KrisHatlelidParser');
      return withNativeThenUADE('krisHatlelid', ctx,
        (buf: Uint8Array | ArrayBuffer, name: string) => { if (isKrisHatlelidFormat(buf as ArrayBuffer)) return parseKrisHatlelidFile(buf as ArrayBuffer, name); return null; },
        'KrisHatlelidParser');
    }
  }

  // ── NTSP System (TWO.* prefix) ───────────────────────────────────────────
  // Amiga 2-file packed format. Magic: 'SPNT' at offset 0 + non-zero at offset 4.
  {
    const _twoBase = getBasename(filename);
    if (matchesPrefix(_twoBase, 'two.')) {
      const { isNTSPFormat, parseNTSPFile } = await import('@lib/import/formats/NTSPParser');
      return withNativeThenUADE('ntsp', ctx,
        (buf: Uint8Array | ArrayBuffer, name: string) => { if (isNTSPFormat(buf as ArrayBuffer)) return parseNTSPFile(buf as ArrayBuffer, name); return null; },
        'NTSPParser');
    }
  }

  // ── UFO / MicroProse (MUS.* / UFO.* prefix) ──────────────────────────────
  // IFF-based 4-channel Amiga format. FORM+DDAT+BODY+CHAN structure.
  {
    const _ufoBase = getBasename(filename);
    if (matchesPrefix(_ufoBase, 'mus.') || matchesPrefix(_ufoBase, 'ufo.')) {
      const { isUFOFormat, parseUFOFile } = await import('@lib/import/formats/UFOParser');
      return withNativeThenUADE('ufo', ctx,
        (buf: Uint8Array | ArrayBuffer, name: string) => { if (isUFOFormat(buf as ArrayBuffer)) return parseUFOFile(buf as ArrayBuffer, name); return null; },
        'UFOParser');
    }
  }

  // ── Mosh Packer (MOSH.* prefix) ──────────────────────────────────────────
  // SoundTracker-compatible Amiga packed format. 31 sample headers + M.K. at 378.
  {
    const _moshBase = getBasename(filename);
    if (matchesPrefix(_moshBase, 'mosh.')) {
      const { isMoshPackerFormat, parseMoshPackerFile } = await import('@lib/import/formats/MoshPackerParser');
      return withNativeThenUADE('moshPacker', ctx,
        (buf: Uint8Array | ArrayBuffer, name: string) => { if (isMoshPackerFormat(buf as ArrayBuffer)) return parseMoshPackerFile(buf as ArrayBuffer, name); return null; },
        'MoshPackerParser');
    }
  }

  // ── Mugician (MUG.* prefix) ───────────────────────────────────────────────
  // Same format as .mug/.dmu — " MUGICIAN/SOFTEYES 1990" signature at offset 0.
  {
    const _mugBase = getBasename(filename);
    if (matchesPrefix(_mugBase, 'mug.')) {
      const { parseDigitalMugicianFile } = await import('@lib/import/formats/DigitalMugicianParser');
      return withNativeThenUADE('mugician', ctx, (buf: Uint8Array | ArrayBuffer, name: string) => parseDigitalMugicianFile(buf as ArrayBuffer, name), 'DigitalMugicianParser');
    }
  }

  // ── Mugician II (MUG2.* prefix) ───────────────────────────────────────────
  // Same format as .mug2/.dmu2 — " MUGICIAN2/SOFTEYES 1990" signature at offset 0.
  {
    const _mug2Base = getBasename(filename);
    if (matchesPrefix(_mug2Base, 'mug2.')) {
      const { parseDigitalMugicianFile } = await import('@lib/import/formats/DigitalMugicianParser');
      return withNativeThenUADE('mugician', ctx, (buf: Uint8Array | ArrayBuffer, name: string) => parseDigitalMugicianFile(buf as ArrayBuffer, name), 'DigitalMugicianParser');
    }
  }

  // ── Core Design (CORE.* prefix) ───────────────────────────────────────────
  {
    const _coreBase = getBasename(filename);
    if (matchesPrefix(_coreBase, 'core.')) {
      const { isCoreDesignFormat, parseCoreDesignFile } = await import('@lib/import/formats/CoreDesignParser');
      return withNativeThenUADE('coreDesign', ctx,
        (buf: Uint8Array | ArrayBuffer, name: string) => { if (isCoreDesignFormat(buf as ArrayBuffer)) return parseCoreDesignFile(buf as ArrayBuffer, name); return null; },
        'CoreDesignParser');
    }
  }

  // ── Janko Mrsic-Flogel (JMF.* prefix) ────────────────────────────────────
  {
    const _jmfBase = getBasename(filename);
    if (matchesPrefix(_jmfBase, 'jmf.')) {
      const { isJankoMrsicFlogelFormat, parseJankoMrsicFlogelFile } = await import('@lib/import/formats/JankoMrsicFlogelParser');
      return withNativeThenUADE('jankoMrsicFlogel', ctx,
        (buf: Uint8Array | ArrayBuffer, name: string) => { if (isJankoMrsicFlogelFormat(buf as ArrayBuffer)) return parseJankoMrsicFlogelFile(buf as ArrayBuffer, name); return null; },
        'JankoMrsicFlogelParser');
    }
  }

  // ── Special FX (JD.* prefix) ──────────────────────────────────────────────
  {
    const _jdBase = getBasename(filename);
    if (matchesPrefix(_jdBase, 'jd.')) {
      const { isSpecialFXFormat, parseSpecialFXFile } = await import('@lib/import/formats/SpecialFXParser');
      return withNativeThenUADE('specialFX', ctx,
        (buf: Uint8Array | ArrayBuffer, name: string) => { if (isSpecialFXFormat(buf as ArrayBuffer)) return parseSpecialFXFile(buf as ArrayBuffer, name); return null; },
        'SpecialFXParser');
    }
  }

  // ── Sound Player / Steve Barrett (SJS.* prefix) ───────────────────────────
  {
    const _sjsBase = getBasename(filename);
    if (matchesPrefix(_sjsBase, 'sjs.')) {
      const { isSoundPlayerFormat, parseSoundPlayerFile } = await import('@lib/import/formats/SoundPlayerParser');
      return withNativeThenUADE('soundPlayer', ctx,
        (buf: Uint8Array | ArrayBuffer, name: string) => { if (isSoundPlayerFormat(buf as ArrayBuffer)) return parseSoundPlayerFile(buf as ArrayBuffer, name); return null; },
        'SoundPlayerParser');
    }
  }

  // ── Nick Pelling Packer (NPP.* prefix) ────────────────────────────────────
  {
    const _nppBase = getBasename(filename);
    if (matchesPrefix(_nppBase, 'npp.')) {
      const { isNickPellingPackerFormat, parseNickPellingPackerFile } = await import('@lib/import/formats/NickPellingPackerParser');
      return withNativeThenUADE('nickPellingPacker', ctx,
        (buf: Uint8Array | ArrayBuffer, name: string) => { if (isNickPellingPackerFormat(buf as ArrayBuffer)) return parseNickPellingPackerFile(buf as ArrayBuffer, name); return null; },
        'NickPellingPackerParser');
    }
  }

  // ── Peter Verswyvelen Packer (PVP.* prefix) ───────────────────────────────
  {
    const _pvpBase = getBasename(filename);
    if (matchesPrefix(_pvpBase, 'pvp.')) {
      const { isPeterVerswyvelenPackerFormat, parsePeterVerswyvelenPackerFile } = await import('@lib/import/formats/PeterVerswyvelenPackerParser');
      return withNativeThenUADE('peterVerswyvelenPacker', ctx,
        (buf: Uint8Array | ArrayBuffer, name: string) => { if (isPeterVerswyvelenPackerFormat(buf as ArrayBuffer)) return parsePeterVerswyvelenPackerFile(buf as ArrayBuffer, name); return null; },
        'PeterVerswyvelenPackerParser');
    }
  }

  // ── Wally Beben (WB.* prefix) ─────────────────────────────────────────────
  {
    const _wbBase = getBasename(filename);
    if (matchesPrefix(_wbBase, 'wb.')) {
      const { isWallyBebenFormat, parseWallyBebenFile } = await import('@lib/import/formats/WallyBebenParser');
      return withNativeThenUADE('wallyBeben', ctx,
        (buf: Uint8Array | ArrayBuffer, name: string) => { if (isWallyBebenFormat(buf as ArrayBuffer)) return parseWallyBebenFile(buf as ArrayBuffer, name); return null; },
        'WallyBebenParser');
    }
  }

  // ── Steve Barrett (SB.* prefix) ───────────────────────────────────────────
  {
    const _sbBase = getBasename(filename);
    if (matchesPrefix(_sbBase, 'sb.')) {
      const { isSteveBarrettFormat, parseSteveBarrettFile } = await import('@lib/import/formats/SteveBarrettParser');
      return withNativeThenUADE('steveBarrett', ctx,
        (buf: Uint8Array | ArrayBuffer, name: string) => { if (isSteveBarrettFormat(buf as ArrayBuffer)) return parseSteveBarrettFile(buf as ArrayBuffer, name); return null; },
        'SteveBarrettParser');
    }
  }

  // ── Paul Summers (SNK.* prefix) ───────────────────────────────────────────
  {
    const _snkBase = getBasename(filename);
    if (matchesPrefix(_snkBase, 'snk.')) {
      const { isPaulSummersFormat, parsePaulSummersFile } = await import('@lib/import/formats/PaulSummersParser');
      return withNativeThenUADE('paulSummers', ctx,
        (buf: Uint8Array | ArrayBuffer, name: string) => { if (isPaulSummersFormat(buf as ArrayBuffer)) return parsePaulSummersFile(buf as ArrayBuffer, name); return null; },
        'PaulSummersParser');
    }
  }

  // ── Desire (DSR.* prefix) ─────────────────────────────────────────────────
  // Amiga 4-channel format with specific 68k opcode pattern. UADE prefix: DSR.
  {
    const _dsrBase = getBasename(filename);
    if (matchesPrefix(_dsrBase, 'dsr.')) {
      const { isDesireFormat, parseDesireFile } = await import('@lib/import/formats/DesireParser');
      return withNativeThenUADE('desire', ctx,
        (buf: Uint8Array | ArrayBuffer, name: string) => { if (isDesireFormat(buf as ArrayBuffer)) return parseDesireFile(buf as ArrayBuffer, name); return null; },
        'DesireParser');
    }
  }

  // ── Dave Lowe New (DLN.* prefix) ──────────────────────────────────────────
  // New-style Dave Lowe Amiga format with table-based detection. UADE prefix: DLN.
  {
    const _dlnBase = getBasename(filename);
    if (matchesPrefix(_dlnBase, 'dln.')) {
      const { isDaveLoweNewFormat, parseDaveLoweNewFile } = await import('@lib/import/formats/DaveLoweNewParser');
      return withNativeThenUADE('daveLowe', ctx,
        (buf: Uint8Array | ArrayBuffer, name: string) => { if (isDaveLoweNewFormat(buf as ArrayBuffer)) return parseDaveLoweNewFile(buf as ArrayBuffer, name); return null; },
        'DaveLoweNewParser');
    }
  }

  // ── Martin Walker (AVP.* / MW.* prefix) ──────────────────────────────────
  // Amiga 5-variant format. UADE prefixes: avp, mw (different from .avp/.mw extensions).
  {
    const _mwBase = getBasename(filename);
    if (matchesPrefix(_mwBase, 'avp.') || matchesPrefix(_mwBase, 'mw.')) {
      const { isMartinWalkerFormat, parseMartinWalkerFile } = await import('@lib/import/formats/MartinWalkerParser');
      return withNativeThenUADE('martinWalker', ctx,
        (buf: Uint8Array | ArrayBuffer, name: string) => { if (isMartinWalkerFormat(buf as ArrayBuffer)) return parseMartinWalkerFile(buf as ArrayBuffer, name); return null; },
        'MartinWalkerParser');
    }
  }

  // ── Paul Shields (PS.* prefix) ────────────────────────────────────────────
  // Amiga 3-variant format with zero-prefix header. UADE prefix: ps.
  {
    const _psBase = getBasename(filename);
    if (matchesPrefix(_psBase, 'ps.')) {
      const { isPaulShieldsFormat, parsePaulShieldsFile } = await import('@lib/import/formats/PaulShieldsParser');
      return withNativeThenUADE('paulShields', ctx,
        (buf: Uint8Array | ArrayBuffer, name: string) => { if (isPaulShieldsFormat(buf as ArrayBuffer)) return parsePaulShieldsFile(buf as ArrayBuffer, name); return null; },
        'PaulShieldsParser');
    }
  }

  // ── Paul Robotham (DAT.* prefix) ──────────────────────────────────────────
  // Amiga format with structured pointer table. UADE prefix: dat.
  {
    const _datBase = getBasename(filename);
    if (matchesPrefix(_datBase, 'dat.')) {
      const { isPaulRobothamFormat, parsePaulRobothamFile } = await import('@lib/import/formats/PaulRobothamParser');
      return withNativeThenUADE('paulRobotham', ctx,
        (buf: Uint8Array | ArrayBuffer, name: string) => { if (isPaulRobothamFormat(buf as ArrayBuffer)) return parsePaulRobothamFile(buf as ArrayBuffer, name); return null; },
        'PaulRobothamParser');
    }
  }

  // ── Pierre Adane Packer (PAP.* prefix) ────────────────────────────────────
  // Amiga format with 4-word offset header. UADE prefix: pap.
  {
    const _papBase = getBasename(filename);
    if (matchesPrefix(_papBase, 'pap.')) {
      const { isPierreAdaneFormat, parsePierreAdaneFile } = await import('@lib/import/formats/PierreAdaneParser');
      return withNativeThenUADE('pierreAdane', ctx,
        (buf: Uint8Array | ArrayBuffer, name: string) => { if (isPierreAdaneFormat(buf as ArrayBuffer)) return parsePierreAdaneFile(buf as ArrayBuffer, name); return null; },
        'PierreAdaneParser');
    }
  }

  // ── Anders 0land (HOT.* prefix) ───────────────────────────────────────────
  // Amiga 3-chunk format (mpl/mdt/msm). UADE prefix: hot.
  {
    const _hotBase = getBasename(filename);
    if (matchesPrefix(_hotBase, 'hot.')) {
            if (prefs.anders0land === 'native') {
        try {
          const { isAnders0landFormat, parseAnders0landFile } = await import('@lib/import/formats/Anders0landParser');
          if (isAnders0landFormat(buffer, originalFileName)) return await parseAnders0landFile(buffer, originalFileName);
        } catch (err) {
          console.warn(`[Anders0landParser] Native parse failed for ${filename}, falling back to UADE:`, err);
        }
      }
      const { parseUADEFile: parseUADE_hot } = await import('@lib/import/formats/UADEParser');
      return parseUADE_hot(buffer, originalFileName, prefs.uade ?? 'enhanced', subsong, preScannedMeta);
    }
  }

  // ── Andrew Parton (BYE.* prefix) ──────────────────────────────────────────
  // Amiga format with 'BANK' magic + chip-RAM pointer table. UADE prefix: bye.
  {
    const _byeBase = getBasename(filename);
    if (matchesPrefix(_byeBase, 'bye.')) {
            if (prefs.andrewParton === 'native') {
        try {
          const { isAndrewPartonFormat, parseAndrewPartonFile } = await import('@lib/import/formats/AndrewPartonParser');
          if (isAndrewPartonFormat(buffer, originalFileName)) return await parseAndrewPartonFile(buffer, originalFileName);
        } catch (err) {
          console.warn(`[AndrewPartonParser] Native parse failed for ${filename}, falling back to UADE:`, err);
        }
      }
      const { parseUADEFile: parseUADE_bye } = await import('@lib/import/formats/UADEParser');
      return parseUADE_bye(buffer, originalFileName, prefs.uade ?? 'enhanced', subsong, preScannedMeta);
    }
  }

  // ── Custom Made (CM.* / RK.* / RKB.* prefix) ─────────────────────────────
  // Amiga format with BRA/JMP opcode detection. UADE prefixes: cm, rk, rkb.
  {
    const _cmBase = getBasename(filename);
    if (matchesPrefix(_cmBase, 'cm.') || matchesPrefix(_cmBase, 'rk.') || matchesPrefix(_cmBase, 'rkb.')) {
            if (prefs.customMade === 'native') {
        try {
          const { isCustomMadeFormat, parseCustomMadeFile } = await import('@lib/import/formats/CustomMadeParser');
          if (isCustomMadeFormat(buffer, originalFileName)) return await parseCustomMadeFile(buffer, originalFileName);
        } catch (err) {
          console.warn(`[CustomMadeParser] Native parse failed for ${filename}, falling back to UADE:`, err);
        }
      }
      const { parseUADEFile: parseUADE_cm } = await import('@lib/import/formats/UADEParser');
      return parseUADE_cm(buffer, originalFileName, prefs.uade ?? 'enhanced', subsong, preScannedMeta);
    }
  }

  // ── Ben Daglish SID (BDS.* prefix) ────────────────────────────────────────
  // Amiga HUNK-based SID-style 3-voice format. UADE prefix: BDS.
  {
    const _bdsBase = getBasename(filename);
    if (matchesPrefix(_bdsBase, 'bds.')) {
            if (prefs.benDaglishSID === 'native') {
        try {
          const { isBenDaglishSIDFormat, parseBenDaglishSIDFile } = await import('@lib/import/formats/BenDaglishSIDParser');
          if (isBenDaglishSIDFormat(buffer, originalFileName)) return await parseBenDaglishSIDFile(buffer, originalFileName);
        } catch (err) {
          console.warn(`[BenDaglishSIDParser] Native parse failed for ${filename}, falling back to UADE:`, err);
        }
      }
      const { parseUADEFile: parseUADE_bds } = await import('@lib/import/formats/UADEParser');
      return parseUADE_bds(buffer, originalFileName, prefs.uade ?? 'enhanced', subsong, preScannedMeta);
    }
  }

  // ── Digital Sonix & Chrome (DSC.* prefix) ────────────────────────────────
  // Amiga format with sample-table structural detection. UADE prefix: DSC.
  {
    const _dscBase = getBasename(filename);
    if (matchesPrefix(_dscBase, 'dsc.')) {
      const { isDscFormat, parseDscFile } = await import('@lib/import/formats/DigitalSonixChromeParser');
      return withNativeThenUADE('digitalSonixChrome', ctx,
        (buf: Uint8Array | ArrayBuffer, name: string) => { if (isDscFormat(buf as ArrayBuffer)) return parseDscFile(buf as ArrayBuffer, name); return null; },
        'DigitalSonixChromeParser');
    }
  }

  // ── Sonix Music Driver (SMUS.* / SNX.* / TINY.* prefix) ──────────────────
  // IFF SMUS and two binary sub-formats. UADE prefixes: smus, snx, tiny.
  // IffSmusParser handles IFF SMUS (smus.*); SonixMusicDriverParser handles
  // the binary SNX and TINY sub-formats which IffSmusParser cannot detect.
  {
    const _sonixBase = getBasename(filename);
    if (matchesPrefix(_sonixBase, 'smus.') || matchesPrefix(_sonixBase, 'snx.') || matchesPrefix(_sonixBase, 'tiny.')) {
            if (prefs.iffSmus === 'native') {
        try {
          const { isIffSmusFormat, parseIffSmusFile } = await import('@lib/import/formats/IffSmusParser');
          if (isIffSmusFormat(buffer)) return await parseIffSmusFile(buffer, originalFileName, companionFiles);
        } catch (err) {
          console.warn(`[IffSmusParser] Native parse failed for ${filename}, falling back to UADE:`, err);
        }
        // IffSmusParser only handles the IFF SMUS variant; try SonixMusicDriverParser
        // for the binary SNX and TINY sub-formats.
        try {
          const { isSonixFormat, parseSonixFile } = await import('@lib/import/formats/SonixMusicDriverParser');
          if (isSonixFormat(buffer)) return await parseSonixFile(buffer, originalFileName);
        } catch (err) {
          console.warn(`[SonixMusicDriverParser] Native parse failed for ${filename}, falling back to UADE:`, err);
        }
      }
      const { parseUADEFile: parseUADE_sonix } = await import('@lib/import/formats/UADEParser');
      return parseUADE_sonix(buffer, originalFileName, prefs.uade ?? 'enhanced', subsong, preScannedMeta);
    }
  }

  // ── Jesper Olsen (JO.* prefix) ────────────────────────────────────────────
  // Amiga format with jump-table detection and two sub-variants. UADE prefix: JO.
  {
    const _joBase = getBasename(filename);
    if (matchesPrefix(_joBase, 'jo.')) {
      const { isJesperOlsenFormat, parseJesperOlsenFile } = await import('@lib/import/formats/JesperOlsenParser');
      return withNativeThenUADE('jesperOlsen', ctx,
        (buf: Uint8Array | ArrayBuffer, name: string) => { if (isJesperOlsenFormat(buf as ArrayBuffer)) return parseJesperOlsenFile(buf as ArrayBuffer, name); return null; },
        'JesperOlsenParser');
    }
  }

  // ── Kim Christensen (KIM.* prefix) ────────────────────────────────────────
  // Amiga format with multi-opcode scan detection. UADE prefix: KIM.
  {
    const _kimBase = getBasename(filename);
    if (matchesPrefix(_kimBase, 'kim.')) {
      const { isKimChristensenFormat, parseKimChristensenFile } = await import('@lib/import/formats/KimChristensenParser');
      return withNativeThenUADE('kimChristensen', ctx,
        (buf: Uint8Array | ArrayBuffer, name: string) => { if (isKimChristensenFormat(buf as ArrayBuffer)) return parseKimChristensenFile(buf as ArrayBuffer, name); return null; },
        'KimChristensenParser');
    }
  }

  // ── Ashley Hogg (ASH.* prefix) ────────────────────────────────────────────
  {
    const _ashBase = getBasename(filename);
    if (matchesPrefix(_ashBase, 'ash.')) {
      const { isAshleyHoggFormat, parseAshleyHoggFile } = await import('@lib/import/formats/AshleyHoggParser');
      return withNativeThenUADE('ashleyHogg', ctx,
        (buf: Uint8Array | ArrayBuffer, name: string) => { if (isAshleyHoggFormat(buf as ArrayBuffer)) return parseAshleyHoggFile(buf as ArrayBuffer, name); return null; },
        'AshleyHoggParser');
    }
  }

  // ── ADPCM Mono (ADPCM.* prefix) ───────────────────────────────────────────
  {
    const _adpcmBase = getBasename(filename);
    if (matchesPrefix(_adpcmBase, 'adpcm.')) {
            if (prefs.adpcmMono === 'native') {
        try {
          const { isADPCMmonoFormat, parseADPCMmonoFile } = await import('@lib/import/formats/ADPCMmonoParser');
          if (isADPCMmonoFormat(buffer, originalFileName)) return parseADPCMmonoFile(buffer, originalFileName);
        } catch (err) {
          console.warn(`[ADPCMmonoParser] Native parse failed for ${filename}, falling back to UADE:`, err);
        }
      }
      const { parseUADEFile: parseUADE_adpcm } = await import('@lib/import/formats/UADEParser');
      return parseUADE_adpcm(buffer, originalFileName, prefs.uade ?? 'enhanced', subsong, preScannedMeta);
    }
  }

  // ── Janne Salmijarvi Optimizer (JS.* prefix) ──────────────────────────────
  {
    const _jsBase = getBasename(filename);
    if (matchesPrefix(_jsBase, 'js.')) {
      const { isJanneSalmijarviFormat, parseJanneSalmijarviFile } = await import('@lib/import/formats/JanneSalmijarviParser');
      return withNativeThenUADE('janneSalmijarvi', ctx,
        (buf: Uint8Array | ArrayBuffer, name: string) => { if (isJanneSalmijarviFormat(buf as ArrayBuffer)) return parseJanneSalmijarviFile(buf as ArrayBuffer, name); return null; },
        'JanneSalmijarviParser');
    }
  }

  // ── Jochen Hippel 7V (HIP7.* / S7G.* prefix) ─────────────────────────────
  {
    const _hip7Base = getBasename(filename);
    if (matchesPrefix(_hip7Base, 'hip7.') || matchesPrefix(_hip7Base, 's7g.')) {
      const { isJochenHippel7VFormat, parseJochenHippel7VFile } = await import('@lib/import/formats/JochenHippel7VParser');
      return withNativeThenUADE('jochenHippel7V', ctx,
        (buf: Uint8Array | ArrayBuffer, name: string) => { if (isJochenHippel7VFormat(buf as ArrayBuffer)) return parseJochenHippel7VFile(buf as ArrayBuffer, name); return null; },
        'JochenHippel7VParser');
    }
  }

  // ── Jochen Hippel ST (.sog extension or HST.* prefix) ────────────────────
  if (/\.sog$/i.test(filename)) {
    const { isJochenHippelSTFormat, parseJochenHippelSTFile } = await import('@lib/import/formats/JochenHippelSTParser');
    return withNativeThenUADE('jochenHippelST', ctx,
      (buf: Uint8Array | ArrayBuffer, name: string) => { if (isJochenHippelSTFormat(buf as ArrayBuffer)) return parseJochenHippelSTFile(buf as ArrayBuffer, name); return null; },
      'JochenHippelSTParser');
  }
  {
    const _hstBase = getBasename(filename);
    if (matchesPrefix(_hstBase, 'hst.')) {
      const { isJochenHippelSTFormat, parseJochenHippelSTFile } = await import('@lib/import/formats/JochenHippelSTParser');
      return withNativeThenUADE('jochenHippelST', ctx,
        (buf: Uint8Array | ArrayBuffer, name: string) => { if (isJochenHippelSTFormat(buf as ArrayBuffer)) return parseJochenHippelSTFile(buf as ArrayBuffer, name); return null; },
        'JochenHippelSTParser');
    }
  }

  // ── Maximum Effect (MAX.* prefix) / MaxTrax (.mxtx) ─────────────────────
  {
    const _maxBase = getBasename(filename);
    const _maxExt  = _maxBase.split('.').pop() ?? '';
    if (matchesPrefix(_maxBase, 'max.') || _maxExt === 'mxtx') {
      const { isMaximumEffectFormat, parseMaximumEffectFile } = await import('@lib/import/formats/MaximumEffectParser');
      return withNativeThenUADE('maximumEffect', ctx,
        (buf: Uint8Array | ArrayBuffer, name: string) => { if (isMaximumEffectFormat(buf as ArrayBuffer)) return parseMaximumEffectFile(buf as ArrayBuffer, name); return null; },
        'MaximumEffectParser');
    }
  }

  // ── MIDI Loriciel (MIDI.* prefix) ─────────────────────────────────────────
  {
    const _midiBase = getBasename(filename);
    if (matchesPrefix(_midiBase, 'midi.')) {
      const { isMIDILoricielFormat, parseMIDILoricielFile } = await import('@lib/import/formats/MIDILoricielParser');
      return withNativeThenUADE('midiLoriciel', ctx,
        (buf: Uint8Array | ArrayBuffer, name: string) => { if (isMIDILoricielFormat(buf as ArrayBuffer)) return parseMIDILoricielFile(buf as ArrayBuffer, name); return null; },
        'MIDILoricielParser');
    }
  }

  // ── onEscapee (ONE.* prefix) ──────────────────────────────────────────────
  {
    const _oneBase = getBasename(filename);
    if (matchesPrefix(_oneBase, 'one.')) {
      const { isOnEscapeeFormat, parseOnEscapeeFile } = await import('@lib/import/formats/OnEscapeeParser');
      return withNativeThenUADE('onEscapee', ctx,
        (buf: Uint8Array | ArrayBuffer, name: string) => { if (isOnEscapeeFormat(buf as ArrayBuffer)) return parseOnEscapeeFile(buf as ArrayBuffer, name); return null; },
        'OnEscapeeParser');
    }
  }

  // ── Paul Tonge (PAT.* prefix) ─────────────────────────────────────────────
  {
    const _patBase = getBasename(filename);
    if (matchesPrefix(_patBase, 'pat.')) {
      const { isPaulTongeFormat, parsePaulTongeFile } = await import('@lib/import/formats/PaulTongeParser');
      return withNativeThenUADE('paulTonge', ctx,
        (buf: Uint8Array | ArrayBuffer, name: string) => { if (isPaulTongeFormat(buf as ArrayBuffer)) return parsePaulTongeFile(buf as ArrayBuffer, name); return null; },
        'PaulTongeParser');
    }
  }

  // ── Rob Hubbard ST (RHO.* prefix) ─────────────────────────────────────────
  {
    const _rhoBase = getBasename(filename);
    if (matchesPrefix(_rhoBase, 'rho.')) {
      const { isRobHubbardSTFormat, parseRobHubbardSTFile } = await import('@lib/import/formats/RobHubbardSTParser');
      return withNativeThenUADE('robHubbardST', ctx,
        (buf: Uint8Array | ArrayBuffer, name: string) => { if (isRobHubbardSTFormat(buf as ArrayBuffer)) return parseRobHubbardSTFile(buf as ArrayBuffer, name); return null; },
        'RobHubbardSTParser');
    }
  }

  // ── Rob Hubbard (RH.* prefix) ─────────────────────────────────────────────
  {
    const _rhBase = getBasename(filename);
    if (matchesPrefix(_rhBase, 'rh.')) {
            if (prefs.robHubbard === 'native') {
        try {
          const { isRobHubbardFormat, parseRobHubbardFile } = await import('@lib/import/formats/RobHubbardParser');
          if (isRobHubbardFormat(buffer, originalFileName)) return await parseRobHubbardFile(buffer, originalFileName);
        } catch (err) {
          console.warn(`[RobHubbardParser] Native parse failed for ${filename}, falling back to UADE:`, err);
        }
      }
      const { parseUADEFile: parseUADE_rh } = await import('@lib/import/formats/UADEParser');
      return parseUADE_rh(buffer, originalFileName, prefs.uade ?? 'enhanced', subsong, preScannedMeta);
    }
  }

  // ── AM-Composer (AMC.* prefix) ───────────────────────────────────────────
  // eagleplayer.conf: AM-Composer  prefixes=amc
  {
    const _amcBase = getBasename(filename);
    if (matchesPrefix(_amcBase, 'amc.')) {
      const { parseUADEFile: parseUADE_amc } = await import('@lib/import/formats/UADEParser');
      return parseUADE_amc(buffer, originalFileName, prefs.uade ?? 'enhanced', subsong, preScannedMeta);
    }
  }

  // ── Mugician prefix (DMU.* / DMU2.* prefix) ──────────────────────────────
  // eagleplayer.conf: Mugician prefixes=dmu,mug  MugicianII prefixes=dmu2,mug2
  // (mug.* and mug2.* are already handled above; these cover the dmu.* variants)
  {
    const _dmuBase = getBasename(filename);
    if (matchesPrefix(_dmuBase, 'dmu.')) {
      const { parseDigitalMugicianFile } = await import('@lib/import/formats/DigitalMugicianParser');
      return withNativeThenUADE('mugician', ctx, (buf: Uint8Array | ArrayBuffer, name: string) => parseDigitalMugicianFile(buf as ArrayBuffer, name), 'DigitalMugicianParser');
    }
  }

  // ── Mugician II prefix (DMU2.* prefix) ───────────────────────────────────
  {
    const _dmu2Base = getBasename(filename);
    if (matchesPrefix(_dmu2Base, 'dmu2.')) {
      const { parseDigitalMugicianFile } = await import('@lib/import/formats/DigitalMugicianParser');
      return withNativeThenUADE('mugician', ctx, (buf: Uint8Array | ArrayBuffer, name: string) => parseDigitalMugicianFile(buf as ArrayBuffer, name), 'DigitalMugicianParser');
    }
  }

  // ── Jochen Hippel ST (MDST.* prefix) ─────────────────────────────────────
  // Amiga compiled music format by Jochen Hippel (ST version, not 7V or CoSo).
  // Magic: scan first 256 bytes for Hippel-ST opcode signature.
  {
    const _mdstBase = getBasename(filename);
    if (matchesPrefix(_mdstBase, 'mdst.')) {
      const { isJochenHippelSTFormat, parseJochenHippelSTFile } = await import('@lib/import/formats/JochenHippelSTParser');
      return withNativeThenUADE('jochenHippelST', ctx,
        (buf: Uint8Array | ArrayBuffer, name: string) => { if (isJochenHippelSTFormat(buf as ArrayBuffer)) return parseJochenHippelSTFile(buf as ArrayBuffer, name); return null; },
        'JochenHippelSTParser');
    }
  }

  // ── Special FX ST (DODA.* prefix) ────────────────────────────────────────
  // Amiga compiled music format ("Special FX" by Special FX). Magic: "SWTD" tag.
  {
    const _dodaBase = getBasename(filename);
    if (matchesPrefix(_dodaBase, 'doda.')) {
      const { isSpecialFXFormat, parseSpecialFXFile } = await import('@lib/import/formats/SpecialFXParser');
      return withNativeThenUADE('specialFX', ctx,
        (buf: Uint8Array | ArrayBuffer, name: string) => { if (isSpecialFXFormat(buf as ArrayBuffer)) return parseSpecialFXFile(buf as ArrayBuffer, name); return null; },
        'SpecialFXParser');
    }
  }

  // ── SynthPack (OSP.* prefix) ─────────────────────────────────────────────
  // eagleplayer.conf: SynthPack  prefixes=osp
  // Magic: "OBISYNTHPACK" at byte offset 0.
  {
    const _ospBase = getBasename(filename);
    if (matchesPrefix(_ospBase, 'osp.')) {
      if (prefs.synthPack === 'native') {
        try {
          const { isSynthPackFormat, parseSynthPackFile } = await import('@lib/import/formats/SynthPackParser');
          if (isSynthPackFormat(buffer, originalFileName)) return parseSynthPackFile(buffer, originalFileName);
        } catch (err) {
          console.warn(`[SynthPackParser] Native parse failed for ${filename}, falling back to UADE:`, err);
        }
      }
      const { parseUADEFile: parseUADE_osp } = await import('@lib/import/formats/UADEParser');
      return parseUADE_osp(buffer, originalFileName, prefs.uade ?? 'enhanced', subsong, preScannedMeta);
    }
  }

  // ── Fred Gray (gray.* prefix) ────────────────────────────────────────────
  // eagleplayer.conf: FredGray  prefixes=gray
  // Magic: "FREDGRAY" at byte offset 0x24.
  {
    const _grayBase = getBasename(filename);
    if (matchesPrefix(_grayBase, 'gray.')) {
      if (prefs.fredGray === 'native') {
        try {
          const { isFredGrayFormat, parseFredGrayFile } = await import('@lib/import/formats/FredGrayParser');
          if (isFredGrayFormat(buffer, originalFileName)) return parseFredGrayFile(buffer, originalFileName);
        } catch (err) {
          console.warn(`[FredGrayParser] Native parse failed for ${filename}, falling back to UADE:`, err);
        }
      }
      const { parseUADEFile: parseUADE_gray } = await import('@lib/import/formats/UADEParser');
      return parseUADE_gray(buffer, originalFileName, prefs.uade ?? 'enhanced', subsong, preScannedMeta);
    }
  }

  // ── Jason Brooke (jcbo.* / jcb.* / jb.* prefix) ─────────────────────────
  // eagleplayer.conf: JasonBrooke  prefixes=jcbo,jcb,jb
  {
    const _jbBase = getBasename(filename);
    const _mightBeJB = matchesPrefix(_jbBase, 'jcbo.') || matchesPrefix(_jbBase, 'jcb.') || matchesPrefix(_jbBase, 'jb.');
    if (_mightBeJB) {
      if (prefs.jasonBrooke === 'native') {
        try {
          const { isJasonBrookeFormat, parseJasonBrookeFile } = await import('@lib/import/formats/JasonBrookeParser');
          if (isJasonBrookeFormat(buffer, originalFileName)) return parseJasonBrookeFile(buffer, originalFileName);
        } catch (err) {
          console.warn(`[JasonBrookeParser] Native parse failed for ${filename}, falling back to UADE:`, err);
        }
      }
      const { parseUADEFile: parseUADE_jb } = await import('@lib/import/formats/UADEParser');
      return parseUADE_jb(buffer, originalFileName, prefs.uade ?? 'enhanced', subsong, preScannedMeta);
    }
  }

  // ── Laxity (powt.* / pt.* prefix) ────────────────────────────────────────
  // eagleplayer.conf: Laxity  prefixes=powt,pt
  // pt.* is shared with ProTracker MOD; LaxityParser handles disambiguation.
  {
    const _laxBase = getBasename(filename);
    const _mightBeLaxity = matchesPrefix(_laxBase, 'powt.') || matchesPrefix(_laxBase, 'pt.');
    if (_mightBeLaxity) {
      if (prefs.laxity === 'native') {
        try {
          const { isLaxityFormat, parseLaxityFile } = await import('@lib/import/formats/LaxityParser');
          if (isLaxityFormat(buffer, originalFileName)) return parseLaxityFile(buffer, originalFileName);
        } catch (err) {
          console.warn(`[LaxityParser] Native parse failed for ${filename}, falling back to UADE:`, err);
        }
      }
      const { parseUADEFile: parseUADE_laxity } = await import('@lib/import/formats/UADEParser');
      return parseUADE_laxity(buffer, originalFileName, prefs.uade ?? 'enhanced', subsong, preScannedMeta);
    }
  }

  // ── Music Maker 4V (mm4.* / sdata.* prefix) ──────────────────────────────
  // eagleplayer.conf: MusicMaker_4V  prefixes=mm4,sdata
  {
    const _mm4Base = getBasename(filename);
    const _mightBeMM4 = matchesPrefix(_mm4Base, 'mm4.') || matchesPrefix(_mm4Base, 'sdata.');
    if (_mightBeMM4) {
      if (prefs.musicMaker4V === 'native') {
        try {
          const { isMusicMaker4VFormat, parseMusicMaker4VFile } = await import('@lib/import/formats/MusicMakerParser');
          if (isMusicMaker4VFormat(buffer, originalFileName)) return parseMusicMaker4VFile(buffer, originalFileName);
        } catch (err) {
          console.warn(`[MusicMakerParser/4V] Native parse failed for ${filename}, falling back to UADE:`, err);
        }
      }
      const { parseUADEFile: parseUADE_mm4 } = await import('@lib/import/formats/UADEParser');
      return parseUADE_mm4(buffer, originalFileName, prefs.uade ?? 'enhanced', subsong, preScannedMeta);
    }
  }

  // ── Music Maker 8V (mm8.* prefix) ────────────────────────────────────────
  // eagleplayer.conf: MusicMaker_8V  prefixes=mm8
  {
    const _mm8Base = getBasename(filename);
    if (matchesPrefix(_mm8Base, 'mm8.')) {
      if (prefs.musicMaker8V === 'native') {
        try {
          const { isMusicMaker8VFormat, parseMusicMaker8VFile } = await import('@lib/import/formats/MusicMakerParser');
          if (isMusicMaker8VFormat(buffer, originalFileName)) return parseMusicMaker8VFile(buffer, originalFileName);
        } catch (err) {
          console.warn(`[MusicMakerParser/8V] Native parse failed for ${filename}, falling back to UADE:`, err);
        }
      }
      const { parseUADEFile: parseUADE_mm8 } = await import('@lib/import/formats/UADEParser');
      return parseUADE_mm8(buffer, originalFileName, prefs.uade ?? 'enhanced', subsong, preScannedMeta);
    }
  }

  // ── Maniacs of Noise (mon.* prefix) ──────────────────────────────────────
  // eagleplayer.conf: ManiacsOfNoise  prefixes=mon
  // mon_old.* is handled above by the JeroenTel block.
  {
    const _monBase = getBasename(filename);
    if (matchesPrefix(_monBase, 'mon.') && !matchesPrefix(_monBase, 'mon_old.')) {
      if (prefs.maniacsOfNoise === 'native') {
        try {
          const { isManiacsOfNoiseFormat, parseManiacsOfNoiseFile } = await import('@lib/import/formats/ManiacsOfNoiseParser');
          if (isManiacsOfNoiseFormat(buffer, originalFileName)) return parseManiacsOfNoiseFile(buffer, originalFileName);
        } catch (err) {
          console.warn(`[ManiacsOfNoiseParser] Native parse failed for ${filename}, falling back to UADE:`, err);
        }
      }
      const { parseUADEFile: parseUADE_mon } = await import('@lib/import/formats/UADEParser');
      return parseUADE_mon(buffer, originalFileName, prefs.uade ?? 'enhanced', subsong, preScannedMeta);
    }
  }

  // ── PxTone Collage / Tune (.ptcop, .pttune) ────────────────────────────
  if (/\.(ptcop|pttune)$/i.test(filename)) {
    const { isPxtoneFormat, parsePxtoneFile } = await import('@lib/import/formats/PxtoneParser');
    if (isPxtoneFormat(buffer)) {
      return parsePxtoneFile(originalFileName, buffer);
    }
  }

  // ── Organya / Cave Story (.org) ─────────────────────────────────────────
  if (/\.org$/i.test(filename)) {
    const { isOrganyaFormat, parseOrganyaFile } = await import('@lib/import/formats/OrganyaParser');
    if (isOrganyaFormat(buffer)) {
      return parseOrganyaFile(buffer, originalFileName);
    }
  }

  // ── FM Towns EUP (.eup) ─────────────────────────────────────────────────
  if (/\.eup$/i.test(filename)) {
    const { isEupFormat, parseEupFile } = await import('@lib/import/formats/EupminiParser');
    if (isEupFormat(buffer)) {
      return parseEupFile(originalFileName, buffer);
    }
  }

  // ── Ixalance IXS (.ixs) ──────────────────────────────────────────────────
  if (/\.ixs$/i.test(filename)) {
    const { isIxsFormat, parseIxsFile } = await import('@lib/import/formats/IxalanceParser');
    if (isIxsFormat(buffer)) {
      return parseIxsFile(originalFileName, buffer);
    }
  }

  // ── Psycle (.psy) ───────────────────────────────────────────────────────
  if (/\.psy$/i.test(filename)) {
    const { isPsycleFormat, parsePsycleFile } = await import('@lib/import/formats/CpsycleParser');
    if (isPsycleFormat(buffer)) {
      return parsePsycleFile(buffer, originalFileName);
    }
  }

  // ── SC68 / SNDH (.sc68, .sndh, .snd) ──────────────────────────────────────
  if (/\.(sc68|sndh|snd)$/i.test(filename)) {
    const { isSc68Format, parseSc68File } = await import('@lib/import/formats/Sc68Parser');
    if (isSc68Format(buffer)) {
      return parseSc68File(originalFileName, buffer);
    }
  }

  // ── ZXTune formats (.pt3, .pt2, .stc, .stp, .vtx, .psg, .sqt, .psc, .asc, .psm, .gtr, .ftc, .ayc, .ts) ──
  if (/\.(pt3|pt2|pt1|stc|st1|st3|stp|vtx|psg|psm|sqt|psc|asc|gtr|ftc|ayc|ts|cop|tfc|tfd|tf0|pdt|chi|str|dst|dmm|et1)$/i.test(filename)) {
    const { isZxtuneFormat, parseZxtuneFile } = await import('@lib/import/formats/ZxtuneParser');
    if (isZxtuneFormat(buffer)) {
      return parseZxtuneFile(originalFileName, buffer);
    }
  }

  // ── UADE-only prefix formats + catch-all ─────────────────────────────────
  { const uadeResult = await tryUADEPrefixParse(buffer, filename, originalFileName, prefs, subsong, preScannedMeta);
    if (uadeResult) return uadeResult; }

  // ── PC tracker formats (S3M, IT, XM, MOD) — native then libopenmpt ──────
  { const pcResult = await tryPCTrackerParse(buffer, filename, originalFileName, prefs, subsong, preScannedMeta);
    if (pcResult) return pcResult; }

  // No format matched — caller handles libopenmpt fallback + UADE last resort
  return null;
}
