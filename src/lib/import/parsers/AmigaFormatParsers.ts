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

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
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
    // Save original buffer — Furnace WASM does its own zlib decompression
    const originalBuffer = buffer;

    // Check for X-Tracker DMF (magic "DDMF") — different format, same extension
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

    // Detect DefleMask: either zlib-compressed (0x78 0x9c) or uncompressed (.Delek magic)
    const isZlibCompressed = bytes.length > 4 && bytes[0] === 0x78 &&
      (bytes[1] === 0x9c || bytes[1] === 0x01 || bytes[1] === 0xDA);
    const isDefleMaskMagic = bytes.length > 16 &&
      bytes[0] === 0x2E && bytes[1] === 0x44 && bytes[2] === 0x65 && bytes[3] === 0x6C
      && bytes[4] === 0x65 && bytes[5] === 0x6B; // ".Delek"
    const isDDMF = bytes[0] === 0x44 && bytes[1] === 0x44 && bytes[2] === 0x4D && bytes[3] === 0x46;
    if (isZlibCompressed || isDefleMaskMagic) {
      // Route DefleMask through Furnace WASM — DivEngine::load() handles DMF natively
      // (zlib decompression, instrument parsing, chip dispatch setup)
      const { parseFurnaceFile } = await import('./FurnaceToSong');
      return parseFurnaceFile(originalBuffer, originalFileName, subsong);
    }
    if (!isDDMF) {
      // Unknown .dmf variant → try OpenMPT WASM first, then Furnace WASM
      try {
        const { parseWithOpenMPT } = await import('@lib/import/wasm/OpenMPTConverter');
        return await parseWithOpenMPT(buffer, originalFileName);
      } catch {
        const { parseFurnaceFile } = await import('./FurnaceToSong');
        return parseFurnaceFile(buffer, originalFileName, subsong);
      }
    }
    // X-Tracker DMF that wasn't handled above → try OpenMPT WASM
    try {
      const { parseWithOpenMPT } = await import('@lib/import/wasm/OpenMPTConverter');
      return await parseWithOpenMPT(buffer, originalFileName);
    } catch {
      const { parseUADEFile: parseUADE_dmf } = await import('@lib/import/formats/UADEParser');
      return parseUADE_dmf(buffer, originalFileName, prefs.uade ?? 'enhanced', subsong, preScannedMeta);
    }
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
  //   DBMX / DBM0 magic  → DigiBoosterParser (native, full decode) + OpenMPT audio
  //   "DIGI Boo..." text  → old DigiBooster 1.x text-header; handled by OpenMPT
  // OpenMPT handles audio for both — UADE produces silence for DigiBooster.
  if (filename.endsWith('.digi')) {
    if (ctx.prefs.digi !== 'uade') {
      const { parseDigiBoosterFile } = await import('@lib/import/formats/DigiBoosterParser');
      try {
        const song = parseDigiBoosterFile(ctx.buffer, ctx.originalFileName);
        // Use OpenMPT for audio (UADE produces silence for DigiBooster)
        song.libopenmptFileData = buffer.slice(0);
        return song;
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
  // Audio routed to Hippel WASM engine (libtfmxaudiodecoder auto-detects FC sub-format).
  if (isFCFormat(filename)) {
    if (prefs.fc !== 'uade') {
      try {
        const { parseFCFile } = await import('@lib/import/formats/FCParser');
        return parseFCFile(buffer, originalFileName);
      } catch (err) {
        console.warn(`[FCParser] Native parse failed for ${filename}, falling back to UADE:`, err);
      }
    }
    const { parseUADEFile } = await import('@lib/import/formats/UADEParser');
    return parseUADEFile(buffer, originalFileName, prefs.uade ?? 'enhanced', subsong, preScannedMeta);
  }

  // ── SoundMon (Brian Postma) ─────────────────────────────────────────────
  // injectUADE: native parser always runs for editable patterns; UADE handles audio.
  if (matchesExt(filename, ['bp', 'bp3', 'sndmon'])) {
    const { parseSoundMonFile } = await import('@lib/import/formats/SoundMonParser');
    return withNativeThenUADE('soundmon', ctx, (buf: Uint8Array | ArrayBuffer, name: string) => parseSoundMonFile(buf as ArrayBuffer, name), 'SoundMonParser', { injectUADE: true });
  }

  // ── SidMon 1.0 / SidMon II (.smn/.sid — .sid disambiguated by magic) ──
  // .sid files: try SidMon1 magic → if no match, fall through to C64 SID handler
  // .smn files: try SidMon1 → SidMon2 (no C64 ambiguity)
  if (matchesExt(filename, ['smn', 'sid'])) {
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
    // For .smn only: try SidMon2. For .sid: fall through to C64 SID handler below.
    if (matchesExt(filename, ['smn'])) {
      const { parseSidMon2File } = await import('@lib/import/formats/SidMon2Parser');
      return parseSidMon2File(buffer, originalFileName);
    }
    // .sid files that aren't SidMon1: fall through to rest of dispatch (C64 SID, etc.)
  }

  // ── SidMon II (.sid2 / .sd2 — unambiguous SidMon 2) ──────────────────────
  // Dedicated Sd2Engine WASM replayer handles playback; native parser provides patterns.
  if (matchesExt(filename, ['sid2', 'sd2'])) {
    const { parseSidMon2File } = await import('@lib/import/formats/SidMon2Parser');
    return parseSidMon2File(buffer, originalFileName);
  }

  // ── Fred Editor ───────────────────────────────────────────────────────────
  // ── Fred Editor (.fred) — synthesized instruments, UADE classic mode ──────
  if (matchesExt(filename, ['fred'])) {
    const { isFredEditorFormat, parseFredEditorFile } = await import('@lib/import/formats/FredEditorParser');
    return withNativeThenUADE('fred', ctx,
      (buf: Uint8Array | ArrayBuffer, name: string) => {
        const ab = buf instanceof Uint8Array ? buf.buffer as ArrayBuffer : buf as ArrayBuffer;
        if (isFredEditorFormat(ab)) return parseFredEditorFile(ab, name);
        return null;
      },
      'FredEditorParser', { injectUADE: true });
  }

  // ── Sound-FX ──────────────────────────────────────────────────────────────
  // .sfx/.sfx2 — OpenMPT
  if (matchesExt(filename, ['sfx', 'sfx2'])) {
    const { parseWithOpenMPT } = await import('@lib/import/wasm/OpenMPTConverter');
    const song = await parseWithOpenMPT(buffer, originalFileName);
    song.libopenmptFileData = buffer.slice(0);
    return song;
  }
  // .sfx13 — Native parser extracts samples; UADE handles audio.
  if (matchesExt(filename, ['sfx13'])) {
    const { isSoundFXFormat, parseSoundFXFile } = await import('@lib/import/formats/SoundFXParser');
    return withNativeThenUADE('soundfx', ctx,
      (buf: Uint8Array | ArrayBuffer, name: string) => {
        const ab = buf instanceof Uint8Array ? buf.buffer as ArrayBuffer : buf as ArrayBuffer;
        if (isSoundFXFormat(ab)) return parseSoundFXFile(ab, name);
        return null;
      },
      'SoundFXParser', { injectUADE: true });
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
  // Native parser provides full pattern/instrument display; UADE handles audio
  // for authentic Amiga playback (IFF EMOD via UADEEditableSynth).
  if (matchesExt(filename, ['emod', 'qc'])) {
    try {
      const { isQuadraComposerFormat, parseQuadraComposerFile } = await import('@lib/import/formats/QuadraComposerParser');
      if (isQuadraComposerFormat(buffer)) {
        return injectUADEPlayback(await parseQuadraComposerFile(buffer, originalFileName), ctx);
      }
    } catch (err) {
      console.warn(`[QuadraComposerParser] Native parse failed for ${filename}, falling back to UADE:`, err);
    }
    return callUADE(ctx);
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

  // ── Sonic Arranger — native parser provides detection; UADE handles audio.
  if (matchesExt(filename, ['sas'])) {
    const { isSonicArrangerFormat, parseSonicArrangerFile } = await import('@lib/import/formats/SonicArrangerParser');
    return withNativeThenUADE('sonicArranger', ctx,
      (buf: Uint8Array | ArrayBuffer, name: string) => {
        const ab = buf instanceof Uint8Array ? buf.buffer as ArrayBuffer : buf as ArrayBuffer;
        if (isSonicArrangerFormat(ab)) return parseSonicArrangerFile(ab, name);
        return null;
      },
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
  // Native WASM replayer (emoon's C99 port of Raspberry Casket)
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
  // Compiled 68k executable. Native parser provides detection/metadata;
  // UADE enhanced scan captures patterns from Paula DMA writes.
  if (matchesExt(filename, ['rh', 'rhp'])) {
    const { isRobHubbardFormat, parseRobHubbardFile } = await import('@lib/import/formats/RobHubbardParser');
    return withNativeThenUADE('robHubbard', ctx,
      (buf: Uint8Array | ArrayBuffer, name: string) => {
        const ab = buf instanceof Uint8Array ? buf.buffer as ArrayBuffer : buf as ArrayBuffer;
        if (isRobHubbardFormat(ab, name)) return parseRobHubbardFile(ab, name);
        return null;
      },
      'RobHubbardParser', { injectUADE: true });
  }

  // ── TFMX (Jochen Hippel) ─────────────────────────────────────────────────
  // Native TFMXParser provides patterns; TFMXEngine WASM handles audio playback.
  // Companion smpl.* file is passed to the WASM engine for sample data.
  if (matchesExt(filename, ['tfmx', 'mdat', 'tfx'])) {
    try {
      const { parseTFMXFile } = await import('@lib/import/formats/TFMXParser');
      const nativeSong = parseTFMXFile(buffer, originalFileName, subsong);

      // Find companion smpl.* file
      let smplData: ArrayBuffer | undefined;
      if (companionFiles) {
        for (const [key, val] of companionFiles) {
          const base = key.split('/').pop()?.toLowerCase() ?? '';
          if (base.startsWith('smpl.')) {
            smplData = val;
            break;
          }
        }
      }

      return {
        ...nativeSong,
        format: 'TFMX' as TrackerFormat,
        // tfmxFileData triggers TFMXEngine WASM module playback (suppressNotes=true)
        tfmxFileData: buffer.slice(0),
        tfmxSmplData: smplData?.slice(0),
      };
    } catch (err) {
      console.warn(`[TFMX] Native parse failed, falling back to UADE:`, err);
      const { parseUADEFile } = await import('@lib/import/formats/UADEParser');
      return await parseUADEFile(buffer, originalFileName, prefs.uade ?? 'enhanced', subsong, preScannedMeta, companionFiles);
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

  // ── SID Factory II (.sf2) ─────────────────────────────────────────────────
  // .sf2 is ambiguous: SID Factory II (C64 PRG + 0x1337 magic) vs SoundFont (RIFF)
  if (matchesExt(filename, ['sf2'])) {
    const { isSIDFactory2File, parseSIDFactory2File } = await import('@lib/import/formats/SIDFactory2Parser');
    if (isSIDFactory2File(buffer)) {
      return parseSIDFactory2File(buffer, originalFileName);
    }
    // Not SID Factory II — could be a SoundFont file, which we don't support as a tracker format
    throw new Error(`${originalFileName}: SoundFont (.sf2) files are not supported as tracker formats`);
  }

  // ── CheeseCutter (.ct) ────────────────────────────────────────────────────
  // CheeseCutter C64 SID tracker. Magic: bytes[0..2] = 'CC2' (0x43 0x43 0x32).
  if (matchesExt(filename, ['ct'])) {
    const { isCheeseCutterFile, parseCheeseCutterFile } = await import('@lib/import/formats/CheeseCutterParser');
    if (isCheeseCutterFile(buffer)) {
      return parseCheeseCutterFile(buffer, originalFileName);
    }
    throw new Error(`${originalFileName}: Not a valid CheeseCutter file (missing CC2 magic)`);
  }

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
    const isC64 = isSIDFormat(buffer);
    const head = new Uint8Array(buffer).slice(0, 4);
    const magic = String.fromCharCode(head[0] || 0, head[1] || 0, head[2] || 0, head[3] || 0);
    console.log(`[AmigaFormatParsers/.sid] ${originalFileName} magic="${magic}" isC64SID=${isC64}`);
    if (isC64) {
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
    const { isGraoumfTracker2Format, parseGraoumfTracker2File } = await import('@lib/import/formats/GraoumfTracker2Parser');
    return withNativeThenUADE('graoumfTracker2', ctx,
      (buf: Uint8Array | ArrayBuffer, name: string) => {
        const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
        if (isGraoumfTracker2Format(u8)) return parseGraoumfTracker2File(u8, name);
        return null;
      },
      'GraoumfTracker2Parser', { injectUADE: true });
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
  // .puma files — OpenMPT WASM handles playback (UADE can't play Pumatracker)
  if (matchesExt(filename, ['puma'])) {
    try {
      const { parseWithOpenMPT } = await import('@lib/import/wasm/OpenMPTConverter');
      return await parseWithOpenMPT(buffer, originalFileName);
    } catch {
      const { isPumaTrackerFormat, parsePumaTrackerFile } = await import('@lib/import/formats/PumaTrackerParser');
      return withNativeThenUADE('pumaTracker', ctx,
        (bytes: Uint8Array | ArrayBuffer, name: string) => parsePumaTrackerFile(bytes instanceof Uint8Array ? bytes.buffer as ArrayBuffer : bytes, name),
        'PumaTrackerParser', { isFormat: (b: Uint8Array) => isPumaTrackerFormat(b.buffer as ArrayBuffer), injectUADE: true });
    }
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
          if (result) { result.libopenmptFileData = buffer.slice(0); return result; }
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
  // Compiled 68k Amiga executable with embedded replayer. Native parser extracts
  // real PCM samples; UADE enhanced scan captures patterns from Paula DMA writes.
  if (matchesExt(filename, ['bd'])) {
    const { isBenDaglishFormat, parseBenDaglishFile } = await import('@lib/import/formats/BenDaglishParser');
    return withNativeThenUADE('benDaglish', ctx,
      (buf: Uint8Array | ArrayBuffer, name: string) => {
        const ab = buf instanceof Uint8Array ? buf.buffer as ArrayBuffer : buf as ArrayBuffer;
        if (isBenDaglishFormat(ab, name)) return parseBenDaglishFile(ab, name);
        return null;
      },
      'BenDaglishParser', { injectUADE: true });
  }

  // ── Images Music System (.ims) ────────────────────────────────────────────
  // .ims files — OpenMPT
  if (matchesExt(filename, ['ims'])) {
    const { parseWithOpenMPT } = await import('@lib/import/wasm/OpenMPTConverter');
    const song = await parseWithOpenMPT(buffer, originalFileName);
    song.libopenmptFileData = buffer.slice(0);
    song.uadeEditableFileData = buffer.slice(0) as ArrayBuffer;
    song.uadeEditableFileName = originalFileName;
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
  // Fully synthesized format (no PCM samples). Native WASM engine.
  if (matchesExt(filename, ['st'])) {
    const { isSawteethFormat, parseSawteethFile } = await import('@lib/import/formats/SawteethParser');
    if (isSawteethFormat(new Uint8Array(buffer))) {
      return parseSawteethFile(new Uint8Array(buffer), originalFileName) ?? null;
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

  // ── Sound Factory (.psf) — Native parser extracts samples; UADE handles audio.
  if (matchesExt(filename, ['psf'])) {
    const { isSoundFactoryFormat, parseSoundFactoryFile } = await import('@lib/import/formats/SoundFactoryParser');
    return withNativeThenUADE('soundFactory', ctx,
      (buf: Uint8Array | ArrayBuffer, name: string) => {
        const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
        if (isSoundFactoryFormat(u8)) return parseSoundFactoryFile(u8, name);
        return null;
      },
      'SoundFactoryParser', { injectUADE: true });
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

  // ── Ron Klaren (.rk, .rkb) — Native parser extracts samples; UADE handles audio.
  if (matchesExt(filename, ['rk', 'rkb'])) {
    const { isRonKlarenFormat, parseRonKlarenFile } = await import('@lib/import/formats/RonKlarenParser');
    return withNativeThenUADE('ronKlaren', ctx,
      (buf: Uint8Array | ArrayBuffer, name: string) => {
        const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
        if (isRonKlarenFormat(u8)) return parseRonKlarenFile(u8, name);
        return null;
      },
      'RonKlarenParser', { injectUADE: true });
  }

  // ── UNIC Tracker (.unic) ─────────────────────────────────────────────────
  if (matchesExt(filename, ['unic'])) {
    try {
      const { isUNICFormat, parseUNICFile } = await import('@lib/import/formats/UNICParser');
      if (isUNICFormat(buffer)) {
        const song = await parseUNICFile(buffer, originalFileName);
        song.libopenmptFileData = buffer.slice(0);
        return song;
      }
    } catch (err) {
      console.warn(`[UNICParser] Native parse failed for ${filename}, falling back to OpenMPT:`, err);
    }
    // Fall through to libopenmpt
  }

  // ── MultiTracker (.mtm) ──────────────────────────────────────────────────
  if (matchesExt(filename, ['mtm'])) {
    try {
      const { isMTMFormat, parseMTMFile } = await import('@lib/import/formats/MTMParser');
      if (isMTMFormat(buffer)) {
        const song = await parseMTMFile(buffer, originalFileName);
        song.libopenmptFileData = buffer.slice(0);
        return song;
      }
    } catch (err) {
      console.warn(`[MTMParser] Native parse failed for ${filename}, falling back to OpenMPT:`, err);
    }
    // Fall through to libopenmpt
  }

  // ── Composer 669 (.669) ──────────────────────────────────────────────────
  if (matchesExt(filename, ['669'])) {
    try {
      const { is669Format, parse669File } = await import('@lib/import/formats/Format669Parser');
      if (is669Format(buffer)) {
        const song = await parse669File(buffer, originalFileName);
        song.libopenmptFileData = buffer.slice(0);
        return song;
      }
    } catch (err) {
      console.warn(`[Format669Parser] Native parse failed for ${filename}, falling back to OpenMPT:`, err);
    }
    // Fall through to libopenmpt
  }

  // ── Farandole Composer (.far) ─────────────────────────────────────────────
  if (matchesExt(filename, ['far'])) {
    try {
      const { isFARFormat, parseFARFile } = await import('@lib/import/formats/FARParser');
      if (isFARFormat(buffer)) {
        const song = await parseFARFile(buffer, originalFileName);
        song.libopenmptFileData = buffer.slice(0);
        return song;
      }
    } catch (err) {
      console.warn(`[FARParser] Native parse failed for ${filename}, falling back to OpenMPT:`, err);
    }
    // Fall through to libopenmpt
  }

  // ── Disorder Tracker 2 (.plm) ─────────────────────────────────────────────
  if (matchesExt(filename, ['plm'])) {
    try {
      const { isPLMFormat, parsePLMFile } = await import('@lib/import/formats/PLMParser');
      if (isPLMFormat(buffer)) {
        const song = await parsePLMFile(buffer, originalFileName);
        song.libopenmptFileData = buffer.slice(0);
        return song;
      }
    } catch (err) {
      console.warn(`[PLMParser] Native parse failed for ${filename}, falling back to OpenMPT:`, err);
    }
    // Fall through to libopenmpt
  }

  // ── Ultra Tracker (.ult) ──────────────────────────────────────────────────
  if (matchesExt(filename, ['ult'])) {
    try {
      const { isULTFormat, parseULTFile } = await import('@lib/import/formats/ULTParser');
      if (isULTFormat(buffer)) {
        const song = await parseULTFile(buffer, originalFileName);
        song.libopenmptFileData = buffer.slice(0);
        return song;
      }
    } catch (err) {
      console.warn(`[ULTParser] Native parse failed for ${filename}, falling back to OpenMPT:`, err);
    }
    // Fall through to libopenmpt
  }

  // ── Reality Tracker (.rtm) ────────────────────────────────────────────────
  if (matchesExt(filename, ['rtm'])) {
    try {
      const { isRTMFormat, parseRTMFile } = await import('@lib/import/formats/RTMParser');
      if (isRTMFormat(buffer)) {
        const song = await parseRTMFile(buffer, originalFileName);
        song.libopenmptFileData = buffer.slice(0);
        return song;
      }
    } catch (err) {
      console.warn(`[RTMParser] Native parse failed for ${filename}, falling back to OpenMPT:`, err);
    }
    // Fall through to libopenmpt
  }

  // ── DSIK Sound Module (.dsm) ──────────────────────────────────────────────
  if (matchesExt(filename, ['dsm'])) {
    try {
      const { isDSMFormat, parseDSMFile } = await import('@lib/import/formats/DSMParser');
      if (isDSMFormat(buffer)) {
        const song = await parseDSMFile(buffer, originalFileName);
        song.libopenmptFileData = buffer.slice(0);
        return song;
      }
    } catch (err) {
      console.warn(`[DSMParser] Native parse failed for ${filename}, falling back to OpenMPT:`, err);
    }
    // Fall through to libopenmpt
  }

  // ── Digital Tracker (.dtm) ────────────────────────────────────────────────
  if (matchesExt(filename, ['dtm'])) {
    try {
      const { isDTMFormat, parseDTMFile } = await import('@lib/import/formats/DTMParser');
      if (isDTMFormat(buffer)) {
        const song = await parseDTMFile(buffer, originalFileName);
        song.libopenmptFileData = buffer.slice(0);
        return song;
      }
    } catch (err) {
      console.warn(`[DTMParser] Native parse failed for ${filename}, falling back to OpenMPT:`, err);
    }
    // Fall through to libopenmpt
  }

  // ── ScreamTracker 2 (.stm) ────────────────────────────────────────────────
  if (matchesExt(filename, ['stm'])) {
    try {
      const { isSTMFormat, parseSTMFile } = await import('@lib/import/formats/STMParser');
      if (isSTMFormat(buffer)) {
        const song = await parseSTMFile(buffer, originalFileName);
        song.libopenmptFileData = buffer.slice(0);
        return song;
      }
    } catch (err) {
      console.warn(`[STMParser] Native parse failed for ${filename}, falling back to OpenMPT:`, err);
    }
    // Fall through to libopenmpt
  }

  // ── ScreamTracker STMIK (.stx) ────────────────────────────────────────────
  if (matchesExt(filename, ['stx'])) {
    try {
      const { isSTXFormat, parseSTXFile } = await import('@lib/import/formats/STXParser');
      if (isSTXFormat(buffer)) {
        const song = parseSTXFile(buffer, originalFileName);
        song.libopenmptFileData = buffer.slice(0);
        return song;
      }
    } catch (err) {
      console.warn(`[STXParser] Native parse failed for ${filename}, falling back to OpenMPT:`, err);
    }
    // Fall through to libopenmpt
  }

  // ── NoiseRunner (.nru) ────────────────────────────────────────────────────
  if (matchesExt(filename, ['nru'])) {
    try {
      const { isNRUFormat, parseNRUFile } = await import('@lib/import/formats/NRUParser');
      if (isNRUFormat(buffer)) {
        const song = await parseNRUFile(buffer, originalFileName);
        song.libopenmptFileData = buffer.slice(0);
        return song;
      }
    } catch (err) {
      console.warn(`[NRUParser] Native parse failed for ${filename}, falling back to OpenMPT:`, err);
    }
    // Fall through to libopenmpt
  }

  // ── PolyTracker (.ptm) ────────────────────────────────────────────────────
  if (matchesExt(filename, ['ptm'])) {
    try {
      const { isPTMFormat, parsePTMFile } = await import('@lib/import/formats/PTMParser');
      if (isPTMFormat(buffer)) {
        const song = await parsePTMFile(buffer, originalFileName);
        song.libopenmptFileData = buffer.slice(0);
        return song;
      }
    } catch (err) {
      console.warn(`[PTMParser] Native parse failed for ${filename}, falling back to OpenMPT:`, err);
    }
    // Fall through to libopenmpt
  }

  // ── General DigiMusic (.gdm) ──────────────────────────────────────────────
  if (matchesExt(filename, ['gdm'])) {
    try {
      const { isGDMFormat, parseGDMFile } = await import('@lib/import/formats/GDMParser');
      if (isGDMFormat(buffer)) {
        const song = await parseGDMFile(buffer, originalFileName);
        song.libopenmptFileData = buffer.slice(0);
        return song;
      }
    } catch (err) {
      console.warn(`[GDMParser] Native parse failed for ${filename}, falling back to OpenMPT:`, err);
    }
    // Fall through to libopenmpt
  }

  // ── Ultimate SoundTracker (.stk) ──────────────────────────────────────────
  if (matchesExt(filename, ['stk'])) {
    try {
      const { isSTKFormat, parseSTKFile } = await import('@lib/import/formats/STKParser');
      if (isSTKFormat(buffer)) {
        const song = await parseSTKFile(buffer, originalFileName);
        song.libopenmptFileData = buffer.slice(0);
        return song;
      }
    } catch (err) {
      console.warn(`[STKParser] Native parse failed for ${filename}, falling back to OpenMPT:`, err);
    }
    // Fall through to libopenmpt
  }

  // ── SoundTracker Pro II (.stp) ─────────────────────────────────────────────
  if (matchesExt(filename, ['stp'])) {
    try {
      const { isSTPFormat, parseSTPFile } = await import('@lib/import/formats/STPParser');
      if (isSTPFormat(buffer)) {
        const song = await parseSTPFile(buffer, originalFileName);
        song.libopenmptFileData = buffer.slice(0);
        return song;
      }
    } catch (err) {
      console.warn(`[STPParser] Native parse failed for ${filename}, falling back to OpenMPT:`, err);
    }
    // Fall through to libopenmpt
  }

  // ── DigiTrakker (.mdl) ────────────────────────────────────────────────────
  if (matchesExt(filename, ['mdl'])) {
    try {
      const { isMDLFormat, parseMDLFile } = await import('@lib/import/formats/MDLParser');
      if (isMDLFormat(buffer)) {
        const song = await parseMDLFile(buffer, originalFileName);
        song.libopenmptFileData = buffer.slice(0);
        return song;
      }
    } catch (err) {
      console.warn(`[MDLParser] Native parse failed for ${filename}, falling back to OpenMPT:`, err);
    }
    // Fall through to libopenmpt
  }

  // ── Advanced Music Format (.amf) ──────────────────────────────────────────
  if (matchesExt(filename, ['amf'])) {
    try {
      const { isAMFFormat, parseAMFFile } = await import('@lib/import/formats/AMFParser');
      if (isAMFFormat(buffer)) {
        const song = await parseAMFFile(buffer, originalFileName);
        song.libopenmptFileData = buffer.slice(0);
        return song;
      }
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
          if (result) { result.libopenmptFileData = buffer.slice(0); return result; }
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
          if (result) { result.libopenmptFileData = buffer.slice(0); return result; }
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
          if (result) { result.libopenmptFileData = buffer.slice(0); return result; }
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
        if (result) { result.libopenmptFileData = buffer.slice(0); return result; }
      }
    } catch (err) {
      console.warn(`[KarlMortonParser] Native parse failed for ${filename}:`, err);
    }
    // Don't fall through to libopenmpt yet - let UFO/MicroProse handler try it
  }

  // ── UFO / MicroProse — native parser provides detection; UADE handles audio.
  if (matchesExt(filename, ['ufo', 'mus'])) {
    const { isUFOFormat, parseUFOFile } = await import('@lib/import/formats/UFOParser');
    return withNativeThenUADE('ufo', ctx,
      (buf: Uint8Array | ArrayBuffer, name: string) => {
        const ab = buf instanceof Uint8Array ? buf.buffer as ArrayBuffer : buf as ArrayBuffer;
        if (isUFOFormat(buf)) return parseUFOFile(ab, name);
        return null;
      },
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
          if (result) { result.libopenmptFileData = buffer.slice(0); return result; }
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
          if (result) { result.libopenmptFileData = buffer.slice(0); return result; }
        }
      } catch (err) {
        throw new Error(`[UAXParser] Failed to parse ${filename}: ${err}`);
      }
    }
    throw new Error(`[UAXParser] ${filename}: no native parser available or format not recognised`);
  }

  // ── FM Tracker (.fmt) ─────────────────────────────────────────────────────
  // PC format — OPL-based tracker, magic "FMTracker" at offset 0.
  // Always try native parser (UADE cannot play PC OPL formats).
  if (matchesExt(filename, ['fmt'])) {
    try {
      const { isFMTrackerFormat, parseFMTrackerFile } = await import('@lib/import/formats/FMTrackerParser');
      const bytes = new Uint8Array(buffer);
      if (isFMTrackerFormat(bytes)) {
        const result = parseFMTrackerFile(bytes, originalFileName);
        if (result) { result.libopenmptFileData = buffer.slice(0); return result; }
      }
    } catch (err) {
      console.warn(`[FMTrackerParser] Native parse failed for ${filename}, falling back to libopenmpt:`, err);
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
          if (result) { result.libopenmptFileData = buffer.slice(0); return result; }
        }
      } catch (err) {
        console.warn(`[MadTracker2Parser] Native parse failed for ${filename}, falling back to libopenmpt:`, err);
      }
    }
    // Fall through to libopenmpt
  }

  // ── PSM / PSM16 (Epic MegaGames MASI) (.psm) ─────────────────────────────
  // Handles both new PSM ("PSM " magic) and PSM16 ("PSM\xFE" magic).
  // Uses native parser by default when the magic byte matches (Epic MegaGames format).
  // ZXTune also uses .psm for ZX Spectrum; the magic check ensures the right parser fires.
  if (matchesExt(filename, ['psm']) && prefs.psm !== 'uade') {
    try {
      const { isPSMFormat, parsePSMFile } = await import('@lib/import/formats/PSMParser');
      const bytes = new Uint8Array(buffer);
      if (isPSMFormat(bytes)) {
        const result = parsePSMFile(bytes, originalFileName);
        if (result) { result.libopenmptFileData = buffer.slice(0); return result; }
      }
    } catch (err) {
      console.warn(`[PSMParser] Native parse failed for ${filename}, falling back:`, err);
    }
    // Fall through to libopenmpt / ZXTune if magic didn't match
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
  // Magic: bytes[0..2]="RJP", bytes[4..7]="SMOD".
  // Native parser decodes patterns + samples; UADE handles audio.
  if (
    matchesExt(filename, ['rjp', 'rj']) ||
    (matchesExt(filename, ['sng']) && buffer.byteLength >= 16 &&
      new Uint8Array(buffer)[0] === 0x52 &&   // 'R'
      new Uint8Array(buffer)[1] === 0x4a &&   // 'J'
      new Uint8Array(buffer)[2] === 0x50)     // 'P'
  ) {
    const { isRJPFormat, parseRJPFile } = await import('@lib/import/formats/RichardJosephParser');
    return withNativeThenUADE('richardJoseph', ctx,
      (buf: Uint8Array | ArrayBuffer, name: string) => {
        if (isRJPFormat(buf instanceof Uint8Array ? buf : new Uint8Array(buf))) {
          return parseRJPFile(buf instanceof Uint8Array ? buf.buffer as ArrayBuffer : buf as ArrayBuffer, name, companionFiles);
        }
        return null;
      },
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

  // ── Speedy System — native parser provides detection; UADE handles audio.
  if (matchesExt(filename, ['ss'])) {
    const { isSpeedySystemFormat, parseSpeedySystemFile } = await import('@lib/import/formats/SpeedySystemParser');
    return withNativeThenUADE('speedySystem', ctx,
      (buf: Uint8Array | ArrayBuffer, name: string) => {
        const ab = buf instanceof Uint8Array ? buf.buffer as ArrayBuffer : buf as ArrayBuffer;
        if (isSpeedySystemFormat(ab)) return parseSpeedySystemFile(ab, name);
        return null;
      },
      'SpeedySystemParser', { injectUADE: true });
  }

  // ── Tronic (.trc/.dp/.tro/.tronic) ───────────────────────────────────────
  // Amiga tracker by Stefan Hartmann. No public format spec; always delegates to UADE.
  if (matchesExt(filename, ['trc', 'dp', 'tro', 'tronic'])) {
    const { parseUADEFile: parseUADE_trc } = await import('@lib/import/formats/UADEParser');
    return parseUADE_trc(buffer, originalFileName, prefs.uade ?? 'enhanced', subsong, preScannedMeta);
  }

  // ── Dave Lowe (.dl / DL.* prefix) ─────────────────────────────────────────
  // Native parser extracts real PCM samples; UADE handles audio.
  if (matchesExt(filename, ['dl', 'dl_deli'])) {
    const { isDaveLoweFormat, parseDaveLoweFile } = await import('@lib/import/formats/DaveLoweParser');
    return withNativeThenUADE('daveLowe', ctx,
      (buf: Uint8Array | ArrayBuffer, name: string) => {
        const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
        const ab = buf instanceof Uint8Array ? buf.buffer as ArrayBuffer : buf as ArrayBuffer;
        if (isDaveLoweFormat(u8)) return parseDaveLoweFile(ab, name);
        return null;
      },
      'DaveLoweParser', { injectUADE: true });
  }

  // ── LME — native parser provides detection; UADE handles audio.
  if (matchesExt(filename, ['lme'])) {
    const { isLMEFormat, parseLMEFile } = await import('@lib/import/formats/LMEParser');
    return withNativeThenUADE('lme', ctx,
      (buf: Uint8Array | ArrayBuffer, name: string) => {
        const ab = buf instanceof Uint8Array ? buf.buffer as ArrayBuffer : buf as ArrayBuffer;
        if (isLMEFormat(buf)) return parseLMEFile(ab, name);
        return null;
      },
      'LMEParser', { injectUADE: true });
  }

  // UADE enhanced scan reconstructs patterns from Paula register captures.
  if (matchesExt(filename, ['md'])) {
    const { parseUADEFile } = await import('@lib/import/formats/UADEParser');
    const song = await parseUADEFile(buffer, originalFileName, 'enhanced', subsong, preScannedMeta);
    song.uadeEditableFileData = buffer.slice(0);
    song.uadeEditableFileName = originalFileName;
    return song;
  }

  // ── Medley — native parser provides detection; UADE handles audio.
  if (matchesExt(filename, ['ml', 'mso'])) {
    const { isMedleyFormat, parseMedleyFile } = await import('@lib/import/formats/MedleyParser');
    return withNativeThenUADE('medley', ctx,
      (buf: Uint8Array | ArrayBuffer, name: string) => {
        const ab = buf instanceof Uint8Array ? buf.buffer as ArrayBuffer : buf as ArrayBuffer;
        if (isMedleyFormat(buf)) return parseMedleyFile(ab, name);
        return null;
      },
      'MedleyParser', { injectUADE: true });
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
  // Native parser decodes full pattern data from voice sequences + tracks; UADE handles audio.
  if (matchesExt(filename, ['jt', 'mon_old'])) {
    const { isJeroenTelFormat, parseJeroenTelFile } = await import('@lib/import/formats/JeroenTelParser');
    return withNativeThenUADE('jeroenTel', ctx,
      (buf: Uint8Array | ArrayBuffer, name: string) => {
        const ab = buf instanceof Uint8Array ? buf.buffer as ArrayBuffer : buf as ArrayBuffer;
        if (isJeroenTelFormat(ab, name)) return parseJeroenTelFile(ab, name);
        return null;
      },
      'JeroenTelParser', { injectUADE: true });
  }

  // ── Quartet / Quartet PSG / Quartet ST (qpa.* / sqt.* / qts.* prefix) ──────
  // Two-file format: song data (.4v/.qpa/.sqt/.qts) + samples (SMP.set).
  // UADE enhanced scan reconstructs patterns from Paula register captures.
  if (matchesExt(filename, ['qpa', 'sqt', 'qts', '4v'])) {
    const { parseUADEFile } = await import('@lib/import/formats/UADEParser');
    const qFile = toUADEPrefixName(originalFileName, ['qpa', 'sqt', 'qts', '4v']);
    const song = await parseUADEFile(buffer, qFile, 'enhanced', subsong, preScannedMeta, companionFiles);
    song.uadeEditableFileData = buffer.slice(0);
    song.uadeEditableFileName = qFile;
    return song;
  }

  // ── Sound Master (sm.* / sm1.* / sm2.* / sm3.* / smpro.* prefix) ───────────
  // Compiled 68k executable with embedded replayer. Native parser provides detection;
  // UADE enhanced scan captures patterns from Paula DMA writes.
  if (matchesExt(filename, ['sm', 'sm1', 'sm2', 'sm3', 'smpro'])) {
    const { isSoundMasterFormat, parseSoundMasterFile } = await import('@lib/import/formats/SoundMasterParser');
    return withNativeThenUADE('soundMaster', ctx,
      (buf: Uint8Array | ArrayBuffer, name: string) => {
        const ab = buf instanceof Uint8Array ? buf.buffer as ArrayBuffer : buf as ArrayBuffer;
        if (isSoundMasterFormat(ab, name)) return parseSoundMasterFile(ab, name);
        return null;
      },
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

  // ── Jason Page (jpn.* / jpnd.* / jp.* / jpo.* / jpold.*) ──────────────────
  // Two-file format: song data (JPN.*) + samples (SMP.*). Native parser extracts
  // real PCM samples from companion file; UADE enhanced scan captures patterns.
  if (matchesExt(filename, ['jpn', 'jpnd', 'jp', 'jpo', 'jpold'])) {
    const { isJasonPageFormat, parseJasonPageFile } = await import('@lib/import/formats/JasonPageParser');
    return withNativeThenUADE('jasonPage', ctx,
      (buf: Uint8Array | ArrayBuffer, name: string) => {
        const ab = buf instanceof Uint8Array ? buf.buffer as ArrayBuffer : buf as ArrayBuffer;
        if (isJasonPageFormat(ab, name)) return parseJasonPageFile(ab, name, companionFiles);
        return null;
      },
      'JasonPageParser', { injectUADE: true });
  }




  // ── TME — native parser provides detection; UADE handles audio.
  if (matchesExt(filename, ['tme'])) {
    const { isTMEFormat, parseTMEFile } = await import('@lib/import/formats/TMEParser');
    return withNativeThenUADE('tme', ctx,
      (buf: Uint8Array | ArrayBuffer, name: string) => {
        const ab = buf instanceof Uint8Array ? buf.buffer as ArrayBuffer : buf as ArrayBuffer;
        if (isTMEFormat(buf)) return parseTMEFile(ab, name);
        return null;
      },
      'TMEParser', { injectUADE: true });
  }

  // ── Infogrames — native parser provides detection; UADE handles audio.
  if (matchesExt(filename, ['dum'])) {
    const { isInfogramesFormat, parseInfogramesFile } = await import('@lib/import/formats/InfogramesParser');
    return withNativeThenUADE('infogrames', ctx,
      (buf: Uint8Array | ArrayBuffer, name: string) => {
        const ab = buf instanceof Uint8Array ? buf.buffer as ArrayBuffer : buf as ArrayBuffer;
        if (isInfogramesFormat(buf)) return parseInfogramesFile(ab, name);
        return null;
      },
      'InfogramesParser', { injectUADE: true });
  }

  // ── PSA — native parser provides detection; UADE handles audio.
  if (matchesExt(filename, ['psa'])) {
    const { isPSAFormat, parsePSAFile } = await import('@lib/import/formats/PSAParser');
    return withNativeThenUADE('psa', ctx,
      (buf: Uint8Array | ArrayBuffer, name: string) => {
        const ab = buf instanceof Uint8Array ? buf.buffer as ArrayBuffer : buf as ArrayBuffer;
        if (isPSAFormat(buf)) return parsePSAFile(ab, name);
        return null;
      },
      'PSAParser', { injectUADE: true });
  }

  // ── MMDC — native parser provides detection; UADE handles audio.
  if (matchesExt(filename, ['mmdc'])) {
    const { isMMDCFormat, parseMMDCFile } = await import('@lib/import/formats/MMDCParser');
    return withNativeThenUADE('mmdc', ctx,
      (buf: Uint8Array | ArrayBuffer, name: string) => {
        const ab = buf instanceof Uint8Array ? buf.buffer as ArrayBuffer : buf as ArrayBuffer;
        if (isMMDCFormat(buf)) return parseMMDCFile(ab, name);
        return null;
      },
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

  // ── Time Tracker — native parser provides detection; UADE handles audio.
  if (matchesExt(filename, ['tmk'])) {
    const { isTimeTrackerFormat, parseTimeTrackerFile } = await import('@lib/import/formats/TimeTrackerParser');
    return withNativeThenUADE('timeTracker', ctx,
      (buf: Uint8Array | ArrayBuffer, name: string) => {
        const ab = buf instanceof Uint8Array ? buf.buffer as ArrayBuffer : buf as ArrayBuffer;
        if (isTimeTrackerFormat(buf)) return parseTimeTrackerFile(ab, name);
        return null;
      },
      'TimeTrackerParser', { injectUADE: true });
  }

  // ── Kris Hatlelid — native parser provides detection; UADE handles audio.
  if (matchesExt(filename, ['kris'])) {
    const { isKrisHatlelidFormat, parseKrisHatlelidFile } = await import('@lib/import/formats/KrisHatlelidParser');
    return withNativeThenUADE('krisHatlelid', ctx,
      (buf: Uint8Array | ArrayBuffer, name: string) => {
        const ab = buf instanceof Uint8Array ? buf.buffer as ArrayBuffer : buf as ArrayBuffer;
        if (isKrisHatlelidFormat(buf)) return parseKrisHatlelidFile(ab, name);
        return null;
      },
      'KrisHatlelidParser', { injectUADE: true });
  }

  // ── Cinemaware — native parser provides detection; UADE handles audio.
  if (matchesExt(filename, ['cin'])) {
    const { isCinemawareFormat, parseCinemawareFile } = await import('@lib/import/formats/CinemawareParser');
    return withNativeThenUADE('cinemaware', ctx,
      (buf: Uint8Array | ArrayBuffer, name: string) => {
        const ab = buf instanceof Uint8Array ? buf.buffer as ArrayBuffer : buf as ArrayBuffer;
        if (isCinemawareFormat(buf)) return parseCinemawareFile(ab, name);
        return null;
      },
      'CinemawareParser', { injectUADE: true });
  }

  // ── NovoTrade Packer (ntp.* prefix) ──────────────────────────────────────
  // Native parser extracts real PCM samples; UADE handles audio.
  if (matchesExt(filename, ['ntp'])) {
    const { isNovoTradePackerFormat, parseNovoTradePackerFile } = await import('@lib/import/formats/NovoTradePackerParser');
    return withNativeThenUADE('novoTradePacker', ctx,
      (buf: Uint8Array | ArrayBuffer, name: string) => {
        if (isNovoTradePackerFormat(buf)) return parseNovoTradePackerFile(buf instanceof Uint8Array ? buf.buffer as ArrayBuffer : buf as ArrayBuffer, name);
        return null;
      },
      'NovoTradePackerParser', { injectUADE: true });
  }

  // ── Alcatraz Packer — native parser provides detection; UADE handles audio.
  if (matchesExt(filename, ['alp'])) {
    const { isAlcatrazPackerFormat, parseAlcatrazPackerFile } = await import('@lib/import/formats/AlcatrazPackerParser');
    return withNativeThenUADE('alcatrazPacker', ctx,
      (buf: Uint8Array | ArrayBuffer, name: string) => {
        const ab = buf instanceof Uint8Array ? buf.buffer as ArrayBuffer : buf as ArrayBuffer;
        if (isAlcatrazPackerFormat(buf)) return parseAlcatrazPackerFile(ab, name);
        return null;
      },
      'AlcatrazPackerParser', { injectUADE: true });
  }

  // UADE enhanced scan reconstructs patterns from Paula register captures.
  if (matchesExt(filename, ['uds'])) {
    const { parseUADEFile } = await import('@lib/import/formats/UADEParser');
    const song = await parseUADEFile(buffer, originalFileName, 'enhanced', subsong, preScannedMeta);
    song.uadeEditableFileData = buffer.slice(0);
    song.uadeEditableFileName = originalFileName;
    return song;
  }

  // ── Tomy Tracker (SG.* prefix) ────────────────────────────────────────────
  // Amiga format with size-based structural detection. UADE prefix: SG.
  if (matchesExt(filename, ['sg'])) {
    const { isTomyTrackerFormat, parseTomyTrackerFile } = await import('@lib/import/formats/TomyTrackerParser');
    return withNativeThenUADE('tomyTracker', ctx,
      (buf: Uint8Array | ArrayBuffer, name: string) => { if (isTomyTrackerFormat(buf as ArrayBuffer)) return parseTomyTrackerFile(buf as ArrayBuffer, name); return null; },
      'TomyTrackerParser', { injectUADE: true });
  }

  // ── Fashion Tracker (EX.* prefix) ────────────────────────────────────────
  // Native parser decodes full MOD-style pattern data + encoder + layout; UADE handles audio.
  if (matchesExt(filename, ['ex'])) {
    const { isFashionTrackerFormat, parseFashionTrackerFile } = await import('@lib/import/formats/FashionTrackerParser');
    return withNativeThenUADE('fashionTracker', ctx,
      (buf: Uint8Array | ArrayBuffer, name: string) => {
        if (isFashionTrackerFormat(buf)) return parseFashionTrackerFile(buf instanceof Uint8Array ? buf.buffer as ArrayBuffer : buf as ArrayBuffer, name);
        return null;
      },
      'FashionTrackerParser', { injectUADE: true });
  }

  // ── MultiMedia Sound — native parser provides detection; UADE handles audio.
  if (matchesExt(filename, ['mms', 'sfx20'])) {
    const { isMultiMediaSoundFormat, parseMultiMediaSoundFile } = await import('@lib/import/formats/MultiMediaSoundParser');
    return withNativeThenUADE('multiMediaSound', ctx,
      (buf: Uint8Array | ArrayBuffer, name: string) => {
        const ab = buf instanceof Uint8Array ? buf.buffer as ArrayBuffer : buf as ArrayBuffer;
        if (isMultiMediaSoundFormat(buf)) return parseMultiMediaSoundFile(ab, name);
        return null;
      },
      'MultiMediaSoundParser', { injectUADE: true });
  }

  // ── Sean Conran (SCR.* prefix) ───────────────────────────────────────────
  // Compiled 68k Amiga music. Native parser provides detection/metadata;
  // UADE enhanced scan captures patterns from Paula DMA writes.
  if (matchesExt(filename, ['scr'])) {
    const { isSeanConranFormat, parseSeanConranFile } = await import('@lib/import/formats/SeanConranParser');
    return withNativeThenUADE('seanConran', ctx,
      (buf: Uint8Array | ArrayBuffer, name: string) => {
        const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
        const ab = buf instanceof Uint8Array ? buf.buffer as ArrayBuffer : buf as ArrayBuffer;
        if (isSeanConranFormat(u8)) return parseSeanConranFile(ab, name);
        return null;
      },
      'SeanConranParser', { injectUADE: true });
  }

  // ── Thomas Hermann (THM.* prefix) ────────────────────────────────────────
  // Native parser extracts real PCM samples + names; UADE handles audio.
  if (matchesExt(filename, ['thm'])) {
    const { isThomasHermannFormat, parseThomasHermannFile } = await import('@lib/import/formats/ThomasHermannParser');
    return withNativeThenUADE('thomasHermann', ctx,
      (buf: Uint8Array | ArrayBuffer, name: string) => {
        const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
        if (isThomasHermannFormat(u8)) return parseThomasHermannFile(buf instanceof Uint8Array ? buf.buffer as ArrayBuffer : buf as ArrayBuffer, name);
        return null;
      },
      'ThomasHermannParser', { injectUADE: true });
  }

  // UADE enhanced scan reconstructs patterns from Paula register captures.
  if (matchesExt(filename, ['tits'])) {
    const { parseUADEFile } = await import('@lib/import/formats/UADEParser');
    const song = await parseUADEFile(buffer, originalFileName, 'enhanced', subsong, preScannedMeta);
    song.uadeEditableFileData = buffer.slice(0);
    song.uadeEditableFileName = originalFileName;
    return song;
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

  // UADE enhanced scan reconstructs patterns from Paula register captures.
  if (matchesExt(filename, ['mus', 'ufo'])) {
    const { parseUADEFile } = await import('@lib/import/formats/UADEParser');
    const musFile = toUADEPrefixName(originalFileName, ['mus', 'ufo']);
    const song = await parseUADEFile(buffer, musFile, 'enhanced', subsong, preScannedMeta);
    song.uadeEditableFileData = buffer.slice(0);
    song.uadeEditableFileName = musFile;
    return song;
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
    const coreCtx = { ...ctx, originalFileName: toUADEPrefixName(originalFileName, ['core']) };
    const { isCoreDesignFormat, parseCoreDesignFile } = await import('@lib/import/formats/CoreDesignParser');
    return withNativeThenUADE('coreDesign', coreCtx,
      (buf: Uint8Array | ArrayBuffer, name: string) => {
        const ab = buf instanceof Uint8Array ? buf.buffer as ArrayBuffer : buf as ArrayBuffer;
        if (isCoreDesignFormat(ab)) return parseCoreDesignFile(ab, name);
        return null;
      },
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
    const { parseUADEFile } = await import('@lib/import/formats/UADEParser');
    return parseUADEFile(buffer, toUADEPrefixName(originalFileName, ['jd']), prefs.uade ?? 'enhanced', subsong, preScannedMeta);
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
    const { parseUADEFile } = await import('@lib/import/formats/UADEParser');
    return parseUADEFile(buffer, toUADEPrefixName(originalFileName, ['pvp']), prefs.uade ?? 'enhanced', subsong, preScannedMeta);
  }

  // ── Wally Beben (WB.* prefix) ─────────────────────────────────────────────
  // Native parser decodes phrase/pattern data + samples; UADE handles audio.
  if (matchesExt(filename, ['wb'])) {
    const { isWallyBebenFormat, parseWallyBebenFile } = await import('@lib/import/formats/WallyBebenParser');
    return withNativeThenUADE('wallyBeben', ctx,
      (buf: Uint8Array | ArrayBuffer, name: string) => {
        if (isWallyBebenFormat(buf)) return parseWallyBebenFile(buf instanceof Uint8Array ? buf.buffer as ArrayBuffer : buf as ArrayBuffer, name);
        return null;
      },
      'WallyBebenParser', { injectUADE: true });
  }

  // ── Steve Barrett — native parser provides detection; UADE handles audio.
  if (matchesExt(filename, ['sb'])) {
    const { isSteveBarrettFormat, parseSteveBarrettFile } = await import('@lib/import/formats/SteveBarrettParser');
    return withNativeThenUADE('steveBarrett', ctx,
      (buf: Uint8Array | ArrayBuffer, name: string) => {
        const ab = buf instanceof Uint8Array ? buf.buffer as ArrayBuffer : buf as ArrayBuffer;
        if (isSteveBarrettFormat(buf)) return parseSteveBarrettFile(ab, name);
        return null;
      },
      'SteveBarrettParser', { injectUADE: true });
  }

  // UADE enhanced scan reconstructs patterns from Paula register captures.
  if (matchesExt(filename, ['snk'])) {
    const { parseUADEFile } = await import('@lib/import/formats/UADEParser');
    const song = await parseUADEFile(buffer, originalFileName, 'enhanced', subsong, preScannedMeta);
    song.uadeEditableFileData = buffer.slice(0);
    song.uadeEditableFileName = originalFileName;
    return song;
  }

  // ── Desire (DSR.* prefix) ─────────────────────────────────────────────────
  // Native parser extracts real PCM samples via opcode scanning; UADE handles audio.
  if (matchesExt(filename, ['dsr'])) {
    const { isDesireFormat, parseDesireFile } = await import('@lib/import/formats/DesireParser');
    return withNativeThenUADE('desire', ctx,
      (buf: Uint8Array | ArrayBuffer, name: string) => {
        if (isDesireFormat(buf)) return parseDesireFile(buf instanceof Uint8Array ? buf.buffer as ArrayBuffer : buf as ArrayBuffer, name);
        return null;
      },
      'DesireParser', { injectUADE: true });
  }

  // ── Dave Lowe New (DLN.* prefix) ──────────────────────────────────────────
  // New-style Dave Lowe Amiga format with table-based detection. UADE prefix: DLN.
  if (matchesExt(filename, ['dln'])) {
    const { parseUADEFile } = await import('@lib/import/formats/UADEParser');
    return parseUADEFile(buffer, toUADEPrefixName(originalFileName, ['dln']), prefs.uade ?? 'enhanced', subsong, preScannedMeta);
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
    const { parseUADEFile } = await import('@lib/import/formats/UADEParser');
    return parseUADEFile(buffer, toUADEPrefixName(originalFileName, ['hot']), prefs.uade ?? 'enhanced', subsong, preScannedMeta);
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

  // UADE enhanced scan reconstructs patterns from Paula register captures.
  if (matchesExt(filename, ['jo'])) {
    const { parseUADEFile } = await import('@lib/import/formats/UADEParser');
    const song = await parseUADEFile(buffer, originalFileName, 'enhanced', subsong, preScannedMeta);
    song.uadeEditableFileData = buffer.slice(0);
    song.uadeEditableFileName = originalFileName;
    return song;
  }

  // ── Kim Christensen (KIM.* prefix) ────────────────────────────────────────
  // Native parser extracts real PCM samples via opcode scanning; UADE handles audio.
  if (matchesExt(filename, ['kim'])) {
    const { isKimChristensenFormat, parseKimChristensenFile } = await import('@lib/import/formats/KimChristensenParser');
    return withNativeThenUADE('kimChristensen', ctx,
      (buf: Uint8Array | ArrayBuffer, name: string) => {
        if (isKimChristensenFormat(buf)) return parseKimChristensenFile(buf instanceof Uint8Array ? buf.buffer as ArrayBuffer : buf as ArrayBuffer, name);
        return null;
      },
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
  // Audio routed to Hippel WASM engine (libtfmxaudiodecoder auto-detects 7V sub-format).
  if (matchesExt(filename, ['hip7', 's7g'])) {
    if (prefs.jochenHippel7V !== 'uade') {
      try {
        const { isJochenHippel7VFormat, parseJochenHippel7VFile } = await import('@lib/import/formats/JochenHippel7VParser');
        if (isJochenHippel7VFormat(buffer)) {
          return parseJochenHippel7VFile(buffer, originalFileName);
        }
      } catch (err) {
        console.warn(`[JochenHippel7VParser] Native parse failed for ${filename}, falling back to UADE:`, err);
      }
    }
    const { parseUADEFile } = await import('@lib/import/formats/UADEParser');
    return parseUADEFile(buffer, originalFileName, prefs.uade ?? 'enhanced', subsong, preScannedMeta);
  }

  // ── Jochen Hippel ST (.sog / .hst / .hip / .mcmd extension or HST.* / MCMD.* prefix) ──
  // Audio routed to Hippel WASM engine (libtfmxaudiodecoder auto-detects ST/MCMD sub-format).
  if (matchesExt(filename, ['sog', 'hst', 'hip', 'mcmd'])) {
    if (prefs.jochenHippelST !== 'uade') {
      try {
        const { isJochenHippelSTFormat, parseJochenHippelSTFile } = await import('@lib/import/formats/JochenHippelSTParser');
        if (isJochenHippelSTFormat(buffer)) {
          return parseJochenHippelSTFile(buffer, originalFileName);
        }
      } catch (err) {
        console.warn(`[JochenHippelSTParser] Native parse failed for ${filename}, falling back to UADE:`, err);
      }
    }
    const { parseUADEFile } = await import('@lib/import/formats/UADEParser');
    return parseUADEFile(buffer, originalFileName, prefs.uade ?? 'enhanced', subsong, preScannedMeta);
  }

  // ── MaxTrax (.mxtx) ──────────────────────────────────────────────────────────
  // MaxTrax is a synthesis-only Amiga format, completely different from Maximum Effect.
  // Routes to UADE eagleplayer using prefix form.
  if (matchesExt(filename, ['mxtx'])) {
    const { parseUADEFile } = await import('@lib/import/formats/UADEParser');
    return parseUADEFile(buffer, toUADEPrefixName(originalFileName, ['mxtx']), prefs.uade ?? 'enhanced', subsong, preScannedMeta);
  }

  // ── StarTrekker AM (.adsc) — native WASM engine ───────────────────────────────
  // Two-file format: .adsc (MOD) + .adsc.nt or .mod.nt companion file.
  // The companion NT file is searched in companionFiles map by filename heuristics.
  if (matchesExt(filename, ['adsc', 'mod_adsc4'])) {
    const { parseStartrekkerAMFile } = await import('@lib/import/formats/StartrekkerAMParser');

    // Look for companion NT file in companionFiles map
    let ntBuffer: ArrayBuffer | null = null;
    if (companionFiles && companionFiles.size > 0) {
      // Try <filename>.nt, then <basename>.nt, then any .nt key
      const candidates = [
        `${originalFileName}.nt`,
        `${originalFileName.replace(/\.(adsc|mod)$/i, '')}.nt`,
      ];
      for (const key of candidates) {
        const found = companionFiles.get(key) ?? companionFiles.get(key.toLowerCase());
        if (found) { ntBuffer = found; break; }
      }
      // Fallback: first .nt key in the map
      if (!ntBuffer) {
        for (const [key, val] of companionFiles.entries()) {
          if (key.toLowerCase().endsWith('.nt')) { ntBuffer = val; break; }
        }
      }
    }

    let modAB: ArrayBuffer;
    if (ArrayBuffer.isView(buffer)) {
      const view = buffer as unknown as Uint8Array;
      modAB = view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength) as ArrayBuffer;
    } else {
      modAB = buffer as ArrayBuffer;
    }
    return parseStartrekkerAMFile(modAB, originalFileName, ntBuffer);
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
    const { parseUADEFile } = await import('@lib/import/formats/UADEParser');
    return parseUADEFile(buffer, toUADEPrefixName(originalFileName, ['rho']), prefs.uade ?? 'enhanced', subsong, preScannedMeta);
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

  // ── Tier 3: Wanted Team Dave Lowe-derived formats ────────────────────────
  // SOPROL (.spl), Riff Raff (.riff), Howie Davies (.hd), Beathoven (.bss):
  // All are compiled 68k binaries ripped/converted by Wanted Team into a format
  // "very similar to EaglePlayer's Dave Lowe format" (per their readmes).
  // Detection: AmigaDOS HUNK_HEADER + format ID at 0x24.
  // Native parser extracts song title + instrument names; UADE classic for audio.
  if (matchesExt(filename, ['spl'])) {
    const wtCtx = { ...ctx, originalFileName: toUADEPrefixName(originalFileName, ['spl']) };
    const { isWantedTeamDaveLoweFormat, parseWantedTeamDaveLoweFile } =
      await import('@lib/import/formats/WantedTeamDaveLoweParser');
    return withNativeThenUADE('soprol', wtCtx,
      (buf: Uint8Array | ArrayBuffer, name: string) => {
        if (isWantedTeamDaveLoweFormat(buf)) return parseWantedTeamDaveLoweFile(buf instanceof Uint8Array ? buf.buffer as ArrayBuffer : buf as ArrayBuffer, name);
        return null;
      },
      'WantedTeamDaveLoweParser', { injectUADE: true });
  }
  if (matchesExt(filename, ['riff'])) {
    const wtCtx = { ...ctx, originalFileName: toUADEPrefixName(originalFileName, ['riff']) };
    const { isWantedTeamDaveLoweFormat, parseWantedTeamDaveLoweFile } =
      await import('@lib/import/formats/WantedTeamDaveLoweParser');
    return withNativeThenUADE('riffRaff', wtCtx,
      (buf: Uint8Array | ArrayBuffer, name: string) => {
        if (isWantedTeamDaveLoweFormat(buf)) return parseWantedTeamDaveLoweFile(buf instanceof Uint8Array ? buf.buffer as ArrayBuffer : buf as ArrayBuffer, name);
        return null;
      },
      'WantedTeamDaveLoweParser', { injectUADE: true });
  }
  if (matchesExt(filename, ['hd'])) {
    const wtCtx = { ...ctx, originalFileName: toUADEPrefixName(originalFileName, ['hd']) };
    const { isWantedTeamDaveLoweFormat, parseWantedTeamDaveLoweFile } =
      await import('@lib/import/formats/WantedTeamDaveLoweParser');
    return withNativeThenUADE('howieDavies', wtCtx,
      (buf: Uint8Array | ArrayBuffer, name: string) => {
        if (isWantedTeamDaveLoweFormat(buf)) return parseWantedTeamDaveLoweFile(buf instanceof Uint8Array ? buf.buffer as ArrayBuffer : buf as ArrayBuffer, name);
        return null;
      },
      'WantedTeamDaveLoweParser', { injectUADE: true });
  }
  if (matchesExt(filename, ['bss'])) {
    const wtCtx = { ...ctx, originalFileName: toUADEPrefixName(originalFileName, ['bss']) };
    const { isWantedTeamDaveLoweFormat, parseWantedTeamDaveLoweFile } =
      await import('@lib/import/formats/WantedTeamDaveLoweParser');
    return withNativeThenUADE('beathovenSynthesizer', wtCtx,
      (buf: Uint8Array | ArrayBuffer, name: string) => {
        if (isWantedTeamDaveLoweFormat(buf)) return parseWantedTeamDaveLoweFile(buf instanceof Uint8Array ? buf.buffer as ArrayBuffer : buf as ArrayBuffer, name);
        return null;
      },
      'WantedTeamDaveLoweParser', { injectUADE: true });
  }
  // ── Sean Connolly — native parser provides detection; UADE handles audio.
  if (matchesExt(filename, ['scn'])) {
    const { isSeanConnollyFormat, parseSeanConnollyFile } = await import('@lib/import/formats/SeanConnollyParser');
    return withNativeThenUADE('seanConnolly', ctx,
      (buf: Uint8Array | ArrayBuffer, name: string) => {
        const ab = buf instanceof Uint8Array ? buf.buffer as ArrayBuffer : buf as ArrayBuffer;
        if (isSeanConnollyFormat(buf)) return parseSeanConnollyFile(ab, name);
        return null;
      },
      'SeanConnollyParser', { injectUADE: true });
  }
  // ── Thomas Hermann (.tw / TW.* prefix) ───────────────────────────────────
  // .tw is the UADE eagleplayer prefix form of Thomas Hermann. The binary structure
  // may differ from .thm files so isThomasHermannFormat may not match; use stub directly.
  if (matchesExt(filename, ['tw'])) {
    const { parseUADEFile } = await import('@lib/import/formats/UADEParser');
    return parseUADEFile(buffer, toUADEPrefixName(originalFileName, ['tw']), prefs.uade ?? 'enhanced', subsong, preScannedMeta);
  }
  // ── Darius Zendeh (.dz / DZ.* prefix) ────────────────────────────────────
  // Stub parser: filename-based title + 4 placeholder instruments. UADE classic audio.
  if (matchesExt(filename, ['dz'])) {
    const { parseUADEFile } = await import('@lib/import/formats/UADEParser');
    return parseUADEFile(buffer, toUADEPrefixName(originalFileName, ['dz']), prefs.uade ?? 'enhanced', subsong, preScannedMeta);
  }

  // ── Dynamic Synthesizer (.dns) ────────────────────────────────────────────
  if (matchesExt(filename, ['dns'])) {
    const { parseUADEFile } = await import('@lib/import/formats/UADEParser');
    return parseUADEFile(buffer, toUADEPrefixName(originalFileName, ['dns']), prefs.uade ?? 'enhanced', subsong, preScannedMeta);
  }

  // ── Voodoo Supreme Synthesizer (.vss) ─────────────────────────────────────
  if (matchesExt(filename, ['vss'])) {
    const { parseUADEFile } = await import('@lib/import/formats/UADEParser');
    return parseUADEFile(buffer, toUADEPrefixName(originalFileName, ['vss']), prefs.uade ?? 'enhanced', subsong, preScannedMeta);
  }

  // ── SynTracker (.synmod) ──────────────────────────────────────────────────
  if (matchesExt(filename, ['synmod'])) {
    const { parseUADEFile } = await import('@lib/import/formats/UADEParser');
    return parseUADEFile(buffer, toUADEPrefixName(originalFileName, ['synmod']), prefs.uade ?? 'enhanced', subsong, preScannedMeta);
  }
  // ── Mark II (.mk2 / .mkii / MK2.* prefix) ────────────────────────────────
  // Stub parser: filename-based title + 4 placeholder instruments. UADE classic audio.
  // Also caught by UADEPrefixParsers for prefix-form files; this handles suffix-form.
  if (matchesExt(filename, ['mk2', 'mkii'])) {
    const mk2Ctx = { ...ctx, originalFileName: toUADEPrefixName(originalFileName, ['mk2', 'mkii']) };
    const { parseMarkIIFile } = await import('@lib/import/formats/SimpleAmigaStubParser');
    return withNativeThenUADE('markII', mk2Ctx,
      (buf: Uint8Array | ArrayBuffer, name: string) => parseMarkIIFile(buf as ArrayBuffer, name),
      'SimpleAmigaStubParser', { injectUADE: true });
  }
  // ── SCUMM (.scumm) — native pattern display + UADE classic audio ─────────
  // eagleplayer.conf: scumm.* prefix — self-contained 68k binary (player + data fused).
  // BRA.W at offset 4 jumps to player code; music data between title string and player.
  // Four voice event streams with absolute tick timestamps and Amiga period values.
  if (matchesExt(filename, ['scumm'])) {
    const scummCtx = { ...ctx, originalFileName: toUADEPrefixName(originalFileName, ['scumm']) };
    const { isSCUMMFormat, parseSCUMMFile } = await import('@lib/import/formats/SCUMMParser');
    return withNativeThenUADE('scumm', scummCtx,
      (buf: Uint8Array | ArrayBuffer, name: string) => {
        if (isSCUMMFormat(buf)) return parseSCUMMFile(buf instanceof Uint8Array ? buf.buffer as ArrayBuffer : buf as ArrayBuffer, name);
        return null;
      },
      'SCUMMParser', { injectUADE: true });
  }
  // AProSys (APS.* prefix) — ADRVPACK compressed; stub parser for title + UADE classic audio
  if (matchesExt(filename, ['aps'])) {
    const apsCtx = { ...ctx, originalFileName: toUADEPrefixName(originalFileName, ['aps']) };
    const { parseAProSysFile } = await import('@lib/import/formats/SimpleAmigaStubParser');
    return withNativeThenUADE('aProSys', apsCtx,
      (buf: Uint8Array | ArrayBuffer, name: string) => parseAProSysFile(buf as ArrayBuffer, name),
      'SimpleAmigaStubParser', { injectUADE: true });
  }
  // ── Silmarils (.mok / MOK.* prefix) ──────────────────────────────────────
  // Stub parser: filename-based title + 3 placeholder instruments (3-voice MIDI clone).
  // Enhanced scan gives garbled "mok [CIA unreliable...]" title due to MIDI clone format.
  if (matchesExt(filename, ['mok'])) {
    const { parseUADEFile } = await import('@lib/import/formats/UADEParser');
    return parseUADEFile(buffer, toUADEPrefixName(originalFileName, ['mok']), prefs.uade ?? 'enhanced', subsong, preScannedMeta);
  }
  // ── SunTronic / TSM (.sun / .tsm / tsm.* prefix) ────────────────────────
  // The Sun Machine — Amiga synthetic music exe. Native parser extracts
  // sample data via 68k opcode scanning; UADE handles audio playback.
  if (matchesExt(filename, ['sun', 'tsm'])) {
    const { isSunTronicFormat, parseSunTronicFile } = await import('@lib/import/formats/SunTronicParser');
    return withNativeThenUADE('suntronic', ctx,
      (buf: Uint8Array | ArrayBuffer, name: string) => {
        if (isSunTronicFormat(buf)) return parseSunTronicFile(buf instanceof Uint8Array ? buf.buffer as ArrayBuffer : buf as ArrayBuffer, name);
        return null;
      },
      'SunTronicParser', { injectUADE: true });
  }

  // EA handled below with native EarAcheParser + UADE classic injection

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
  // Audio routed to Hippel WASM engine (libtfmxaudiodecoder auto-detects ST sub-format).
  if (matchesExt(filename, ['mdst'])) {
    if (prefs.jochenHippelST !== 'uade') {
      try {
        const { isJochenHippelSTFormat, parseJochenHippelSTFile } = await import('@lib/import/formats/JochenHippelSTParser');
        if (isJochenHippelSTFormat(buffer)) {
          return parseJochenHippelSTFile(buffer, originalFileName);
        }
      } catch (err) {
        console.warn(`[JochenHippelSTParser] Native parse failed for ${filename}, falling back to UADE:`, err);
      }
    }
    const { parseUADEFile } = await import('@lib/import/formats/UADEParser');
    return parseUADEFile(buffer, originalFileName, prefs.uade ?? 'enhanced', subsong, preScannedMeta);
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
    const { isSynthPackFormat, parseSynthPackFile } = await import('@lib/import/formats/SynthPackParser');
    return withNativeThenUADE('synthPack' as any, ctx,
      (buf: Uint8Array | ArrayBuffer, name: string) => { if (isSynthPackFormat(buf as ArrayBuffer, name)) return parseSynthPackFile(buf as ArrayBuffer, name); return null; },
      'SynthPackParser', { injectUADE: true });
  }

  // ── Fred Gray (gray.* prefix) ────────────────────────────────────────────
  // HUNK executable with "FREDGRAY" magic. Native parser provides detection;
  // UADE enhanced scan captures patterns from Paula DMA writes.
  if (matchesExt(filename, ['gray'])) {
    const { isFredGrayFormat, parseFredGrayFile } = await import('@lib/import/formats/FredGrayParser');
    return withNativeThenUADE('fredGray', ctx,
      (buf: Uint8Array | ArrayBuffer, name: string) => {
        if (isFredGrayFormat(buf, name)) return parseFredGrayFile(buf instanceof Uint8Array ? buf.buffer as ArrayBuffer : buf as ArrayBuffer, name);
        return null;
      },
      'FredGrayParser', { injectUADE: true });
  }

  // ── Jason Brooke (jcbo.* / jcb.* / jb.* prefix) ─────────────────────────
  // UADE enhanced scan reconstructs patterns from Paula register captures.
  if (matchesExt(filename, ['jcbo', 'jcb', 'jb'])) {
    const { parseUADEFile } = await import('@lib/import/formats/UADEParser');
    const jbFile = toUADEPrefixName(originalFileName, ['jcbo', 'jcb', 'jb']);
    const song = await parseUADEFile(buffer, jbFile, 'enhanced', subsong, preScannedMeta);
    song.uadeEditableFileData = buffer.slice(0);
    song.uadeEditableFileName = jbFile;
    return song;
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

  // ── EarAche (.ea) — native pattern display + UADE classic audio ──────────────
  // eagleplayer.conf: EarAche  prefixes=ea  Magic: "EASO"
  // Enhanced scan produces completely wrong notes (synthesis engine confuses the scanner).
  // Use native EarAcheParser for pattern display; inject UADE classic for audio.
  if (matchesExt(filename, ['ea'])) {
    const eaCtx = { ...ctx, originalFileName: toUADEPrefixName(originalFileName, ['ea']) };
    const { isEarAcheFormat, parseEarAcheFile } = await import('@lib/import/formats/EarAcheParser');
    return withNativeThenUADE('earAche', eaCtx,
      (buf: Uint8Array | ArrayBuffer, name: string) => { if (isEarAcheFormat(buf)) return parseEarAcheFile(buf as ArrayBuffer, name); return null; },
      'EarAcheParser', { injectUADE: true });
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
    const monCtx = { ...ctx, originalFileName: toUADEPrefixName(originalFileName, ['mon']) };
    const { isManiacsOfNoiseFormat, parseManiacsOfNoiseFile } = await import('@lib/import/formats/ManiacsOfNoiseParser');
    return withNativeThenUADE('maniacsOfNoise', monCtx,
      (buf: Uint8Array | ArrayBuffer, name: string) => parseManiacsOfNoiseFile(buf as ArrayBuffer, name),
      'ManiacsOfNoiseParser', { isFormat: (b: Uint8Array) => isManiacsOfNoiseFormat(b, filename), injectUADE: true });
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

  // ── QSF — Capcom QSound (.qsf, .miniqsf) ────────────────────────────────────
  if (matchesExt(filename, ['qsf', 'miniqsf'])) {
    const { isQsfFormat, parseQsfFile } = await import('@lib/import/formats/QsfParser');
    if (isQsfFormat(originalFileName, buffer)) {
      return parseQsfFile(buffer, originalFileName);
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
  // Native parser decodes IFF chunks + pattern data; UADE handles audio.
  if (matchesExt(filename, ['dh'])) {
    const { isDavidHanneyFormat, parseDavidHanneyFile } = await import('@lib/import/formats/DavidHanneyParser');
    return withNativeThenUADE('davidHanney', ctx,
      (buf: Uint8Array | ArrayBuffer, name: string) => {
        if (isDavidHanneyFormat(buf)) return parseDavidHanneyFile(buf instanceof Uint8Array ? buf.buffer as ArrayBuffer : buf as ArrayBuffer, name);
        return null;
      },
      'DavidHanneyParser', { injectUADE: true });
  }

  // ── ArtAndMagic (.aam / AAM.*) ───────────────────────────────────────────
  // Stub parser for title + UADE classic audio.
  if (matchesExt(filename, ['aam'])) {
    const aamCtx = { ...ctx, originalFileName: toUADEPrefixName(originalFileName, ['aam']) };
    const { parseArtAndMagicFile } = await import('@lib/import/formats/SimpleAmigaStubParser');
    return withNativeThenUADE('artAndMagic', aamCtx,
      (buf: Uint8Array | ArrayBuffer, name: string) => parseArtAndMagicFile(buf as ArrayBuffer, name),
      'SimpleAmigaStubParser', { injectUADE: true });
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
