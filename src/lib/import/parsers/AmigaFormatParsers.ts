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
import { withNativeDefault, withNativeThenUADE, callUADE, getBasename, injectUADEPlayback, type FallbackContext } from './withFallback';
import { tryChipDumpParse } from './ChipDumpParsers';
import { tryUADEPrefixParse } from './UADEPrefixParsers';
import { tryPCTrackerParse } from './PCTrackerParsers';

/**
 * Check if a filename matches a list of extensions, either as suffix (.ext) or prefix (ext.).
 * Handles Amiga naming convention where 'mdat.songname' and 'songname.mdat' are equivalent.
 */
function matchesExt(filename: string, exts: string[]): boolean {
  const lower = filename.toLowerCase();
  const base = getBasename(lower);
  // Check suffix: .ext at end of filename
  for (const ext of exts) {
    if (lower.endsWith('.' + ext)) return true;
  }
  // Check prefix: ext. at start of basename
  for (const ext of exts) {
    if (base.startsWith(ext + '.')) return true;
  }
  return false;
}

/**
 * Normalize a reversed-extension filename to UADE prefix form.
 * UADE identifies formats by filename prefix (e.g. "mc.commando"), not extension ("commando.mc").
 * If the file is already in prefix form, returns it unchanged.
 * Example: "commando.mc" → "mc.commando", "jt.song" → "jt.song" (unchanged)
 */
function toUADEPrefixName(filename: string, prefixes: string[]): string {
  const base = getBasename(filename);
  const lower = base.toLowerCase();
  for (const pfx of prefixes) {
    if (lower.startsWith(pfx + '.')) return filename; // already prefix form
  }
  const lastDot = base.lastIndexOf('.');
  if (lastDot <= 0) return filename;
  const namePart = base.substring(0, lastDot);
  const extPart = base.substring(lastDot + 1);
  return `${extPart}.${namePart}`;
}

/** Check if a filename matches Future Composer extensions */
function isFCFormat(filename: string): boolean {
  return matchesExt(filename, ['fc', 'fc2', 'fc3', 'fc4', 'fc13', 'fc14', 'sfc', 'smod', 'bfc', 'bsi']);
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
  const ctx: FallbackContext = { buffer, originalFileName, prefs, subsong, preScannedMeta, companionFiles };

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
        console.warn(`[XTrackerParser] Native parse failed for ${filename}, falling back:`, err);
      }
    }
    // Check for DefleMask magic ".DeFleMask." (starts with 0x2E 0x44 0x65 0x46)
    const isDefleMask = bytes.length > 16 &&
      bytes[0] === 0x2E && bytes[1] === 0x44 && bytes[2] === 0x65 && bytes[3] === 0x46;
    const isDDMF = bytes[0] === 0x44 && bytes[1] === 0x44 && bytes[2] === 0x4D && bytes[3] === 0x46;
    if (isDefleMask) {
      // DefleMask .dmf files → use TS parser directly (Furnace WASM can't handle DMF)
      const { parseDefleMaskToTrackerSong } = await import('./DefleMaskToSong');
      return parseDefleMaskToTrackerSong(buffer, originalFileName);
    }
    if (!isDDMF) {
      // Unknown .dmf variant → try Furnace WASM
      const { parseFurnaceFile } = await import('./FurnaceToSong');
      return parseFurnaceFile(buffer, originalFileName, subsong);
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
  if (filename.endsWith('.okt') || filename.endsWith('.okta')) {
    const { parseOktalyzerFile } = await import('@lib/import/formats/OktalyzerParser');
    return withNativeDefault('okt', ctx, (buf: Uint8Array | ArrayBuffer, name: string) => parseOktalyzerFile(buf as ArrayBuffer, name));
  }

  // ── OctaMED / MED ────────────────────────────────────────────────────────
  // Handles .med/.mmd0-3 extension files AND prefix-named files (med.* UADE prefix)
  // by magic-byte detection (MMD0/MMD1/MMD2/MMD3 at offset 0).
  {
    const buf4 = new Uint8Array(buffer instanceof ArrayBuffer ? buffer : buffer).subarray(0, 4);
    const isMEDExt = filename.endsWith('.med') || filename.endsWith('.mmd0') || filename.endsWith('.mmd1')
      || filename.endsWith('.mmd2') || filename.endsWith('.mmd3');
    const isMEDMagic = buf4[0] === 0x4D && buf4[1] === 0x4D && buf4[2] === 0x44
      && (buf4[3] === 0x30 || buf4[3] === 0x31 || buf4[3] === 0x32 || buf4[3] === 0x33); // MMD0-3
    if (isMEDExt || isMEDMagic) {
      const { parseMEDFile } = await import('@lib/import/formats/MEDParser');
      return withNativeDefault('med', ctx, (buf: Uint8Array | ArrayBuffer, name: string) => parseMEDFile(buf as ArrayBuffer, name));
    }
  }

  // ── DigiBooster ──────────────────────────────────────────────────────────
  // .digi files come in two sub-formats:
  //   DBMX / DBM0 magic  → DigiBoosterParser (native, full decode)
  //   "DIGI Boo..." text  → old DigiBooster 1.x text-header; handled by OpenMPT
  if (filename.endsWith('.digi')) {
    if (ctx.prefs.digi !== 'uade') {
      const { parseDigiBoosterFile } = await import('@lib/import/formats/DigiBoosterParser');
      try {
        return injectUADEPlayback(parseDigiBoosterFile(ctx.buffer, ctx.originalFileName), ctx);
      } catch {
        // Not DBMX/DBM0 magic — fall through to OpenMPT (handles old text-header format)
        const { parseWithOpenMPT } = await import('@lib/import/wasm/OpenMPTConverter');
        const song = await parseWithOpenMPT(buffer, originalFileName);
        song.libopenmptFileData = buffer.slice(0);
        return song;
      }
    }
    // User explicitly requested UADE
    const { parseUADEFile } = await import('@lib/import/formats/UADEParser');
    return parseUADEFile(ctx.buffer, ctx.originalFileName, ctx.prefs.uade ?? 'enhanced', ctx.subsong, ctx.preScannedMeta);
  }

  // ── Delta Music 2.0 ──────────────────────────────────────────────────────
  // DM2Parser handles .dm2 files (magic ".FNL" at 0xBC6).
  // .dm and .dm1 are Delta Music 1.x — different format, handled by UADE.
  // injectUADE: native parser always runs for editable patterns; UADE handles audio.
  if (filename.endsWith('.dm2')) {
    const { isDeltaMusic2Format, parseDeltaMusic2File } = await import('@lib/import/formats/DeltaMusic2Parser');
    return withNativeThenUADE('deltaMusic2', ctx,
      (bytes: Uint8Array | ArrayBuffer, name: string) => parseDeltaMusic2File(bytes as Uint8Array, name),
      'DeltaMusic2Parser', { isFormat: isDeltaMusic2Format, usesBytes: true, injectUADE: true });
  }

  // ── Future Composer ──────────────────────────────────────────────────────
  // FCParser handles FC 1.3 (magic "FC13"/"SMOD") and FC 1.4 (magic "FC14").
  // Future Composer 2 and other FC variants have different magic bytes and
  // fall through to UADE automatically when the native parser rejects them.
  // injectUADE: native parser always runs for editable patterns; UADE handles audio.
  if (isFCFormat(filename)) {
    const { parseFCFile } = await import('@lib/import/formats/FCParser');
    return withNativeThenUADE('fc', ctx, (buf: Uint8Array | ArrayBuffer, name: string) => parseFCFile(buf as ArrayBuffer, name), 'FCParser', { injectUADE: true });
  }

  // ── SoundMon (Brian Postma) ─────────────────────────────────────────────
  // injectUADE: native parser always runs for editable patterns; UADE handles audio.
  if (matchesExt(filename, ['bp', 'bp3', 'sndmon'])) {
    const { parseSoundMonFile } = await import('@lib/import/formats/SoundMonParser');
    return withNativeThenUADE('soundmon', ctx, (buf: Uint8Array | ArrayBuffer, name: string) => parseSoundMonFile(buf as ArrayBuffer, name), 'SoundMonParser', { injectUADE: true });
  }

  // ── SidMon 1.0 / SidMon II (.smn can be either) ─────────────────────────
  if (matchesExt(filename, ['smn'])) {
    // Try SidMon1 magic first
    if (prefs.sidmon1 !== 'uade') {
      try {
        const { isSidMon1Format, parseSidMon1File } = await import('@lib/import/formats/SidMon1Parser');
        if (isSidMon1Format(buffer)) {
          const result = parseSidMon1File(buffer, originalFileName);
          // Inject UADE for 1:1 audio — SidMon1Synth doesn't emulate all instrument types
          (result as any).uadeEditableFileData = buffer.slice(0);
          (result as any).uadeEditableFileName = originalFileName;
          return result;
        }
      } catch (err) {
        console.warn(`[SidMon1Parser] Native parse failed for ${filename}, falling back:`, err);
      }
    }
    // Then try SidMon2 — dedicated Sd2Engine WASM replayer handles playback
    {
      const { parseSidMon2File } = await import('@lib/import/formats/SidMon2Parser');
      return parseSidMon2File(buffer, originalFileName);
    }
  }

  // ── SidMon II (.sid2 — unambiguous SidMon 2) ─────────────────────────────
  // Dedicated Sd2Engine WASM replayer handles playback; native parser provides patterns.
  if (matchesExt(filename, ['sid2'])) {
    const { parseSidMon2File } = await import('@lib/import/formats/SidMon2Parser');
    return parseSidMon2File(buffer, originalFileName);
  }

  // ── Fred Editor ───────────────────────────────────────────────────────────
  // Force UADE classic mode — Fred Editor has synthesized instruments that UADE
  // enhanced mode can't extract as PCM. Classic mode uses UADESynth streaming.
  if (matchesExt(filename, ['fred'])) {
    const { parseUADEFile } = await import('@lib/import/formats/UADEParser');
    return parseUADEFile(buffer, originalFileName, 'classic', subsong, preScannedMeta);
  }

  // ── Sound-FX ──────────────────────────────────────────────────────────────
  // .sfx/.sfx2 — OpenMPT
  if (matchesExt(filename, ['sfx', 'sfx2'])) {
    const { parseWithOpenMPT } = await import('@lib/import/wasm/OpenMPTConverter');
    const song = await parseWithOpenMPT(buffer, originalFileName);
    song.libopenmptFileData = buffer.slice(0);
    return song;
  }
  // .sfx13 — UADE only (not in OpenMPT)
  if (matchesExt(filename, ['sfx13'])) {
    const { parseUADEFile } = await import('@lib/import/formats/UADEParser');
    return parseUADEFile(buffer, originalFileName, prefs.uade ?? 'enhanced', subsong, preScannedMeta);
  }

  // ── JamCracker ────────────────────────────────────────────────────────────
  if (matchesExt(filename, ['jam', 'jc'])) {
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
  if (matchesExt(filename, ['emod', 'qc'])) {
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
  if (matchesExt(filename, ['abk'])) {
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
  // injectUADE: native parser always runs for editable pattern display;
  // UADE handles audio via uadeEditableFileData / UADEEditableSynth (classic streaming).
  if (matchesExt(filename, ['sa', 'sonic'])) {
    const { isSonicArrangerFormat, parseSonicArrangerFile } = await import('@lib/import/formats/SonicArrangerParser');
    return withNativeThenUADE('sonicArranger', ctx,
      (buf: Uint8Array | ArrayBuffer, name: string) => { if (isSonicArrangerFormat(buf as ArrayBuffer)) return parseSonicArrangerFile(buf as ArrayBuffer, name) ?? null; return null; },
      'SonicArrangerParser', { injectUADE: true });
  }

  // ── InStereo! 2.0 (.is20 — unambiguous) ──────────────────────────────────
  // Use native parser for instrument display + inject UADE for 1:1 audio playback.
  // This gives individual instrument previews while UADE handles the song audio.
  if (matchesExt(filename, ['is20'])) {
    try {
      const { isInStereo2Format, parseInStereo2File } = await import('@lib/import/formats/InStereo2Parser');
      const bytes = new Uint8Array(buffer);
      if (isInStereo2Format(bytes)) {
        const result = parseInStereo2File(bytes, originalFileName);
        if (result) {
          // Inject UADE for 1:1 audio — InStereo2Synth can't reproduce all instrument types
          (result as any).uadeEditableFileData = buffer.slice(0);
          (result as any).uadeEditableFileName = originalFileName;
          return result;
        }
      }
    } catch (err) {
      console.warn(`[InStereo2Parser] Native parse failed for ${filename}, falling back to UADE:`, err);
    }
    const { parseUADEFile } = await import('@lib/import/formats/UADEParser');
    return parseUADEFile(buffer, originalFileName, 'classic', subsong, preScannedMeta);
  }

  // ── InStereo! 1.0 (.is10 — unambiguous) ──────────────────────────────────
  // Use native parser for instrument display + inject UADE for 1:1 audio playback.
  if (matchesExt(filename, ['is10'])) {
    try {
      const { isInStereo1Format, parseInStereo1File } = await import('@lib/import/formats/InStereo1Parser');
      const bytes = new Uint8Array(buffer);
      if (isInStereo1Format(bytes)) {
        const result = parseInStereo1File(bytes, originalFileName);
        if (result) {
          (result as any).uadeEditableFileData = buffer.slice(0);
          (result as any).uadeEditableFileName = originalFileName;
          return result;
        }
      }
    } catch (err) {
      console.warn(`[InStereo1Parser] Native parse failed for ${filename}, falling back to UADE:`, err);
    }
    const { parseUADEFile } = await import('@lib/import/formats/UADEParser');
    return parseUADEFile(buffer, originalFileName, 'classic', subsong, preScannedMeta);
  }

  // ── InStereo! (.is — ambiguous: detect by magic) ─────────────────────────
  // Try IS1 first (ISM!V1.2 magic), then IS2, with UADE for audio in both cases.
  if (matchesExt(filename, ['is'])) {
    const bytes = new Uint8Array(buffer);
    try {
      const { isInStereo1Format, parseInStereo1File } = await import('@lib/import/formats/InStereo1Parser');
      if (isInStereo1Format(bytes)) {
        const result = parseInStereo1File(bytes, originalFileName);
        if (result) {
          (result as any).uadeEditableFileData = buffer.slice(0);
          (result as any).uadeEditableFileName = originalFileName;
          return result;
        }
      }
    } catch (err) {
      console.warn(`[InStereo1Parser] Native parse failed for ${filename}, trying IS2:`, err);
    }
    try {
      const { isInStereo2Format, parseInStereo2File } = await import('@lib/import/formats/InStereo2Parser');
      if (isInStereo2Format(bytes)) {
        const result = parseInStereo2File(bytes, originalFileName);
        if (result) {
          (result as any).uadeEditableFileData = buffer.slice(0);
          (result as any).uadeEditableFileName = originalFileName;
          return result;
        }
      }
    } catch (err) {
      console.warn(`[InStereo2Parser] Native parse failed for ${filename}, falling back to UADE:`, err);
    }
    const { parseUADEFile } = await import('@lib/import/formats/UADEParser');
    return parseUADEFile(buffer, originalFileName, 'classic', subsong, preScannedMeta);
  }

  // ── PreTracker ───────────────────────────────────────────────────────────
  if (matchesExt(filename, ['prt'])) {
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
  if (matchesExt(filename, ['hipc', 'soc', 'coso'])) {
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
  if (matchesExt(filename, ['rh', 'rhp'])) {
    const { parseUADEFile } = await import('@lib/import/formats/UADEParser');
    return parseUADEFile(buffer, originalFileName, prefs.uade ?? 'enhanced', subsong, preScannedMeta);
  }

  // ── TFMX (Jochen Hippel) ─────────────────────────────────────────────────
  // TFMX requires UADE for audio (complex macro/trackstep system).
  // The enhanced UADE scan calls TFMXParser internally for pattern data.
  // Companion files (smpl.*) must be registered with UADE before loading.
  // If UADE fails (e.g. missing smpl.* companion), fall back to native parser
  // for pattern display + editing only (no audio).
  if (matchesExt(filename, ['tfmx', 'mdat', 'tfx'])) {
    try {
      const { parseUADEFile } = await import('@lib/import/formats/UADEParser');
      return await parseUADEFile(buffer, originalFileName, prefs.uade ?? 'enhanced', subsong, preScannedMeta, companionFiles);
    } catch (err) {
      console.warn(`[TFMX] UADE failed (missing smpl.* companion?), falling back to native parser for display:`, err);
      const { parseTFMXFile } = await import('@lib/import/formats/TFMXParser');
      return parseTFMXFile(buffer, originalFileName, subsong);
    }
  }

  // ── Digital Mugician ──────────────────────────────────────────────────────
  if (matchesExt(filename, ['dmu', 'dmu2', 'mug', 'mug2'])) {
    const { parseDigitalMugicianFile } = await import('@lib/import/formats/DigitalMugicianParser');
    return withNativeThenUADE('mugician', ctx, (buf: Uint8Array | ArrayBuffer, name: string) => parseDigitalMugicianFile(buf as ArrayBuffer, name), 'DigitalMugicianParser', { injectUADE: true });
  }

  // ── Chip-dump formats (VGM, YM, NSF, SAP, AY) ───────────────────────────
  { const chipResult = await tryChipDumpParse(buffer, filename, originalFileName);
    if (chipResult) return chipResult; }

  // ── SidMon 1.0 (.sid1) ───────────────────────────────────────────────────
  // .sid1 files may be SidMon 1.0 or Commodore 64 SID — try magic detection first.
  if (matchesExt(filename, ['sid1'])) {
    if (prefs.sidmon1 !== 'uade') {
      try {
        const { isSidMon1Format, parseSidMon1File } = await import('@lib/import/formats/SidMon1Parser');
        if (isSidMon1Format(buffer)) {
          const result = parseSidMon1File(buffer, originalFileName);
          // Inject UADE for 1:1 audio — SidMon1Synth doesn't emulate all instrument types
          (result as any).uadeEditableFileData = buffer.slice(0);
          (result as any).uadeEditableFileName = originalFileName;
          return result;
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
  if (matchesExt(filename, ['sid'])) {
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
          const result = parseSidMon1File(buffer, originalFileName);
          // Inject UADE for 1:1 audio — SidMon1Synth doesn't emulate all instrument types
          (result as any).uadeEditableFileData = buffer.slice(0);
          (result as any).uadeEditableFileName = originalFileName;
          return result;
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
  if (matchesExt(filename, ['dw', 'dwold'])) {
        if (prefs.davidWhittaker !== 'uade') {
      try {
        const { parseDavidWhittakerFile } = await import('@lib/import/formats/DavidWhittakerParser');
        const dwResult = parseDavidWhittakerFile(buffer, originalFileName);
        // Check if native parser produced any notes; if not, fall to UADE
        const dwNotes = dwResult.patterns.reduce((sum: number, p: any) =>
          sum + p.channels.reduce((cs: number, ch: any) =>
            cs + ch.rows.filter((r: any) => r.note > 0).length, 0), 0);
        if (dwNotes > 0) return dwResult;
        console.warn(`[DavidWhittakerParser] 0 notes extracted, falling back to UADE`);
      } catch (err) {
        console.warn(`[DavidWhittakerParser] Native parse failed for ${filename}, falling back to UADE:`, err);
      }
    }
    const { parseUADEFile: parseUADE } = await import('@lib/import/formats/UADEParser');
    return parseUADE(buffer, originalFileName, prefs.uade ?? 'enhanced', subsong, preScannedMeta);
  }

  // ── Art of Noise ──────────────────────────────────────────────────────────
  // AON4 (.aon) and AON8 (.aon8) — identified by "AON4"/"AON8" magic bytes at offset 0.
  if (matchesExt(filename, ['aon', 'aon8'])) {
    const { isArtOfNoiseFormat, parseArtOfNoiseFile } = await import('@lib/import/formats/ArtOfNoiseParser');
    return withNativeThenUADE('artOfNoise', ctx,
      (bytes: Uint8Array | ArrayBuffer, name: string) => parseArtOfNoiseFile(bytes as Uint8Array, name),
      'ArtOfNoiseParser', { isFormat: isArtOfNoiseFormat, usesBytes: true, injectUADE: true });
  }

  // ── Digital Symphony ──────────────────────────────────────────────────────
  // .dsym files — OpenMPT
  if (matchesExt(filename, ['dsym'])) {
    const { parseWithOpenMPT } = await import('@lib/import/wasm/OpenMPTConverter');
    const song = await parseWithOpenMPT(buffer, originalFileName);
    song.libopenmptFileData = buffer.slice(0);
    return song;
  }

  // ── Graoumf Tracker 1/2 ───────────────────────────────────────────────────
  // .gt2 — OpenMPT; .gtk — UADE only (not in OpenMPT)
  if (matchesExt(filename, ['gt2'])) {
    const { parseWithOpenMPT } = await import('@lib/import/wasm/OpenMPTConverter');
    const song = await parseWithOpenMPT(buffer, originalFileName);
    song.libopenmptFileData = buffer.slice(0);
    return song;
  }
  if (matchesExt(filename, ['gtk'])) {
    const { parseUADEFile } = await import('@lib/import/formats/UADEParser');
    return parseUADEFile(buffer, originalFileName, prefs.uade ?? 'enhanced', subsong, preScannedMeta);
  }

  // ── Symphonie Pro ─────────────────────────────────────────────────────────
  // .symmod files — OpenMPT for pattern data + libopenmpt for audio playback.
  // OpenMPT handles notes and DSP events (DSPEcho + DSPDelay) via Zxx MIDI macros.
  if (matchesExt(filename, ['symmod'])) {
    const { parseWithOpenMPT } = await import('@lib/import/wasm/OpenMPTConverter');
    const song = await parseWithOpenMPT(buffer, originalFileName);
    song.libopenmptFileData = buffer.slice(0);
    // Symphonie Pro stores full Amiga paths in instrument names (e.g. "HD3:Samples/Kick").
    // Strip everything up to the last '/' or ':' to keep only the sample filename.
    for (const inst of song.instruments) {
      const raw = inst.name ?? '';
      const slashIdx = raw.lastIndexOf('/');
      const colonIdx = raw.lastIndexOf(':');
      const stripIdx = Math.max(slashIdx, colonIdx);
      if (stripIdx >= 0) inst.name = raw.substring(stripIdx + 1);
    }
    return song;
  }

  // ── DigiBooster Pro ───────────────────────────────────────────────────────
  // .dbm files — OpenMPT
  // NOTE: .digi (DigiBooster 1.x) is handled separately above; this is DBM Pro only.
  if (matchesExt(filename, ['dbm'])) {
    const { parseWithOpenMPT } = await import('@lib/import/wasm/OpenMPTConverter');
    const song = await parseWithOpenMPT(buffer, originalFileName);
    song.libopenmptFileData = buffer.slice(0);
    return song;
  }

  // ── PumaTracker ───────────────────────────────────────────────────────────
  // .puma files — OpenMPT
  if (matchesExt(filename, ['puma'])) {
    const { parseWithOpenMPT } = await import('@lib/import/wasm/OpenMPTConverter');
    const song = await parseWithOpenMPT(buffer, originalFileName);
    song.libopenmptFileData = buffer.slice(0);
    return song;
  }

  // ── Synthesis ─────────────────────────────────────────────────────────────
  // .syn files — identified by "Synth4.0" at offset 0 or "Synth4.2" at 0x1f0e.
  if (matchesExt(filename, ['syn'])) {
    const { isSynthesisFormat, parseSynthesisFile } = await import('@lib/import/formats/SynthesisParser');
    return withNativeThenUADE('synthesis', ctx,
      (bytes: Uint8Array | ArrayBuffer, name: string) => parseSynthesisFile(bytes as Uint8Array, name),
      'SynthesisParser', { isFormat: isSynthesisFormat, usesBytes: true, injectUADE: true });
  }

  // ── Digital Sound Studio ──────────────────────────────────────────────────
  // .dss files — identified by "MMU2" magic at offset 0.
  if (matchesExt(filename, ['dss'])) {
    const { isDigitalSoundStudioFormat, parseDigitalSoundStudioFile } = await import('@lib/import/formats/DigitalSoundStudioParser');
    return withNativeThenUADE('digitalSoundStudio', ctx,
      (bytes: Uint8Array | ArrayBuffer, name: string) => parseDigitalSoundStudioFile(bytes as Uint8Array, name),
      'DigitalSoundStudioParser', { isFormat: isDigitalSoundStudioFormat, usesBytes: true, injectUADE: true });
  }

  // ── Music Assembler ────────────────────────────────────────────────────────
  // .ma files — identified by M68k player bytecode scanning (no magic bytes).
  if (matchesExt(filename, ['ma'])) {
    const { isMusicAssemblerFormat, parseMusicAssemblerFile } = await import('@lib/import/formats/MusicAssemblerParser');
    return withNativeThenUADE('musicAssembler', ctx,
      (bytes: Uint8Array | ArrayBuffer, name: string) => parseMusicAssemblerFile(bytes as Uint8Array, name),
      'MusicAssemblerParser', { isFormat: isMusicAssemblerFormat, usesBytes: true, injectUADE: true });
  }

  // ── Composer 667 ─────────────────────────────────────────────────────────
  // ── Composer 667 (.667) ───────────────────────────────────────────────────
  // OPL FM tracker (PC format). No PCM samples; instruments are FM patches.
  // Falls through to libopenmpt on failure. (UADE is Amiga-only, cannot play OPL.)
  if (matchesExt(filename, ['667'])) {
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
  // .cba files — OpenMPT
  if (matchesExt(filename, ['cba'])) {
    const { parseWithOpenMPT } = await import('@lib/import/wasm/OpenMPTConverter');
    const song = await parseWithOpenMPT(buffer, originalFileName);
    song.libopenmptFileData = buffer.slice(0);
    return song;
  }

  // ── Ben Daglish (bd.* prefix or .bd extension) ─────────────────────────
  // Dedicated BD WASM engine — always use native parser (UADE can't play BD).
  // Native parser sets bdFileData which triggers BdEngine via NativeEngineRouting.
  if (matchesExt(filename, ['bd'])) {
    const { parseBenDaglishFile } = await import('@lib/import/formats/BenDaglishParser');
    return await parseBenDaglishFile(buffer, originalFileName);
  }

  // ── Images Music System (.ims) ────────────────────────────────────────────
  // .ims files — OpenMPT
  if (matchesExt(filename, ['ims'])) {
    const { parseWithOpenMPT } = await import('@lib/import/wasm/OpenMPTConverter');
    const song = await parseWithOpenMPT(buffer, originalFileName);
    song.libopenmptFileData = buffer.slice(0);
    return song;
  }

  // ── ICE Tracker / SoundTracker 2.6 (.ice) ────────────────────────────────
  // .ice files — OpenMPT
  if (matchesExt(filename, ['ice'])) {
    const { parseWithOpenMPT } = await import('@lib/import/wasm/OpenMPTConverter');
    const song = await parseWithOpenMPT(buffer, originalFileName);
    song.libopenmptFileData = buffer.slice(0);
    return song;
  }

  // ── ChipTracker (.kris) ───────────────────────────────────────────────────
  // .kris files — OpenMPT
  if (matchesExt(filename, ['kris'])) {
    const { parseWithOpenMPT } = await import('@lib/import/wasm/OpenMPTConverter');
    const song = await parseWithOpenMPT(buffer, originalFileName);
    song.libopenmptFileData = buffer.slice(0);
    return song;
  }

  // ── MusicLine Editor (.ml) ───────────────────────────────────────────────
  // Magic "MLEDMODL" at offset 0. Falls through to Medley handler if magic doesn't match.
  if (matchesExt(filename, ['ml'])) {
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
  // .gmc files — OpenMPT
  if (matchesExt(filename, ['gmc'])) {
    const { parseWithOpenMPT } = await import('@lib/import/wasm/OpenMPTConverter');
    const song = await parseWithOpenMPT(buffer, originalFileName);
    song.libopenmptFileData = buffer.slice(0);
    return song;
  }

  // ── Face The Music (.ftm) ─────────────────────────────────────────────────
  // .ftm files — OpenMPT
  if (matchesExt(filename, ['ftm'])) {
    const { parseWithOpenMPT } = await import('@lib/import/wasm/OpenMPTConverter');
    const song = await parseWithOpenMPT(buffer, originalFileName);
    song.libopenmptFileData = buffer.slice(0);
    return song;
  }

  // ── Sawteeth (.st — magic "SWTD" required to disambiguate) ───────────────
  // Fully synthesized format (no PCM samples). Native parser available (metadata only).
  if (matchesExt(filename, ['st'])) {
    const { isSawteethFormat, parseSawteethFile } = await import('@lib/import/formats/SawteethParser');
    if (isSawteethFormat(new Uint8Array(buffer))) {
      return withNativeThenUADE('sawteeth', ctx,
        (buf: Uint8Array | ArrayBuffer, name: string) => { if (isSawteethFormat(new Uint8Array(buf as ArrayBuffer))) return parseSawteethFile(new Uint8Array(buf as ArrayBuffer), name) ?? null; return null; },
        'SawteethParser', { injectUADE: true });
    }
    const { parseUADEFile: parseUADE_st } = await import('@lib/import/formats/UADEParser');
    return parseUADE_st(buffer, originalFileName, prefs.uade ?? 'enhanced', subsong, preScannedMeta);
  }

  // ── Sound Control (.sc, .sct) ─────────────────────────────────────────────
  if (matchesExt(filename, ['sc', 'sct'])) {
    const { isSoundControlFormat, parseSoundControlFile } = await import('@lib/import/formats/SoundControlParser');
    return withNativeThenUADE('soundControl', ctx,
      (bytes: Uint8Array | ArrayBuffer, name: string) => parseSoundControlFile(bytes as Uint8Array, name),
      'SoundControlParser', { isFormat: isSoundControlFormat, usesBytes: true, injectUADE: true });
  }

  // ── Sound Factory (.psf) ──────────────────────────────────────────────────
  // Force UADE classic mode — SoundFactory has synth instruments that UADE enhanced
  // mode can't extract as PCM. Classic mode uses UADESynth streaming for 1:1 audio.
  // Normalize suffix-form to prefix form: axelf.psf → psf.axelf
  if (matchesExt(filename, ['psf'])) {
    const { parseUADEFile } = await import('@lib/import/formats/UADEParser');
    const psfBase = getBasename(filename);
    const psfDot = psfBase.lastIndexOf('.');
    const psfName = (psfDot > 0 && !psfBase.startsWith('psf.'))
      ? `${psfBase.slice(psfDot + 1)}.${psfBase.slice(0, psfDot)}`
      : originalFileName;
    return parseUADEFile(buffer, psfName, 'classic', subsong, preScannedMeta);
  }

  // ── Actionamics (.act) ────────────────────────────────────────────────────
  // Identified by "ACTIONAMICS SOUND TOOL" signature at offset 62.
  if (matchesExt(filename, ['act', 'ast'])) {
    const { isActionamicsFormat, parseActionamicsFile } = await import('@lib/import/formats/ActionamicsParser');
    return withNativeThenUADE('actionamics', ctx,
      (bytes: Uint8Array | ArrayBuffer, name: string) => parseActionamicsFile(bytes as Uint8Array, name),
      'ActionamicsParser', { isFormat: isActionamicsFormat, usesBytes: true, injectUADE: true });
  }

  // ── Activision Pro / Martin Walker (.avp, .mw) ────────────────────────────
  // Identified by scanning first 4096 bytes for M68k init pattern (0x48 0xe7 0xfc 0xfe).
  if (matchesExt(filename, ['avp', 'mw'])) {
    const { isActivisionProFormat, parseActivisionProFile } = await import('@lib/import/formats/ActivisionProParser');
    return withNativeThenUADE('activisionPro', ctx,
      (bytes: Uint8Array | ArrayBuffer, name: string) => parseActivisionProFile(bytes as Uint8Array, name),
      'ActivisionProParser', { isFormat: isActivisionProFormat, usesBytes: true, injectUADE: true });
  }

  // ── Ron Klaren (.rk, .rkb) ────────────────────────────────────────────────
  // Force UADE classic mode — Ron Klaren has synthesized instruments that UADE
  // enhanced mode can't extract as PCM. Classic mode uses UADESynth streaming.
  if (matchesExt(filename, ['rk', 'rkb'])) {
    const { parseUADEFile } = await import('@lib/import/formats/UADEParser');
    return parseUADEFile(buffer, originalFileName, 'classic', subsong, preScannedMeta);
  }

  // ── UNIC Tracker (.unic) ─────────────────────────────────────────────────
  if (matchesExt(filename, ['unic'])) {
    try {
      const { isUNICFormat, parseUNICFile } = await import('@lib/import/formats/UNICParser');
      if (isUNICFormat(buffer)) return parseUNICFile(buffer, originalFileName);
    } catch (err) {
      console.warn(`[UNICParser] Native parse failed for ${filename}, falling back to OpenMPT:`, err);
    }
    // Fall through to libopenmpt
  }

  // ── MultiTracker (.mtm) ──────────────────────────────────────────────────
  if (matchesExt(filename, ['mtm'])) {
    try {
      const { isMTMFormat, parseMTMFile } = await import('@lib/import/formats/MTMParser');
      if (isMTMFormat(buffer)) return parseMTMFile(buffer, originalFileName);
    } catch (err) {
      console.warn(`[MTMParser] Native parse failed for ${filename}, falling back to OpenMPT:`, err);
    }
    // Fall through to libopenmpt
  }

  // ── Composer 669 (.669) ──────────────────────────────────────────────────
  if (matchesExt(filename, ['669'])) {
    try {
      const { is669Format, parse669File } = await import('@lib/import/formats/Format669Parser');
      if (is669Format(buffer)) return parse669File(buffer, originalFileName);
    } catch (err) {
      console.warn(`[Format669Parser] Native parse failed for ${filename}, falling back to OpenMPT:`, err);
    }
    // Fall through to libopenmpt
  }

  // ── Farandole Composer (.far) ─────────────────────────────────────────────
  if (matchesExt(filename, ['far'])) {
    try {
      const { isFARFormat, parseFARFile } = await import('@lib/import/formats/FARParser');
      if (isFARFormat(buffer)) return parseFARFile(buffer, originalFileName);
    } catch (err) {
      console.warn(`[FARParser] Native parse failed for ${filename}, falling back to OpenMPT:`, err);
    }
    // Fall through to libopenmpt
  }

  // ── Disorder Tracker 2 (.plm) ─────────────────────────────────────────────
  if (matchesExt(filename, ['plm'])) {
    try {
      const { isPLMFormat, parsePLMFile } = await import('@lib/import/formats/PLMParser');
      if (isPLMFormat(buffer)) return parsePLMFile(buffer, originalFileName);
    } catch (err) {
      console.warn(`[PLMParser] Native parse failed for ${filename}, falling back to OpenMPT:`, err);
    }
    // Fall through to libopenmpt
  }

  // ── Ultra Tracker (.ult) ──────────────────────────────────────────────────
  if (matchesExt(filename, ['ult'])) {
    try {
      const { isULTFormat, parseULTFile } = await import('@lib/import/formats/ULTParser');
      if (isULTFormat(buffer)) return parseULTFile(buffer, originalFileName);
    } catch (err) {
      console.warn(`[ULTParser] Native parse failed for ${filename}, falling back to OpenMPT:`, err);
    }
    // Fall through to libopenmpt
  }

  // ── Reality Tracker (.rtm) ────────────────────────────────────────────────
  if (matchesExt(filename, ['rtm'])) {
    try {
      const { isRTMFormat, parseRTMFile } = await import('@lib/import/formats/RTMParser');
      if (isRTMFormat(buffer)) return parseRTMFile(buffer, originalFileName);
    } catch (err) {
      console.warn(`[RTMParser] Native parse failed for ${filename}, falling back to OpenMPT:`, err);
    }
    // Fall through to libopenmpt
  }

  // ── DSIK Sound Module (.dsm) ──────────────────────────────────────────────
  if (matchesExt(filename, ['dsm'])) {
    try {
      const { isDSMFormat, parseDSMFile } = await import('@lib/import/formats/DSMParser');
      if (isDSMFormat(buffer)) return parseDSMFile(buffer, originalFileName);
    } catch (err) {
      console.warn(`[DSMParser] Native parse failed for ${filename}, falling back to OpenMPT:`, err);
    }
    // Fall through to libopenmpt
  }

  // ── Digital Tracker (.dtm) ────────────────────────────────────────────────
  if (matchesExt(filename, ['dtm'])) {
    try {
      const { isDTMFormat, parseDTMFile } = await import('@lib/import/formats/DTMParser');
      if (isDTMFormat(buffer)) return parseDTMFile(buffer, originalFileName);
    } catch (err) {
      console.warn(`[DTMParser] Native parse failed for ${filename}, falling back to OpenMPT:`, err);
    }
    // Fall through to libopenmpt
  }

  // ── ScreamTracker 2 (.stm) ────────────────────────────────────────────────
  if (matchesExt(filename, ['stm'])) {
    try {
      const { isSTMFormat, parseSTMFile } = await import('@lib/import/formats/STMParser');
      if (isSTMFormat(buffer)) return parseSTMFile(buffer, originalFileName);
    } catch (err) {
      console.warn(`[STMParser] Native parse failed for ${filename}, falling back to OpenMPT:`, err);
    }
    // Fall through to libopenmpt
  }

  // ── ScreamTracker STMIK (.stx) ────────────────────────────────────────────
  if (matchesExt(filename, ['stx'])) {
    try {
      const { isSTXFormat, parseSTXFile } = await import('@lib/import/formats/STXParser');
      if (isSTXFormat(buffer)) return parseSTXFile(buffer, originalFileName);
    } catch (err) {
      console.warn(`[STXParser] Native parse failed for ${filename}, falling back to OpenMPT:`, err);
    }
    // Fall through to libopenmpt
  }

  // ── NoiseRunner (.nru) ────────────────────────────────────────────────────
  if (matchesExt(filename, ['nru'])) {
    try {
      const { isNRUFormat, parseNRUFile } = await import('@lib/import/formats/NRUParser');
      if (isNRUFormat(buffer)) return parseNRUFile(buffer, originalFileName);
    } catch (err) {
      console.warn(`[NRUParser] Native parse failed for ${filename}, falling back to OpenMPT:`, err);
    }
    // Fall through to libopenmpt
  }

  // ── PolyTracker (.ptm) ────────────────────────────────────────────────────
  if (matchesExt(filename, ['ptm'])) {
    try {
      const { isPTMFormat, parsePTMFile } = await import('@lib/import/formats/PTMParser');
      if (isPTMFormat(buffer)) return parsePTMFile(buffer, originalFileName);
    } catch (err) {
      console.warn(`[PTMParser] Native parse failed for ${filename}, falling back to OpenMPT:`, err);
    }
    // Fall through to libopenmpt
  }

  // ── General DigiMusic (.gdm) ──────────────────────────────────────────────
  if (matchesExt(filename, ['gdm'])) {
    try {
      const { isGDMFormat, parseGDMFile } = await import('@lib/import/formats/GDMParser');
      if (isGDMFormat(buffer)) return parseGDMFile(buffer, originalFileName);
    } catch (err) {
      console.warn(`[GDMParser] Native parse failed for ${filename}, falling back to OpenMPT:`, err);
    }
    // Fall through to libopenmpt
  }

  // ── Ultimate SoundTracker (.stk) ──────────────────────────────────────────
  if (matchesExt(filename, ['stk'])) {
    try {
      const { isSTKFormat, parseSTKFile } = await import('@lib/import/formats/STKParser');
      if (isSTKFormat(buffer)) return parseSTKFile(buffer, originalFileName);
    } catch (err) {
      console.warn(`[STKParser] Native parse failed for ${filename}, falling back to OpenMPT:`, err);
    }
    // Fall through to libopenmpt
  }

  // ── SoundTracker Pro II (.stp) ─────────────────────────────────────────────
  if (matchesExt(filename, ['stp'])) {
    try {
      const { isSTPFormat, parseSTPFile } = await import('@lib/import/formats/STPParser');
      if (isSTPFormat(buffer)) return parseSTPFile(buffer, originalFileName);
    } catch (err) {
      console.warn(`[STPParser] Native parse failed for ${filename}, falling back to OpenMPT:`, err);
    }
    // Fall through to libopenmpt
  }

  // ── DigiTrakker (.mdl) ────────────────────────────────────────────────────
  if (matchesExt(filename, ['mdl'])) {
    try {
      const { isMDLFormat, parseMDLFile } = await import('@lib/import/formats/MDLParser');
      if (isMDLFormat(buffer)) return parseMDLFile(buffer, originalFileName);
    } catch (err) {
      console.warn(`[MDLParser] Native parse failed for ${filename}, falling back to OpenMPT:`, err);
    }
    // Fall through to libopenmpt
  }

  // ── Advanced Music Format (.amf) ──────────────────────────────────────────
  if (matchesExt(filename, ['amf'])) {
    try {
      const { isAMFFormat, parseAMFFile } = await import('@lib/import/formats/AMFParser');
      if (isAMFFormat(buffer)) return parseAMFFile(buffer, originalFileName);
    } catch (err) {
      console.warn(`[AMFParser] Native parse failed for ${filename}, falling back to OpenMPT:`, err);
    }
    // Fall through to libopenmpt
  }

  // ── Imago Orpheus (.imf) ──────────────────────────────────────────────────
  if (matchesExt(filename, ['imf'])) {
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
  if (matchesExt(filename, ['c67'])) {
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
  if (matchesExt(filename, ['etx'])) {
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
  if (matchesExt(filename, ['mus']) && prefs.karlMorton === 'native') {
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
  if (matchesExt(filename, ['ufo', 'mus'])) {
    const { isUFOFormat, parseUFOFile } = await import('@lib/import/formats/UFOParser');
    return withNativeThenUADE('ufo', ctx,
      (buf: Uint8Array | ArrayBuffer, name: string) => { if (isUFOFormat(buf as ArrayBuffer)) return parseUFOFile(buf as ArrayBuffer, name); return null; },
      'UFOParser', { injectUADE: true });
  }

  // ── Astroidea XMF / Imperium Galactica (.xmf) ────────────────────────────
  if (matchesExt(filename, ['xmf'])) {
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
  if (matchesExt(filename, ['uax'])) {
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
  if (matchesExt(filename, ['fmt'])) {
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
  if (matchesExt(filename, ['mt2'])) {
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
  if (matchesExt(filename, ['psm'])) {
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
  // PC format — OpenMPT.  Two magic variants:
  //   "Extreme"    → AMS 1.x (Extreme's Tracker)
  //   "AMShdr\x1A" → AMS 2.x (Velvet Studio 2.00–2.02)
  if (matchesExt(filename, ['ams'])) {
    const { parseWithOpenMPT } = await import('@lib/import/wasm/OpenMPTConverter');
    const song = await parseWithOpenMPT(buffer, originalFileName);
    song.libopenmptFileData = buffer.slice(0);
    return song;
  }

  // ── IFF SMUS / Sonix Music Driver (.smus, .snx, .tiny) ───────────────────
  // IFF SMUS format: "FORM" + "SMUS" IFF structure. Binary SNX/TINY sub-formats
  // are handled by SonixMusicDriverParser when IffSmusParser does not detect IFF.
  if (matchesExt(filename, ['smus', 'snx', 'tiny'])) {
    if (prefs.iffSmus === 'native') {
      try {
        const { isIffSmusFormat, parseIffSmusFile } = await import('@lib/import/formats/IffSmusParser');
        if (isIffSmusFormat(buffer)) {
          const smusResult = await parseIffSmusFile(buffer, originalFileName, companionFiles);
          // If any instruments have real audio (companion .ss files), use native result
          const hasAudio = smusResult.instruments.some(
            (inst: any) => inst.sample?.audioBuffer && inst.sample.audioBuffer.byteLength > 100,
          );
          if (hasAudio) return smusResult;
          console.warn(`[IffSmusParser] All instruments silent (no .ss companions), falling back to UADE`);
        }
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
  if (matchesExt(filename, ['mfp'])) {
    const [{ isMFPFormat, parseMFPFile }, { isMagneticFieldsPackerFormat, parseMagneticFieldsPackerFile }] = await Promise.all([
      import('@lib/import/formats/MFPParser'),
      import('@lib/import/formats/MagneticFieldsPackerParser'),
    ]);
    return withNativeThenUADE('magneticFieldsPacker', ctx,
      async (buf: Uint8Array | ArrayBuffer, name: string) => {
        if (isMFPFormat(buf as ArrayBuffer, name)) return await parseMFPFile(buf as ArrayBuffer, name);
        if (isMagneticFieldsPackerFormat(buf as ArrayBuffer, name)) return await parseMagneticFieldsPackerFile(buf as ArrayBuffer, name);
        return null;
      },
      'MFPParser', { injectUADE: true });
  }

  // ── Delta Music 1.0 (.dm, .dm1) — identified by "ALL " magic ──────────────
  if (matchesExt(filename, ['dm', 'dm1'])) {
    const { isDeltaMusic1Format, parseDeltaMusic1File } = await import('@lib/import/formats/DeltaMusic1Parser');
    return withNativeThenUADE('deltaMusic1', ctx,
      async (buf: Uint8Array | ArrayBuffer, name: string) => { if (isDeltaMusic1Format(buf as ArrayBuffer)) return await parseDeltaMusic1File(buf as ArrayBuffer, name) ?? null; return null; },
      'DeltaMusic1Parser', { injectUADE: true });
  }

  // ── Richard Joseph Player (.rjp, RJP.*, .sng with RJP magic) ─────────────
  // Two-file format: song data (RJP.* / *.SNG) + samples (SMP.* / *.INS).
  // Magic: bytes[0..2]="RJP", bytes[4..7]="SMOD", bytes[12..15]=0.
  if (
    matchesExt(filename, ['rjp']) ||
    (matchesExt(filename, ['sng']) && buffer.byteLength >= 16 &&
      new Uint8Array(buffer)[0] === 0x52 &&   // 'R'
      new Uint8Array(buffer)[1] === 0x4a &&   // 'J'
      new Uint8Array(buffer)[2] === 0x50)     // 'P'
  ) {
    const { isRJPFormat, parseRJPFile } = await import('@lib/import/formats/RichardJosephParser');
    return withNativeThenUADE('richardJoseph', ctx,
      async (buf: Uint8Array | ArrayBuffer, name: string) => { if (isRJPFormat(new Uint8Array(buf as ArrayBuffer))) return await parseRJPFile(buf as ArrayBuffer, name); return null; },
      'RichardJosephParser', { injectUADE: true });
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
  if (matchesExt(filename, ['ss'])) {
    const { isSpeedySystemFormat, parseSpeedySystemFile } = await import('@lib/import/formats/SpeedySystemParser');
    return withNativeThenUADE('speedySystem', ctx,
      (buf: Uint8Array | ArrayBuffer, name: string) => { if (isSpeedySystemFormat(buf as ArrayBuffer)) return parseSpeedySystemFile(buf as ArrayBuffer, name); return null; },
      'SpeedySystemParser', { injectUADE: true });
  }

  // ── Tronic (.trc/.dp/.tro/.tronic) ───────────────────────────────────────
  // Amiga tracker by Stefan Hartmann. No public format spec; always delegates to UADE.
  if (matchesExt(filename, ['trc', 'dp', 'tro', 'tronic'])) {
    const { parseUADEFile: parseUADE_trc } = await import('@lib/import/formats/UADEParser');
    return parseUADE_trc(buffer, originalFileName, prefs.uade ?? 'enhanced', subsong, preScannedMeta);
  }

  // ── Dave Lowe (.dl / DL.* prefix) ─────────────────────────────────────────
  // Compiled 68k Amiga music format. Two variants: old and new. Both detected
  // by opcode patterns at offsets 0/4/8.
  if (matchesExt(filename, ['dl', 'dl_deli'])) {
    const [{ isDaveLoweFormat, parseDaveLoweFile }, { isDaveLoweNewFormat, parseDaveLoweNewFile }] = await Promise.all([
      import('@lib/import/formats/DaveLoweParser'),
      import('@lib/import/formats/DaveLoweNewParser'),
    ]);
    return withNativeThenUADE('daveLowe', ctx,
      async (buf: Uint8Array | ArrayBuffer, name: string) => {
        if (isDaveLoweFormat(new Uint8Array(buf as ArrayBuffer))) return await parseDaveLoweFile(buf as ArrayBuffer, name);
        if (isDaveLoweNewFormat(buf as ArrayBuffer)) return parseDaveLoweNewFile(buf as ArrayBuffer, name);
        return null;
      },
      'DaveLoweParser', { injectUADE: true });
  }

  // ── Leggless Music Editor (.lme / LME.*) ────────────────────────────────────
  // Force UADE classic mode — LME has synth instruments that UADE enhanced mode
  // can't extract as PCM. Classic mode uses UADESynth streaming for 1:1 audio.
  if (matchesExt(filename, ['lme'])) {
    const { parseUADEFile } = await import('@lib/import/formats/UADEParser');
    return parseUADEFile(buffer, originalFileName, 'classic', subsong, preScannedMeta);
  }

  // ── Mike Davies (MD.* / .md) ─────────────────────────────────────────────
  // Compiled 68k synthesizer. UADE enhanced mode extracts wrong/garbled samples.
  // Classic mode streams correct audio. Prefix-normalize for UADE replayer selection.
  if (matchesExt(filename, ['md'])) {
    const { parseUADEFile } = await import('@lib/import/formats/UADEParser');
    return parseUADEFile(buffer, toUADEPrefixName(originalFileName, ['md']), 'classic', subsong, preScannedMeta);
  }

  // ── Medley (.ml / .mso) ───────────────────────────────────────────────────
  // Amiga 4-channel format (Medley tracker). Magic: "MSOB" at bytes[0..3].
  // UADESynth plays this format incorrectly; UADEEditableSynth plays it correctly.
  // Strategy: parse via UADE for real instruments/patterns, then inject uadeEditableFileData
  // to force UADEEditableSynth for audio (which uses MSOB magic-byte detection correctly).
  if (matchesExt(filename, ['ml', 'mso'])) {
    const { parseUADEFile } = await import('@lib/import/formats/UADEParser');
    const result = await parseUADEFile(buffer, originalFileName, prefs.uade ?? 'enhanced', subsong, preScannedMeta);
    if (!(result as any).uadeEditableFileData) {
      (result as any).uadeEditableFileData = buffer.slice(0);
      (result as any).uadeEditableFileName = originalFileName;
    }
    return result;
  }

  // ── Mark Cooksey / Don Adan (mc.* / mcr.* / mco.* prefix) ─────────────────
  // Compiled 68k Amiga music format. Three sub-variants: Old (D040D040 magic),
  // New/Medium (601A + 48E780F0), and Rare (4DFA + DFF000 hardware register).
  if (matchesExt(filename, ['mc', 'mcr', 'mco'])) {
    const { isMarkCookseyFormat, parseMarkCookseyFile } = await import('@lib/import/formats/MarkCookseyParser');
    const mcCtx = { ...ctx, originalFileName: toUADEPrefixName(originalFileName, ['mc', 'mcr', 'mco']) };
    return withNativeThenUADE('markCooksey', mcCtx,
      (buf: Uint8Array | ArrayBuffer, name: string) => { if (isMarkCookseyFormat(buf as ArrayBuffer, name)) return parseMarkCookseyFile(buf as ArrayBuffer, name); return null; },
      'MarkCookseyParser', { injectUADE: true });
  }

  // ── Jeroen Tel (jt.* / mon_old.* prefix) ────────────────────────────────────
  // Compiled 68k Amiga music format (Maniacs of Noise / Jeroen Tel).
  // Detection: scan first 40 bytes for 0x02390001 + structural checks.
  if (matchesExt(filename, ['jt', 'mon_old'])) {
    const { isJeroenTelFormat, parseJeroenTelFile } = await import('@lib/import/formats/JeroenTelParser');
    const jtCtx = { ...ctx, originalFileName: toUADEPrefixName(originalFileName, ['jt', 'mon_old']) };
    return withNativeThenUADE('jeroenTel', jtCtx,
      (buf: Uint8Array | ArrayBuffer, name: string) => { if (isJeroenTelFormat(buf as ArrayBuffer, name)) return parseJeroenTelFile(buf as ArrayBuffer, name); return null; },
      'JeroenTelParser', { injectUADE: true });
  }

  // ── Quartet / Quartet PSG / Quartet ST (qpa.* / sqt.* / qts.* prefix) ──────
  if (matchesExt(filename, ['qpa', 'sqt', 'qts'])) {
    const { isQuartetFormat, parseQuartetFile } = await import('@lib/import/formats/QuartetParser');
    return withNativeThenUADE('quartet', ctx,
      (buf: Uint8Array | ArrayBuffer, name: string) => { if (isQuartetFormat(buf as ArrayBuffer, name)) return parseQuartetFile(buf as ArrayBuffer, name); return null; },
      'QuartetParser', { injectUADE: true });
  }

  // ── Sound Master (sm.* / sm1.* / sm2.* / sm3.* / smpro.* prefix) ───────────
  if (matchesExt(filename, ['sm', 'sm1', 'sm2', 'sm3', 'smpro'])) {
    const { isSoundMasterFormat, parseSoundMasterFile } = await import('@lib/import/formats/SoundMasterParser');
    return withNativeThenUADE('soundMaster', ctx,
      (buf: Uint8Array | ArrayBuffer, name: string) => { if (isSoundMasterFormat(buf as ArrayBuffer, name)) return parseSoundMasterFile(buf as ArrayBuffer, name); return null; },
      'SoundMasterParser', { injectUADE: true });
  }

  // ── ZoundMonitor (sng.* prefix OR *.sng extension) ──────────────────────────
  // Amiga 4-channel PCM tracker by A.J. van Dongen.
  // Matched by: "sng." prefix (UADE convention) OR ".sng" extension (non-RJP files;
  // Richard Joseph .sng files are caught earlier by the RJP magic check).
  // Detection: computed offset from bytes[0..1], then "df?:" or "?amp" tag check.
  if (matchesExt(filename, ['sng'])) {
    const { isZoundMonitorFormat, parseZoundMonitorFile } = await import('@lib/import/formats/ZoundMonitorParser');
    return withNativeThenUADE('zoundMonitor', ctx,
      (buf: Uint8Array | ArrayBuffer, name: string) => { if (isZoundMonitorFormat(buf as ArrayBuffer, name)) return parseZoundMonitorFile(buf as ArrayBuffer, name, companionFiles); return null; },
      'ZoundMonitorParser', { injectUADE: true });
  }

  // ── Future Player (.fp / FP.*) ───────────────────────────────────────────────
  // Amiga 4-channel format (Future Player). Magic: 0x000003F3 + "F.PLAYER" at offsets 32-39.
  if (matchesExt(filename, ['fp'])) {
    const { isFuturePlayerFormat, parseFuturePlayerFile } = await import('@lib/import/formats/FuturePlayerParser');
    return withNativeThenUADE('futurePlayer', ctx,
      (buf: Uint8Array | ArrayBuffer, name: string) => { if (isFuturePlayerFormat(buf as ArrayBuffer)) return parseFuturePlayerFile(buf as ArrayBuffer, name); return null; },
      'FuturePlayerParser', { injectUADE: true });
  }

  // ── TCB Tracker (tcb.* or *.tcb) ─────────────────────────────────────────────
  if (matchesExt(filename, ['tcb'])) {
    const { isTCBTrackerFormat, parseTCBTrackerFile } = await import('@lib/import/formats/TCBTrackerParser');
    return withNativeThenUADE('tcbTracker', ctx,
      async (buf: Uint8Array | ArrayBuffer, name: string) => { if (isTCBTrackerFormat(buf as ArrayBuffer)) return parseTCBTrackerFile(buf as ArrayBuffer, name); return null; },
      'TCBTrackerParser', { injectUADE: true });
  }

  // ── Jason Page (jpn.* / jpnd.* / jp.*) ──────────────────────────────────────
  // Amiga 4-channel format. Three sub-variants (old/new/raw binary).
  if (matchesExt(filename, ['jpn', 'jpnd', 'jp'])) {
    const { isJasonPageFormat, parseJasonPageFile } = await import('@lib/import/formats/JasonPageParser');
    const jpCtx = { ...ctx, originalFileName: toUADEPrefixName(originalFileName, ['jpn', 'jpnd', 'jp']) };
    return withNativeThenUADE('jasonPage', jpCtx,
      (buf: Uint8Array | ArrayBuffer, name: string) => { if (isJasonPageFormat(buf as ArrayBuffer, name)) return parseJasonPageFile(buf as ArrayBuffer, name); return null; },
      'JasonPageParser', { injectUADE: true });
  }




  // ── TME (.tme / TME.*) ───────────────────────────────────────────────────────
  if (matchesExt(filename, ['tme'])) {
    const { isTMEFormat, parseTMEFile } = await import('@lib/import/formats/TMEParser');
    return withNativeThenUADE('tme', ctx,
      (buf: Uint8Array | ArrayBuffer, name: string) => { if (isTMEFormat(buf as ArrayBuffer)) return parseTMEFile(buf as ArrayBuffer, name); return null; },
      'TMEParser', { injectUADE: true });
  }

  // ── Infogrames DUM (.dum) ────────────────────────────────────────────────────
  // Infogrames music format used in Gobliins, Ween, etc. Two-file format
  // with external .dum.set sample data. Detection: header offset at u16BE(0).
  if (matchesExt(filename, ['dum'])) {
    const { isInfogramesFormat, parseInfogramesFile } = await import('@lib/import/formats/InfogramesParser');
    return withNativeThenUADE('infogrames', ctx,
      (buf: Uint8Array | ArrayBuffer, name: string) => { if (isInfogramesFormat(buf as ArrayBuffer)) return parseInfogramesFile(buf as ArrayBuffer, name); return null; },
      'InfogramesParser', { injectUADE: true });
  }

  // ── PSA (.psa / PSA.*) ───────────────────────────────────────────────────────
  // Professional Sound Artists format. Magic: bytes[0..3] == 0x50534100 ("PSA\0").
  if (matchesExt(filename, ['psa'])) {
    const { isPSAFormat, parsePSAFile } = await import('@lib/import/formats/PSAParser');
    return withNativeThenUADE('psa', ctx,
      (buf: Uint8Array | ArrayBuffer, name: string) => { if (isPSAFormat(buf as ArrayBuffer)) return parsePSAFile(buf as ArrayBuffer, name); return null; },
      'PSAParser', { injectUADE: true });
  }

  // ── MMDC (.mmdc / MMDC.*) ────────────────────────────────────────────────────
  // MED Packer format by Antony "Ratt" Crowther. Magic: bytes[0..3] == 'MMDC'.
  if (matchesExt(filename, ['mmdc'])) {
    const { isMMDCFormat, parseMMDCFile } = await import('@lib/import/formats/MMDCParser');
    return withNativeThenUADE('mmdc', ctx,
      (buf: Uint8Array | ArrayBuffer, name: string) => { if (isMMDCFormat(buf as ArrayBuffer)) return parseMMDCFile(buf as ArrayBuffer, name); return null; },
      'MMDCParser', { injectUADE: true });
  }

  // ── Steve Turner (.jpo / .jpold / JPO.*) ────────────────────────────────────
  // Amiga compiled 68k format (JPO. prefix). Detection: 4x 0x2B7C at offsets
  // 0/8/16/24, 0x303C00FF at 0x20, 0x32004EB9 at 0x24, 0x4E75 at 0x2C.
  if (matchesExt(filename, ['jpo', 'jpold'])) {
    const { parseSteveTurnerFile } = await import('@lib/import/formats/SteveTurnerParser');
    return withNativeDefault('steveTurner', ctx,
      (buf: ArrayBuffer, name: string) => parseSteveTurnerFile(buf, name));
  }

  // ── TimeTracker (TMK.* prefix) ───────────────────────────────────────────
  // Amiga format by BrainWasher & FireBlade. UADE prefix: TMK.
  if (matchesExt(filename, ['tmk'])) {
    const { isTimeTrackerFormat, parseTimeTrackerFile } = await import('@lib/import/formats/TimeTrackerParser');
    return withNativeThenUADE('timeTracker', ctx,
      (buf: Uint8Array | ArrayBuffer, name: string) => { if (isTimeTrackerFormat(buf as ArrayBuffer)) return parseTimeTrackerFile(buf as ArrayBuffer, name); return null; },
      'TimeTrackerParser', { injectUADE: true });
  }

  // ── ChipTracker (KRIS.* prefix) ──────────────────────────────────────────
  // Amiga format identified by 'KRIS' at offset 952. UADE prefix: KRIS.
  if (matchesExt(filename, ['kris'])) {
    const { isKRISFormat, parseKRISFile } = await import('@lib/import/formats/KRISParser');
    return withNativeThenUADE('kris', ctx,
      async (buf: Uint8Array | ArrayBuffer, name: string) => { if (isKRISFormat(buf as ArrayBuffer)) return await parseKRISFile(buf as ArrayBuffer, name); return null; },
      'KRISParser', { injectUADE: true });
  }

  // ── Cinemaware (CIN.* prefix) ─────────────────────────────────────────────
  // Amiga format with 'IBLK'+'ASEQ' magic. UADE prefix: CIN.
  if (matchesExt(filename, ['cin'])) {
    const { isCinemawareFormat, parseCinemawareFile } = await import('@lib/import/formats/CinemawareParser');
    return withNativeThenUADE('cinemaware', ctx,
      (buf: Uint8Array | ArrayBuffer, name: string) => { if (isCinemawareFormat(buf as ArrayBuffer)) return parseCinemawareFile(buf as ArrayBuffer, name); return null; },
      'CinemawareParser', { injectUADE: true });
  }

  // ── NovoTrade Packer (NTP.* prefix) ──────────────────────────────────────
  // Amiga chunked format: MODU/BODY/SAMP chunks. UADE prefix: NTP.
  if (matchesExt(filename, ['ntp'])) {
    const { isNovoTradePackerFormat, parseNovoTradePackerFile } = await import('@lib/import/formats/NovoTradePackerParser');
    return withNativeThenUADE('novoTradePacker', ctx,
      (buf: Uint8Array | ArrayBuffer, name: string) => { if (isNovoTradePackerFormat(buf as ArrayBuffer)) return parseNovoTradePackerFile(buf as ArrayBuffer, name); return null; },
      'NovoTradePackerParser', { injectUADE: true });
  }

  // ── Alcatraz Packer (ALP.* prefix) ───────────────────────────────────────
  // Amiga format with 'PAn\x10' magic. UADE prefix: ALP.
  if (matchesExt(filename, ['alp'])) {
    const { isAlcatrazPackerFormat, parseAlcatrazPackerFile } = await import('@lib/import/formats/AlcatrazPackerParser');
    return withNativeThenUADE('alcatrazPacker', ctx,
      (buf: Uint8Array | ArrayBuffer, name: string) => { if (isAlcatrazPackerFormat(buf as ArrayBuffer)) return parseAlcatrazPackerFile(buf as ArrayBuffer, name); return null; },
      'AlcatrazPackerParser', { injectUADE: true });
  }

  // ── Blade Packer (UDS.* prefix) ──────────────────────────────────────────
  // Amiga 8-channel format with 0x538F4E47 magic. UADE prefix: UDS.
  if (matchesExt(filename, ['uds'])) {
    const { isBladePackerFormat, parseBladePackerFile } = await import('@lib/import/formats/BladePackerParser');
    return withNativeThenUADE('bladePacker', ctx,
      (buf: Uint8Array | ArrayBuffer, name: string) => { if (isBladePackerFormat(buf as ArrayBuffer)) return parseBladePackerFile(buf as ArrayBuffer, name); return null; },
      'BladePackerParser', { injectUADE: true });
  }

  // ── Tomy Tracker (SG.* prefix) ────────────────────────────────────────────
  // Amiga format with size-based structural detection. UADE prefix: SG.
  if (matchesExt(filename, ['sg'])) {
    const { isTomyTrackerFormat, parseTomyTrackerFile } = await import('@lib/import/formats/TomyTrackerParser');
    return withNativeThenUADE('tomyTracker', ctx,
      (buf: Uint8Array | ArrayBuffer, name: string) => { if (isTomyTrackerFormat(buf as ArrayBuffer)) return parseTomyTrackerFile(buf as ArrayBuffer, name); return null; },
      'TomyTrackerParser', { injectUADE: true });
  }

  // ── Images Music System (IMS.* prefix) ────────────────────────────────────
  // Amiga format with offset-arithmetic detection. UADE prefix: IMS.
  // Note: .ims extension files are handled earlier with native IMSParser.
  if (matchesExt(filename, ['ims'])) {
    const { isImagesMusicSystemFormat, parseImagesMusicSystemFile } = await import('@lib/import/formats/ImagesMusicSystemParser');
    return withNativeThenUADE('imagesMusicSystem', ctx,
      (buf: Uint8Array | ArrayBuffer, name: string) => { if (isImagesMusicSystemFormat(buf as ArrayBuffer)) return parseImagesMusicSystemFile(buf as ArrayBuffer, name); return null; },
      'ImagesMusicSystemParser', { injectUADE: true });
  }

  // ── Fashion Tracker (EX.* prefix) ────────────────────────────────────────
  if (matchesExt(filename, ['ex'])) {
    const { isFashionTrackerFormat, parseFashionTrackerFile } = await import('@lib/import/formats/FashionTrackerParser');
    return withNativeThenUADE('fashionTracker', ctx,
      (buf: Uint8Array | ArrayBuffer, name: string) => { if (isFashionTrackerFormat(buf as ArrayBuffer)) return parseFashionTrackerFile(buf as ArrayBuffer, name); return null; },
      'FashionTrackerParser', { injectUADE: true });
  }

  // ── MultiMedia Sound (MMS.* / SFX20.* prefix) ────────────────────────────
  // Stub parser provides no useful display data. Use UADE for real instruments/patterns,
  // then inject uadeEditableFileData so UADEEditableSynth handles playback correctly.
  if (matchesExt(filename, ['mms', 'sfx20'])) {
    const { parseUADEFile } = await import('@lib/import/formats/UADEParser');
    const result = await parseUADEFile(buffer, originalFileName, prefs.uade ?? 'enhanced', subsong, preScannedMeta);
    if (!(result as any).uadeEditableFileData) {
      (result as any).uadeEditableFileData = buffer.slice(0);
      (result as any).uadeEditableFileName = originalFileName;
    }
    return result;
  }

  // ── Sean Conran (SCR.* prefix) ───────────────────────────────────────────
  // Compiled 68k Amiga music. Three detection paths with specific 68k opcodes + scan.
  if (matchesExt(filename, ['scr'])) {
    const { isSeanConranFormat, parseSeanConranFile } = await import('@lib/import/formats/SeanConranParser');
    return withNativeThenUADE('seanConran', ctx,
      async (buf: Uint8Array | ArrayBuffer, name: string) => { if (isSeanConranFormat(new Uint8Array(buf as ArrayBuffer))) return await parseSeanConranFile(buf as ArrayBuffer, name); return null; },
      'SeanConranParser', { injectUADE: true });
  }

  // ── Thomas Hermann (THM.* prefix) ────────────────────────────────────────
  // Compiled 68k Amiga music. Relocation table structure with arithmetic checks.
  if (matchesExt(filename, ['thm'])) {
    const { isThomasHermannFormat, parseThomasHermannFile } = await import('@lib/import/formats/ThomasHermannParser');
    return withNativeThenUADE('thomasHermann', ctx,
      async (buf: Uint8Array | ArrayBuffer, name: string) => { if (isThomasHermannFormat(new Uint8Array(buf as ArrayBuffer))) return await parseThomasHermannFile(buf as ArrayBuffer, name); return null; },
      'ThomasHermannParser', { injectUADE: true });
  }

  // ── Titanics Packer (TITS.* prefix) ──────────────────────────────────────
  // Amiga packed music format. Detection: 128 words at offset 180 (even, non-zero).
  if (matchesExt(filename, ['tits'])) {
    const { isTitanicsPackerFormat, parseTitanicsPackerFile } = await import('@lib/import/formats/TitanicsPackerParser');
    return withNativeThenUADE('titanicsPacker', ctx,
      (buf: Uint8Array | ArrayBuffer, name: string) => { if (isTitanicsPackerFormat(buf as ArrayBuffer)) return parseTitanicsPackerFile(buf as ArrayBuffer, name); return null; },
      'TitanicsPackerParser', { injectUADE: true });
  }

  // ── Kris Hatlelid (KH.* prefix) ──────────────────────────────────────────
  // Compiled 68k Amiga music. Fixed-offset pattern with 0x000003F3 header.
  if (matchesExt(filename, ['kh'])) {
    const { isKrisHatlelidFormat, parseKrisHatlelidFile } = await import('@lib/import/formats/KrisHatlelidParser');
    const khCtx = { ...ctx, originalFileName: toUADEPrefixName(originalFileName, ['kh']) };
    return withNativeThenUADE('krisHatlelid', khCtx,
      (buf: Uint8Array | ArrayBuffer, name: string) => { if (isKrisHatlelidFormat(buf as ArrayBuffer)) return parseKrisHatlelidFile(buf as ArrayBuffer, name); return null; },
      'KrisHatlelidParser', { injectUADE: true });
  }

  // ── NTSP System (TWO.* prefix) ───────────────────────────────────────────
  // Amiga 2-file packed format. Magic: 'SPNT' at offset 0 + non-zero at offset 4.
  if (matchesExt(filename, ['two'])) {
    const { isNTSPFormat, parseNTSPFile } = await import('@lib/import/formats/NTSPParser');
    return withNativeThenUADE('ntsp', ctx,
      (buf: Uint8Array | ArrayBuffer, name: string) => { if (isNTSPFormat(buf as ArrayBuffer)) return parseNTSPFile(buf as ArrayBuffer, name); return null; },
      'NTSPParser', { injectUADE: true });
  }

  // ── UFO / MicroProse (MUS.* / UFO.* prefix) ──────────────────────────────
  // IFF-based 4-channel Amiga format. FORM+DDAT+BODY+CHAN structure.
  if (matchesExt(filename, ['mus', 'ufo'])) {
    const { isUFOFormat, parseUFOFile } = await import('@lib/import/formats/UFOParser');
    return withNativeThenUADE('ufo', ctx,
      (buf: Uint8Array | ArrayBuffer, name: string) => { if (isUFOFormat(buf as ArrayBuffer)) return parseUFOFile(buf as ArrayBuffer, name); return null; },
      'UFOParser', { injectUADE: true });
  }

  // ── Mosh Packer (MOSH.* prefix) ──────────────────────────────────────────
  // SoundTracker-compatible Amiga packed format. 31 sample headers + M.K. at 378.
  if (matchesExt(filename, ['mosh'])) {
    const { isMoshPackerFormat, parseMoshPackerFile } = await import('@lib/import/formats/MoshPackerParser');
    return withNativeThenUADE('moshPacker', ctx,
      (buf: Uint8Array | ArrayBuffer, name: string) => { if (isMoshPackerFormat(buf as ArrayBuffer)) return parseMoshPackerFile(buf as ArrayBuffer, name); return null; },
      'MoshPackerParser', { injectUADE: true });
  }

  // ── Mugician (MUG.* prefix) ───────────────────────────────────────────────
  // Same format as .mug/.dmu — " MUGICIAN/SOFTEYES 1990" signature at offset 0.
  if (matchesExt(filename, ['mug'])) {
    const { parseDigitalMugicianFile } = await import('@lib/import/formats/DigitalMugicianParser');
    return withNativeThenUADE('mugician', ctx, (buf: Uint8Array | ArrayBuffer, name: string) => parseDigitalMugicianFile(buf as ArrayBuffer, name), 'DigitalMugicianParser', { injectUADE: true });
  }

  // ── Mugician II (MUG2.* prefix) ───────────────────────────────────────────
  // Same format as .mug2/.dmu2 — " MUGICIAN2/SOFTEYES 1990" signature at offset 0.
  if (matchesExt(filename, ['mug2'])) {
    const { parseDigitalMugicianFile } = await import('@lib/import/formats/DigitalMugicianParser');
    return withNativeThenUADE('mugician', ctx, (buf: Uint8Array | ArrayBuffer, name: string) => parseDigitalMugicianFile(buf as ArrayBuffer, name), 'DigitalMugicianParser', { injectUADE: true });
  }

  // ── Core Design (CORE.* prefix) ───────────────────────────────────────────
  if (matchesExt(filename, ['core'])) {
    const { isCoreDesignFormat, parseCoreDesignFile } = await import('@lib/import/formats/CoreDesignParser');
    const coreCtx = { ...ctx, originalFileName: toUADEPrefixName(originalFileName, ['core']) };
    return withNativeThenUADE('coreDesign', coreCtx,
      (buf: Uint8Array | ArrayBuffer, name: string) => { if (isCoreDesignFormat(buf as ArrayBuffer)) return parseCoreDesignFile(buf as ArrayBuffer, name); return null; },
      'CoreDesignParser', { injectUADE: true });
  }

  // ── Janko Mrsic-Flogel (JMF.* prefix) ────────────────────────────────────
  if (matchesExt(filename, ['jmf'])) {
    const { isJankoMrsicFlogelFormat, parseJankoMrsicFlogelFile } = await import('@lib/import/formats/JankoMrsicFlogelParser');
    const jmfCtx = { ...ctx, originalFileName: toUADEPrefixName(originalFileName, ['jmf']) };
    return withNativeThenUADE('jankoMrsicFlogel', jmfCtx,
      (buf: Uint8Array | ArrayBuffer, name: string) => { if (isJankoMrsicFlogelFormat(buf as ArrayBuffer)) return parseJankoMrsicFlogelFile(buf as ArrayBuffer, name); return null; },
      'JankoMrsicFlogelParser', { injectUADE: true });
  }

  // ── Special FX (JD.* prefix) ──────────────────────────────────────────────
  if (matchesExt(filename, ['jd'])) {
    const { isSpecialFXFormat, parseSpecialFXFile } = await import('@lib/import/formats/SpecialFXParser');
    return withNativeThenUADE('specialFX', ctx,
      (buf: Uint8Array | ArrayBuffer, name: string) => { if (isSpecialFXFormat(buf as ArrayBuffer)) return parseSpecialFXFile(buf as ArrayBuffer, name); return null; },
      'SpecialFXParser', { injectUADE: true });
  }

  // ── Sound Player / Steve Barrett (SJS.* prefix) ───────────────────────────
  if (matchesExt(filename, ['sjs'])) {
    const { isSoundPlayerFormat, parseSoundPlayerFile } = await import('@lib/import/formats/SoundPlayerParser');
    return withNativeThenUADE('soundPlayer', ctx,
      (buf: Uint8Array | ArrayBuffer, name: string) => { if (isSoundPlayerFormat(buf as ArrayBuffer)) return parseSoundPlayerFile(buf as ArrayBuffer, name); return null; },
      'SoundPlayerParser', { injectUADE: true });
  }

  // ── Nick Pelling Packer (NPP.* prefix) ────────────────────────────────────
  if (matchesExt(filename, ['npp'])) {
    const { isNickPellingPackerFormat, parseNickPellingPackerFile } = await import('@lib/import/formats/NickPellingPackerParser');
    return withNativeThenUADE('nickPellingPacker', ctx,
      (buf: Uint8Array | ArrayBuffer, name: string) => { if (isNickPellingPackerFormat(buf as ArrayBuffer)) return parseNickPellingPackerFile(buf as ArrayBuffer, name); return null; },
      'NickPellingPackerParser', { injectUADE: true });
  }

  // ── Peter Verswyvelen Packer (PVP.* prefix) ───────────────────────────────
  if (matchesExt(filename, ['pvp'])) {
    const { isPeterVerswyvelenPackerFormat, parsePeterVerswyvelenPackerFile } = await import('@lib/import/formats/PeterVerswyvelenPackerParser');
    return withNativeThenUADE('peterVerswyvelenPacker', ctx,
      (buf: Uint8Array | ArrayBuffer, name: string) => { if (isPeterVerswyvelenPackerFormat(buf as ArrayBuffer)) return parsePeterVerswyvelenPackerFile(buf as ArrayBuffer, name); return null; },
      'PeterVerswyvelenPackerParser', { injectUADE: true });
  }

  // ── Wally Beben (WB.* prefix) ─────────────────────────────────────────────
  if (matchesExt(filename, ['wb'])) {
    const { isWallyBebenFormat, parseWallyBebenFile } = await import('@lib/import/formats/WallyBebenParser');
    return withNativeThenUADE('wallyBeben', ctx,
      (buf: Uint8Array | ArrayBuffer, name: string) => { if (isWallyBebenFormat(buf as ArrayBuffer)) return parseWallyBebenFile(buf as ArrayBuffer, name); return null; },
      'WallyBebenParser', { injectUADE: true });
  }

  // ── Steve Barrett (SB.* prefix) ───────────────────────────────────────────
  if (matchesExt(filename, ['sb'])) {
    const { isSteveBarrettFormat, parseSteveBarrettFile } = await import('@lib/import/formats/SteveBarrettParser');
    return withNativeThenUADE('steveBarrett', ctx,
      (buf: Uint8Array | ArrayBuffer, name: string) => { if (isSteveBarrettFormat(buf as ArrayBuffer)) return parseSteveBarrettFile(buf as ArrayBuffer, name); return null; },
      'SteveBarrettParser', { injectUADE: true });
  }

  // ── Paul Summers (SNK.* prefix) ───────────────────────────────────────────
  // Compiled Amiga format. Stub parser + UADE audio via UADEEditableSynth.
  if (matchesExt(filename, ['snk'])) {
    const snkCtx = { ...ctx, originalFileName: toUADEPrefixName(originalFileName, ['snk']) };
    const { isPaulSummersFormat, parsePaulSummersFile } = await import('@lib/import/formats/PaulSummersParser');
    return withNativeThenUADE('paulSummers', snkCtx,
      (buf: Uint8Array | ArrayBuffer, name: string) => { if (isPaulSummersFormat(buf as ArrayBuffer)) return parsePaulSummersFile(buf as ArrayBuffer, name); return null; },
      'PaulSummersParser', { injectUADE: true });
  }

  // ── Desire (DSR.* prefix) ─────────────────────────────────────────────────
  // Amiga 4-channel format with specific 68k opcode pattern. UADE prefix: DSR.
  if (matchesExt(filename, ['dsr'])) {
    const { isDesireFormat, parseDesireFile } = await import('@lib/import/formats/DesireParser');
    return withNativeThenUADE('desire', ctx,
      (buf: Uint8Array | ArrayBuffer, name: string) => { if (isDesireFormat(buf as ArrayBuffer)) return parseDesireFile(buf as ArrayBuffer, name); return null; },
      'DesireParser', { injectUADE: true });
  }

  // ── Dave Lowe New (DLN.* prefix) ──────────────────────────────────────────
  // New-style Dave Lowe Amiga format with table-based detection. UADE prefix: DLN.
  if (matchesExt(filename, ['dln'])) {
    const { isDaveLoweNewFormat, parseDaveLoweNewFile } = await import('@lib/import/formats/DaveLoweNewParser');
    return withNativeThenUADE('daveLowe', ctx,
      (buf: Uint8Array | ArrayBuffer, name: string) => { if (isDaveLoweNewFormat(buf as ArrayBuffer)) return parseDaveLoweNewFile(buf as ArrayBuffer, name); return null; },
      'DaveLoweNewParser', { injectUADE: true });
  }

  // ── Martin Walker (AVP.* / MW.* prefix) ──────────────────────────────────
  // Amiga 5-variant format. UADE prefixes: avp, mw (different from .avp/.mw extensions).
  if (matchesExt(filename, ['avp', 'mw'])) {
    const { isMartinWalkerFormat, parseMartinWalkerFile } = await import('@lib/import/formats/MartinWalkerParser');
    return withNativeThenUADE('martinWalker', ctx,
      (buf: Uint8Array | ArrayBuffer, name: string) => { if (isMartinWalkerFormat(buf as ArrayBuffer)) return parseMartinWalkerFile(buf as ArrayBuffer, name); return null; },
      'MartinWalkerParser', { injectUADE: true });
  }

  // ── Paul Shields (PS.* prefix) ────────────────────────────────────────────
  // Amiga 3-variant format with zero-prefix header. UADE prefix: ps.
  // Use UADE prefix-form filename so the replayer is correctly identified.
  if (matchesExt(filename, ['ps'])) {
    const { isPaulShieldsFormat, parsePaulShieldsFile } = await import('@lib/import/formats/PaulShieldsParser');
    if (isPaulShieldsFormat(buffer)) {
      const result = parsePaulShieldsFile(buffer, originalFileName);
      if (!(result as any).uadeEditableFileData) {
        (result as any).uadeEditableFileData = buffer.slice(0);
        (result as any).uadeEditableFileName = toUADEPrefixName(originalFileName, ['ps']);
      }
      return result;
    }
    return callUADE(ctx);
  }

  // ── Paul Robotham (DAT.* prefix) ──────────────────────────────────────────
  // Amiga format with structured pointer table. UADE prefix: dat.
  if (matchesExt(filename, ['dat'])) {
    const { isPaulRobothamFormat, parsePaulRobothamFile } = await import('@lib/import/formats/PaulRobothamParser');
    return withNativeThenUADE('paulRobotham', ctx,
      (buf: Uint8Array | ArrayBuffer, name: string) => { if (isPaulRobothamFormat(buf as ArrayBuffer)) return parsePaulRobothamFile(buf as ArrayBuffer, name); return null; },
      'PaulRobothamParser', { injectUADE: true });
  }

  // ── Pierre Adane Packer (PAP.* prefix) ────────────────────────────────────
  // Amiga format with 4-word offset header. UADE prefix: pap.
  if (matchesExt(filename, ['pap'])) {
    const { isPierreAdaneFormat, parsePierreAdaneFile } = await import('@lib/import/formats/PierreAdaneParser');
    return withNativeThenUADE('pierreAdane', ctx,
      (buf: Uint8Array | ArrayBuffer, name: string) => { if (isPierreAdaneFormat(buf as ArrayBuffer)) return parsePierreAdaneFile(buf as ArrayBuffer, name); return null; },
      'PierreAdaneParser', { injectUADE: true });
  }

  // ── Anders 0land (HOT.* prefix) ───────────────────────────────────────────
  // Amiga 3-chunk format (mpl/mdt/msm). UADE prefix: hot.
  if (matchesExt(filename, ['hot'])) {
    const { isAnders0landFormat, parseAnders0landFile } = await import('@lib/import/formats/Anders0landParser');
    // UADE and the native parser both require hot.* prefix naming.
    // Remap extension-named files (e.g. "primemover.hot" → "hot.primemover").
    const hotBase = (filename.split('/').pop() ?? filename).replace(/\.hot$/i, '');
    const uadeCtx = { ...ctx, originalFileName: `hot.${hotBase}` };
    return withNativeThenUADE('anders0land', uadeCtx,
      async (buf: Uint8Array | ArrayBuffer, name: string) => { if (isAnders0landFormat(buf as ArrayBuffer, name)) return await parseAnders0landFile(buf as ArrayBuffer, name); return null; },
      'Anders0landParser', { injectUADE: true });
  }

  // ── Andrew Parton (BYE.* prefix) ──────────────────────────────────────────
  // Amiga format with 'BANK' magic + chip-RAM pointer table. UADE prefix: bye.
  if (matchesExt(filename, ['bye'])) {
    const { isAndrewPartonFormat, parseAndrewPartonFile } = await import('@lib/import/formats/AndrewPartonParser');
    return withNativeThenUADE('andrewParton', ctx,
      async (buf: Uint8Array | ArrayBuffer, name: string) => { if (isAndrewPartonFormat(buf as ArrayBuffer, name)) return await parseAndrewPartonFile(buf as ArrayBuffer, name); return null; },
      'AndrewPartonParser', { injectUADE: true });
  }

  // ── Custom Made (CM.* / RK.* / RKB.* prefix) ─────────────────────────────
  // Amiga format with BRA/JMP opcode detection. UADE prefixes: cm, rk, rkb.
  if (matchesExt(filename, ['cm', 'rk', 'rkb'])) {
    const { isCustomMadeFormat, parseCustomMadeFile } = await import('@lib/import/formats/CustomMadeParser');
    return withNativeThenUADE('customMade', ctx,
      async (buf: Uint8Array | ArrayBuffer, name: string) => { if (isCustomMadeFormat(buf as ArrayBuffer, name)) return await parseCustomMadeFile(buf as ArrayBuffer, name); return null; },
      'CustomMadeParser', { injectUADE: true });
  }

  // ── Ben Daglish SID (BDS.* prefix) ────────────────────────────────────────
  // Amiga HUNK-based SID-style 3-voice format. UADE prefix: BDS.
  if (matchesExt(filename, ['bds'])) {
    const { isBenDaglishSIDFormat, parseBenDaglishSIDFile } = await import('@lib/import/formats/BenDaglishSIDParser');
    return withNativeThenUADE('benDaglishSID', ctx,
      async (buf: Uint8Array | ArrayBuffer, name: string) => { if (isBenDaglishSIDFormat(buf as ArrayBuffer, name)) return parseBenDaglishSIDFile(buf as ArrayBuffer, name); return null; },
      'BenDaglishSIDParser', { injectUADE: true });
  }

  // ── Digital Sonix & Chrome (DSC.* prefix) ────────────────────────────────
  // Amiga format with sample-table structural detection. UADE prefix: DSC.
  if (matchesExt(filename, ['dsc'])) {
    const { isDscFormat, parseDscFile } = await import('@lib/import/formats/DigitalSonixChromeParser');
    return withNativeThenUADE('digitalSonixChrome', ctx,
      (buf: Uint8Array | ArrayBuffer, name: string) => { if (isDscFormat(buf as ArrayBuffer)) return parseDscFile(buf as ArrayBuffer, name); return null; },
      'DigitalSonixChromeParser', { injectUADE: true });
  }

  // ── Jesper Olsen (JO.* prefix) ────────────────────────────────────────────
  // Amiga format with jump-table detection and two sub-variants. UADE prefix: JO.
  if (matchesExt(filename, ['jo'])) {
    const { isJesperOlsenFormat, parseJesperOlsenFile } = await import('@lib/import/formats/JesperOlsenParser');
    return withNativeThenUADE('jesperOlsen', ctx,
      (buf: Uint8Array | ArrayBuffer, name: string) => { if (isJesperOlsenFormat(buf as ArrayBuffer)) return parseJesperOlsenFile(buf as ArrayBuffer, name); return null; },
      'JesperOlsenParser', { injectUADE: true });
  }

  // ── Kim Christensen (KIM.* prefix) ────────────────────────────────────────
  // Amiga format with multi-opcode scan detection. UADE prefix: KIM.
  if (matchesExt(filename, ['kim'])) {
    const { isKimChristensenFormat, parseKimChristensenFile } = await import('@lib/import/formats/KimChristensenParser');
    return withNativeThenUADE('kimChristensen', ctx,
      (buf: Uint8Array | ArrayBuffer, name: string) => { if (isKimChristensenFormat(buf as ArrayBuffer)) return parseKimChristensenFile(buf as ArrayBuffer, name); return null; },
      'KimChristensenParser', { injectUADE: true });
  }

  // ── Ashley Hogg (ASH.* prefix) ────────────────────────────────────────────
  if (matchesExt(filename, ['ash'])) {
    const { isAshleyHoggFormat, parseAshleyHoggFile } = await import('@lib/import/formats/AshleyHoggParser');
    return withNativeThenUADE('ashleyHogg', ctx,
      (buf: Uint8Array | ArrayBuffer, name: string) => { if (isAshleyHoggFormat(buf as ArrayBuffer)) return parseAshleyHoggFile(buf as ArrayBuffer, name); return null; },
      'AshleyHoggParser', { injectUADE: true });
  }

  // ── ADPCM Mono (ADPCM.* prefix) ───────────────────────────────────────────
  if (matchesExt(filename, ['adpcm'])) {
    const { isADPCMmonoFormat, parseADPCMmonoFile } = await import('@lib/import/formats/ADPCMmonoParser');
    return withNativeThenUADE('adpcmMono', ctx,
      (buf: Uint8Array | ArrayBuffer, name: string) => { if (isADPCMmonoFormat(buf as ArrayBuffer, name)) return parseADPCMmonoFile(buf as ArrayBuffer, name); return null; },
      'ADPCMmonoParser', { injectUADE: true });
  }

  // ── Janne Salmijarvi Optimizer (JS.* prefix) ──────────────────────────────
  if (matchesExt(filename, ['js'])) {
    const { isJanneSalmijarviFormat, parseJanneSalmijarviFile } = await import('@lib/import/formats/JanneSalmijarviParser');
    return withNativeThenUADE('janneSalmijarvi', ctx,
      (buf: Uint8Array | ArrayBuffer, name: string) => { if (isJanneSalmijarviFormat(buf as ArrayBuffer)) return parseJanneSalmijarviFile(buf as ArrayBuffer, name); return null; },
      'JanneSalmijarviParser', { injectUADE: true });
  }

  // ── Jochen Hippel 7V (HIP7.* / S7G.* prefix) ─────────────────────────────
  if (matchesExt(filename, ['hip7', 's7g'])) {
    const { isJochenHippel7VFormat, parseJochenHippel7VFile } = await import('@lib/import/formats/JochenHippel7VParser');
    return withNativeThenUADE('jochenHippel7V', ctx,
      (buf: Uint8Array | ArrayBuffer, name: string) => { if (isJochenHippel7VFormat(buf as ArrayBuffer)) return parseJochenHippel7VFile(buf as ArrayBuffer, name); return null; },
      'JochenHippel7VParser', { injectUADE: true });
  }

  // ── Jochen Hippel ST (.sog / .hst / .hip extension or HST.* prefix) ──────
  if (matchesExt(filename, ['sog', 'hst', 'hip'])) {
    const { isJochenHippelSTFormat, parseJochenHippelSTFile } = await import('@lib/import/formats/JochenHippelSTParser');
    return withNativeThenUADE('jochenHippelST', ctx,
      (buf: Uint8Array | ArrayBuffer, name: string) => { if (isJochenHippelSTFormat(buf as ArrayBuffer)) return parseJochenHippelSTFile(buf as ArrayBuffer, name); return null; },
      'JochenHippelSTParser', { injectUADE: true });
  }

  // ── MaxTrax (.mxtx) ──────────────────────────────────────────────────────────
  // MaxTrax is a synthesis-only Amiga format, completely different from Maximum Effect.
  // Routes to UADE eagleplayer using prefix form.
  if (matchesExt(filename, ['mxtx'])) {
    const { parseUADEFile } = await import('@lib/import/formats/UADEParser');
    return parseUADEFile(buffer, toUADEPrefixName(originalFileName, ['mxtx']), prefs.uade ?? 'enhanced', subsong, preScannedMeta);
  }

  // ── AudioSculpture / Startrekker AM (.adsc, .mod_adsc4) ──────────────────────
  // UADE eagleplayer requires prefix form: adsc.songname
  if (matchesExt(filename, ['adsc', 'mod_adsc4'])) {
    const { parseUADEFile } = await import('@lib/import/formats/UADEParser');
    return parseUADEFile(buffer, toUADEPrefixName(originalFileName, ['adsc', 'mod_adsc4']), prefs.uade ?? 'enhanced', subsong, preScannedMeta);
  }

  // ── Maximum Effect (MAX.* prefix) ────────────────────────────────────────────
  if (matchesExt(filename, ['max'])) {
    const { isMaximumEffectFormat, parseMaximumEffectFile } = await import('@lib/import/formats/MaximumEffectParser');
    return withNativeThenUADE('maximumEffect', ctx,
      (buf: Uint8Array | ArrayBuffer, name: string) => { if (isMaximumEffectFormat(buf as ArrayBuffer)) return parseMaximumEffectFile(buf as ArrayBuffer, name); return null; },
      'MaximumEffectParser', { injectUADE: true });
  }

  // ── MIDI Loriciel (MIDI.* prefix) ─────────────────────────────────────────
  if (matchesExt(filename, ['midi'])) {
    const { isMIDILoricielFormat, parseMIDILoricielFile } = await import('@lib/import/formats/MIDILoricielParser');
    return withNativeThenUADE('midiLoriciel', ctx,
      (buf: Uint8Array | ArrayBuffer, name: string) => { if (isMIDILoricielFormat(buf as ArrayBuffer)) return parseMIDILoricielFile(buf as ArrayBuffer, name); return null; },
      'MIDILoricielParser', { injectUADE: true });
  }

  // ── onEscapee (ONE.* prefix) ──────────────────────────────────────────────
  if (matchesExt(filename, ['one'])) {
    const { isOnEscapeeFormat, parseOnEscapeeFile } = await import('@lib/import/formats/OnEscapeeParser');
    return withNativeThenUADE('onEscapee', ctx,
      (buf: Uint8Array | ArrayBuffer, name: string) => { if (isOnEscapeeFormat(buf as ArrayBuffer)) return parseOnEscapeeFile(buf as ArrayBuffer, name); return null; },
      'OnEscapeeParser', { injectUADE: true });
  }

  // ── Paul Tonge (PAT.* prefix) ─────────────────────────────────────────────
  if (matchesExt(filename, ['pat'])) {
    const { isPaulTongeFormat, parsePaulTongeFile } = await import('@lib/import/formats/PaulTongeParser');
    return withNativeThenUADE('paulTonge', ctx,
      (buf: Uint8Array | ArrayBuffer, name: string) => { if (isPaulTongeFormat(buf as ArrayBuffer)) return parsePaulTongeFile(buf as ArrayBuffer, name); return null; },
      'PaulTongeParser', { injectUADE: true });
  }

  // ── Rob Hubbard ST (RHO.* prefix) ─────────────────────────────────────────
  if (matchesExt(filename, ['rho'])) {
    const { isRobHubbardSTFormat, parseRobHubbardSTFile } = await import('@lib/import/formats/RobHubbardSTParser');
    return withNativeThenUADE('robHubbardST', ctx,
      (buf: Uint8Array | ArrayBuffer, name: string) => { if (isRobHubbardSTFormat(buf as ArrayBuffer)) return parseRobHubbardSTFile(buf as ArrayBuffer, name); return null; },
      'RobHubbardSTParser', { injectUADE: true });
  }

  // ── Rob Hubbard (RH.* prefix) ─────────────────────────────────────────────
  if (matchesExt(filename, ['rh'])) {
    const { isRobHubbardFormat, parseRobHubbardFile } = await import('@lib/import/formats/RobHubbardParser');
    return withNativeThenUADE('robHubbard', ctx,
      async (buf: Uint8Array | ArrayBuffer, name: string) => { if (isRobHubbardFormat(buf as ArrayBuffer, name)) return parseRobHubbardFile(buf as ArrayBuffer, name); return null; },
      'RobHubbardParser', { injectUADE: true });
  }

  // ── AM-Composer (AMC.* prefix) ───────────────────────────────────────────
  // eagleplayer.conf: AM-Composer  prefixes=amc
  if (matchesExt(filename, ['amc'])) {
    const { parseUADEFile: parseUADE_amc } = await import('@lib/import/formats/UADEParser');
    return parseUADE_amc(buffer, toUADEPrefixName(originalFileName, ['amc']), prefs.uade ?? 'enhanced', subsong, preScannedMeta);
  }

  // ── Tier 3 suffix-form → UADE prefix-form routing ────────────────────────
  // eagleplayer.conf only registers these by prefixes=xxx (no suffix entries).
  // Without conversion, UADE receives e.g. "boulderdash.spl" and can't find
  // an eagleplayer → silent/failed audio. Convert to prefix form first.
  //
  // Compiled replayer formats (FORCE_CLASSIC_FORMATS) → classic streaming:
  if (matchesExt(filename, ['spl'])) {
    const { parseUADEFile: parseUADE_spl } = await import('@lib/import/formats/UADEParser');
    return parseUADE_spl(buffer, toUADEPrefixName(originalFileName, ['spl']), 'classic', subsong, preScannedMeta);
  }
  if (matchesExt(filename, ['riff'])) {
    const { parseUADEFile: parseUADE_riff } = await import('@lib/import/formats/UADEParser');
    return parseUADE_riff(buffer, toUADEPrefixName(originalFileName, ['riff']), 'classic', subsong, preScannedMeta);
  }
  if (matchesExt(filename, ['hd'])) {
    const { parseUADEFile: parseUADE_hd } = await import('@lib/import/formats/UADEParser');
    return parseUADE_hd(buffer, toUADEPrefixName(originalFileName, ['hd']), 'classic', subsong, preScannedMeta);
  }
  if (matchesExt(filename, ['tw'])) {
    const { parseUADEFile: parseUADE_tw } = await import('@lib/import/formats/UADEParser');
    return parseUADE_tw(buffer, toUADEPrefixName(originalFileName, ['tw']), 'classic', subsong, preScannedMeta);
  }
  if (matchesExt(filename, ['dz'])) {
    const { parseUADEFile: parseUADE_dz } = await import('@lib/import/formats/UADEParser');
    return parseUADE_dz(buffer, toUADEPrefixName(originalFileName, ['dz']), 'classic', subsong, preScannedMeta);
  }
  if (matchesExt(filename, ['bss'])) {
    const { parseUADEFile: parseUADE_bss } = await import('@lib/import/formats/UADEParser');
    return parseUADE_bss(buffer, toUADEPrefixName(originalFileName, ['bss']), 'classic', subsong, preScannedMeta);
  }
  if (matchesExt(filename, ['scn'])) {
    const { parseUADEFile: parseUADE_scn } = await import('@lib/import/formats/UADEParser');
    return parseUADE_scn(buffer, toUADEPrefixName(originalFileName, ['scn']), 'classic', subsong, preScannedMeta);
  }
  if (matchesExt(filename, ['scumm'])) {
    const { parseUADEFile: parseUADE_scumm } = await import('@lib/import/formats/UADEParser');
    return parseUADE_scumm(buffer, toUADEPrefixName(originalFileName, ['scumm']), 'classic', subsong, preScannedMeta);
  }
  // Enhanced-scan capable formats (UADE_ONLY_PREFIXES) → enhanced scan:
  if (matchesExt(filename, ['mok'])) {
    const { parseUADEFile: parseUADE_mok } = await import('@lib/import/formats/UADEParser');
    return parseUADE_mok(buffer, toUADEPrefixName(originalFileName, ['mok']), prefs.uade ?? 'enhanced', subsong, preScannedMeta);
  }
  if (matchesExt(filename, ['ea'])) {
    const { parseUADEFile: parseUADE_ea } = await import('@lib/import/formats/UADEParser');
    return parseUADE_ea(buffer, toUADEPrefixName(originalFileName, ['ea']), prefs.uade ?? 'enhanced', subsong, preScannedMeta);
  }

  // ── Mugician prefix (DMU.* / DMU2.* prefix) ──────────────────────────────
  // eagleplayer.conf: Mugician prefixes=dmu,mug  MugicianII prefixes=dmu2,mug2
  // (mug.* and mug2.* are already handled above; these cover the dmu.* variants)
  if (matchesExt(filename, ['dmu'])) {
    const { parseDigitalMugicianFile } = await import('@lib/import/formats/DigitalMugicianParser');
    return withNativeThenUADE('mugician', ctx, (buf: Uint8Array | ArrayBuffer, name: string) => parseDigitalMugicianFile(buf as ArrayBuffer, name), 'DigitalMugicianParser', { injectUADE: true });
  }

  // ── Mugician II prefix (DMU2.* prefix) ───────────────────────────────────
  if (matchesExt(filename, ['dmu2'])) {
    const { parseDigitalMugicianFile } = await import('@lib/import/formats/DigitalMugicianParser');
    return withNativeThenUADE('mugician', ctx, (buf: Uint8Array | ArrayBuffer, name: string) => parseDigitalMugicianFile(buf as ArrayBuffer, name), 'DigitalMugicianParser', { injectUADE: true });
  }

  // ── Jochen Hippel ST (MDST.* prefix) ─────────────────────────────────────
  // Amiga compiled music format by Jochen Hippel (ST version, not 7V or CoSo).
  // Magic: scan first 256 bytes for Hippel-ST opcode signature.
  if (matchesExt(filename, ['mdst'])) {
    const { isJochenHippelSTFormat, parseJochenHippelSTFile } = await import('@lib/import/formats/JochenHippelSTParser');
    return withNativeThenUADE('jochenHippelST', ctx,
      (buf: Uint8Array | ArrayBuffer, name: string) => { if (isJochenHippelSTFormat(buf as ArrayBuffer)) return parseJochenHippelSTFile(buf as ArrayBuffer, name); return null; },
      'JochenHippelSTParser', { injectUADE: true });
  }

  // ── Special FX ST (DODA.* prefix) ────────────────────────────────────────
  // Amiga compiled music format ("Special FX" by Special FX). Magic: "SWTD" tag.
  if (matchesExt(filename, ['doda'])) {
    const { isSpecialFXFormat, parseSpecialFXFile } = await import('@lib/import/formats/SpecialFXParser');
    return withNativeThenUADE('specialFX', ctx,
      (buf: Uint8Array | ArrayBuffer, name: string) => { if (isSpecialFXFormat(buf as ArrayBuffer)) return parseSpecialFXFile(buf as ArrayBuffer, name); return null; },
      'SpecialFXParser', { injectUADE: true });
  }

  // ── SynthPack (OSP.* prefix) ─────────────────────────────────────────────
  // eagleplayer.conf: SynthPack  prefixes=osp
  // Magic: "OBISYNTHPACK" at byte offset 0.
  // NOTE: UADE does not include the SynthPack eagleplayer — native stub parser only.
  if (matchesExt(filename, ['osp'])) {
    const { parseSynthPackFile } = await import('@lib/import/formats/SynthPackParser');
    return parseSynthPackFile(buffer, originalFileName);
  }

  // ── Fred Gray (gray.* prefix) ────────────────────────────────────────────
  // eagleplayer.conf: FredGray  prefixes=gray
  // Magic: "FREDGRAY" at byte offset 0x24.
  if (matchesExt(filename, ['gray'])) {
    const { isFredGrayFormat, parseFredGrayFile } = await import('@lib/import/formats/FredGrayParser');
    return withNativeThenUADE('fredGray', ctx,
      (buf: Uint8Array | ArrayBuffer, name: string) => { if (isFredGrayFormat(buf as ArrayBuffer, name)) return parseFredGrayFile(buf as ArrayBuffer, name); return null; },
      'FredGrayParser', { injectUADE: true });
  }

  // ── Jason Brooke (jcbo.* / jcb.* / jb.* prefix) ─────────────────────────
  // eagleplayer.conf: JasonBrooke  prefixes=jcbo,jcb,jb
  if (matchesExt(filename, ['jcbo', 'jcb', 'jb'])) {
    const { isJasonBrookeFormat, parseJasonBrookeFile } = await import('@lib/import/formats/JasonBrookeParser');
    const jbCtx = { ...ctx, originalFileName: toUADEPrefixName(originalFileName, ['jcbo', 'jcb', 'jb']) };
    return withNativeThenUADE('jasonBrooke', jbCtx,
      (buf: Uint8Array | ArrayBuffer, name: string) => { if (isJasonBrookeFormat(buf as ArrayBuffer, name)) return parseJasonBrookeFile(buf as ArrayBuffer, name); return null; },
      'JasonBrookeParser', { injectUADE: true });
  }

  // ── Laxity (powt.* / pt.* prefix) ────────────────────────────────────────
  // eagleplayer.conf: Laxity  prefixes=powt,pt
  // pt.* is shared with ProTracker MOD; LaxityParser handles disambiguation.
  if (matchesExt(filename, ['powt', 'pt'])) {
    const { isLaxityFormat, parseLaxityFile } = await import('@lib/import/formats/LaxityParser');
    return withNativeThenUADE('laxity', ctx,
      (buf: Uint8Array | ArrayBuffer, name: string) => { if (isLaxityFormat(buf as ArrayBuffer, name)) return parseLaxityFile(buf as ArrayBuffer, name); return null; },
      'LaxityParser', { injectUADE: true });
  }

  // ── Music Maker 4V (mm4.* / sdata.* prefix) ──────────────────────────────
  // eagleplayer.conf: MusicMaker_4V  prefixes=mm4,sdata
  if (matchesExt(filename, ['mm4', 'sdata'])) {
    const { isMusicMaker4VFormat, parseMusicMaker4VFile } = await import('@lib/import/formats/MusicMakerParser');
    // Normalize suffix-form to UADE prefix form so callUADE fallback works:
    // axelf.mm4 → mm4.axelf (UADE eagleplayer keyed on prefix)
    const mm4Base = getBasename(filename);
    const mm4Dot = mm4Base.lastIndexOf('.');
    const mm4Ctx = (mm4Dot > 0 && !mm4Base.startsWith('mm4.') && !mm4Base.startsWith('sdata.'))
      ? { ...ctx, originalFileName: `${mm4Base.slice(mm4Dot + 1)}.${mm4Base.slice(0, mm4Dot)}` }
      : ctx;
    return withNativeThenUADE('musicMaker4V', mm4Ctx,
      (buf: Uint8Array | ArrayBuffer, name: string) => { if (isMusicMaker4VFormat(buf as ArrayBuffer, name)) return parseMusicMaker4VFile(buf as ArrayBuffer, name); return null; },
      'MusicMakerParser/4V', { injectUADE: true });
  }

  // ── Music Maker 8V (mm8.* prefix) ────────────────────────────────────────
  // eagleplayer.conf: MusicMaker_8V  prefixes=mm8
  if (matchesExt(filename, ['mm8'])) {
    const { isMusicMaker8VFormat, parseMusicMaker8VFile } = await import('@lib/import/formats/MusicMakerParser');
    // Normalize suffix-form to UADE prefix form: axelf.mm8 → mm8.axelf
    const mm8Base = getBasename(filename);
    const mm8Dot = mm8Base.lastIndexOf('.');
    const mm8Ctx = (mm8Dot > 0 && !mm8Base.startsWith('mm8.'))
      ? { ...ctx, originalFileName: `${mm8Base.slice(mm8Dot + 1)}.${mm8Base.slice(0, mm8Dot)}` }
      : ctx;
    return withNativeThenUADE('musicMaker8V', mm8Ctx,
      (buf: Uint8Array | ArrayBuffer, name: string) => { if (isMusicMaker8VFormat(buf as ArrayBuffer, name)) return parseMusicMaker8VFile(buf as ArrayBuffer, name); return null; },
      'MusicMakerParser/8V', { injectUADE: true });
  }

  // ── Maniacs of Noise (mon.* prefix) ──────────────────────────────────────
  // eagleplayer.conf: ManiacsOfNoise  prefixes=mon
  // mon_old.* is handled above by the JeroenTel block.
  if (matchesExt(filename, ['mon']) && !matchesExt(filename, ['mon_old'])) {
    const { parseUADEFile: parseUADE_mon } = await import('@lib/import/formats/UADEParser');
    return parseUADE_mon(buffer, originalFileName, prefs.uade ?? 'enhanced', subsong, preScannedMeta);
  }

  // ── PxTone Collage / Tune (.ptcop, .pttune) ────────────────────────────
  if (matchesExt(filename, ['ptcop', 'pttune'])) {
    const { isPxtoneFormat, parsePxtoneFile } = await import('@lib/import/formats/PxtoneParser');
    if (isPxtoneFormat(buffer)) {
      return parsePxtoneFile(originalFileName, buffer);
    }
  }

  // ── Organya / Cave Story (.org) ─────────────────────────────────────────
  if (matchesExt(filename, ['org'])) {
    const { isOrganyaFormat, parseOrganyaFile } = await import('@lib/import/formats/OrganyaParser');
    if (isOrganyaFormat(buffer)) {
      return parseOrganyaFile(buffer, originalFileName);
    }
  }

  // ── FM Towns EUP (.eup) ─────────────────────────────────────────────────
  if (matchesExt(filename, ['eup'])) {
    const { isEupFormat, parseEupFile } = await import('@lib/import/formats/EupminiParser');
    if (isEupFormat(buffer)) {
      return parseEupFile(originalFileName, buffer);
    }
  }

  // ── Ixalance IXS (.ixs) ──────────────────────────────────────────────────
  if (matchesExt(filename, ['ixs'])) {
    const { isIxsFormat, parseIxsFile } = await import('@lib/import/formats/IxalanceParser');
    if (isIxsFormat(buffer)) {
      return parseIxsFile(originalFileName, buffer);
    }
  }

  // ── Psycle (.psy) ───────────────────────────────────────────────────────
  if (matchesExt(filename, ['psy'])) {
    const { isPsycleFormat, parsePsycleFile } = await import('@lib/import/formats/CpsycleParser');
    if (isPsycleFormat(buffer)) {
      return parsePsycleFile(buffer, originalFileName);
    }
  }

  // ── SC68 / SNDH (.sc68, .sndh, .snd) ──────────────────────────────────────
  if (matchesExt(filename, ['sc68', 'sndh', 'snd'])) {
    const { isSc68Format, parseSc68File } = await import('@lib/import/formats/Sc68Parser');
    if (isSc68Format(buffer)) {
      return parseSc68File(originalFileName, buffer);
    }
  }

  // ── ZXTune formats (.pt3, .pt2, .stc, .stp, .vtx, .psg, .sqt, .psc, .asc, .psm, .gtr, .ftc, .ayc, .ts) ──
  if (matchesExt(filename, ['pt3', 'pt2', 'pt1', 'stc', 'st1', 'st3', 'stp', 'vtx', 'psg', 'psm', 'sqt', 'psc', 'asc', 'gtr', 'ftc', 'ayc', 'ts', 'cop', 'tfc', 'tfd', 'tf0', 'pdt', 'chi', 'str', 'dst', 'dmm', 'et1'])) {
    const { isZxtuneFormat, parseZxtuneFile } = await import('@lib/import/formats/ZxtuneParser');
    if (isZxtuneFormat(buffer)) {
      return parseZxtuneFile(originalFileName, buffer);
    }
  }

  // ── GlueMon (GLUE.* / GM.* prefix) ──────────────────────────────────────
  // 4-channel Amiga format by GlueMaster/Northstar. Magic: "GLUE" at offset 0.
  if (matchesExt(filename, ['glue', 'gm'])) {
    const { isGlueMonFormat, parseGlueMonFile } = await import('@lib/import/formats/GlueMonParser');
    return withNativeThenUADE('glueMonParser', ctx,
      (buf: Uint8Array | ArrayBuffer, name: string) => { if (isGlueMonFormat(buf as ArrayBuffer)) return parseGlueMonFile(buf as ArrayBuffer, name); return null; },
      'GlueMonParser', { injectUADE: true });
  }

  // ── David Hanney (DH.* prefix) ────────────────────────────────────────────
  // Amiga music format by David Hanney (1992). Magic: "DSNGSEQU" at offset 0.
  if (matchesExt(filename, ['dh'])) {
    const { isDavidHanneyFormat, parseDavidHanneyFile } = await import('@lib/import/formats/DavidHanneyParser');
    return withNativeThenUADE('davidHanney', ctx,
      (buf: Uint8Array | ArrayBuffer, name: string) => { if (isDavidHanneyFormat(buf as ArrayBuffer)) return parseDavidHanneyFile(buf as ArrayBuffer, name); return null; },
      'DavidHanneyParser', { injectUADE: true });
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
