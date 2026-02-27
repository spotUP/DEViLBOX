/**
 * parseModuleToSong - Shared module file → TrackerSong converter
 *
 * Used by both the main tracker view (App.tsx) and the DJ file browser.
 * Handles all supported formats: MOD, XM, IT, S3M, Furnace, DefleMask, MIDI,
 * HivelyTracker/AHX, Oktalyzer, OctaMED, DigiBooster, Future Composer, and
 * 130+ exotic Amiga formats via UADE catch-all.
 * Returns a self-contained TrackerSong ready for a TrackerReplayer.
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { Pattern, InstrumentConfig } from '@/types';
import type { UADEMetadata } from '@/engine/uade/UADEEngine';
import { useSettingsStore, type FormatEnginePreferences } from '@/stores/useSettingsStore';
import { isAudioFile } from '@/lib/audioFileUtils';

/** Get current format engine preferences (non-reactive, snapshot read) */
function getFormatEngine(): FormatEnginePreferences {
  return useSettingsStore.getState().formatEngine;
}

/** Check if a filename matches Future Composer extensions */
function isFCFormat(filename: string): boolean {
  return /\.(fc|fc2|fc3|fc4|fc13|fc14|sfc|smod|bfc|bsi)$/.test(filename);
}

interface ParseOptions {
  subsong?: number;
  preScannedMeta?: UADEMetadata;
  midiOptions?: {
    quantize?: number;
    mergeChannels?: boolean;
    velocityToVolume?: boolean;
    defaultPatternLength?: number;
  };
}

/**
 * Parse a tracker module file and return a TrackerSong.
 * Handles .fur, .dmf, .mod, .xm, .it, .s3m, .mid, .hvl, .ahx, .okt, .med,
 * .digi, .fc/.fc14 and many more exotic Amiga formats via UADE.
 *
 * Format engine preferences (Settings → Format Engine) control which parser
 * is used for formats supported by multiple engines (MOD, HVL, MED, FC, etc.).
 */
export async function parseModuleToSong(file: File, subsong = 0, preScannedMeta?: UADEMetadata, midiOptions?: ParseOptions['midiOptions']): Promise<TrackerSong> {
  const filename = file.name.toLowerCase();
  const buffer = await file.arrayBuffer();
  const prefs = getFormatEngine();

  // ── Regular Audio ─────────────────────────────────────────────────────────
  // If it's a regular audio file (MP3, WAV, etc.), it shouldn't be here.
  // The DJ UI should handle it via DeckAudioPlayer directly.
  if (isAudioFile(file.name)) {
    throw new Error(`Cannot parse ${file.name} as a tracker module: it is a regular audio file.`);
  }

  // ── MIDI ──────────────────────────────────────────────────────────────────
  if (filename.endsWith('.mid') || filename.endsWith('.midi')) {
    return parseMIDIFile(file, midiOptions);
  }

  // ── HivelyTracker / AHX ─────────────────────────────────────────────────
  if (filename.endsWith('.hvl') || filename.endsWith('.ahx')) {
    if (prefs.hvl === 'uade') {
      const { parseUADEFile } = await import('@lib/import/formats/UADEParser');
      return parseUADEFile(buffer, file.name, prefs.uade ?? 'enhanced', subsong, preScannedMeta);
    }
    const { parseHivelyFile } = await import('@lib/import/formats/HivelyParser');
    return parseHivelyFile(buffer, file.name);
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
          const result = parseXTrackerFile(bytes, file.name);
          if (result) return result;
        }
      } catch (err) {
        console.warn(`[XTrackerParser] Native parse failed for ${filename}, falling back to UADE:`, err);
      }
    }
    // DefleMask DMF (non-DDMF magic) falls through to Furnace parser
    if (!bytes[0] || !(bytes[0] === 0x44 && bytes[1] === 0x44 && bytes[2] === 0x4D && bytes[3] === 0x46)) {
      return parseFurnaceFile(buffer, file.name, subsong);
    }
    // X-Tracker DMF that wasn't handled above → UADE fallback
    const { parseUADEFile: parseUADE_dmf } = await import('@lib/import/formats/UADEParser');
    return parseUADE_dmf(buffer, file.name, prefs.uade ?? 'enhanced', subsong, preScannedMeta);
  }

  // ── Furnace / DefleMask ─────────────────────────────────────────────────
  if (filename.endsWith('.fur')) {
    return parseFurnaceFile(buffer, file.name, subsong);
  }

  // ── Oktalyzer ────────────────────────────────────────────────────────────
  if (filename.endsWith('.okt')) {
    if (prefs.okt === 'uade') {
      const { parseUADEFile } = await import('@lib/import/formats/UADEParser');
      return parseUADEFile(buffer, file.name, prefs.uade ?? 'enhanced', subsong, preScannedMeta);
    }
    const { parseOktalyzerFile } = await import('@lib/import/formats/OktalyzerParser');
    return parseOktalyzerFile(buffer, file.name);
  }

  // ── OctaMED / MED ────────────────────────────────────────────────────────
  if (filename.endsWith('.med') || filename.endsWith('.mmd0') || filename.endsWith('.mmd1')
    || filename.endsWith('.mmd2') || filename.endsWith('.mmd3')) {
    if (prefs.med === 'uade') {
      const { parseUADEFile } = await import('@lib/import/formats/UADEParser');
      return parseUADEFile(buffer, file.name, prefs.uade ?? 'enhanced', subsong, preScannedMeta);
    }
    const { parseMEDFile } = await import('@lib/import/formats/MEDParser');
    return parseMEDFile(buffer, file.name);
  }

  // ── DigiBooster ──────────────────────────────────────────────────────────
  if (filename.endsWith('.digi')) {
    if (prefs.digi === 'uade') {
      const { parseUADEFile } = await import('@lib/import/formats/UADEParser');
      return parseUADEFile(buffer, file.name, prefs.uade ?? 'enhanced', subsong, preScannedMeta);
    }
    const { parseDigiBoosterFile } = await import('@lib/import/formats/DigiBoosterParser');
    return parseDigiBoosterFile(buffer, file.name);
  }

  // ── Delta Music 2.0 ──────────────────────────────────────────────────────
  // DM2Parser handles .dm2 files (magic ".FNL" at 0xBC6).
  // .dm and .dm1 are Delta Music 1.x — different format, handled by UADE.
  if (filename.endsWith('.dm2')) {
    const uadeMode = prefs.uade ?? 'enhanced';
    if (prefs.deltaMusic2 === 'native') {
      try {
        const { isDeltaMusic2Format, parseDeltaMusic2File } = await import('@lib/import/formats/DeltaMusic2Parser');
        const bytes = new Uint8Array(buffer);
        if (isDeltaMusic2Format(bytes)) {
          const result = parseDeltaMusic2File(bytes, file.name);
          if (result) return result;
        }
      } catch (err) {
        console.warn(`[DeltaMusic2Parser] Native parse failed for ${filename}, falling back to UADE:`, err);
      }
    }
    const { parseUADEFile } = await import('@lib/import/formats/UADEParser');
    return parseUADEFile(buffer, file.name, uadeMode, subsong, preScannedMeta);
  }

  // ── Future Composer ──────────────────────────────────────────────────────
  // FCParser handles FC 1.3 (magic "FC13"/"SMOD") and FC 1.4 (magic "FC14").
  // Future Composer 2 and other FC variants have different magic bytes and
  // fall through to UADE automatically when the native parser rejects them.
  if (isFCFormat(filename)) {
    const uadeMode = prefs.uade ?? 'enhanced';
    if (prefs.fc === 'native') {
      try {
        const { parseFCFile } = await import('@lib/import/formats/FCParser');
        return parseFCFile(buffer, file.name);
      } catch (err) {
        // FC2 / unknown FC variant — native parser doesn't support it, use UADE
        console.warn(`[FCParser] Native parse failed for ${filename}, falling back to UADE:`, err);
      }
    }
    const { parseUADEFile } = await import('@lib/import/formats/UADEParser');
    return parseUADEFile(buffer, file.name, uadeMode, subsong, preScannedMeta);
  }

  // ── SoundMon (Brian Postma) ─────────────────────────────────────────────
  if (/\.(bp|bp3|sndmon)$/.test(filename)) {
    const uadeMode = prefs.uade ?? 'enhanced';
    if (prefs.soundmon === 'native') {
      try {
        const { parseSoundMonFile } = await import('@lib/import/formats/SoundMonParser');
        return parseSoundMonFile(buffer, file.name);
      } catch (err) {
        console.warn(`[SoundMonParser] Native parse failed for ${filename}, falling back to UADE:`, err);
      }
    }
    const { parseUADEFile } = await import('@lib/import/formats/UADEParser');
    return parseUADEFile(buffer, file.name, uadeMode, subsong, preScannedMeta);
  }

  // ── SidMon 1.0 / SidMon II (.smn can be either) ─────────────────────────
  if (/\.smn$/.test(filename)) {
    const uadeMode = prefs.uade ?? 'enhanced';
    // Try SidMon1 magic first
    if (prefs.sidmon1 !== 'uade') {
      try {
        const { isSidMon1Format, parseSidMon1File } = await import('@lib/import/formats/SidMon1Parser');
        if (isSidMon1Format(buffer)) {
          return parseSidMon1File(buffer, file.name);
        }
      } catch (err) {
        console.warn(`[SidMon1Parser] Native parse failed for ${filename}, falling back:`, err);
      }
    }
    // Then try SidMon2
    if (prefs.sidmon2 === 'native') {
      try {
        const { parseSidMon2File } = await import('@lib/import/formats/SidMon2Parser');
        return parseSidMon2File(buffer, file.name);
      } catch (err) {
        console.warn(`[SidMon2Parser] Native parse failed for ${filename}, falling back to UADE:`, err);
      }
    }
    const { parseUADEFile } = await import('@lib/import/formats/UADEParser');
    return parseUADEFile(buffer, file.name, uadeMode, subsong, preScannedMeta);
  }

  // ── SidMon II (.sid2 — unambiguous SidMon 2) ─────────────────────────────
  if (/\.sid2$/.test(filename)) {
    const uadeMode = prefs.uade ?? 'enhanced';
    if (prefs.sidmon2 === 'native') {
      try {
        const { parseSidMon2File } = await import('@lib/import/formats/SidMon2Parser');
        return parseSidMon2File(buffer, file.name);
      } catch (err) {
        console.warn(`[SidMon2Parser] Native parse failed for ${filename}, falling back to UADE:`, err);
      }
    }
    const { parseUADEFile } = await import('@lib/import/formats/UADEParser');
    return parseUADEFile(buffer, file.name, uadeMode, subsong, preScannedMeta);
  }

  // ── Fred Editor ───────────────────────────────────────────────────────────
  if (/\.fred$/.test(filename)) {
    const uadeMode = prefs.uade ?? 'enhanced';
    if (prefs.fred === 'native') {
      try {
        const { parseFredEditorFile } = await import('@lib/import/formats/FredEditorParser');
        return parseFredEditorFile(buffer, file.name);
      } catch (err) {
        console.warn(`[FredEditorParser] Native parse failed for ${filename}, falling back to UADE:`, err);
      }
    }
    const { parseUADEFile } = await import('@lib/import/formats/UADEParser');
    return parseUADEFile(buffer, file.name, uadeMode, subsong, preScannedMeta);
  }

  // ── Sound-FX ──────────────────────────────────────────────────────────────
  if (/\.(sfx|sfx13)$/.test(filename)) {
    const uadeMode = prefs.uade ?? 'enhanced';
    if (prefs.soundfx === 'native') {
      try {
        const { parseSoundFXFile } = await import('@lib/import/formats/SoundFXParser');
        return parseSoundFXFile(buffer, file.name);
      } catch (err) {
        console.warn(`[SoundFXParser] Native parse failed for ${filename}, falling back to UADE:`, err);
      }
    }
    const { parseUADEFile } = await import('@lib/import/formats/UADEParser');
    return parseUADEFile(buffer, file.name, uadeMode, subsong, preScannedMeta);
  }

  // ── JamCracker ────────────────────────────────────────────────────────────
  if (/\.(jam|jc)$/.test(filename)) {
    try {
      const { isJamCrackerFormat, parseJamCrackerFile } = await import('@lib/import/formats/JamCrackerParser');
      if (isJamCrackerFormat(buffer)) {
        return parseJamCrackerFile(buffer, file.name);
      }
    } catch (err) {
      console.warn(`[JamCrackerParser] Native parse failed for ${filename}, falling back to UADE:`, err);
    }
    const { parseUADEFile } = await import('@lib/import/formats/UADEParser');
    const uadeMode = prefs.uade ?? 'enhanced';
    return parseUADEFile(buffer, file.name, uadeMode, subsong, preScannedMeta);
  }

  // ── Quadra Composer ───────────────────────────────────────────────────────
  if (/\.(emod|qc)$/.test(filename)) {
    try {
      const { isQuadraComposerFormat, parseQuadraComposerFile } = await import('@lib/import/formats/QuadraComposerParser');
      if (isQuadraComposerFormat(buffer)) {
        return parseQuadraComposerFile(buffer, file.name);
      }
    } catch (err) {
      console.warn(`[QuadraComposerParser] Native parse failed for ${filename}, falling back to UADE:`, err);
    }
    const { parseUADEFile } = await import('@lib/import/formats/UADEParser');
    const uadeMode = prefs.uade ?? 'enhanced';
    return parseUADEFile(buffer, file.name, uadeMode, subsong, preScannedMeta);
  }

  // ── AMOS Music Bank ───────────────────────────────────────────────────────
  if (/\.abk$/.test(filename)) {
    try {
      const { isAMOSMusicBankFormat, parseAMOSMusicBankFile } = await import('@lib/import/formats/AMOSMusicBankParser');
      if (isAMOSMusicBankFormat(buffer)) {
        return parseAMOSMusicBankFile(buffer, file.name);
      }
    } catch (err) {
      console.warn(`[AMOSMusicBankParser] Native parse failed for ${filename}, falling back to UADE:`, err);
    }
    const { parseUADEFile } = await import('@lib/import/formats/UADEParser');
    const uadeMode = prefs.uade ?? 'enhanced';
    return parseUADEFile(buffer, file.name, uadeMode, subsong, preScannedMeta);
  }

  // ── Sonic Arranger ────────────────────────────────────────────────────────
  // Magic "SOARV1.0" at offset 0. "@OARV1.0" is LH-compressed — falls to UADE.
  if (/\.(sa|sonic)$/.test(filename)) {
    const uadeMode = prefs.uade ?? 'enhanced';
    if (prefs.sonicArranger === 'native') {
      try {
        const { isSonicArrangerFormat, parseSonicArrangerFile } = await import('@lib/import/formats/SonicArrangerParser');
        if (isSonicArrangerFormat(buffer)) {
          const result = parseSonicArrangerFile(buffer, file.name);
          if (result) return result;
        }
      } catch (err) {
        console.warn(`[SonicArrangerParser] Native parse failed for ${filename}, falling back to UADE:`, err);
      }
    }
    const { parseUADEFile } = await import('@lib/import/formats/UADEParser');
    return parseUADEFile(buffer, file.name, uadeMode, subsong, preScannedMeta);
  }

  // ── InStereo! 2.0 (.is20 — unambiguous) ──────────────────────────────────
  // Magic "IS20DF10" at offset 0.
  if (/\.is20$/.test(filename)) {
    const uadeMode = prefs.uade ?? 'enhanced';
    if (prefs.inStereo2 === 'native') {
      try {
        const { isInStereo2Format, parseInStereo2File } = await import('@lib/import/formats/InStereo2Parser');
        const bytes = new Uint8Array(buffer);
        if (isInStereo2Format(bytes)) {
          const result = parseInStereo2File(bytes, file.name);
          if (result) return result;
        }
      } catch (err) {
        console.warn(`[InStereo2Parser] Native parse failed for ${filename}, falling back to UADE:`, err);
      }
    }
    const { parseUADEFile } = await import('@lib/import/formats/UADEParser');
    return parseUADEFile(buffer, file.name, uadeMode, subsong, preScannedMeta);
  }

  // ── InStereo! 1.0 (.is10 — unambiguous) ──────────────────────────────────
  // Magic "ISM!V1.2" at offset 0.
  if (/\.is10$/.test(filename)) {
    const uadeMode = prefs.uade ?? 'enhanced';
    if (prefs.inStereo1 === 'native') {
      try {
        const { isInStereo1Format, parseInStereo1File } = await import('@lib/import/formats/InStereo1Parser');
        const bytes = new Uint8Array(buffer);
        if (isInStereo1Format(bytes)) {
          const result = parseInStereo1File(bytes, file.name);
          if (result) return result;
        }
      } catch (err) {
        console.warn(`[InStereo1Parser] Native parse failed for ${filename}, falling back to UADE:`, err);
      }
    }
    const { parseUADEFile } = await import('@lib/import/formats/UADEParser');
    return parseUADEFile(buffer, file.name, uadeMode, subsong, preScannedMeta);
  }

  // ── InStereo! (.is — ambiguous: detect by magic) ─────────────────────────
  if (/\.is$/.test(filename)) {
    const uadeMode = prefs.uade ?? 'enhanced';
    const bytes = new Uint8Array(buffer);
    if (prefs.inStereo2 === 'native') {
      try {
        const { isInStereo2Format, parseInStereo2File } = await import('@lib/import/formats/InStereo2Parser');
        if (isInStereo2Format(bytes)) {
          const result = parseInStereo2File(bytes, file.name);
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
          const result = parseInStereo1File(bytes, file.name);
          if (result) return result;
        }
      } catch (err) {
        console.warn(`[InStereo1Parser] Native parse failed for ${filename}, falling back to UADE:`, err);
      }
    }
    const { parseUADEFile } = await import('@lib/import/formats/UADEParser');
    return parseUADEFile(buffer, file.name, uadeMode, subsong, preScannedMeta);
  }

  // ── Jochen Hippel CoSo ────────────────────────────────────────────────────
  if (/\.(hipc|soc|coso)$/.test(filename)) {
    const uadeMode = prefs.uade ?? 'enhanced';
    if (prefs.hippelCoso !== 'uade') {
      try {
        const { isHippelCoSoFormat, parseHippelCoSoFile } = await import('@lib/import/formats/HippelCoSoParser');
        if (isHippelCoSoFormat(buffer)) {
          return parseHippelCoSoFile(buffer, file.name);
        }
      } catch (err) {
        console.warn(`[HippelCoSoParser] Native parse failed for ${filename}, falling back to UADE:`, err);
      }
    }
    const { parseUADEFile } = await import('@lib/import/formats/UADEParser');
    return parseUADEFile(buffer, file.name, uadeMode, subsong, preScannedMeta);
  }

  // ── Rob Hubbard ───────────────────────────────────────────────────────────
  // RobHubbardParser is metadata-only (compiled 68k executable, no parseable
  // instrument data). UADE always handles audio; native parse is not used.
  if (/\.(rh|rhp)$/.test(filename)) {
    const { parseUADEFile } = await import('@lib/import/formats/UADEParser');
    return parseUADEFile(buffer, file.name, prefs.uade ?? 'enhanced', subsong, preScannedMeta);
  }

  // ── TFMX (Jochen Hippel) ─────────────────────────────────────────────────
  if (/\.(tfmx|mdat|tfx)$/.test(filename)) {
    const uadeMode = prefs.uade ?? 'enhanced';
    if (prefs.tfmx === 'native') {
      try {
        const { parseTFMXFile } = await import('@lib/import/formats/TFMXParser');
        return parseTFMXFile(buffer, file.name, subsong);
      } catch (err) {
        console.warn(`[TFMXParser] Native parse failed for ${filename}, falling back to UADE:`, err);
      }
    }
    const { parseUADEFile } = await import('@lib/import/formats/UADEParser');
    return parseUADEFile(buffer, file.name, uadeMode, subsong, preScannedMeta);
  }

  // ── Digital Mugician ──────────────────────────────────────────────────────
  if (/\.(dmu|dmu2|mug|mug2)$/.test(filename)) {
    const uadeMode = prefs.uade ?? 'enhanced';
    if (prefs.mugician === 'native') {
      try {
        const { parseDigitalMugicianFile } = await import('@lib/import/formats/DigitalMugicianParser');
        return parseDigitalMugicianFile(buffer, file.name);
      } catch (err) {
        console.warn(`[DigitalMugicianParser] Native parse failed for ${filename}, falling back to UADE:`, err);
      }
    }
    const { parseUADEFile } = await import('@lib/import/formats/UADEParser');
    return parseUADEFile(buffer, file.name, uadeMode, subsong, preScannedMeta);
  }

  // ── VGM/VGZ — Video Game Music chip-dump ─────────────────────────────────
  if (/\.(vgm|vgz)$/.test(filename)) {
    const { parseVGMFile } = await import('@lib/import/formats/VGMParser');
    return parseVGMFile(buffer, file.name);
  }

  // ── YM — Atari ST AY/YM2149 register dumps ────────────────────────────────
  if (/\.ym$/.test(filename)) {
    const { parseYMFile } = await import('@lib/import/formats/YMParser');
    return parseYMFile(buffer, file.name);
  }

  // ── NSF/NSFE — NES Sound Format ───────────────────────────────────────────
  if (/\.nsfe?$/.test(filename)) {
    const { parseNSFFile } = await import('@lib/import/formats/NSFParser');
    return parseNSFFile(buffer, file.name);
  }

  // ── SidMon 1.0 (.sid1) ───────────────────────────────────────────────────
  // .sid1 files may be SidMon 1.0 or Commodore 64 SID — try magic detection first.
  if (/\.sid1$/.test(filename)) {
    if (prefs.sidmon1 !== 'uade') {
      try {
        const { isSidMon1Format, parseSidMon1File } = await import('@lib/import/formats/SidMon1Parser');
        if (isSidMon1Format(buffer)) {
          return parseSidMon1File(buffer, file.name);
        }
      } catch (err) {
        console.warn(`[SidMon1Parser] Native parse failed for ${filename}, falling back to SID:`, err);
      }
    }
    // Fallback: try C64 SID parser
    const { parseSIDFile } = await import('@lib/import/formats/SIDParser');
    return parseSIDFile(buffer, file.name);
  }

  // ── SID — Commodore 64 PSID/RSID (.sid only — .sid1 handled above)
  if (/\.sid$/.test(filename)) {
    const { parseSIDFile } = await import('@lib/import/formats/SIDParser');
    return parseSIDFile(buffer, file.name);
  }

  // ── SAP — Atari 8-bit POKEY ───────────────────────────────────────────────
  if (/\.sap$/.test(filename)) {
    const { parseSAPFile } = await import('@lib/import/formats/SAPParser');
    return parseSAPFile(buffer, file.name);
  }

  // ── AY — ZX Spectrum AY (ZXAYEMUL) ───────────────────────────────────────
  if (/\.ay$/.test(filename)) {
    const { parseAYFile } = await import('@lib/import/formats/AYParser');
    return parseAYFile(buffer, file.name);
  }

  // ── David Whittaker (.dw / .dwold) ───────────────────────────────────────
  if (/\.(dw|dwold)$/.test(filename)) {
    const uadeMode = prefs.uade ?? 'enhanced';
    if (prefs.davidWhittaker !== 'uade') {
      try {
        const { parseDavidWhittakerFile } = await import('@lib/import/formats/DavidWhittakerParser');
        return parseDavidWhittakerFile(buffer, file.name);
      } catch (err) {
        console.warn(`[DavidWhittakerParser] Native parse failed for ${filename}, falling back to UADE:`, err);
      }
    }
    const { parseUADEFile: parseUADE } = await import('@lib/import/formats/UADEParser');
    return parseUADE(buffer, file.name, uadeMode, subsong, preScannedMeta);
  }

  // ── Art of Noise ──────────────────────────────────────────────────────────
  // AON4 (.aon) and AON8 (.aon8) — identified by "AON4"/"AON8" magic bytes at offset 0.
  if (/\.(aon|aon8)$/.test(filename)) {
    const uadeMode = prefs.uade ?? 'enhanced';
    if (prefs.artOfNoise === 'native') {
      try {
        const { isArtOfNoiseFormat, parseArtOfNoiseFile } = await import('@lib/import/formats/ArtOfNoiseParser');
        const bytes = new Uint8Array(buffer);
        if (isArtOfNoiseFormat(bytes)) {
          const result = parseArtOfNoiseFile(bytes, file.name);
          if (result) return result;
        }
      } catch (err) {
        console.warn(`[ArtOfNoiseParser] Native parse failed for ${filename}, falling back to UADE:`, err);
      }
    }
    const { parseUADEFile } = await import('@lib/import/formats/UADEParser');
    return parseUADEFile(buffer, file.name, uadeMode, subsong, preScannedMeta);
  }

  // ── Digital Symphony ──────────────────────────────────────────────────────
  // .dsym files — identified by 8-byte magic \x02\x01\x13\x13\x14\x12\x01\x0B at offset 0.
  if (/\.dsym$/.test(filename)) {
    const uadeMode = prefs.uade ?? 'enhanced';
    if (prefs.digitalSymphony === 'native') {
      try {
        const { isDigitalSymphonyFormat, parseDigitalSymphonyFile } = await import('@lib/import/formats/DigitalSymphonyParser');
        const bytes = new Uint8Array(buffer);
        if (isDigitalSymphonyFormat(bytes)) {
          const result = parseDigitalSymphonyFile(bytes, file.name);
          if (result) return result;
        }
      } catch (err) {
        console.warn(`[DigitalSymphonyParser] Native parse failed for ${filename}, falling back to UADE:`, err);
      }
    }
    const { parseUADEFile } = await import('@lib/import/formats/UADEParser');
    return parseUADEFile(buffer, file.name, uadeMode, subsong, preScannedMeta);
  }

  // ── Graoumf Tracker 1/2 ───────────────────────────────────────────────────
  // .gt2 files (GT2 format) and .gtk files (GTK format) — identified by "GT2" / "GTK" magic.
  if (/\.(gt2|gtk)$/.test(filename)) {
    const uadeMode = prefs.uade ?? 'enhanced';
    if (prefs.graoumfTracker2 === 'native') {
      try {
        const { isGraoumfTracker2Format, parseGraoumfTracker2File } = await import('@lib/import/formats/GraoumfTracker2Parser');
        const bytes = new Uint8Array(buffer);
        if (isGraoumfTracker2Format(bytes)) {
          const result = parseGraoumfTracker2File(bytes, file.name);
          if (result) return result;
        }
      } catch (err) {
        console.warn(`[GraoumfTracker2Parser] Native parse failed for ${filename}, falling back to UADE:`, err);
      }
    }
    const { parseUADEFile } = await import('@lib/import/formats/UADEParser');
    return parseUADEFile(buffer, file.name, uadeMode, subsong, preScannedMeta);
  }

  // ── Symphonie Pro ─────────────────────────────────────────────────────────
  // .symmod files — identified by "SymM" magic at offset 0.
  if (/\.symmod$/i.test(filename)) {
    const uadeMode = prefs.uade ?? 'enhanced';
    if (prefs.symphoniePro === 'native') {
      try {
        const { isSymphonieProFormat, parseSymphonieProFile } = await import('@lib/import/formats/SymphonieProParser');
        const bytes = new Uint8Array(buffer);
        if (isSymphonieProFormat(bytes)) {
          const result = await parseSymphonieProFile(bytes, file.name);
          if (result) return result;
        }
      } catch (err) {
        console.warn(`[SymphonieProParser] Native parse failed for ${filename}, falling back to UADE:`, err);
      }
    }
    const { parseUADEFile } = await import('@lib/import/formats/UADEParser');
    return parseUADEFile(buffer, file.name, uadeMode, subsong, preScannedMeta);
  }

  // ── DigiBooster Pro ───────────────────────────────────────────────────────
  // .dbm files — identified by "DBM0" magic at offset 0.
  // NOTE: .digi (DigiBooster 1.x) is handled separately above; this is DBM Pro only.
  if (/\.dbm$/i.test(filename)) {
    const uadeMode = prefs.uade ?? 'enhanced';
    if (prefs.digiBoosterPro === 'native') {
      try {
        const { isDigiBoosterProFormat, parseDigiBoosterProFile } = await import('@lib/import/formats/DigiBoosterProParser');
        const bytes = new Uint8Array(buffer);
        if (isDigiBoosterProFormat(bytes)) {
          const result = parseDigiBoosterProFile(bytes, file.name);
          if (result) return result;
        }
      } catch (err) {
        console.warn(`[DigiBoosterProParser] Native parse failed for ${filename}, falling back to UADE:`, err);
      }
    }
    const { parseUADEFile } = await import('@lib/import/formats/UADEParser');
    return parseUADEFile(buffer, file.name, uadeMode, subsong, preScannedMeta);
  }

  // ── PumaTracker ───────────────────────────────────────────────────────────
  // .puma files — no magic bytes; heuristic header validation (mirrors OpenMPT).
  if (/\.puma$/.test(filename)) {
    const uadeMode = prefs.uade ?? 'enhanced';
    if (prefs.pumaTracker === 'native') {
      try {
        const { isPumaTrackerFormat, parsePumaTrackerFile } = await import('@lib/import/formats/PumaTrackerParser');
        if (isPumaTrackerFormat(buffer)) {
          return parsePumaTrackerFile(buffer, file.name);
        }
      } catch (err) {
        console.warn(`[PumaTrackerParser] Native parse failed for ${filename}, falling back to UADE:`, err);
      }
    }
    const { parseUADEFile } = await import('@lib/import/formats/UADEParser');
    return parseUADEFile(buffer, file.name, uadeMode, subsong, preScannedMeta);
  }

  // ── Synthesis ─────────────────────────────────────────────────────────────
  // .syn files — identified by "Synth4.0" at offset 0 or "Synth4.2" at 0x1f0e.
  if (/\.syn$/.test(filename)) {
    const uadeMode = prefs.uade ?? 'enhanced';
    if (prefs.synthesis === 'native') {
      try {
        const { isSynthesisFormat, parseSynthesisFile } = await import('@lib/import/formats/SynthesisParser');
        const bytes = new Uint8Array(buffer);
        if (isSynthesisFormat(bytes)) {
          const result = parseSynthesisFile(bytes, file.name);
          if (result) return result;
        }
      } catch (err) {
        console.warn(`[SynthesisParser] Native parse failed for ${filename}, falling back to UADE:`, err);
      }
    }
    const { parseUADEFile } = await import('@lib/import/formats/UADEParser');
    return parseUADEFile(buffer, file.name, uadeMode, subsong, preScannedMeta);
  }

  // ── Digital Sound Studio ──────────────────────────────────────────────────
  // .dss files — identified by "MMU2" magic at offset 0.
  if (/\.dss$/.test(filename)) {
    const uadeMode = prefs.uade ?? 'enhanced';
    if (prefs.digitalSoundStudio === 'native') {
      try {
        const { isDigitalSoundStudioFormat, parseDigitalSoundStudioFile } = await import('@lib/import/formats/DigitalSoundStudioParser');
        const bytes = new Uint8Array(buffer);
        if (isDigitalSoundStudioFormat(bytes)) {
          const result = parseDigitalSoundStudioFile(bytes, file.name);
          if (result) return result;
        }
      } catch (err) {
        console.warn(`[DigitalSoundStudioParser] Native parse failed for ${filename}, falling back to UADE:`, err);
      }
    }
    const { parseUADEFile } = await import('@lib/import/formats/UADEParser');
    return parseUADEFile(buffer, file.name, uadeMode, subsong, preScannedMeta);
  }

  // ── Music Assembler ────────────────────────────────────────────────────────
  // .ma files — identified by M68k player bytecode scanning (no magic bytes).
  if (/\.ma$/.test(filename)) {
    const uadeMode = prefs.uade ?? 'enhanced';
    if (prefs.musicAssembler === 'native') {
      try {
        const { isMusicAssemblerFormat, parseMusicAssemblerFile } = await import('@lib/import/formats/MusicAssemblerParser');
        const bytes = new Uint8Array(buffer);
        if (isMusicAssemblerFormat(bytes)) {
          const result = parseMusicAssemblerFile(bytes, file.name);
          if (result) return result;
        }
      } catch (err) {
        console.warn(`[MusicAssemblerParser] Native parse failed for ${filename}, falling back to UADE:`, err);
      }
    }
    const { parseUADEFile } = await import('@lib/import/formats/UADEParser');
    return parseUADEFile(buffer, file.name, uadeMode, subsong, preScannedMeta);
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
          const result = parseComposer667File(bytes, file.name);
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
    const uadeMode = prefs.uade ?? 'enhanced';
    if (prefs.chuckBiscuits === 'native') {
      try {
        const { isChuckBiscuitsFormat, parseChuckBiscuitsFile } = await import('@lib/import/formats/ChuckBiscuitsParser');
        const bytes = new Uint8Array(buffer);
        if (isChuckBiscuitsFormat(bytes)) {
          const result = parseChuckBiscuitsFile(bytes, file.name);
          if (result) return result;
        }
      } catch (err) {
        console.warn(`[ChuckBiscuitsParser] Native parse failed for ${filename}, falling back to UADE:`, err);
      }
    }
    const { parseUADEFile } = await import('@lib/import/formats/UADEParser');
    return parseUADEFile(buffer, file.name, uadeMode, subsong, preScannedMeta);
  }

  // ── Ben Daglish (bd.* prefix) ────────────────────────────────────────────
  // Compiled 68k Amiga music format. Magic: Amiga HUNK header at offset 0.
  {
    const _bdBase = (filename.split('/').pop() ?? filename).split('\\').pop()!.toLowerCase();
    if (_bdBase.startsWith('bd.')) {
      if (prefs.benDaglish === 'native') {
        try {
          const { isBenDaglishFormat, parseBenDaglishFile } = await import('@lib/import/formats/BenDaglishParser');
          if (isBenDaglishFormat(buffer, file.name)) return await parseBenDaglishFile(buffer, file.name);
        } catch (err) {
          console.warn(`[BenDaglishParser] Native parse failed for ${filename}, falling back to UADE:`, err);
        }
      }
      const { parseUADEFile: parseUADE_bd } = await import('@lib/import/formats/UADEParser');
      return parseUADE_bd(buffer, file.name, prefs.uade ?? 'enhanced', subsong, preScannedMeta);
    }
  }

  // ── Images Music System (.ims) ────────────────────────────────────────────
  if (/\.ims$/.test(filename)) {
    try {
      const { isIMSFormat, parseIMSFile } = await import('@lib/import/formats/IMSParser');
      if (isIMSFormat(buffer)) return parseIMSFile(buffer, file.name);
    } catch (err) {
      console.warn(`[IMSParser] Native parse failed for ${filename}, falling back to UADE:`, err);
    }
    const { parseUADEFile: parseUADE_ims } = await import('@lib/import/formats/UADEParser');
    return parseUADE_ims(buffer, file.name, prefs.uade ?? 'enhanced', subsong, preScannedMeta);
  }

  // ── ICE Tracker / SoundTracker 2.6 (.ice) ────────────────────────────────
  if (/\.ice$/.test(filename)) {
    try {
      const { isICEFormat, parseICEFile } = await import('@lib/import/formats/ICEParser');
      if (isICEFormat(buffer)) return parseICEFile(buffer, file.name);
    } catch (err) {
      console.warn(`[ICEParser] Native parse failed for ${filename}, falling back to UADE:`, err);
    }
    const { parseUADEFile: parseUADE_ice } = await import('@lib/import/formats/UADEParser');
    return parseUADE_ice(buffer, file.name, prefs.uade ?? 'enhanced', subsong, preScannedMeta);
  }

  // ── ChipTracker (.kris) ───────────────────────────────────────────────────
  if (/\.kris$/.test(filename)) {
    try {
      const { isKRISFormat, parseKRISFile } = await import('@lib/import/formats/KRISParser');
      if (isKRISFormat(buffer)) return parseKRISFile(buffer, file.name);
    } catch (err) {
      console.warn(`[KRISParser] Native parse failed for ${filename}, falling back to UADE:`, err);
    }
    const { parseUADEFile: parseUADE_kris } = await import('@lib/import/formats/UADEParser');
    return parseUADE_kris(buffer, file.name, prefs.uade ?? 'enhanced', subsong, preScannedMeta);
  }

  // ── MusicLine Editor (.ml) ───────────────────────────────────────────────
  // Magic "MLEDMODL" at offset 0.
  if (/\.ml$/.test(filename)) {
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
    // No UADE fallback for .ml (UADE uses prefix-based detection; .ml extension not a UADE prefix)
    return null;
  }

  // ── Game Music Creator (.gmc) ─────────────────────────────────────────────
  // No magic bytes — identified by structural heuristics (mirrors OpenMPT).
  if (/\.gmc$/.test(filename)) {
    const uadeMode = prefs.uade ?? 'enhanced';
    if (prefs.gameMusicCreator === 'native') {
      try {
        const { isGameMusicCreatorFormat, parseGameMusicCreatorFile } = await import('@lib/import/formats/GameMusicCreatorParser');
        const bytes = new Uint8Array(buffer);
        if (isGameMusicCreatorFormat(bytes)) {
          const result = parseGameMusicCreatorFile(bytes, file.name);
          if (result) return result;
        }
      } catch (err) {
        console.warn(`[GameMusicCreatorParser] Native parse failed for ${filename}, falling back to UADE:`, err);
      }
    }
    const { parseUADEFile: parseUADE_gmc } = await import('@lib/import/formats/UADEParser');
    return parseUADE_gmc(buffer, file.name, uadeMode, subsong, preScannedMeta);
  }

  // ── Face The Music (.ftm) ─────────────────────────────────────────────────
  // Magic "FTMN" at offset 0; embedded-sample variant only.
  if (/\.ftm$/.test(filename)) {
    const uadeMode = prefs.uade ?? 'enhanced';
    if (prefs.faceTheMusic === 'native') {
      try {
        const { isFaceTheMusicFormat, parseFaceTheMusicFile } = await import('@lib/import/formats/FaceTheMusicParser');
        const bytes = new Uint8Array(buffer);
        if (isFaceTheMusicFormat(bytes)) {
          const result = parseFaceTheMusicFile(bytes, file.name);
          if (result) return result;
        }
      } catch (err) {
        console.warn(`[FaceTheMusicParser] Native parse failed for ${filename}, falling back to UADE:`, err);
      }
    }
    const { parseUADEFile: parseUADE_ftm } = await import('@lib/import/formats/UADEParser');
    return parseUADE_ftm(buffer, file.name, uadeMode, subsong, preScannedMeta);
  }

  // ── Sawteeth (.st — magic "SWTD" required to disambiguate) ───────────────
  // Fully synthesized format (no PCM samples). Native parser available (metadata only).
  if (/\.st$/.test(filename)) {
    const uadeMode = prefs.uade ?? 'enhanced';
    if (prefs.sawteeth === 'native') {
      try {
        const { isSawteethFormat, parseSawteethFile } = await import('@lib/import/formats/SawteethParser');
        const _stBytes = new Uint8Array(buffer);
        if (isSawteethFormat(_stBytes)) {
          const result = parseSawteethFile(_stBytes, file.name);
          if (result) return result;
        }
      } catch (err) {
        console.warn(`[SawteethParser] Native parse failed for ${filename}, falling back to UADE:`, err);
      }
    }
    const { parseUADEFile: parseUADE_st } = await import('@lib/import/formats/UADEParser');
    return parseUADE_st(buffer, file.name, uadeMode, subsong, preScannedMeta);
  }

  // ── Sound Control (.sc, .sct) ─────────────────────────────────────────────
  if (/\.(sc|sct)$/.test(filename)) {
    const uadeMode = prefs.uade ?? 'enhanced';
    if (prefs.soundControl === 'native') {
      try {
        const { isSoundControlFormat, parseSoundControlFile } = await import('@lib/import/formats/SoundControlParser');
        const bytes = new Uint8Array(buffer);
        if (isSoundControlFormat(bytes)) {
          const result = parseSoundControlFile(bytes, file.name);
          if (result) return result;
        }
      } catch (err) {
        console.warn(`[SoundControlParser] Native parse failed for ${filename}, falling back to UADE:`, err);
      }
    }
    const { parseUADEFile: parseUADE_sc } = await import('@lib/import/formats/UADEParser');
    return parseUADE_sc(buffer, file.name, uadeMode, subsong, preScannedMeta);
  }

  // ── Sound Factory (.psf) ──────────────────────────────────────────────────
  if (/\.psf$/.test(filename)) {
    const uadeMode = prefs.uade ?? 'enhanced';
    if (prefs.soundFactory === 'native') {
      try {
        const { isSoundFactoryFormat, parseSoundFactoryFile } = await import('@lib/import/formats/SoundFactoryParser');
        const bytes = new Uint8Array(buffer);
        if (isSoundFactoryFormat(bytes)) {
          const result = parseSoundFactoryFile(bytes, file.name);
          if (result) return result;
        }
      } catch (err) {
        console.warn(`[SoundFactoryParser] Native parse failed for ${filename}, falling back to UADE:`, err);
      }
    }
    const { parseUADEFile: parseUADE_psf } = await import('@lib/import/formats/UADEParser');
    return parseUADE_psf(buffer, file.name, uadeMode, subsong, preScannedMeta);
  }

  // ── Actionamics (.act) ────────────────────────────────────────────────────
  // Identified by "ACTIONAMICS SOUND TOOL" signature at offset 62.
  if (/\.act$/.test(filename)) {
    const uadeMode = prefs.uade ?? 'enhanced';
    if (prefs.actionamics === 'native') {
      try {
        const { isActionamicsFormat, parseActionamicsFile } = await import('@lib/import/formats/ActionamicsParser');
        const bytes = new Uint8Array(buffer);
        if (isActionamicsFormat(bytes)) {
          const result = parseActionamicsFile(bytes, file.name);
          if (result) return result;
        }
      } catch (err) {
        console.warn(`[ActionamicsParser] Native parse failed for ${filename}, falling back to UADE:`, err);
      }
    }
    const { parseUADEFile: parseUADE_act } = await import('@lib/import/formats/UADEParser');
    return parseUADE_act(buffer, file.name, uadeMode, subsong, preScannedMeta);
  }

  // ── Activision Pro / Martin Walker (.avp, .mw) ────────────────────────────
  // Identified by scanning first 4096 bytes for M68k init pattern (0x48 0xe7 0xfc 0xfe).
  if (/\.(avp|mw)$/.test(filename)) {
    const uadeMode = prefs.uade ?? 'enhanced';
    if (prefs.activisionPro === 'native') {
      try {
        const { isActivisionProFormat, parseActivisionProFile } = await import('@lib/import/formats/ActivisionProParser');
        const bytes = new Uint8Array(buffer);
        if (isActivisionProFormat(bytes)) {
          const result = parseActivisionProFile(bytes, file.name);
          if (result) return result;
        }
      } catch (err) {
        console.warn(`[ActivisionProParser] Native parse failed for ${filename}, falling back to UADE:`, err);
      }
    }
    const { parseUADEFile: parseUADE_avp } = await import('@lib/import/formats/UADEParser');
    return parseUADE_avp(buffer, file.name, uadeMode, subsong, preScannedMeta);
  }

  // ── Ron Klaren (.rk, .rkb) ────────────────────────────────────────────────
  // Identified by Amiga HUNK magic (0x3F3) at offset 0 and "RON_KLAREN_SOUNDMODULE!" at offset 40.
  if (/\.(rk|rkb)$/.test(filename)) {
    const uadeMode = prefs.uade ?? 'enhanced';
    if (prefs.ronKlaren === 'native') {
      try {
        const { isRonKlarenFormat, parseRonKlarenFile } = await import('@lib/import/formats/RonKlarenParser');
        const bytes = new Uint8Array(buffer);
        if (isRonKlarenFormat(bytes)) {
          const result = parseRonKlarenFile(bytes, file.name);
          if (result) return result;
        }
      } catch (err) {
        console.warn(`[RonKlarenParser] Native parse failed for ${filename}, falling back to UADE:`, err);
      }
    }
    const { parseUADEFile: parseUADE_rk } = await import('@lib/import/formats/UADEParser');
    return parseUADE_rk(buffer, file.name, uadeMode, subsong, preScannedMeta);
  }

  // ── UNIC Tracker (.unic) ─────────────────────────────────────────────────
  if (/\.unic$/.test(filename)) {
    try {
      const { isUNICFormat, parseUNICFile } = await import('@lib/import/formats/UNICParser');
      if (isUNICFormat(buffer)) return parseUNICFile(buffer, file.name);
    } catch (err) {
      console.warn(`[UNICParser] Native parse failed for ${filename}, falling back to OpenMPT:`, err);
    }
    // Fall through to libopenmpt
  }

  // ── MultiTracker (.mtm) ──────────────────────────────────────────────────
  if (/\.mtm$/.test(filename)) {
    try {
      const { isMTMFormat, parseMTMFile } = await import('@lib/import/formats/MTMParser');
      if (isMTMFormat(buffer)) return parseMTMFile(buffer, file.name);
    } catch (err) {
      console.warn(`[MTMParser] Native parse failed for ${filename}, falling back to OpenMPT:`, err);
    }
    // Fall through to libopenmpt
  }

  // ── Composer 669 (.669) ──────────────────────────────────────────────────
  if (/\.669$/.test(filename)) {
    try {
      const { is669Format, parse669File } = await import('@lib/import/formats/Format669Parser');
      if (is669Format(buffer)) return parse669File(buffer, file.name);
    } catch (err) {
      console.warn(`[Format669Parser] Native parse failed for ${filename}, falling back to OpenMPT:`, err);
    }
    // Fall through to libopenmpt
  }

  // ── Farandole Composer (.far) ─────────────────────────────────────────────
  if (/\.far$/.test(filename)) {
    try {
      const { isFARFormat, parseFARFile } = await import('@lib/import/formats/FARParser');
      if (isFARFormat(buffer)) return parseFARFile(buffer, file.name);
    } catch (err) {
      console.warn(`[FARParser] Native parse failed for ${filename}, falling back to OpenMPT:`, err);
    }
    // Fall through to libopenmpt
  }

  // ── Disorder Tracker 2 (.plm) ─────────────────────────────────────────────
  if (/\.plm$/.test(filename)) {
    try {
      const { isPLMFormat, parsePLMFile } = await import('@lib/import/formats/PLMParser');
      if (isPLMFormat(buffer)) return parsePLMFile(buffer, file.name);
    } catch (err) {
      console.warn(`[PLMParser] Native parse failed for ${filename}, falling back to OpenMPT:`, err);
    }
    // Fall through to libopenmpt
  }

  // ── Ultra Tracker (.ult) ──────────────────────────────────────────────────
  if (/\.ult$/.test(filename)) {
    try {
      const { isULTFormat, parseULTFile } = await import('@lib/import/formats/ULTParser');
      if (isULTFormat(buffer)) return parseULTFile(buffer, file.name);
    } catch (err) {
      console.warn(`[ULTParser] Native parse failed for ${filename}, falling back to OpenMPT:`, err);
    }
    // Fall through to libopenmpt
  }

  // ── Reality Tracker (.rtm) ────────────────────────────────────────────────
  if (/\.rtm$/.test(filename)) {
    try {
      const { isRTMFormat, parseRTMFile } = await import('@lib/import/formats/RTMParser');
      if (isRTMFormat(buffer)) return parseRTMFile(buffer, file.name);
    } catch (err) {
      console.warn(`[RTMParser] Native parse failed for ${filename}, falling back to OpenMPT:`, err);
    }
    // Fall through to libopenmpt
  }

  // ── DSIK Sound Module (.dsm) ──────────────────────────────────────────────
  if (/\.dsm$/.test(filename)) {
    try {
      const { isDSMFormat, parseDSMFile } = await import('@lib/import/formats/DSMParser');
      if (isDSMFormat(buffer)) return parseDSMFile(buffer, file.name);
    } catch (err) {
      console.warn(`[DSMParser] Native parse failed for ${filename}, falling back to OpenMPT:`, err);
    }
    // Fall through to libopenmpt
  }

  // ── Digital Tracker (.dtm) ────────────────────────────────────────────────
  if (/\.dtm$/.test(filename)) {
    try {
      const { isDTMFormat, parseDTMFile } = await import('@lib/import/formats/DTMParser');
      if (isDTMFormat(buffer)) return parseDTMFile(buffer, file.name);
    } catch (err) {
      console.warn(`[DTMParser] Native parse failed for ${filename}, falling back to OpenMPT:`, err);
    }
    // Fall through to libopenmpt
  }

  // ── ScreamTracker 2 (.stm) ────────────────────────────────────────────────
  if (/\.stm$/.test(filename)) {
    try {
      const { isSTMFormat, parseSTMFile } = await import('@lib/import/formats/STMParser');
      if (isSTMFormat(buffer)) return parseSTMFile(buffer, file.name);
    } catch (err) {
      console.warn(`[STMParser] Native parse failed for ${filename}, falling back to OpenMPT:`, err);
    }
    // Fall through to libopenmpt
  }

  // ── NoiseRunner (.nru) ────────────────────────────────────────────────────
  if (/\.nru$/.test(filename)) {
    try {
      const { isNRUFormat, parseNRUFile } = await import('@lib/import/formats/NRUParser');
      if (isNRUFormat(buffer)) return parseNRUFile(buffer, file.name);
    } catch (err) {
      console.warn(`[NRUParser] Native parse failed for ${filename}, falling back to OpenMPT:`, err);
    }
    // Fall through to libopenmpt
  }

  // ── PolyTracker (.ptm) ────────────────────────────────────────────────────
  if (/\.ptm$/.test(filename)) {
    try {
      const { isPTMFormat, parsePTMFile } = await import('@lib/import/formats/PTMParser');
      if (isPTMFormat(buffer)) return parsePTMFile(buffer, file.name);
    } catch (err) {
      console.warn(`[PTMParser] Native parse failed for ${filename}, falling back to OpenMPT:`, err);
    }
    // Fall through to libopenmpt
  }

  // ── General DigiMusic (.gdm) ──────────────────────────────────────────────
  if (/\.gdm$/.test(filename)) {
    try {
      const { isGDMFormat, parseGDMFile } = await import('@lib/import/formats/GDMParser');
      if (isGDMFormat(buffer)) return parseGDMFile(buffer, file.name);
    } catch (err) {
      console.warn(`[GDMParser] Native parse failed for ${filename}, falling back to OpenMPT:`, err);
    }
    // Fall through to libopenmpt
  }

  // ── Ultimate SoundTracker (.stk) ──────────────────────────────────────────
  if (/\.stk$/.test(filename)) {
    try {
      const { isSTKFormat, parseSTKFile } = await import('@lib/import/formats/STKParser');
      if (isSTKFormat(buffer)) return parseSTKFile(buffer, file.name);
    } catch (err) {
      console.warn(`[STKParser] Native parse failed for ${filename}, falling back to OpenMPT:`, err);
    }
    // Fall through to libopenmpt
  }

  // ── SoundTracker Pro II (.stp) ─────────────────────────────────────────────
  if (/\.stp$/.test(filename)) {
    try {
      const { isSTPFormat, parseSTPFile } = await import('@lib/import/formats/STPParser');
      if (isSTPFormat(buffer)) return parseSTPFile(buffer, file.name);
    } catch (err) {
      console.warn(`[STPParser] Native parse failed for ${filename}, falling back to OpenMPT:`, err);
    }
    // Fall through to libopenmpt
  }

  // ── DigiTrakker (.mdl) ────────────────────────────────────────────────────
  if (/\.mdl$/i.test(filename)) {
    try {
      const { isMDLFormat, parseMDLFile } = await import('@lib/import/formats/MDLParser');
      if (isMDLFormat(buffer)) return parseMDLFile(buffer, file.name);
    } catch (err) {
      console.warn(`[MDLParser] Native parse failed for ${filename}, falling back to OpenMPT:`, err);
    }
    // Fall through to libopenmpt
  }

  // ── Advanced Music Format (.amf) ──────────────────────────────────────────
  if (/\.amf$/i.test(filename)) {
    try {
      const { isAMFFormat, parseAMFFile } = await import('@lib/import/formats/AMFParser');
      if (isAMFFormat(buffer)) return parseAMFFile(buffer, file.name);
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
          const result = parseImagoOrpheusFile(bytes, file.name);
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
          const result = parseCDFM67File(bytes, file.name);
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
          const result = parseEasyTraxFile(bytes, file.name);
          if (result) return result;
        }
      } catch (err) {
        console.warn(`[EasyTraxParser] Native parse failed for ${filename}, falling back to OpenMPT:`, err);
      }
    }
    // Fall through to libopenmpt
  }

  // ── Karl Morton Music Format (.mus) ───────────────────────────────────────
  if (/\.mus$/.test(filename)) {
    if (prefs.karlMorton === 'native') {
      try {
        const { isKarlMortonFormat, parseKarlMortonFile } = await import('@lib/import/formats/KarlMortonParser');
        const bytes = new Uint8Array(buffer);
        if (isKarlMortonFormat(bytes)) {
          const result = parseKarlMortonFile(bytes, file.name);
          if (result) return result;
        }
      } catch (err) {
        console.warn(`[KarlMortonParser] Native parse failed for ${filename}, falling back to OpenMPT:`, err);
      }
    }
    // Fall through to libopenmpt
  }

  // ── UFO / MicroProse (.ufo, .mus with DDAT magic) ─────────────────────────
  // IFF-based 4-channel Amiga format from UFO: Enemy Unknown (1994).
  // Magic: "DDAT" at offset 0 (IFF-like chunk marker).
  if (/\.(ufo|mus)$/i.test(filename)) {
    const uadeMode = prefs.uade ?? 'enhanced';
    if (prefs.ufo === 'native') {
      try {
        const { isUFOFormat, parseUFOFile } = await import('@lib/import/formats/UFOParser');
        if (isUFOFormat(buffer)) return parseUFOFile(buffer, file.name);
      } catch (err) {
        console.warn(`[UFOParser] Native parse failed for ${filename}, falling back to UADE:`, err);
      }
    }
    const { parseUADEFile: parseUADE_ufo } = await import('@lib/import/formats/UADEParser');
    return parseUADE_ufo(buffer, file.name, uadeMode, subsong, preScannedMeta);
  }

  // ── Astroidea XMF / Imperium Galactica (.xmf) ────────────────────────────
  if (/\.xmf$/i.test(filename)) {
    if (prefs.xmf === 'native') {
      try {
        const { isXMFFormat, parseXMFFile } = await import('@lib/import/formats/XMFParser');
        const bytes = new Uint8Array(buffer);
        if (isXMFFormat(bytes)) {
          const result = parseXMFFile(bytes, file.name);
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
          const result = parseUAXFile(bytes, file.name);
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
          const result = parseFMTrackerFile(bytes, file.name);
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
          const result = parseMadTracker2File(bytes, file.name);
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
          const result = parsePSMFile(bytes, file.name);
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
          const result = parseAMSFile(bytes, file.name);
          if (result) return result;
        }
      } catch (err) {
        console.warn(`[AMSParser] Native parse failed for ${filename}, falling back to UADE:`, err);
      }
    }
    // PC format — fall back to UADE
    const { parseUADEFile: parseUADE_ams } = await import('@lib/import/formats/UADEParser');
    return parseUADE_ams(buffer, file.name, prefs.uade ?? 'enhanced', subsong, preScannedMeta);
  }

  // ── IFF SMUS / Sonix Music Driver (.smus, .snx, .tiny) ───────────────────
  // IFF SMUS format: "FORM" + "SMUS" IFF structure. Sonix .snx shares layout.
  if (/\.(smus|snx|tiny)$/i.test(filename)) {
    const uadeMode = prefs.uade ?? 'enhanced';
    if (prefs.iffSmus === 'native') {
      try {
        const { isIffSmusFormat, parseIffSmusFile } = await import('@lib/import/formats/IffSmusParser');
        if (isIffSmusFormat(buffer)) return await parseIffSmusFile(buffer, file.name);
      } catch (err) {
        console.warn(`[IffSmusParser] Native parse failed for ${filename}, falling back to UADE:`, err);
      }
    }
    const { parseUADEFile: parseUADE_smus } = await import('@lib/import/formats/UADEParser');
    return parseUADE_smus(buffer, file.name, uadeMode, subsong, preScannedMeta);
  }

  // ── Magnetic Fields Packer (.mfp / mfp.*) ────────────────────────────────
  // Two-file format: song data in .mfp, PCM samples in companion smp.* file.
  // Native parser extracts structure; UADE provides full audio with samples.
  if (/\.mfp$/i.test(filename) || /^mfp\./i.test((filename.split('/').pop() ?? filename).split('\\').pop() ?? filename)) {
    const uadeMode = prefs.uade ?? 'enhanced';
    if (prefs.magneticFieldsPacker === 'native') {
      try {
        const { isMagneticFieldsPackerFormat, parseMagneticFieldsPackerFile } = await import('@lib/import/formats/MagneticFieldsPackerParser');
        if (isMagneticFieldsPackerFormat(buffer, file.name)) return await parseMagneticFieldsPackerFile(buffer, file.name);
      } catch (err) {
        console.warn(`[MagneticFieldsPackerParser] Native parse failed for ${filename}, falling back to UADE:`, err);
      }
    }
    const { parseUADEFile: parseUADE_mfp } = await import('@lib/import/formats/UADEParser');
    return parseUADE_mfp(buffer, file.name, uadeMode, subsong, preScannedMeta);
  }

  // ── Delta Music 1.0 (.dm, .dm1) — identified by "ALL " magic ──────────────
  if (/\.dm1?$/i.test(filename)) {
    const uadeMode = prefs.uade ?? 'enhanced';
    if (prefs.deltaMusic1 === 'native') {
      try {
        const { isDeltaMusic1Format, parseDeltaMusic1File } = await import('@lib/import/formats/DeltaMusic1Parser');
        if (isDeltaMusic1Format(buffer)) {
          const result = await parseDeltaMusic1File(buffer, file.name);
          if (result) return result;
        }
      } catch (err) {
        console.warn(`[DeltaMusic1Parser] Native parse failed for ${filename}, falling back to UADE:`, err);
      }
    }
    const { parseUADEFile: parseUADE_dm1 } = await import('@lib/import/formats/UADEParser');
    return parseUADE_dm1(buffer, file.name, uadeMode, subsong, preScannedMeta);
  }

  // ── Richard Joseph Player (.rjp, RJP.*, .sng with RJP magic) ─────────────
  // Two-file format: song data (RJP.* / *.SNG) + samples (SMP.* / *.INS).
  // Magic: bytes[0..2]="RJP", bytes[4..7]="SMOD", bytes[12..15]=0.
  {
    const _rjpBase = (filename.split('/').pop() ?? filename).toLowerCase();
    const _mightBeRJP =
      /\.rjp$/i.test(filename) ||
      _rjpBase.startsWith('rjp.') ||
      (/\.sng$/i.test(filename) && buffer.byteLength >= 16 &&
        new Uint8Array(buffer)[0] === 0x52 &&   // 'R'
        new Uint8Array(buffer)[1] === 0x4a &&   // 'J'
        new Uint8Array(buffer)[2] === 0x50);    // 'P'
    if (_mightBeRJP) {
      const uadeMode = prefs.uade ?? 'enhanced';
      if (prefs.richardJoseph === 'native') {
        try {
          const { isRJPFormat, parseRJPFile } = await import('@lib/import/formats/RichardJosephParser');
          const _rjpBuf = new Uint8Array(buffer);
          if (isRJPFormat(_rjpBuf)) return await parseRJPFile(buffer, file.name);
        } catch (err) {
          console.warn(`[RichardJosephParser] Native parse failed for ${filename}, falling back to UADE:`, err);
        }
      }
      const { parseUADEFile: parseUADE_rjp } = await import('@lib/import/formats/UADEParser');
      return parseUADE_rjp(buffer, file.name, uadeMode, subsong, preScannedMeta);
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
        return await parsePT36File(buffer, file.name);
      } catch (err) {
        console.warn(`[PT36Parser] Native parse failed for ${filename}, falling through to OpenMPT:`, err);
      }
    }
  }

  // ── SpeedySystem / SoundSmith (.ss) ───────────────────────────────────────
  // Apple IIgs SoundSmith/MegaTracker. External DOC RAM samples required;
  // UADE is preferred (bundles samples in module archives), but native is available.
  if (/\.ss$/i.test(filename)) {
    const uadeMode = prefs.uade ?? 'enhanced';
    if (prefs.speedySystem === 'native') {
      try {
        const { isSpeedySystemFormat, parseSpeedySystemFile } = await import('@lib/import/formats/SpeedySystemParser');
        if (isSpeedySystemFormat(buffer)) return await parseSpeedySystemFile(buffer, file.name);
      } catch (err) {
        console.warn(`[SpeedySystemParser] Native parse failed for ${filename}, falling back to UADE:`, err);
      }
    }
    const { parseUADEFile: parseUADE_ss } = await import('@lib/import/formats/UADEParser');
    return parseUADE_ss(buffer, file.name, uadeMode, subsong, preScannedMeta);
  }

  // ── Tronic (.trc/.dp/.tro/.tronic) ───────────────────────────────────────
  // Amiga tracker by Stefan Hartmann. Native parser available.
  if (/\.(trc|dp|tro|tronic)$/i.test(filename)) {
    const uadeMode = prefs.uade ?? 'enhanced';
    if (prefs.tronic === 'native') {
      try {
        const { isTronicFormat, parseTronicFile } = await import('@lib/import/formats/TronicParser');
        if (isTronicFormat(buffer)) return await parseTronicFile(buffer, file.name);
      } catch (err) {
        console.warn(`[TronicParser] Native parse failed for ${filename}, falling back to UADE:`, err);
      }
    }
    const { parseUADEFile: parseUADE_trc } = await import('@lib/import/formats/UADEParser');
    return parseUADE_trc(buffer, file.name, uadeMode, subsong, preScannedMeta);
  }

  // ── Dave Lowe (.dl / DL.* prefix) ─────────────────────────────────────────
  // Compiled 68k Amiga music format. Two variants: old and new. Both detected
  // by opcode patterns at offsets 0/4/8.
  {
    const _dlBase = (filename.split('/').pop() ?? filename).toLowerCase();
    const _mightBeDL = /\.dl$/i.test(filename) || /\.dl_deli$/i.test(filename) || _dlBase.startsWith('dl.');
    if (_mightBeDL) {
      const uadeMode = prefs.uade ?? 'enhanced';
      if (prefs.daveLowe === 'native') {
        try {
          const { isDaveLoweFormat, parseDaveLoweFile } = await import('@lib/import/formats/DaveLoweParser');
          const _dlBuf = new Uint8Array(buffer);
          if (isDaveLoweFormat(_dlBuf)) return await parseDaveLoweFile(buffer, file.name);
        } catch (err) {
          console.warn(`[DaveLoweParser] Native parse failed for ${filename}, trying DaveLoweNew:`, err);
        }
        try {
          const { isDaveLoweNewFormat, parseDaveLoweNewFile } = await import('@lib/import/formats/DaveLoweNewParser');
          if (isDaveLoweNewFormat(buffer)) return parseDaveLoweNewFile(buffer, file.name);
        } catch (err) {
          console.warn(`[DaveLoweNewParser] Native parse failed for ${filename}, falling back to UADE:`, err);
        }
      }
      const { parseUADEFile: parseUADE_dl } = await import('@lib/import/formats/UADEParser');
      return parseUADE_dl(buffer, file.name, uadeMode, subsong, preScannedMeta);
    }
  }

  // ── Leggless Music Editor (.lme / LME.*) ────────────────────────────────────
  // Amiga 4-channel format (Leggless Music Editor). Magic: "LME" at offset 0.
  {
    const _lmeBase = (filename.split('/').pop() ?? filename).split('\\').pop() ?? filename;
    const _mightBeLME = /\.lme$/i.test(filename) || _lmeBase.toLowerCase().startsWith('lme.');
    if (_mightBeLME) {
      const uadeMode = prefs.uade ?? 'enhanced';
      if (prefs.lme === 'native') {
        try {
          const { isLMEFormat, parseLMEFile } = await import('@lib/import/formats/LMEParser');
          if (isLMEFormat(buffer)) return parseLMEFile(buffer, file.name);
        } catch (err) {
          console.warn(`[LMEParser] Native parse failed for ${filename}, falling back to UADE:`, err);
        }
      }
      const { parseUADEFile: parseUADE_lme } = await import('@lib/import/formats/UADEParser');
      return parseUADE_lme(buffer, file.name, uadeMode, subsong, preScannedMeta);
    }
  }

  // ── Medley (.ml) ─────────────────────────────────────────────────────────
  // Amiga 4-channel format (Medley tracker). Magic: "MSOB" at bytes[0..3].
  if (/\.ml$/i.test(filename)) {
    if (prefs.medley === 'native') {
      try {
        const { isMedleyFormat, parseMedleyFile } = await import('@lib/import/formats/MedleyParser');
        if (isMedleyFormat(buffer)) return parseMedleyFile(buffer, file.name);
      } catch (err) {
        console.warn(`[MedleyParser] Native parse failed for ${filename}, falling back to UADE:`, err);
      }
    }
    const uadeMode = prefs.uade ?? 'enhanced';
    const { parseUADEFile: parseUADE_ml } = await import('@lib/import/formats/UADEParser');
    return parseUADE_ml(buffer, file.name, uadeMode, subsong, preScannedMeta);
  }

  // ── Mark Cooksey / Don Adan (mc.* / mcr.* / mco.* prefix) ─────────────────
  // Compiled 68k Amiga music format. Three sub-variants: Old (D040D040 magic),
  // New/Medium (601A + 48E780F0), and Rare (4DFA + DFF000 hardware register).
  {
    const _mcBase = (filename.split('/').pop() ?? filename).split('\\').pop()!.toLowerCase();
    const _mightBeMC = _mcBase.startsWith('mc.') || _mcBase.startsWith('mcr.') || _mcBase.startsWith('mco.');
    if (_mightBeMC) {
      if (prefs.markCooksey === 'native') {
        try {
          const { isMarkCookseyFormat, parseMarkCookseyFile } = await import('@lib/import/formats/MarkCookseyParser');
          if (isMarkCookseyFormat(buffer, file.name)) return parseMarkCookseyFile(buffer, file.name);
        } catch (err) {
          console.warn(`[MarkCookseyParser] Native parse failed for ${filename}, falling back to UADE:`, err);
        }
      }
      const uadeMode = prefs.uade ?? 'enhanced';
      const { parseUADEFile: parseUADE_mc } = await import('@lib/import/formats/UADEParser');
      return parseUADE_mc(buffer, file.name, uadeMode, subsong, preScannedMeta);
    }
  }

  // ── Jeroen Tel (jt.* / mon_old.* prefix) ────────────────────────────────────
  // Compiled 68k Amiga music format (Maniacs of Noise / Jeroen Tel).
  // Detection: scan first 40 bytes for 0x02390001 + structural checks.
  {
    const _jtBase = (filename.split('/').pop() ?? filename).split('\\').pop()!.toLowerCase();
    const _mightBeJT = _jtBase.startsWith('jt.') || _jtBase.startsWith('mon_old.');
    if (_mightBeJT) {
      if (prefs.jeroenTel === 'native') {
        try {
          const { isJeroenTelFormat, parseJeroenTelFile } = await import('@lib/import/formats/JeroenTelParser');
          if (isJeroenTelFormat(buffer, file.name)) return parseJeroenTelFile(buffer, file.name);
        } catch (err) {
          console.warn(`[JeroenTelParser] Native parse failed for ${filename}, falling back to UADE:`, err);
        }
      }
      const uadeMode = prefs.uade ?? 'enhanced';
      const { parseUADEFile: parseUADE_jt } = await import('@lib/import/formats/UADEParser');
      return parseUADE_jt(buffer, file.name, uadeMode, subsong, preScannedMeta);
    }
  }

  // ── Quartet / Quartet PSG / Quartet ST (qpa.* / sqt.* / qts.* prefix) ──────
  {
    const _qBase = (filename.split('/').pop() ?? filename).split('\\').pop()!.toLowerCase();
    const _mightBeQuartet = _qBase.startsWith('qpa.') || _qBase.startsWith('sqt.') || _qBase.startsWith('qts.');
    if (_mightBeQuartet) {
      if (prefs.quartet === 'native') {
        try {
          const { isQuartetFormat, parseQuartetFile } = await import('@lib/import/formats/QuartetParser');
          if (isQuartetFormat(buffer, file.name)) return parseQuartetFile(buffer, file.name);
        } catch (err) {
          console.warn(`[QuartetParser] Native parse failed for ${filename}, falling back to UADE:`, err);
        }
      }
      const uadeMode = prefs.uade ?? 'enhanced';
      const { parseUADEFile: parseUADE_quartet } = await import('@lib/import/formats/UADEParser');
      return parseUADE_quartet(buffer, file.name, uadeMode, subsong, preScannedMeta);
    }
  }

  // ── Sound Master (sm.* / sm1.* / sm2.* / sm3.* / smpro.* prefix) ───────────
  {
    const _smBase = (filename.split('/').pop() ?? filename).split('\\').pop()!.toLowerCase();
    const _mightBeSM =
      _smBase.startsWith('sm.') || _smBase.startsWith('sm1.') ||
      _smBase.startsWith('sm2.') || _smBase.startsWith('sm3.') ||
      _smBase.startsWith('smpro.');
    if (_mightBeSM) {
      if (prefs.soundMaster === 'native') {
        try {
          const { isSoundMasterFormat, parseSoundMasterFile } = await import('@lib/import/formats/SoundMasterParser');
          if (isSoundMasterFormat(buffer, file.name)) return parseSoundMasterFile(buffer, file.name);
        } catch (err) {
          console.warn(`[SoundMasterParser] Native parse failed for ${filename}, falling back to UADE:`, err);
        }
      }
      const uadeMode = prefs.uade ?? 'enhanced';
      const { parseUADEFile: parseUADE_sm } = await import('@lib/import/formats/UADEParser');
      return parseUADE_sm(buffer, file.name, uadeMode, subsong, preScannedMeta);
    }
  }

  // ── ZoundMonitor (sng.* prefix) ──────────────────────────────────────────────
  // Amiga compiled 68k music format (UADE eagleplayer prefix "sng").
  // Note: .sng extension is Richard Joseph; this block only matches sng.* prefix.
  // Detection: computed offset from bytes[0..1], then "df?:" or "?amp" tag check.
  {
    const _zBase = (filename.split('/').pop() ?? filename).split('\\').pop()!.toLowerCase();
    if (_zBase.startsWith('sng.')) {
      if (prefs.zoundMonitor === 'native') {
        try {
          const { isZoundMonitorFormat, parseZoundMonitorFile } = await import('@lib/import/formats/ZoundMonitorParser');
          if (isZoundMonitorFormat(buffer, file.name)) return parseZoundMonitorFile(buffer, file.name);
        } catch (err) {
          console.warn(`[ZoundMonitorParser] Native parse failed for ${filename}, falling back to UADE:`, err);
        }
      }
      const uadeMode = prefs.uade ?? 'enhanced';
      const { parseUADEFile: parseUADE_sng } = await import('@lib/import/formats/UADEParser');
      return parseUADE_sng(buffer, file.name, uadeMode, subsong, preScannedMeta);
    }
  }

  // ── Future Player (.fp / FP.*) ───────────────────────────────────────────────
  // Amiga 4-channel format (Future Player). Magic: 0x000003F3 + "F.PLAYER" at offsets 32-39.
  if (
    /\.fp$/i.test(filename) ||
    /^fp\./i.test((filename.split('/').pop() ?? filename).split('\\').pop() ?? filename)
  ) {
    const uadeMode = prefs.uade ?? 'enhanced';
    if (prefs.futurePlayer === 'native') {
      try {
        const { isFuturePlayerFormat, parseFuturePlayerFile } = await import('@lib/import/formats/FuturePlayerParser');
        if (isFuturePlayerFormat(buffer)) return parseFuturePlayerFile(buffer, file.name);
      } catch (err) {
        console.warn(`[FuturePlayerParser] Native parse failed for ${filename}, falling back to UADE:`, err);
      }
    }
    const { parseUADEFile: parseUADE_fp } = await import('@lib/import/formats/UADEParser');
    return parseUADE_fp(buffer, file.name, uadeMode, subsong, preScannedMeta);
  }

  // ── TCB Tracker (tcb.*) ──────────────────────────────────────────────────────
  {
    const _tcbBase = (filename.split('/').pop() ?? filename).split('\\').pop()!.toLowerCase();
    if (_tcbBase.startsWith('tcb.')) {
      if (prefs.tcbTracker === 'native') {
        try {
          const { isTCBTrackerFormat, parseTCBTrackerFile } = await import('@lib/import/formats/TCBTrackerParser');
          if (isTCBTrackerFormat(buffer, file.name)) return parseTCBTrackerFile(buffer, file.name);
        } catch (err) {
          console.warn(`[TCBTrackerParser] Native parse failed for ${filename}, falling back to UADE:`, err);
        }
      }
      const uadeMode = prefs.uade ?? 'enhanced';
      const { parseUADEFile: parseUADE_tcb } = await import('@lib/import/formats/UADEParser');
      return parseUADE_tcb(buffer, file.name, uadeMode, subsong, preScannedMeta);
    }
  }

  // ── Jason Page (jpn.* / jpnd.* / jp.*) ──────────────────────────────────────
  // Amiga 4-channel format. Three sub-variants (old/new/raw binary).
  {
    const _jpBase = (filename.split('/').pop() ?? filename).split('\\').pop() ?? filename;
    const _mightBeJP =
      _jpBase.toLowerCase().startsWith('jpn.') ||
      _jpBase.toLowerCase().startsWith('jpnd.') ||
      _jpBase.toLowerCase().startsWith('jp.');
    if (_mightBeJP) {
      const uadeMode = prefs.uade ?? 'enhanced';
      if (prefs.jasonPage === 'native') {
        try {
          const { isJasonPageFormat, parseJasonPageFile } = await import('@lib/import/formats/JasonPageParser');
          if (isJasonPageFormat(buffer, file.name)) return await parseJasonPageFile(buffer, file.name);
        } catch (err) {
          console.warn(`[JasonPageParser] Native parse failed for ${filename}, falling back to UADE:`, err);
        }
      }
      const { parseUADEFile: parseUADE_jp } = await import('@lib/import/formats/UADEParser');
      return parseUADE_jp(buffer, file.name, uadeMode, subsong, preScannedMeta);
    }
  }

  // ── MMDC / MED Packer (mmdc.*) ───────────────────────────────────────────────
  {
    const _mmdcBase = (filename.split('/').pop() ?? filename).split('\\').pop()!.toLowerCase();
    if (_mmdcBase.startsWith('mmdc.')) {
      if (prefs.mmdc === 'native') {
        try {
          const { isMMDCFormat, parseMMDCFile } = await import('@lib/import/formats/MMDCParser');
          if (isMMDCFormat(buffer)) return parseMMDCFile(buffer, file.name);
        } catch (err) {
          console.warn(`[MMDCParser] Native parse failed for ${filename}, falling back to UADE:`, err);
        }
      }
      const uadeMode = prefs.uade ?? 'enhanced';
      const { parseUADEFile: parseUADE_mmdc } = await import('@lib/import/formats/UADEParser');
      return parseUADE_mmdc(buffer, file.name, uadeMode, subsong, preScannedMeta);
    }
  }

  // ── Professional Sound Artists (psa.*) ───────────────────────────────────────
  {
    const _psaBase = (filename.split('/').pop() ?? filename).split('\\').pop()!.toLowerCase();
    if (_psaBase.startsWith('psa.')) {
      if (prefs.psa === 'native') {
        try {
          const { isPSAFormat, parsePSAFile } = await import('@lib/import/formats/PSAParser');
          if (isPSAFormat(buffer)) return parsePSAFile(buffer, file.name);
        } catch (err) {
          console.warn(`[PSAParser] Native parse failed for ${filename}, falling back to UADE:`, err);
        }
      }
      const uadeMode = prefs.uade ?? 'enhanced';
      const { parseUADEFile: parseUADE_psa } = await import('@lib/import/formats/UADEParser');
      return parseUADE_psa(buffer, file.name, uadeMode, subsong, preScannedMeta);
    }
  }

  // ── Steve Turner (jpo.* / jpold.*) ───────────────────────────────────────────
  {
    const _jpoBase = (filename.split('/').pop() ?? filename).split('\\').pop()!.toLowerCase();
    if (_jpoBase.startsWith('jpo.') || _jpoBase.startsWith('jpold.')) {
      if (prefs.steveTurner === 'native') {
        try {
          const { isSteveTurnerFormat, parseSteveTurnerFile } = await import('@lib/import/formats/SteveTurnerParser');
          if (isSteveTurnerFormat(buffer)) return parseSteveTurnerFile(buffer, file.name);
        } catch (err) {
          console.warn(`[SteveTurnerParser] Native parse failed for ${filename}, falling back to UADE:`, err);
        }
      }
      const uadeMode = prefs.uade ?? 'enhanced';
      const { parseUADEFile: parseUADE_jpo } = await import('@lib/import/formats/UADEParser');
      return parseUADE_jpo(buffer, file.name, uadeMode, subsong, preScannedMeta);
    }
  }

  // ── TME (.tme / TME.*) ───────────────────────────────────────────────────────
  {
    const _tmeBase = (filename.split('/').pop() ?? filename).split('\\').pop()!.toLowerCase();
    if (/\.tme$/i.test(filename) || _tmeBase.startsWith('tme.')) {
      if (prefs.tme === 'native') {
        try {
          const { isTMEFormat, parseTMEFile } = await import('@lib/import/formats/TMEParser');
          if (isTMEFormat(buffer)) return parseTMEFile(buffer, file.name);
        } catch (err) {
          console.warn(`[TMEParser] Native parse failed for ${filename}, falling back to UADE:`, err);
        }
      }
      const uadeMode = prefs.uade ?? 'enhanced';
      const { parseUADEFile: parseUADE_tme } = await import('@lib/import/formats/UADEParser');
      return parseUADE_tme(buffer, file.name, uadeMode, subsong, preScannedMeta);
    }
  }

  // ── Infogrames DUM (.dum) ────────────────────────────────────────────────────
  // Infogrames music format used in Gobliins, Ween, etc. Two-file format
  // with external .dum.set sample data. Detection: header offset at u16BE(0).
  if (/\.dum$/i.test(filename)) {
    const uadeMode = prefs.uade ?? 'enhanced';
    if (prefs.infogrames === 'native') {
      try {
        const { isInfogramesFormat, parseInfogramesFile } = await import('@lib/import/formats/InfogramesParser');
        if (isInfogramesFormat(buffer)) return parseInfogramesFile(buffer, file.name);
      } catch (err) {
        console.warn(`[InfogramesParser] Native parse failed for ${filename}, falling back to UADE:`, err);
      }
    }
    const { parseUADEFile: parseUADE_dum } = await import('@lib/import/formats/UADEParser');
    return parseUADE_dum(buffer, file.name, uadeMode, subsong, preScannedMeta);
  }

  // ── PSA (.psa / PSA.*) ───────────────────────────────────────────────────────
  // Professional Sound Artists format. Magic: bytes[0..3] == 0x50534100 ("PSA\0").
  if (
    /\.psa$/i.test(filename) ||
    /^psa\./i.test((filename.split('/').pop() ?? filename).split('\\').pop() ?? filename)
  ) {
    const uadeMode = prefs.uade ?? 'enhanced';
    if (prefs.psa === 'native') {
      try {
        const { isPSAFormat, parsePSAFile } = await import('@lib/import/formats/PSAParser');
        if (isPSAFormat(buffer)) return parsePSAFile(buffer, file.name);
      } catch (err) {
        console.warn(`[PSAParser] Native parse failed for ${filename}, falling back to UADE:`, err);
      }
    }
    const { parseUADEFile: parseUADE_psa } = await import('@lib/import/formats/UADEParser');
    return parseUADE_psa(buffer, file.name, uadeMode, subsong, preScannedMeta);
  }

  // ── MMDC (.mmdc / MMDC.*) ────────────────────────────────────────────────────
  // MED Packer format by Antony "Ratt" Crowther. Magic: bytes[0..3] == 'MMDC'.
  if (
    /\.mmdc$/i.test(filename) ||
    /^mmdc\./i.test((filename.split('/').pop() ?? filename).split('\\').pop() ?? filename)
  ) {
    const uadeMode = prefs.uade ?? 'enhanced';
    if (prefs.mmdc === 'native') {
      try {
        const { isMMDCFormat, parseMMDCFile } = await import('@lib/import/formats/MMDCParser');
        if (isMMDCFormat(buffer)) return parseMMDCFile(buffer, file.name);
      } catch (err) {
        console.warn(`[MMDCParser] Native parse failed for ${filename}, falling back to UADE:`, err);
      }
    }
    const { parseUADEFile: parseUADE_mmdc } = await import('@lib/import/formats/UADEParser');
    return parseUADE_mmdc(buffer, file.name, uadeMode, subsong, preScannedMeta);
  }

  // ── Steve Turner (.jpo / .jpold / JPO.*) ────────────────────────────────────
  // Amiga compiled 68k format (JPO. prefix). Detection: 4x 0x2B7C at offsets
  // 0/8/16/24, 0x303C00FF at 0x20, 0x32004EB9 at 0x24, 0x4E75 at 0x2C.
  if (
    /\.jpold?$/i.test(filename) ||
    /^jpo\./i.test((filename.split('/').pop() ?? filename).split('\\').pop() ?? filename)
  ) {
    const uadeMode = prefs.uade ?? 'enhanced';
    if (prefs.steveTurner === 'native') {
      try {
        const { isSteveTurnerFormat, parseSteveTurnerFile } = await import('@lib/import/formats/SteveTurnerParser');
        if (isSteveTurnerFormat(buffer)) return parseSteveTurnerFile(buffer, file.name);
      } catch (err) {
        console.warn(`[SteveTurnerParser] Native parse failed for ${filename}, falling back to UADE:`, err);
      }
    }
    const { parseUADEFile: parseUADE_jpo } = await import('@lib/import/formats/UADEParser');
    return parseUADE_jpo(buffer, file.name, uadeMode, subsong, preScannedMeta);
  }

  // ── TimeTracker (TMK.* prefix) ───────────────────────────────────────────
  // Amiga format by BrainWasher & FireBlade. UADE prefix: TMK.
  {
    const _tmkBase = (filename.split('/').pop() ?? filename).split('\\').pop()!.toLowerCase();
    if (_tmkBase.startsWith('tmk.')) {
      const uadeMode = prefs.uade ?? 'enhanced';
      if (prefs.timeTracker === 'native') {
        try {
          const { isTimeTrackerFormat, parseTimeTrackerFile } = await import('@lib/import/formats/TimeTrackerParser');
          if (isTimeTrackerFormat(buffer)) return parseTimeTrackerFile(buffer, file.name);
        } catch (err) {
          console.warn(`[TimeTrackerParser] Native parse failed for ${filename}, falling back to UADE:`, err);
        }
      }
      const { parseUADEFile: parseUADE_tmk } = await import('@lib/import/formats/UADEParser');
      return parseUADE_tmk(buffer, file.name, uadeMode, subsong, preScannedMeta);
    }
  }

  // ── ChipTracker (KRIS.* prefix) ──────────────────────────────────────────
  // Amiga format identified by 'KRIS' at offset 952. UADE prefix: KRIS.
  {
    const _krisBase = (filename.split('/').pop() ?? filename).split('\\').pop()!.toLowerCase();
    if (_krisBase.startsWith('kris.')) {
      const uadeMode = prefs.uade ?? 'enhanced';
      if (prefs.kris === 'native') {
        try {
          const { isKRISFormat, parseKRISFile } = await import('@lib/import/formats/KRISParser');
          if (isKRISFormat(buffer)) return await parseKRISFile(buffer, file.name);
        } catch (err) {
          console.warn(`[KRISParser] Native parse failed for ${filename}, falling back to UADE:`, err);
        }
      }
      const { parseUADEFile: parseUADE_kris } = await import('@lib/import/formats/UADEParser');
      return parseUADE_kris(buffer, file.name, uadeMode, subsong, preScannedMeta);
    }
  }

  // ── Cinemaware (CIN.* prefix) ─────────────────────────────────────────────
  // Amiga format with 'IBLK'+'ASEQ' magic. UADE prefix: CIN.
  {
    const _cinBase = (filename.split('/').pop() ?? filename).split('\\').pop()!.toLowerCase();
    if (_cinBase.startsWith('cin.')) {
      const uadeMode = prefs.uade ?? 'enhanced';
      if (prefs.cinemaware === 'native') {
        try {
          const { isCinemawareFormat, parseCinemawareFile } = await import('@lib/import/formats/CinemawareParser');
          if (isCinemawareFormat(buffer)) return parseCinemawareFile(buffer, file.name);
        } catch (err) {
          console.warn(`[CinemawareParser] Native parse failed for ${filename}, falling back to UADE:`, err);
        }
      }
      const { parseUADEFile: parseUADE_cin } = await import('@lib/import/formats/UADEParser');
      return parseUADE_cin(buffer, file.name, uadeMode, subsong, preScannedMeta);
    }
  }

  // ── NovoTrade Packer (NTP.* prefix) ──────────────────────────────────────
  // Amiga chunked format: MODU/BODY/SAMP chunks. UADE prefix: NTP.
  {
    const _ntpBase = (filename.split('/').pop() ?? filename).split('\\').pop()!.toLowerCase();
    if (_ntpBase.startsWith('ntp.')) {
      const uadeMode = prefs.uade ?? 'enhanced';
      if (prefs.novoTradePacker === 'native') {
        try {
          const { isNovoTradePackerFormat, parseNovoTradePackerFile } = await import('@lib/import/formats/NovoTradePackerParser');
          if (isNovoTradePackerFormat(buffer)) return parseNovoTradePackerFile(buffer, file.name);
        } catch (err) {
          console.warn(`[NovoTradePackerParser] Native parse failed for ${filename}, falling back to UADE:`, err);
        }
      }
      const { parseUADEFile: parseUADE_ntp } = await import('@lib/import/formats/UADEParser');
      return parseUADE_ntp(buffer, file.name, uadeMode, subsong, preScannedMeta);
    }
  }

  // ── Alcatraz Packer (ALP.* prefix) ───────────────────────────────────────
  // Amiga format with 'PAn\x10' magic. UADE prefix: ALP.
  {
    const _alpBase = (filename.split('/').pop() ?? filename).split('\\').pop()!.toLowerCase();
    if (_alpBase.startsWith('alp.')) {
      const uadeMode = prefs.uade ?? 'enhanced';
      if (prefs.alcatrazPacker === 'native') {
        try {
          const { isAlcatrazPackerFormat, parseAlcatrazPackerFile } = await import('@lib/import/formats/AlcatrazPackerParser');
          if (isAlcatrazPackerFormat(buffer)) return parseAlcatrazPackerFile(buffer, file.name);
        } catch (err) {
          console.warn(`[AlcatrazPackerParser] Native parse failed for ${filename}, falling back to UADE:`, err);
        }
      }
      const { parseUADEFile: parseUADE_alp } = await import('@lib/import/formats/UADEParser');
      return parseUADE_alp(buffer, file.name, uadeMode, subsong, preScannedMeta);
    }
  }

  // ── Blade Packer (UDS.* prefix) ──────────────────────────────────────────
  // Amiga 8-channel format with 0x538F4E47 magic. UADE prefix: UDS.
  {
    const _udsBase = (filename.split('/').pop() ?? filename).split('\\').pop()!.toLowerCase();
    if (_udsBase.startsWith('uds.')) {
      const uadeMode = prefs.uade ?? 'enhanced';
      if (prefs.bladePacker === 'native') {
        try {
          const { isBladePackerFormat, parseBladePackerFile } = await import('@lib/import/formats/BladePackerParser');
          if (isBladePackerFormat(buffer)) return parseBladePackerFile(buffer, file.name);
        } catch (err) {
          console.warn(`[BladePackerParser] Native parse failed for ${filename}, falling back to UADE:`, err);
        }
      }
      const { parseUADEFile: parseUADE_uds } = await import('@lib/import/formats/UADEParser');
      return parseUADE_uds(buffer, file.name, uadeMode, subsong, preScannedMeta);
    }
  }

  // ── Tomy Tracker (SG.* prefix) ────────────────────────────────────────────
  // Amiga format with size-based structural detection. UADE prefix: SG.
  {
    const _sgBase = (filename.split('/').pop() ?? filename).split('\\').pop()!.toLowerCase();
    if (_sgBase.startsWith('sg.')) {
      const uadeMode = prefs.uade ?? 'enhanced';
      if (prefs.tomyTracker === 'native') {
        try {
          const { isTomyTrackerFormat, parseTomyTrackerFile } = await import('@lib/import/formats/TomyTrackerParser');
          if (isTomyTrackerFormat(buffer)) return parseTomyTrackerFile(buffer, file.name);
        } catch (err) {
          console.warn(`[TomyTrackerParser] Native parse failed for ${filename}, falling back to UADE:`, err);
        }
      }
      const { parseUADEFile: parseUADE_sg } = await import('@lib/import/formats/UADEParser');
      return parseUADE_sg(buffer, file.name, uadeMode, subsong, preScannedMeta);
    }
  }

  // ── Images Music System (IMS.* prefix) ────────────────────────────────────
  // Amiga format with offset-arithmetic detection. UADE prefix: IMS.
  // Note: .ims extension files are handled earlier with native IMSParser.
  {
    const _imspBase = (filename.split('/').pop() ?? filename).split('\\').pop()!.toLowerCase();
    if (_imspBase.startsWith('ims.')) {
      const uadeMode = prefs.uade ?? 'enhanced';
      if (prefs.imagesMusicSystem === 'native') {
        try {
          const { isImagesMusicSystemFormat, parseImagesMusicSystemFile } = await import('@lib/import/formats/ImagesMusicSystemParser');
          if (isImagesMusicSystemFormat(buffer)) return parseImagesMusicSystemFile(buffer, file.name);
        } catch (err) {
          console.warn(`[ImagesMusicSystemParser] Native parse failed for ${filename}, falling back to UADE:`, err);
        }
      }
      const { parseUADEFile: parseUADE_imsp } = await import('@lib/import/formats/UADEParser');
      return parseUADE_imsp(buffer, file.name, uadeMode, subsong, preScannedMeta);
    }
  }

  // ── Fashion Tracker (EX.* prefix) ────────────────────────────────────────
  {
    const _exBase = (filename.split('/').pop() ?? filename).split('\\').pop()!.toLowerCase();
    if (_exBase.startsWith('ex.')) {
      const uadeMode = prefs.uade ?? 'enhanced';
      if (prefs.fashionTracker === 'native') {
        try {
          const { isFashionTrackerFormat, parseFashionTrackerFile } = await import('@lib/import/formats/FashionTrackerParser');
          if (isFashionTrackerFormat(buffer)) return parseFashionTrackerFile(buffer, file.name);
        } catch (err) {
          console.warn(`[FashionTrackerParser] Native parse failed for ${filename}, falling back to UADE:`, err);
        }
      }
      const { parseUADEFile: parseUADE_ex } = await import('@lib/import/formats/UADEParser');
      return parseUADE_ex(buffer, file.name, uadeMode, subsong, preScannedMeta);
    }
  }

  // ── MultiMedia Sound (MMS.* / SFX20.* prefix) ────────────────────────────
  {
    const _mmsBase = (filename.split('/').pop() ?? filename).split('\\').pop()!.toLowerCase();
    if (_mmsBase.startsWith('mms.') || _mmsBase.startsWith('sfx20.')) {
      const uadeMode = prefs.uade ?? 'enhanced';
      if (prefs.multiMediaSound === 'native') {
        try {
          const { isMultiMediaSoundFormat, parseMultiMediaSoundFile } = await import('@lib/import/formats/MultiMediaSoundParser');
          if (isMultiMediaSoundFormat(buffer)) return parseMultiMediaSoundFile(buffer, file.name);
        } catch (err) {
          console.warn(`[MultiMediaSoundParser] Native parse failed for ${filename}, falling back to UADE:`, err);
        }
      }
      const { parseUADEFile: parseUADE_mms } = await import('@lib/import/formats/UADEParser');
      return parseUADE_mms(buffer, file.name, uadeMode, subsong, preScannedMeta);
    }
  }

  // ── Sean Conran (SCR.* prefix) ───────────────────────────────────────────
  // Compiled 68k Amiga music. Three detection paths with specific 68k opcodes + scan.
  {
    const _scrBase = (filename.split('/').pop() ?? filename).split('\\').pop()!.toLowerCase();
    if (_scrBase.startsWith('scr.')) {
      const uadeMode = prefs.uade ?? 'enhanced';
      if (prefs.seanConran === 'native') {
        try {
          const { isSeanConranFormat, parseSeanConranFile } = await import('@lib/import/formats/SeanConranParser');
          const _scrBuf = new Uint8Array(buffer);
          if (isSeanConranFormat(_scrBuf)) return await parseSeanConranFile(buffer, file.name);
        } catch (err) {
          console.warn(`[SeanConranParser] Native parse failed for ${filename}, falling back to UADE:`, err);
        }
      }
      const { parseUADEFile: parseUADE_scr } = await import('@lib/import/formats/UADEParser');
      return parseUADE_scr(buffer, file.name, uadeMode, subsong, preScannedMeta);
    }
  }

  // ── Thomas Hermann (THM.* prefix) ────────────────────────────────────────
  // Compiled 68k Amiga music. Relocation table structure with arithmetic checks.
  {
    const _thmBase = (filename.split('/').pop() ?? filename).split('\\').pop()!.toLowerCase();
    if (_thmBase.startsWith('thm.')) {
      const uadeMode = prefs.uade ?? 'enhanced';
      if (prefs.thomasHermann === 'native') {
        try {
          const { isThomasHermannFormat, parseThomasHermannFile } = await import('@lib/import/formats/ThomasHermannParser');
          const _thmBuf = new Uint8Array(buffer);
          if (isThomasHermannFormat(_thmBuf)) return await parseThomasHermannFile(buffer, file.name);
        } catch (err) {
          console.warn(`[ThomasHermannParser] Native parse failed for ${filename}, falling back to UADE:`, err);
        }
      }
      const { parseUADEFile: parseUADE_thm } = await import('@lib/import/formats/UADEParser');
      return parseUADE_thm(buffer, file.name, uadeMode, subsong, preScannedMeta);
    }
  }

  // ── Titanics Packer (TITS.* prefix) ──────────────────────────────────────
  // Amiga packed music format. Detection: 128 words at offset 180 (even, non-zero).
  {
    const _titsBase = (filename.split('/').pop() ?? filename).split('\\').pop()!.toLowerCase();
    if (_titsBase.startsWith('tits.')) {
      const uadeMode = prefs.uade ?? 'enhanced';
      if (prefs.titanicsPacker === 'native') {
        try {
          const { isTitanicsPackerFormat, parseTitanicsPackerFile } = await import('@lib/import/formats/TitanicsPackerParser');
          if (isTitanicsPackerFormat(buffer)) return parseTitanicsPackerFile(buffer, file.name);
        } catch (err) {
          console.warn(`[TitanicsPackerParser] Native parse failed for ${filename}, falling back to UADE:`, err);
        }
      }
      const { parseUADEFile: parseUADE_tits } = await import('@lib/import/formats/UADEParser');
      return parseUADE_tits(buffer, file.name, uadeMode, subsong, preScannedMeta);
    }
  }

  // ── Kris Hatlelid (KH.* prefix) ──────────────────────────────────────────
  // Compiled 68k Amiga music. Fixed-offset pattern with 0x000003F3 header.
  {
    const _khBase = (filename.split('/').pop() ?? filename).split('\\').pop()!.toLowerCase();
    if (_khBase.startsWith('kh.')) {
      const uadeMode = prefs.uade ?? 'enhanced';
      if (prefs.krisHatlelid === 'native') {
        try {
          const { isKrisHatlelidFormat, parseKrisHatlelidFile } = await import('@lib/import/formats/KrisHatlelidParser');
          if (isKrisHatlelidFormat(buffer)) return parseKrisHatlelidFile(buffer, file.name);
        } catch (err) {
          console.warn(`[KrisHatlelidParser] Native parse failed for ${filename}, falling back to UADE:`, err);
        }
      }
      const { parseUADEFile: parseUADE_kh } = await import('@lib/import/formats/UADEParser');
      return parseUADE_kh(buffer, file.name, uadeMode, subsong, preScannedMeta);
    }
  }

  // ── NTSP System (TWO.* prefix) ───────────────────────────────────────────
  // Amiga 2-file packed format. Magic: 'SPNT' at offset 0 + non-zero at offset 4.
  {
    const _twoBase = (filename.split('/').pop() ?? filename).split('\\').pop()!.toLowerCase();
    if (_twoBase.startsWith('two.')) {
      const uadeMode = prefs.uade ?? 'enhanced';
      if (prefs.ntsp === 'native') {
        try {
          const { isNTSPFormat, parseNTSPFile } = await import('@lib/import/formats/NTSPParser');
          if (isNTSPFormat(buffer)) return parseNTSPFile(buffer, file.name);
        } catch (err) {
          console.warn(`[NTSPParser] Native parse failed for ${filename}, falling back to UADE:`, err);
        }
      }
      const { parseUADEFile: parseUADE_two } = await import('@lib/import/formats/UADEParser');
      return parseUADE_two(buffer, file.name, uadeMode, subsong, preScannedMeta);
    }
  }

  // ── UFO / MicroProse (MUS.* / UFO.* prefix) ──────────────────────────────
  // IFF-based 4-channel Amiga format. FORM+DDAT+BODY+CHAN structure.
  {
    const _ufoBase = (filename.split('/').pop() ?? filename).split('\\').pop()!.toLowerCase();
    if (_ufoBase.startsWith('mus.') || _ufoBase.startsWith('ufo.')) {
      const uadeMode = prefs.uade ?? 'enhanced';
      if (prefs.ufo === 'native') {
        try {
          const { isUFOFormat, parseUFOFile } = await import('@lib/import/formats/UFOParser');
          if (isUFOFormat(buffer)) return parseUFOFile(buffer, file.name);
        } catch (err) {
          console.warn(`[UFOParser] Native parse failed for ${filename}, falling back to UADE:`, err);
        }
      }
      const { parseUADEFile: parseUADE_ufop } = await import('@lib/import/formats/UADEParser');
      return parseUADE_ufop(buffer, file.name, uadeMode, subsong, preScannedMeta);
    }
  }

  // ── Mosh Packer (MOSH.* prefix) ──────────────────────────────────────────
  // SoundTracker-compatible Amiga packed format. 31 sample headers + M.K. at 378.
  {
    const _moshBase = (filename.split('/').pop() ?? filename).split('\\').pop()!.toLowerCase();
    if (_moshBase.startsWith('mosh.')) {
      const uadeMode = prefs.uade ?? 'enhanced';
      if (prefs.moshPacker === 'native') {
        try {
          const { isMoshPackerFormat, parseMoshPackerFile } = await import('@lib/import/formats/MoshPackerParser');
          if (isMoshPackerFormat(buffer)) return parseMoshPackerFile(buffer, file.name);
        } catch (err) {
          console.warn(`[MoshPackerParser] Native parse failed for ${filename}, falling back to UADE:`, err);
        }
      }
      const { parseUADEFile: parseUADE_mosh } = await import('@lib/import/formats/UADEParser');
      return parseUADE_mosh(buffer, file.name, uadeMode, subsong, preScannedMeta);
    }
  }

  // ── Mugician (MUG.* prefix) ───────────────────────────────────────────────
  // Same format as .mug/.dmu — " MUGICIAN/SOFTEYES 1990" signature at offset 0.
  {
    const _mugBase = (filename.split('/').pop() ?? filename).split('\\').pop()!.toLowerCase();
    if (_mugBase.startsWith('mug.')) {
      const uadeMode = prefs.uade ?? 'enhanced';
      if (prefs.mugician === 'native') {
        try {
          const { parseDigitalMugicianFile } = await import('@lib/import/formats/DigitalMugicianParser');
          return parseDigitalMugicianFile(buffer, file.name);
        } catch (err) {
          console.warn(`[DigitalMugicianParser] Native parse failed for ${filename}, falling back to UADE:`, err);
        }
      }
      const { parseUADEFile: parseUADE_mug } = await import('@lib/import/formats/UADEParser');
      return parseUADE_mug(buffer, file.name, uadeMode, subsong, preScannedMeta);
    }
  }

  // ── Mugician II (MUG2.* prefix) ───────────────────────────────────────────
  // Same format as .mug2/.dmu2 — " MUGICIAN2/SOFTEYES 1990" signature at offset 0.
  {
    const _mug2Base = (filename.split('/').pop() ?? filename).split('\\').pop()!.toLowerCase();
    if (_mug2Base.startsWith('mug2.')) {
      const uadeMode = prefs.uade ?? 'enhanced';
      if (prefs.mugician === 'native') {
        try {
          const { parseDigitalMugicianFile } = await import('@lib/import/formats/DigitalMugicianParser');
          return parseDigitalMugicianFile(buffer, file.name);
        } catch (err) {
          console.warn(`[DigitalMugicianParser] Native parse failed for ${filename}, falling back to UADE:`, err);
        }
      }
      const { parseUADEFile: parseUADE_mug2 } = await import('@lib/import/formats/UADEParser');
      return parseUADE_mug2(buffer, file.name, uadeMode, subsong, preScannedMeta);
    }
  }

  // ── Core Design (CORE.* prefix) ───────────────────────────────────────────
  {
    const _coreBase = (filename.split('/').pop() ?? filename).split('\\').pop()!.toLowerCase();
    if (_coreBase.startsWith('core.')) {
      const uadeMode = prefs.uade ?? 'enhanced';
      if (prefs.coreDesign === 'native') {
        try {
          const { isCoreDesignFormat, parseCoreDesignFile } = await import('@lib/import/formats/CoreDesignParser');
          if (isCoreDesignFormat(buffer)) return parseCoreDesignFile(buffer, file.name);
        } catch (err) {
          console.warn(`[CoreDesignParser] Native parse failed for ${filename}, falling back to UADE:`, err);
        }
      }
      const { parseUADEFile: parseUADE_core } = await import('@lib/import/formats/UADEParser');
      return parseUADE_core(buffer, file.name, uadeMode, subsong, preScannedMeta);
    }
  }

  // ── Janko Mrsic-Flogel (JMF.* prefix) ────────────────────────────────────
  {
    const _jmfBase = (filename.split('/').pop() ?? filename).split('\\').pop()!.toLowerCase();
    if (_jmfBase.startsWith('jmf.')) {
      const uadeMode = prefs.uade ?? 'enhanced';
      if (prefs.jankoMrsicFlogel === 'native') {
        try {
          const { isJankoMrsicFlogelFormat, parseJankoMrsicFlogelFile } = await import('@lib/import/formats/JankoMrsicFlogelParser');
          if (isJankoMrsicFlogelFormat(buffer)) return parseJankoMrsicFlogelFile(buffer, file.name);
        } catch (err) {
          console.warn(`[JankoMrsicFlogelParser] Native parse failed for ${filename}, falling back to UADE:`, err);
        }
      }
      const { parseUADEFile: parseUADE_jmf } = await import('@lib/import/formats/UADEParser');
      return parseUADE_jmf(buffer, file.name, uadeMode, subsong, preScannedMeta);
    }
  }

  // ── Special FX (JD.* prefix) ──────────────────────────────────────────────
  {
    const _jdBase = (filename.split('/').pop() ?? filename).split('\\').pop()!.toLowerCase();
    if (_jdBase.startsWith('jd.')) {
      const uadeMode = prefs.uade ?? 'enhanced';
      if (prefs.specialFX === 'native') {
        try {
          const { isSpecialFXFormat, parseSpecialFXFile } = await import('@lib/import/formats/SpecialFXParser');
          if (isSpecialFXFormat(buffer)) return parseSpecialFXFile(buffer, file.name);
        } catch (err) {
          console.warn(`[SpecialFXParser] Native parse failed for ${filename}, falling back to UADE:`, err);
        }
      }
      const { parseUADEFile: parseUADE_jd } = await import('@lib/import/formats/UADEParser');
      return parseUADE_jd(buffer, file.name, uadeMode, subsong, preScannedMeta);
    }
  }

  // ── Sound Player / Steve Barrett (SJS.* prefix) ───────────────────────────
  {
    const _sjsBase = (filename.split('/').pop() ?? filename).split('\\').pop()!.toLowerCase();
    if (_sjsBase.startsWith('sjs.')) {
      const uadeMode = prefs.uade ?? 'enhanced';
      if (prefs.soundPlayer === 'native') {
        try {
          const { isSoundPlayerFormat, parseSoundPlayerFile } = await import('@lib/import/formats/SoundPlayerParser');
          if (isSoundPlayerFormat(buffer)) return parseSoundPlayerFile(buffer, file.name);
        } catch (err) {
          console.warn(`[SoundPlayerParser] Native parse failed for ${filename}, falling back to UADE:`, err);
        }
      }
      const { parseUADEFile: parseUADE_sjs } = await import('@lib/import/formats/UADEParser');
      return parseUADE_sjs(buffer, file.name, uadeMode, subsong, preScannedMeta);
    }
  }

  // ── Nick Pelling Packer (NPP.* prefix) ────────────────────────────────────
  {
    const _nppBase = (filename.split('/').pop() ?? filename).split('\\').pop()!.toLowerCase();
    if (_nppBase.startsWith('npp.')) {
      const uadeMode = prefs.uade ?? 'enhanced';
      if (prefs.nickPellingPacker === 'native') {
        try {
          const { isNickPellingPackerFormat, parseNickPellingPackerFile } = await import('@lib/import/formats/NickPellingPackerParser');
          if (isNickPellingPackerFormat(buffer)) return parseNickPellingPackerFile(buffer, file.name);
        } catch (err) {
          console.warn(`[NickPellingPackerParser] Native parse failed for ${filename}, falling back to UADE:`, err);
        }
      }
      const { parseUADEFile: parseUADE_npp } = await import('@lib/import/formats/UADEParser');
      return parseUADE_npp(buffer, file.name, uadeMode, subsong, preScannedMeta);
    }
  }

  // ── Peter Verswyvelen Packer (PVP.* prefix) ───────────────────────────────
  {
    const _pvpBase = (filename.split('/').pop() ?? filename).split('\\').pop()!.toLowerCase();
    if (_pvpBase.startsWith('pvp.')) {
      const uadeMode = prefs.uade ?? 'enhanced';
      if (prefs.peterVerswyvelenPacker === 'native') {
        try {
          const { isPeterVerswyvelenPackerFormat, parsePeterVerswyvelenPackerFile } = await import('@lib/import/formats/PeterVerswyvelenPackerParser');
          if (isPeterVerswyvelenPackerFormat(buffer)) return parsePeterVerswyvelenPackerFile(buffer, file.name);
        } catch (err) {
          console.warn(`[PeterVerswyvelenPackerParser] Native parse failed for ${filename}, falling back to UADE:`, err);
        }
      }
      const { parseUADEFile: parseUADE_pvp } = await import('@lib/import/formats/UADEParser');
      return parseUADE_pvp(buffer, file.name, uadeMode, subsong, preScannedMeta);
    }
  }

  // ── Wally Beben (WB.* prefix) ─────────────────────────────────────────────
  {
    const _wbBase = (filename.split('/').pop() ?? filename).split('\\').pop()!.toLowerCase();
    if (_wbBase.startsWith('wb.')) {
      const uadeMode = prefs.uade ?? 'enhanced';
      if (prefs.wallyBeben === 'native') {
        try {
          const { isWallyBebenFormat, parseWallyBebenFile } = await import('@lib/import/formats/WallyBebenParser');
          if (isWallyBebenFormat(buffer)) return parseWallyBebenFile(buffer, file.name);
        } catch (err) {
          console.warn(`[WallyBebenParser] Native parse failed for ${filename}, falling back to UADE:`, err);
        }
      }
      const { parseUADEFile: parseUADE_wb } = await import('@lib/import/formats/UADEParser');
      return parseUADE_wb(buffer, file.name, uadeMode, subsong, preScannedMeta);
    }
  }

  // ── Steve Barrett (SB.* prefix) ───────────────────────────────────────────
  {
    const _sbBase = (filename.split('/').pop() ?? filename).split('\\').pop()!.toLowerCase();
    if (_sbBase.startsWith('sb.')) {
      const uadeMode = prefs.uade ?? 'enhanced';
      if (prefs.steveBarrett === 'native') {
        try {
          const { isSteveBarrettFormat, parseSteveBarrettFile } = await import('@lib/import/formats/SteveBarrettParser');
          if (isSteveBarrettFormat(buffer)) return parseSteveBarrettFile(buffer, file.name);
        } catch (err) {
          console.warn(`[SteveBarrettParser] Native parse failed for ${filename}, falling back to UADE:`, err);
        }
      }
      const { parseUADEFile: parseUADE_sb } = await import('@lib/import/formats/UADEParser');
      return parseUADE_sb(buffer, file.name, uadeMode, subsong, preScannedMeta);
    }
  }

  // ── Paul Summers (SNK.* prefix) ───────────────────────────────────────────
  {
    const _snkBase = (filename.split('/').pop() ?? filename).split('\\').pop()!.toLowerCase();
    if (_snkBase.startsWith('snk.')) {
      const uadeMode = prefs.uade ?? 'enhanced';
      if (prefs.paulSummers === 'native') {
        try {
          const { isPaulSummersFormat, parsePaulSummersFile } = await import('@lib/import/formats/PaulSummersParser');
          if (isPaulSummersFormat(buffer)) return parsePaulSummersFile(buffer, file.name);
        } catch (err) {
          console.warn(`[PaulSummersParser] Native parse failed for ${filename}, falling back to UADE:`, err);
        }
      }
      const { parseUADEFile: parseUADE_snk } = await import('@lib/import/formats/UADEParser');
      return parseUADE_snk(buffer, file.name, uadeMode, subsong, preScannedMeta);
    }
  }

  // ── Desire (DSR.* prefix) ─────────────────────────────────────────────────
  // Amiga 4-channel format with specific 68k opcode pattern. UADE prefix: DSR.
  {
    const _dsrBase = (filename.split('/').pop() ?? filename).split('\\').pop()!.toLowerCase();
    if (_dsrBase.startsWith('dsr.')) {
      const uadeMode = prefs.uade ?? 'enhanced';
      if (prefs.desire === 'native') {
        try {
          const { isDesireFormat, parseDesireFile } = await import('@lib/import/formats/DesireParser');
          if (isDesireFormat(buffer)) return parseDesireFile(buffer, file.name);
        } catch (err) {
          console.warn(`[DesireParser] Native parse failed for ${filename}, falling back to UADE:`, err);
        }
      }
      const { parseUADEFile: parseUADE_dsr } = await import('@lib/import/formats/UADEParser');
      return parseUADE_dsr(buffer, file.name, uadeMode, subsong, preScannedMeta);
    }
  }

  // ── Dave Lowe New (DLN.* prefix) ──────────────────────────────────────────
  // New-style Dave Lowe Amiga format with table-based detection. UADE prefix: DLN.
  {
    const _dlnBase = (filename.split('/').pop() ?? filename).split('\\').pop()!.toLowerCase();
    if (_dlnBase.startsWith('dln.')) {
      const uadeMode = prefs.uade ?? 'enhanced';
      if (prefs.daveLowe === 'native') {
        try {
          const { isDaveLoweNewFormat, parseDaveLoweNewFile } = await import('@lib/import/formats/DaveLoweNewParser');
          if (isDaveLoweNewFormat(buffer)) return parseDaveLoweNewFile(buffer, file.name);
        } catch (err) {
          console.warn(`[DaveLoweNewParser] Native parse failed for ${filename}, falling back to UADE:`, err);
        }
      }
      const { parseUADEFile: parseUADE_dln } = await import('@lib/import/formats/UADEParser');
      return parseUADE_dln(buffer, file.name, uadeMode, subsong, preScannedMeta);
    }
  }

  // ── Martin Walker (AVP.* / MW.* prefix) ──────────────────────────────────
  // Amiga 5-variant format. UADE prefixes: avp, mw (different from .avp/.mw extensions).
  {
    const _mwBase = (filename.split('/').pop() ?? filename).split('\\').pop()!.toLowerCase();
    if (_mwBase.startsWith('avp.') || _mwBase.startsWith('mw.')) {
      const uadeMode = prefs.uade ?? 'enhanced';
      if (prefs.martinWalker === 'native') {
        try {
          const { isMartinWalkerFormat, parseMartinWalkerFile } = await import('@lib/import/formats/MartinWalkerParser');
          if (isMartinWalkerFormat(buffer)) return parseMartinWalkerFile(buffer, file.name);
        } catch (err) {
          console.warn(`[MartinWalkerParser] Native parse failed for ${filename}, falling back to UADE:`, err);
        }
      }
      const { parseUADEFile: parseUADE_mw } = await import('@lib/import/formats/UADEParser');
      return parseUADE_mw(buffer, file.name, uadeMode, subsong, preScannedMeta);
    }
  }

  // ── Paul Shields (PS.* prefix) ────────────────────────────────────────────
  // Amiga 3-variant format with zero-prefix header. UADE prefix: ps.
  {
    const _psBase = (filename.split('/').pop() ?? filename).split('\\').pop()!.toLowerCase();
    if (_psBase.startsWith('ps.')) {
      const uadeMode = prefs.uade ?? 'enhanced';
      if (prefs.paulShields === 'native') {
        try {
          const { isPaulShieldsFormat, parsePaulShieldsFile } = await import('@lib/import/formats/PaulShieldsParser');
          if (isPaulShieldsFormat(buffer)) return parsePaulShieldsFile(buffer, file.name);
        } catch (err) {
          console.warn(`[PaulShieldsParser] Native parse failed for ${filename}, falling back to UADE:`, err);
        }
      }
      const { parseUADEFile: parseUADE_ps } = await import('@lib/import/formats/UADEParser');
      return parseUADE_ps(buffer, file.name, uadeMode, subsong, preScannedMeta);
    }
  }

  // ── Paul Robotham (DAT.* prefix) ──────────────────────────────────────────
  // Amiga format with structured pointer table. UADE prefix: dat.
  {
    const _datBase = (filename.split('/').pop() ?? filename).split('\\').pop()!.toLowerCase();
    if (_datBase.startsWith('dat.')) {
      const uadeMode = prefs.uade ?? 'enhanced';
      if (prefs.paulRobotham === 'native') {
        try {
          const { isPaulRobothamFormat, parsePaulRobothamFile } = await import('@lib/import/formats/PaulRobothamParser');
          if (isPaulRobothamFormat(buffer)) return parsePaulRobothamFile(buffer, file.name);
        } catch (err) {
          console.warn(`[PaulRobothamParser] Native parse failed for ${filename}, falling back to UADE:`, err);
        }
      }
      const { parseUADEFile: parseUADE_dat } = await import('@lib/import/formats/UADEParser');
      return parseUADE_dat(buffer, file.name, uadeMode, subsong, preScannedMeta);
    }
  }

  // ── Pierre Adane Packer (PAP.* prefix) ────────────────────────────────────
  // Amiga format with 4-word offset header. UADE prefix: pap.
  {
    const _papBase = (filename.split('/').pop() ?? filename).split('\\').pop()!.toLowerCase();
    if (_papBase.startsWith('pap.')) {
      const uadeMode = prefs.uade ?? 'enhanced';
      if (prefs.pierreAdane === 'native') {
        try {
          const { isPierreAdaneFormat, parsePierreAdaneFile } = await import('@lib/import/formats/PierreAdaneParser');
          if (isPierreAdaneFormat(buffer)) return parsePierreAdaneFile(buffer, file.name);
        } catch (err) {
          console.warn(`[PierreAdaneParser] Native parse failed for ${filename}, falling back to UADE:`, err);
        }
      }
      const { parseUADEFile: parseUADE_pap } = await import('@lib/import/formats/UADEParser');
      return parseUADE_pap(buffer, file.name, uadeMode, subsong, preScannedMeta);
    }
  }

  // ── Anders 0land (HOT.* prefix) ───────────────────────────────────────────
  // Amiga 3-chunk format (mpl/mdt/msm). UADE prefix: hot.
  {
    const _hotBase = (filename.split('/').pop() ?? filename).split('\\').pop()!.toLowerCase();
    if (_hotBase.startsWith('hot.')) {
      const uadeMode = prefs.uade ?? 'enhanced';
      if (prefs.anders0land === 'native') {
        try {
          const { isAnders0landFormat, parseAnders0landFile } = await import('@lib/import/formats/Anders0landParser');
          if (isAnders0landFormat(buffer, file.name)) return await parseAnders0landFile(buffer, file.name);
        } catch (err) {
          console.warn(`[Anders0landParser] Native parse failed for ${filename}, falling back to UADE:`, err);
        }
      }
      const { parseUADEFile: parseUADE_hot } = await import('@lib/import/formats/UADEParser');
      return parseUADE_hot(buffer, file.name, uadeMode, subsong, preScannedMeta);
    }
  }

  // ── Andrew Parton (BYE.* prefix) ──────────────────────────────────────────
  // Amiga format with 'BANK' magic + chip-RAM pointer table. UADE prefix: bye.
  {
    const _byeBase = (filename.split('/').pop() ?? filename).split('\\').pop()!.toLowerCase();
    if (_byeBase.startsWith('bye.')) {
      const uadeMode = prefs.uade ?? 'enhanced';
      if (prefs.andrewParton === 'native') {
        try {
          const { isAndrewPartonFormat, parseAndrewPartonFile } = await import('@lib/import/formats/AndrewPartonParser');
          if (isAndrewPartonFormat(buffer, file.name)) return await parseAndrewPartonFile(buffer, file.name);
        } catch (err) {
          console.warn(`[AndrewPartonParser] Native parse failed for ${filename}, falling back to UADE:`, err);
        }
      }
      const { parseUADEFile: parseUADE_bye } = await import('@lib/import/formats/UADEParser');
      return parseUADE_bye(buffer, file.name, uadeMode, subsong, preScannedMeta);
    }
  }

  // ── Custom Made (CM.* / RK.* / RKB.* prefix) ─────────────────────────────
  // Amiga format with BRA/JMP opcode detection. UADE prefixes: cm, rk, rkb.
  {
    const _cmBase = (filename.split('/').pop() ?? filename).split('\\').pop()!.toLowerCase();
    if (_cmBase.startsWith('cm.') || _cmBase.startsWith('rk.') || _cmBase.startsWith('rkb.')) {
      const uadeMode = prefs.uade ?? 'enhanced';
      if (prefs.customMade === 'native') {
        try {
          const { isCustomMadeFormat, parseCustomMadeFile } = await import('@lib/import/formats/CustomMadeParser');
          if (isCustomMadeFormat(buffer, file.name)) return await parseCustomMadeFile(buffer, file.name);
        } catch (err) {
          console.warn(`[CustomMadeParser] Native parse failed for ${filename}, falling back to UADE:`, err);
        }
      }
      const { parseUADEFile: parseUADE_cm } = await import('@lib/import/formats/UADEParser');
      return parseUADE_cm(buffer, file.name, uadeMode, subsong, preScannedMeta);
    }
  }

  // ── Ben Daglish SID (BDS.* prefix) ────────────────────────────────────────
  // Amiga HUNK-based SID-style 3-voice format. UADE prefix: BDS.
  {
    const _bdsBase = (filename.split('/').pop() ?? filename).split('\\').pop()!.toLowerCase();
    if (_bdsBase.startsWith('bds.')) {
      const uadeMode = prefs.uade ?? 'enhanced';
      if (prefs.benDaglishSID === 'native') {
        try {
          const { isBenDaglishSIDFormat, parseBenDaglishSIDFile } = await import('@lib/import/formats/BenDaglishSIDParser');
          if (isBenDaglishSIDFormat(buffer, file.name)) return await parseBenDaglishSIDFile(buffer, file.name);
        } catch (err) {
          console.warn(`[BenDaglishSIDParser] Native parse failed for ${filename}, falling back to UADE:`, err);
        }
      }
      const { parseUADEFile: parseUADE_bds } = await import('@lib/import/formats/UADEParser');
      return parseUADE_bds(buffer, file.name, uadeMode, subsong, preScannedMeta);
    }
  }

  // ── Digital Sonix & Chrome (DSC.* prefix) ────────────────────────────────
  // Amiga format with sample-table structural detection. UADE prefix: DSC.
  {
    const _dscBase = (filename.split('/').pop() ?? filename).split('\\').pop()!.toLowerCase();
    if (_dscBase.startsWith('dsc.')) {
      const uadeMode = prefs.uade ?? 'enhanced';
      if (prefs.digitalSonixChrome === 'native') {
        try {
          const { isDscFormat, parseDscFile } = await import('@lib/import/formats/DigitalSonixChromeParser');
          if (isDscFormat(buffer)) return parseDscFile(buffer, file.name);
        } catch (err) {
          console.warn(`[DigitalSonixChromeParser] Native parse failed for ${filename}, falling back to UADE:`, err);
        }
      }
      const { parseUADEFile: parseUADE_dsc } = await import('@lib/import/formats/UADEParser');
      return parseUADE_dsc(buffer, file.name, uadeMode, subsong, preScannedMeta);
    }
  }

  // ── Sonix Music Driver (SMUS.* / SNX.* / TINY.* prefix) ──────────────────
  // IFF SMUS and two binary sub-formats. UADE prefixes: smus, snx, tiny.
  {
    const _sonixBase = (filename.split('/').pop() ?? filename).split('\\').pop()!.toLowerCase();
    if (_sonixBase.startsWith('smus.') || _sonixBase.startsWith('snx.') || _sonixBase.startsWith('tiny.')) {
      const uadeMode = prefs.uade ?? 'enhanced';
      if (prefs.iffSmus === 'native') {
        try {
          const { isIffSmusFormat, parseIffSmusFile } = await import('@lib/import/formats/IffSmusParser');
          if (isIffSmusFormat(buffer)) return await parseIffSmusFile(buffer, file.name);
        } catch (err) {
          console.warn(`[IffSmusParser] Native parse failed for ${filename}, falling back to UADE:`, err);
        }
      }
      const { parseUADEFile: parseUADE_sonix } = await import('@lib/import/formats/UADEParser');
      return parseUADE_sonix(buffer, file.name, uadeMode, subsong, preScannedMeta);
    }
  }

  // ── Jesper Olsen (JO.* prefix) ────────────────────────────────────────────
  // Amiga format with jump-table detection and two sub-variants. UADE prefix: JO.
  {
    const _joBase = (filename.split('/').pop() ?? filename).split('\\').pop()!.toLowerCase();
    if (_joBase.startsWith('jo.')) {
      const uadeMode = prefs.uade ?? 'enhanced';
      if (prefs.jesperOlsen === 'native') {
        try {
          const { isJesperOlsenFormat, parseJesperOlsenFile } = await import('@lib/import/formats/JesperOlsenParser');
          if (isJesperOlsenFormat(buffer)) return parseJesperOlsenFile(buffer, file.name);
        } catch (err) {
          console.warn(`[JesperOlsenParser] Native parse failed for ${filename}, falling back to UADE:`, err);
        }
      }
      const { parseUADEFile: parseUADE_jo } = await import('@lib/import/formats/UADEParser');
      return parseUADE_jo(buffer, file.name, uadeMode, subsong, preScannedMeta);
    }
  }

  // ── Kim Christensen (KIM.* prefix) ────────────────────────────────────────
  // Amiga format with multi-opcode scan detection. UADE prefix: KIM.
  {
    const _kimBase = (filename.split('/').pop() ?? filename).split('\\').pop()!.toLowerCase();
    if (_kimBase.startsWith('kim.')) {
      const uadeMode = prefs.uade ?? 'enhanced';
      if (prefs.kimChristensen === 'native') {
        try {
          const { isKimChristensenFormat, parseKimChristensenFile } = await import('@lib/import/formats/KimChristensenParser');
          if (isKimChristensenFormat(buffer)) return parseKimChristensenFile(buffer, file.name);
        } catch (err) {
          console.warn(`[KimChristensenParser] Native parse failed for ${filename}, falling back to UADE:`, err);
        }
      }
      const { parseUADEFile: parseUADE_kim } = await import('@lib/import/formats/UADEParser');
      return parseUADE_kim(buffer, file.name, uadeMode, subsong, preScannedMeta);
    }
  }

  // ── Ashley Hogg (ASH.* prefix) ────────────────────────────────────────────
  {
    const _ashBase = (filename.split('/').pop() ?? filename).split('\\').pop()!.toLowerCase();
    if (_ashBase.startsWith('ash.')) {
      const uadeMode = prefs.uade ?? 'enhanced';
      if (prefs.ashleyHogg === 'native') {
        try {
          const { isAshleyHoggFormat, parseAshleyHoggFile } = await import('@lib/import/formats/AshleyHoggParser');
          if (isAshleyHoggFormat(buffer)) return parseAshleyHoggFile(buffer, file.name);
        } catch (err) {
          console.warn(`[AshleyHoggParser] Native parse failed for ${filename}, falling back to UADE:`, err);
        }
      }
      const { parseUADEFile: parseUADE_ash } = await import('@lib/import/formats/UADEParser');
      return parseUADE_ash(buffer, file.name, uadeMode, subsong, preScannedMeta);
    }
  }

  // ── ADPCM Mono (ADPCM.* prefix) ───────────────────────────────────────────
  {
    const _adpcmBase = (filename.split('/').pop() ?? filename).split('\\').pop()!.toLowerCase();
    if (_adpcmBase.startsWith('adpcm.')) {
      const uadeMode = prefs.uade ?? 'enhanced';
      if (prefs.adpcmMono === 'native') {
        try {
          const { isADPCMmonoFormat, parseADPCMmonoFile } = await import('@lib/import/formats/ADPCMmonoParser');
          if (isADPCMmonoFormat(buffer, file.name)) return parseADPCMmonoFile(buffer, file.name);
        } catch (err) {
          console.warn(`[ADPCMmonoParser] Native parse failed for ${filename}, falling back to UADE:`, err);
        }
      }
      const { parseUADEFile: parseUADE_adpcm } = await import('@lib/import/formats/UADEParser');
      return parseUADE_adpcm(buffer, file.name, uadeMode, subsong, preScannedMeta);
    }
  }

  // ── Janne Salmijarvi Optimizer (JS.* prefix) ──────────────────────────────
  {
    const _jsBase = (filename.split('/').pop() ?? filename).split('\\').pop()!.toLowerCase();
    if (_jsBase.startsWith('js.')) {
      const uadeMode = prefs.uade ?? 'enhanced';
      if (prefs.janneSalmijarvi === 'native') {
        try {
          const { isJanneSalmijarviFormat, parseJanneSalmijarviFile } = await import('@lib/import/formats/JanneSalmijarviParser');
          if (isJanneSalmijarviFormat(buffer)) return parseJanneSalmijarviFile(buffer, file.name);
        } catch (err) {
          console.warn(`[JanneSalmijarviParser] Native parse failed for ${filename}, falling back to UADE:`, err);
        }
      }
      const { parseUADEFile: parseUADE_js } = await import('@lib/import/formats/UADEParser');
      return parseUADE_js(buffer, file.name, uadeMode, subsong, preScannedMeta);
    }
  }

  // ── Jochen Hippel 7V (HIP7.* / S7G.* prefix) ─────────────────────────────
  {
    const _hip7Base = (filename.split('/').pop() ?? filename).split('\\').pop()!.toLowerCase();
    if (_hip7Base.startsWith('hip7.') || _hip7Base.startsWith('s7g.')) {
      const uadeMode = prefs.uade ?? 'enhanced';
      if (prefs.jochenHippel7V === 'native') {
        try {
          const { isJochenHippel7VFormat, parseJochenHippel7VFile } = await import('@lib/import/formats/JochenHippel7VParser');
          if (isJochenHippel7VFormat(buffer)) return parseJochenHippel7VFile(buffer, file.name);
        } catch (err) {
          console.warn(`[JochenHippel7VParser] Native parse failed for ${filename}, falling back to UADE:`, err);
        }
      }
      const { parseUADEFile: parseUADE_hip7 } = await import('@lib/import/formats/UADEParser');
      return parseUADE_hip7(buffer, file.name, uadeMode, subsong, preScannedMeta);
    }
  }

  // ── Jochen Hippel ST (HST.* prefix) ───────────────────────────────────────
  {
    const _hstBase = (filename.split('/').pop() ?? filename).split('\\').pop()!.toLowerCase();
    if (_hstBase.startsWith('hst.')) {
      const uadeMode = prefs.uade ?? 'enhanced';
      if (prefs.jochenHippelST === 'native') {
        try {
          const { isJochenHippelSTFormat, parseJochenHippelSTFile } = await import('@lib/import/formats/JochenHippelSTParser');
          if (isJochenHippelSTFormat(buffer)) return parseJochenHippelSTFile(buffer, file.name);
        } catch (err) {
          console.warn(`[JochenHippelSTParser] Native parse failed for ${filename}, falling back to UADE:`, err);
        }
      }
      const { parseUADEFile: parseUADE_hst } = await import('@lib/import/formats/UADEParser');
      return parseUADE_hst(buffer, file.name, uadeMode, subsong, preScannedMeta);
    }
  }

  // ── Maximum Effect (MAX.* prefix) ─────────────────────────────────────────
  {
    const _maxBase = (filename.split('/').pop() ?? filename).split('\\').pop()!.toLowerCase();
    if (_maxBase.startsWith('max.')) {
      const uadeMode = prefs.uade ?? 'enhanced';
      if (prefs.maximumEffect === 'native') {
        try {
          const { isMaximumEffectFormat, parseMaximumEffectFile } = await import('@lib/import/formats/MaximumEffectParser');
          if (isMaximumEffectFormat(buffer)) return parseMaximumEffectFile(buffer, file.name);
        } catch (err) {
          console.warn(`[MaximumEffectParser] Native parse failed for ${filename}, falling back to UADE:`, err);
        }
      }
      const { parseUADEFile: parseUADE_max } = await import('@lib/import/formats/UADEParser');
      return parseUADE_max(buffer, file.name, uadeMode, subsong, preScannedMeta);
    }
  }

  // ── MIDI Loriciel (MIDI.* prefix) ─────────────────────────────────────────
  {
    const _midiBase = (filename.split('/').pop() ?? filename).split('\\').pop()!.toLowerCase();
    if (_midiBase.startsWith('midi.')) {
      const uadeMode = prefs.uade ?? 'enhanced';
      if (prefs.midiLoriciel === 'native') {
        try {
          const { isMIDILoricielFormat, parseMIDILoricielFile } = await import('@lib/import/formats/MIDILoricielParser');
          if (isMIDILoricielFormat(buffer)) return parseMIDILoricielFile(buffer, file.name);
        } catch (err) {
          console.warn(`[MIDILoricielParser] Native parse failed for ${filename}, falling back to UADE:`, err);
        }
      }
      const { parseUADEFile: parseUADE_midi } = await import('@lib/import/formats/UADEParser');
      return parseUADE_midi(buffer, file.name, uadeMode, subsong, preScannedMeta);
    }
  }

  // ── onEscapee (ONE.* prefix) ──────────────────────────────────────────────
  {
    const _oneBase = (filename.split('/').pop() ?? filename).split('\\').pop()!.toLowerCase();
    if (_oneBase.startsWith('one.')) {
      const uadeMode = prefs.uade ?? 'enhanced';
      if (prefs.onEscapee === 'native') {
        try {
          const { isOnEscapeeFormat, parseOnEscapeeFile } = await import('@lib/import/formats/OnEscapeeParser');
          if (isOnEscapeeFormat(buffer)) return parseOnEscapeeFile(buffer, file.name);
        } catch (err) {
          console.warn(`[OnEscapeeParser] Native parse failed for ${filename}, falling back to UADE:`, err);
        }
      }
      const { parseUADEFile: parseUADE_one } = await import('@lib/import/formats/UADEParser');
      return parseUADE_one(buffer, file.name, uadeMode, subsong, preScannedMeta);
    }
  }

  // ── Paul Tonge (PAT.* prefix) ─────────────────────────────────────────────
  {
    const _patBase = (filename.split('/').pop() ?? filename).split('\\').pop()!.toLowerCase();
    if (_patBase.startsWith('pat.')) {
      const uadeMode = prefs.uade ?? 'enhanced';
      if (prefs.paulTonge === 'native') {
        try {
          const { isPaulTongeFormat, parsePaulTongeFile } = await import('@lib/import/formats/PaulTongeParser');
          if (isPaulTongeFormat(buffer)) return parsePaulTongeFile(buffer, file.name);
        } catch (err) {
          console.warn(`[PaulTongeParser] Native parse failed for ${filename}, falling back to UADE:`, err);
        }
      }
      const { parseUADEFile: parseUADE_pat } = await import('@lib/import/formats/UADEParser');
      return parseUADE_pat(buffer, file.name, uadeMode, subsong, preScannedMeta);
    }
  }

  // ── Rob Hubbard ST (RHO.* prefix) ─────────────────────────────────────────
  {
    const _rhoBase = (filename.split('/').pop() ?? filename).split('\\').pop()!.toLowerCase();
    if (_rhoBase.startsWith('rho.')) {
      const uadeMode = prefs.uade ?? 'enhanced';
      if (prefs.robHubbardST === 'native') {
        try {
          const { isRobHubbardSTFormat, parseRobHubbardSTFile } = await import('@lib/import/formats/RobHubbardSTParser');
          if (isRobHubbardSTFormat(buffer)) return parseRobHubbardSTFile(buffer, file.name);
        } catch (err) {
          console.warn(`[RobHubbardSTParser] Native parse failed for ${filename}, falling back to UADE:`, err);
        }
      }
      const { parseUADEFile: parseUADE_rho } = await import('@lib/import/formats/UADEParser');
      return parseUADE_rho(buffer, file.name, uadeMode, subsong, preScannedMeta);
    }
  }

  // ── Rob Hubbard (RH.* prefix) ─────────────────────────────────────────────
  {
    const _rhBase = (filename.split('/').pop() ?? filename).split('\\').pop()!.toLowerCase();
    if (_rhBase.startsWith('rh.')) {
      const uadeMode = prefs.uade ?? 'enhanced';
      if (prefs.robHubbard === 'native') {
        try {
          const { isRobHubbardFormat, parseRobHubbardFile } = await import('@lib/import/formats/RobHubbardParser');
          if (isRobHubbardFormat(buffer, file.name)) return await parseRobHubbardFile(buffer, file.name);
        } catch (err) {
          console.warn(`[RobHubbardParser] Native parse failed for ${filename}, falling back to UADE:`, err);
        }
      }
      const { parseUADEFile: parseUADE_rh } = await import('@lib/import/formats/UADEParser');
      return parseUADE_rh(buffer, file.name, uadeMode, subsong, preScannedMeta);
    }
  }

  // ── AM-Composer (AMC.* prefix) ───────────────────────────────────────────
  // eagleplayer.conf: AM-Composer  prefixes=amc
  {
    const _amcBase = (filename.split('/').pop() ?? filename).split('\\').pop()!.toLowerCase();
    if (_amcBase.startsWith('amc.')) {
      const uadeMode = prefs.uade ?? 'enhanced';
      const { parseUADEFile: parseUADE_amc } = await import('@lib/import/formats/UADEParser');
      return parseUADE_amc(buffer, file.name, uadeMode, subsong, preScannedMeta);
    }
  }

  // ── Mugician prefix (DMU.* / DMU2.* prefix) ──────────────────────────────
  // eagleplayer.conf: Mugician prefixes=dmu,mug  MugicianII prefixes=dmu2,mug2
  // (mug.* and mug2.* are already handled above; these cover the dmu.* variants)
  {
    const _dmuBase = (filename.split('/').pop() ?? filename).split('\\').pop()!.toLowerCase();
    if (_dmuBase.startsWith('dmu.')) {
      const uadeMode = prefs.uade ?? 'enhanced';
      if (prefs.mugician === 'native') {
        try {
          const { parseDigitalMugicianFile } = await import('@lib/import/formats/DigitalMugicianParser');
          return parseDigitalMugicianFile(buffer, file.name);
        } catch (err) {
          console.warn(`[DigitalMugicianParser] Native parse failed for ${filename}, falling back to UADE:`, err);
        }
      }
      const { parseUADEFile: parseUADE_dmu } = await import('@lib/import/formats/UADEParser');
      return parseUADE_dmu(buffer, file.name, uadeMode, subsong, preScannedMeta);
    }
  }

  // ── Mugician II prefix (DMU2.* prefix) ───────────────────────────────────
  {
    const _dmu2Base = (filename.split('/').pop() ?? filename).split('\\').pop()!.toLowerCase();
    if (_dmu2Base.startsWith('dmu2.')) {
      const uadeMode = prefs.uade ?? 'enhanced';
      if (prefs.mugician === 'native') {
        try {
          const { parseDigitalMugicianFile } = await import('@lib/import/formats/DigitalMugicianParser');
          return parseDigitalMugicianFile(buffer, file.name);
        } catch (err) {
          console.warn(`[DigitalMugicianParser] Native parse failed for ${filename}, falling back to UADE:`, err);
        }
      }
      const { parseUADEFile: parseUADE_dmu2 } = await import('@lib/import/formats/UADEParser');
      return parseUADE_dmu2(buffer, file.name, uadeMode, subsong, preScannedMeta);
    }
  }

  // ── Jochen Hippel ST (MDST.* prefix) ─────────────────────────────────────
  // Amiga compiled music format by Jochen Hippel (ST version, not 7V or CoSo).
  // Magic: scan first 256 bytes for Hippel-ST opcode signature.
  {
    const _mdstBase = (filename.split('/').pop() ?? filename).split('\\').pop()!.toLowerCase();
    if (_mdstBase.startsWith('mdst.')) {
      const uadeMode = prefs.uade ?? 'enhanced';
      if (prefs.jochenHippelST === 'native') {
        try {
          const { isJochenHippelSTFormat, parseJochenHippelSTFile } = await import('@lib/import/formats/JochenHippelSTParser');
          if (isJochenHippelSTFormat(buffer)) return parseJochenHippelSTFile(buffer, file.name);
        } catch (err) {
          console.warn(`[JochenHippelSTParser] Native parse failed for ${filename}, falling back to UADE:`, err);
        }
      }
      const { parseUADEFile: parseUADE_mdst } = await import('@lib/import/formats/UADEParser');
      return parseUADE_mdst(buffer, file.name, uadeMode, subsong, preScannedMeta);
    }
  }

  // ── Special FX ST (DODA.* prefix) ────────────────────────────────────────
  // Amiga compiled music format ("Special FX" by Special FX). Magic: "SWTD" tag.
  {
    const _dodaBase = (filename.split('/').pop() ?? filename).split('\\').pop()!.toLowerCase();
    if (_dodaBase.startsWith('doda.')) {
      const uadeMode = prefs.uade ?? 'enhanced';
      if (prefs.specialFX === 'native') {
        try {
          const { isSpecialFXFormat, parseSpecialFXFile } = await import('@lib/import/formats/SpecialFXParser');
          if (isSpecialFXFormat(buffer)) return parseSpecialFXFile(buffer, file.name);
        } catch (err) {
          console.warn(`[SpecialFXParser] Native parse failed for ${filename}, falling back to UADE:`, err);
        }
      }
      const { parseUADEFile: parseUADE_doda } = await import('@lib/import/formats/UADEParser');
      return parseUADE_doda(buffer, file.name, uadeMode, subsong, preScannedMeta);
    }
  }

  // ── SynthPack (OSP.* prefix) ─────────────────────────────────────────────
  // eagleplayer.conf: SynthPack  prefixes=osp
  // Magic: "OBISYNTHPACK" at byte offset 0.
  {
    const _ospBase = (filename.split('/').pop() ?? filename).split('\\').pop()!.toLowerCase();
    if (_ospBase.startsWith('osp.')) {
      if (prefs.synthPack === 'native') {
        try {
          const { isSynthPackFormat, parseSynthPackFile } = await import('@lib/import/formats/SynthPackParser');
          if (isSynthPackFormat(buffer, file.name)) return parseSynthPackFile(buffer, file.name);
        } catch (err) {
          console.warn(`[SynthPackParser] Native parse failed for ${filename}, falling back to UADE:`, err);
        }
      }
      const uadeMode = prefs.uade ?? 'enhanced';
      const { parseUADEFile: parseUADE_osp } = await import('@lib/import/formats/UADEParser');
      return parseUADE_osp(buffer, file.name, uadeMode, subsong, preScannedMeta);
    }
  }

  // ── Fred Gray (gray.* prefix) ────────────────────────────────────────────
  // eagleplayer.conf: FredGray  prefixes=gray
  // Magic: "FREDGRAY" at byte offset 0x24.
  {
    const _grayBase = (filename.split('/').pop() ?? filename).split('\\').pop()!.toLowerCase();
    if (_grayBase.startsWith('gray.')) {
      if (prefs.fredGray === 'native') {
        try {
          const { isFredGrayFormat, parseFredGrayFile } = await import('@lib/import/formats/FredGrayParser');
          if (isFredGrayFormat(buffer, file.name)) return parseFredGrayFile(buffer, file.name);
        } catch (err) {
          console.warn(`[FredGrayParser] Native parse failed for ${filename}, falling back to UADE:`, err);
        }
      }
      const uadeMode = prefs.uade ?? 'enhanced';
      const { parseUADEFile: parseUADE_gray } = await import('@lib/import/formats/UADEParser');
      return parseUADE_gray(buffer, file.name, uadeMode, subsong, preScannedMeta);
    }
  }

  // ── Jason Brooke (jcbo.* / jcb.* / jb.* prefix) ─────────────────────────
  // eagleplayer.conf: JasonBrooke  prefixes=jcbo,jcb,jb
  {
    const _jbBase = (filename.split('/').pop() ?? filename).split('\\').pop()!.toLowerCase();
    const _mightBeJB = _jbBase.startsWith('jcbo.') || _jbBase.startsWith('jcb.') || _jbBase.startsWith('jb.');
    if (_mightBeJB) {
      if (prefs.jasonBrooke === 'native') {
        try {
          const { isJasonBrookeFormat, parseJasonBrookeFile } = await import('@lib/import/formats/JasonBrookeParser');
          if (isJasonBrookeFormat(buffer, file.name)) return parseJasonBrookeFile(buffer, file.name);
        } catch (err) {
          console.warn(`[JasonBrookeParser] Native parse failed for ${filename}, falling back to UADE:`, err);
        }
      }
      const uadeMode = prefs.uade ?? 'enhanced';
      const { parseUADEFile: parseUADE_jb } = await import('@lib/import/formats/UADEParser');
      return parseUADE_jb(buffer, file.name, uadeMode, subsong, preScannedMeta);
    }
  }

  // ── Laxity (powt.* / pt.* prefix) ────────────────────────────────────────
  // eagleplayer.conf: Laxity  prefixes=powt,pt
  // pt.* is shared with ProTracker MOD; LaxityParser handles disambiguation.
  {
    const _laxBase = (filename.split('/').pop() ?? filename).split('\\').pop()!.toLowerCase();
    const _mightBeLaxity = _laxBase.startsWith('powt.') || _laxBase.startsWith('pt.');
    if (_mightBeLaxity) {
      if (prefs.laxity === 'native') {
        try {
          const { isLaxityFormat, parseLaxityFile } = await import('@lib/import/formats/LaxityParser');
          if (isLaxityFormat(buffer, file.name)) return parseLaxityFile(buffer, file.name);
        } catch (err) {
          console.warn(`[LaxityParser] Native parse failed for ${filename}, falling back to UADE:`, err);
        }
      }
      const uadeMode = prefs.uade ?? 'enhanced';
      const { parseUADEFile: parseUADE_laxity } = await import('@lib/import/formats/UADEParser');
      return parseUADE_laxity(buffer, file.name, uadeMode, subsong, preScannedMeta);
    }
  }

  // ── Music Maker 4V (mm4.* / sdata.* prefix) ──────────────────────────────
  // eagleplayer.conf: MusicMaker_4V  prefixes=mm4,sdata
  {
    const _mm4Base = (filename.split('/').pop() ?? filename).split('\\').pop()!.toLowerCase();
    const _mightBeMM4 = _mm4Base.startsWith('mm4.') || _mm4Base.startsWith('sdata.');
    if (_mightBeMM4) {
      if (prefs.musicMaker4V === 'native') {
        try {
          const { isMusicMaker4VFormat, parseMusicMaker4VFile } = await import('@lib/import/formats/MusicMakerParser');
          if (isMusicMaker4VFormat(buffer, file.name)) return parseMusicMaker4VFile(buffer, file.name);
        } catch (err) {
          console.warn(`[MusicMakerParser/4V] Native parse failed for ${filename}, falling back to UADE:`, err);
        }
      }
      const uadeMode = prefs.uade ?? 'enhanced';
      const { parseUADEFile: parseUADE_mm4 } = await import('@lib/import/formats/UADEParser');
      return parseUADE_mm4(buffer, file.name, uadeMode, subsong, preScannedMeta);
    }
  }

  // ── Music Maker 8V (mm8.* prefix) ────────────────────────────────────────
  // eagleplayer.conf: MusicMaker_8V  prefixes=mm8
  {
    const _mm8Base = (filename.split('/').pop() ?? filename).split('\\').pop()!.toLowerCase();
    if (_mm8Base.startsWith('mm8.')) {
      if (prefs.musicMaker8V === 'native') {
        try {
          const { isMusicMaker8VFormat, parseMusicMaker8VFile } = await import('@lib/import/formats/MusicMakerParser');
          if (isMusicMaker8VFormat(buffer, file.name)) return parseMusicMaker8VFile(buffer, file.name);
        } catch (err) {
          console.warn(`[MusicMakerParser/8V] Native parse failed for ${filename}, falling back to UADE:`, err);
        }
      }
      const uadeMode = prefs.uade ?? 'enhanced';
      const { parseUADEFile: parseUADE_mm8 } = await import('@lib/import/formats/UADEParser');
      return parseUADE_mm8(buffer, file.name, uadeMode, subsong, preScannedMeta);
    }
  }

  // ── Maniacs of Noise (mon.* prefix) ──────────────────────────────────────
  // eagleplayer.conf: ManiacsOfNoise  prefixes=mon
  // mon_old.* is handled above by the JeroenTel block.
  {
    const _monBase = (filename.split('/').pop() ?? filename).split('\\').pop()!.toLowerCase();
    if (_monBase.startsWith('mon.') && !_monBase.startsWith('mon_old.')) {
      if (prefs.maniacsOfNoise === 'native') {
        try {
          const { isManiacsOfNoiseFormat, parseManiacsOfNoiseFile } = await import('@lib/import/formats/ManiacsOfNoiseParser');
          if (isManiacsOfNoiseFormat(buffer, file.name)) return parseManiacsOfNoiseFile(buffer, file.name);
        } catch (err) {
          console.warn(`[ManiacsOfNoiseParser] Native parse failed for ${filename}, falling back to UADE:`, err);
        }
      }
      const uadeMode = prefs.uade ?? 'enhanced';
      const { parseUADEFile: parseUADE_mon } = await import('@lib/import/formats/UADEParser');
      return parseUADE_mon(buffer, file.name, uadeMode, subsong, preScannedMeta);
    }
  }

  // ── Remaining UADE prefix formats (no native parsers) ─────────────────────
  // All eagleplayer.conf prefix= entries not covered above route directly to UADE.
  // Covers: ManiacsOfNoise (mon.*), FredGray (gray.*), JochenHippel-base (hip.*,
  //   mcmd.*,sog.*), AHX/thx prefix (thx.*), TFMX variants (tfhd1.5.*, tfmxpro.*,
  //   tfmx1.5.*, tfmx7V.*, tfhd7V.*, tfhdpro.*), FutureComposer-BSI (bfc.*,bsi.*,
  //   fc-bsi.*), SeanConnolly (s-c.*,scn.*), SpecialFX_ST (doda.*), many more.
  // NOTE: files without matching routing reach UADE as a last-resort fallback anyway;
  //   this block provides explicit routing for performance and clarity.
  {
    const _uadeBase = (filename.split('/').pop() ?? filename).split('\\').pop()!.toLowerCase();
    // Prefixes that require explicit string matching (hyphens/dots need startsWith not extension-check)
    const UADE_ONLY_PREFIXES = [
      // ArtAndMagic, AMOS, Sierra-AGI
      'aam.', 'abk.', 'agi.',
      // ActionAmics (prefix form), BeathovenSynthesizer
      'ast.', 'bss.',
      // FutureComposer-BSI, custom
      'bfc.', 'bsi.', 'fc-bsi.', 'cus.', 'cust.', 'custom.',
      // DavidHanney, DynamicSynthesizer, DariusZendeh
      'dh.', 'dns.', 'dz.', 'mkiio.',
      // EarAche, EMS
      'ea.', 'mg.', 'ems.', 'emsv6.',
      // ForgottenWorlds, GlueMon
      'fw.', 'glue.', 'gm.',
      // HowieDavies, MajorTom variants
      'hd.', 'hn.', 'thn.', 'mtp2.', 'arp.',
      // JochenHippel base (hip.*, mcmd.*, sog.*) — different from CoSo and 7V
      'hip.', 'mcmd.', 'sog.',
      // MikeDavies, MarkII, MusiclineEditor
      'md.', 'mk2.', 'mkii.', 'ml.',
      // Silmarils, Medley
      'mok.', 'mso.',
      // Pokeynoise
      'pn.',
      // RiffRaff, SeanConnolly
      'riff.', 's-c.', 'scn.',
      // SonicArranger variants, SpeedyA1System
      'sa-p.', 'lion.', 'sa_old.', 'sas.',
      // SCUMM, SynthDream
      'scumm.', 'sdr.',
      // SoundProgrammingLanguage, SoundImages
      'spl.', 'tw.',
      // SUN-Tronic, SynTracker
      'sun.', 'synmod.', 'st.',
      // TimFollin
      'tf.',
      // AHX thx prefix (AbyssHighestExperience — thx.* prefix form of AHX)
      'thx.',
      // TFMX variant prefixes (all handled by UADE)
      'tfhd1.5.', 'tfhd7v.', 'tfhdpro.', 'tfmx1.5.', 'tfmx7v.', 'tfmxpro.',
      // VoodooSupremeSynthesizer
      'vss.',
    ] as const;
    if (UADE_ONLY_PREFIXES.some(p => _uadeBase.startsWith(p))) {
      const uadeMode = prefs.uade ?? 'enhanced';
      const { parseUADEFile: parseUADE_bulk } = await import('@lib/import/formats/UADEParser');
      return parseUADE_bulk(buffer, file.name, uadeMode, subsong, preScannedMeta);
    }
  }

  // ── UADE catch-all: 130+ exotic Amiga formats ───────────────────────────
  // Check extension list first, then fall back to UADE for unknown formats
  // (UADE also detects many formats by magic bytes, not just extension)
  const { isUADEFormat, parseUADEFile } = await import('@lib/import/formats/UADEParser');
  if (isUADEFormat(filename)) {
    const uadeMode = prefs.uade ?? 'enhanced';
    return await parseUADEFile(buffer, file.name, uadeMode, subsong, preScannedMeta);
  }

  // ── S3M (ScreamTracker 3) ─────────────────────────────────────────────────
  if (/\.s3m$/i.test(filename)) {
    try {
      const { isS3MFormat, parseS3MFile } = await import('@lib/import/formats/S3MParser');
      if (isS3MFormat(buffer)) return parseS3MFile(buffer, file.name);
    } catch (err) {
      console.warn(`[S3MParser] Native parse failed for ${filename}, falling back to libopenmpt:`, err);
    }
    // Fall through to libopenmpt
  }

  // ── IT / MPTM (Impulse Tracker / OpenMPT) ─────────────────────────────────
  if (/\.(it|mptm)$/i.test(filename)) {
    try {
      const { isITFormat, parseITFile } = await import('@lib/import/formats/ITParser');
      if (isITFormat(buffer)) return parseITFile(buffer, file.name);
    } catch (err) {
      console.warn(`[ITParser] Native parse failed for ${filename}, falling back to libopenmpt:`, err);
    }
    // Fall through to libopenmpt
  }

  // ── MOD, XM, IT, S3M, and other tracker formats ────────────────────────
  // MOD files can be routed to UADE for authentic Amiga playback
  if (filename.endsWith('.mod') && prefs.mod === 'uade') {
    return await parseUADEFile(buffer, file.name, prefs.uade ?? 'enhanced', subsong, preScannedMeta);
  }

  try {
    return await parseTrackerModule(buffer, file.name);
  } catch {
    // If libopenmpt fails, try UADE as last resort (magic byte detection)
    return await parseUADEFile(buffer, file.name, prefs.uade ?? 'enhanced', subsong, preScannedMeta);
  }
}

// ─── MIDI ────────────────────────────────────────────────────────────────────

async function parseMIDIFile(file: File, options?: ParseOptions['midiOptions']): Promise<TrackerSong> {
  const { importMIDIFile } = await import('@lib/import/MIDIImporter');
  const result = await importMIDIFile(file, {
    quantize: options?.quantize ?? 1,
    mergeChannels: options?.mergeChannels ?? false,
    velocityToVolume: options?.velocityToVolume ?? true,
    defaultPatternLength: options?.defaultPatternLength ?? 64,
  });

  const order = result.patterns.map((_, i) => i);
  return {
    name: result.metadata.name,
    format: 'XM' as TrackerFormat,
    patterns: result.patterns,
    instruments: result.instruments,
    songPositions: order,
    songLength: order.length,
    restartPosition: 0,
    numChannels: result.patterns[0]?.channels?.length || 1,
    initialSpeed: 6,
    initialBPM: result.bpm,
  };
}

// ─── Furnace / DefleMask ──────────────────────────────────────────────────────

async function parseFurnaceFile(buffer: ArrayBuffer, _fileName: string, subsong = 0): Promise<TrackerSong> {
  const { parseFurnaceSong, convertFurnaceToDevilbox, convertSubsongForPlayback } = await import('@lib/import/formats/FurnaceSongParser');
  const { convertToInstrument } = await import('@lib/import/InstrumentConverter');

  const module = await parseFurnaceSong(buffer);
  const result = convertFurnaceToDevilbox(module, subsong);

  const instruments = result.instruments
    .map((inst, idx) => convertToInstrument(inst, idx + 1, 'FUR'))
    .flat()
    .map((inst, i) => ({ ...inst, id: i + 1 })) as InstrumentConfig[];

  const patternOrder = result.metadata.modData?.patternOrderTable || [];
  const patterns = result.patterns;
  const patLen = patterns[0]?.length || 64;
  const numChannels = patterns[0]?.[0]?.length || 4;

  interface FurnaceCell {
    note?: number; instrument?: number; volume?: number;
    effectType?: number;  effectParam?: number;
    effectType2?: number; effectParam2?: number;
    effectType3?: number; effectParam3?: number;
    effectType4?: number; effectParam4?: number;
    effectType5?: number; effectParam5?: number;
    effectType6?: number; effectParam6?: number;
    effectType7?: number; effectParam7?: number;
    effectType8?: number; effectParam8?: number;
  }
  const convertedPatterns: Pattern[] = patterns.map((pat: FurnaceCell[][], idx: number) => ({
    id: `pattern-${idx}`,
    name: `Pattern ${idx}`,
    length: patLen,
    channels: Array.from({ length: numChannels }, (_, ch) => ({
      id: `channel-${ch}`,
      name: `Channel ${ch + 1}`,
      muted: false,
      solo: false,
      collapsed: false,
      volume: 100,
      pan: 0,
      instrumentId: null,
      color: null,
      rows: pat.map((row: FurnaceCell[]) => {
        const cell = row[ch] || {};
        const trackerCell: import('@/types/tracker').TrackerCell = {
          note: cell.note || 0,
          instrument: cell.instrument || 0,
          volume: cell.volume || 0,
          effTyp: cell.effectType || 0,
          eff: cell.effectParam || 0,
          effTyp2: cell.effectType2 || 0,
          eff2: cell.effectParam2 || 0,
        };
        if (cell.effectType3 || cell.effectParam3) { trackerCell.effTyp3 = cell.effectType3 || 0; trackerCell.eff3 = cell.effectParam3 || 0; }
        if (cell.effectType4 || cell.effectParam4) { trackerCell.effTyp4 = cell.effectType4 || 0; trackerCell.eff4 = cell.effectParam4 || 0; }
        if (cell.effectType5 || cell.effectParam5) { trackerCell.effTyp5 = cell.effectType5 || 0; trackerCell.eff5 = cell.effectParam5 || 0; }
        if (cell.effectType6 || cell.effectParam6) { trackerCell.effTyp6 = cell.effectType6 || 0; trackerCell.eff6 = cell.effectParam6 || 0; }
        if (cell.effectType7 || cell.effectParam7) { trackerCell.effTyp7 = cell.effectType7 || 0; trackerCell.eff7 = cell.effectParam7 || 0; }
        if (cell.effectType8 || cell.effectParam8) { trackerCell.effTyp8 = cell.effectType8 || 0; trackerCell.eff8 = cell.effectParam8 || 0; }
        return trackerCell;
      }),
    })),
  }));

  // Store module-level wavetables/samples on the dispatch engine singleton.
  // This data is used by FurnaceDispatchSynth.setupDefaultInstrument() to upload
  // real wavetable/sample data instead of test data when chips are created.
  // Must be awaited so the data is available before synths initialize.
  if (result.wavetables.length > 0 || result.samples.length > 0) {
    const { FurnaceDispatchEngine } = await import('@engine/furnace-dispatch/FurnaceDispatchEngine');
    const engine = FurnaceDispatchEngine.getInstance();
    engine.setModuleWavetables(result.wavetables.length > 0 ? result.wavetables : null);
    engine.setModuleSamples(result.samples.length > 0 ? result.samples : null);
  }

  // Pre-convert ALL subsongs using the full conversion pipeline so the in-editor
  // subsong selector can switch between them without re-parsing.
  // Instruments/wavetables/samples are module-level (shared) — taken from the primary result.
  // Each subsong gets its own full convertFurnaceToDevilbox() call for correct pattern
  // conversion (chip context, effect mapping, octave handling, groove resolution).
  type SubCell = { note?: number; instrument?: number; volume?: number;
    effectType?: number; effectParam?: number; effectType2?: number; effectParam2?: number;
    effectType3?: number; effectParam3?: number; effectType4?: number; effectParam4?: number;
    effectType5?: number; effectParam5?: number; effectType6?: number; effectParam6?: number;
    effectType7?: number; effectParam7?: number; effectType8?: number; effectParam8?: number; };
  function cellsToPatterns(rawPats: SubCell[][][], rowLen: number, numCh: number, prefix: string): Pattern[] {
    return rawPats.map((pat, idx) => ({
      id: `${prefix}-${idx}`,
      name: `Pattern ${idx}`,
      length: rowLen,
      channels: Array.from({ length: numCh }, (_, ch) => ({
        id: `channel-${ch}`,
        name: `Channel ${ch + 1}`,
        muted: false, solo: false, collapsed: false, volume: 100, pan: 0,
        instrumentId: null, color: null,
        rows: pat.map((row: SubCell[]) => {
          const cell = row[ch] || {};
          const tc: import('@/types/tracker').TrackerCell = {
            note: cell.note || 0, instrument: cell.instrument || 0,
            volume: cell.volume || 0, effTyp: cell.effectType || 0,
            eff: cell.effectParam || 0, effTyp2: cell.effectType2 || 0,
            eff2: cell.effectParam2 || 0,
          };
          if (cell.effectType3 || cell.effectParam3) { tc.effTyp3 = cell.effectType3 || 0; tc.eff3 = cell.effectParam3 || 0; }
          if (cell.effectType4 || cell.effectParam4) { tc.effTyp4 = cell.effectType4 || 0; tc.eff4 = cell.effectParam4 || 0; }
          if (cell.effectType5 || cell.effectParam5) { tc.effTyp5 = cell.effectType5 || 0; tc.eff5 = cell.effectParam5 || 0; }
          if (cell.effectType6 || cell.effectParam6) { tc.effTyp6 = cell.effectType6 || 0; tc.eff6 = cell.effectParam6 || 0; }
          if (cell.effectType7 || cell.effectParam7) { tc.effTyp7 = cell.effectType7 || 0; tc.eff7 = cell.effectParam7 || 0; }
          if (cell.effectType8 || cell.effectParam8) { tc.effTyp8 = cell.effectType8 || 0; tc.eff8 = cell.effectParam8 || 0; }
          return tc;
        }),
      })),
    }));
  }

  type FurnaceSubsongPlaybackLocal = import('@/types').FurnaceSubsongPlayback;
  const furnaceSubsongs: FurnaceSubsongPlaybackLocal[] = module.subsongs.map((_, i) => {
    // Instruments are module-level and shared across all subsongs — never re-convert them.
    // For the active subsong reuse the already-converted result; for others extract only
    // patterns + timing via convertSubsongForPlayback().
    const subResult = i === subsong ? result : convertSubsongForPlayback(module, i);
    const subMeta = subResult.metadata;
    const subPatterns = subResult.patterns as unknown as SubCell[][][];
    const subPatLen = module.subsongs[i]?.patLen || patLen;
    return {
      name: module.subsongs[i]?.name || `Subsong ${i + 1}`,
      patterns: cellsToPatterns(subPatterns, subPatLen, numChannels, `sub${i}`),
      songPositions: subMeta.modData?.patternOrderTable ?? Array.from({ length: subPatterns.length }, (_, j) => j),
      initialSpeed: subMeta.modData?.initialSpeed ?? 6,
      initialBPM: subMeta.modData?.initialBPM ?? 125,
      speed2: subMeta.furnaceData?.speed2 || undefined,
      hz: subMeta.furnaceData?.hz || undefined,
      virtualTempoN: subMeta.furnaceData?.virtualTempoN || undefined,
      virtualTempoD: subMeta.furnaceData?.virtualTempoD || undefined,
      grooves: subMeta.furnaceData?.grooves,
    };
  });

  const furnaceData = result.metadata.furnaceData;
  return {
    name: result.metadata.sourceFile.replace(/\.[^/.]+$/, ''),
    format: 'XM' as TrackerFormat,
    patterns: convertedPatterns,
    instruments,
    songPositions: patternOrder.length > 0 ? patternOrder : convertedPatterns.map((_, i) => i),
    songLength: patternOrder.length || convertedPatterns.length,
    restartPosition: 0,
    numChannels,
    initialSpeed: result.metadata.modData?.initialSpeed ?? 6,
    initialBPM: result.metadata.modData?.initialBPM ?? 125,
    speed2: furnaceData?.speed2,
    hz: furnaceData?.hz,
    virtualTempoN: furnaceData?.virtualTempoN,
    virtualTempoD: furnaceData?.virtualTempoD,
    compatFlags: furnaceData?.compatFlags as Record<string, unknown> | undefined,
    grooves: furnaceData?.grooves,
    furnaceWavetables: result.wavetables.length > 0 ? result.wavetables : undefined,
    furnaceSamples: result.samples.length > 0 ? result.samples : undefined,
    furnaceNative: result.furnaceNative,
    furnaceSubsongs: module.subsongs.length > 1 ? furnaceSubsongs : undefined,
    furnaceActiveSubsong: subsong,
  };
}

// ─── MOD / XM / IT / S3M / etc. ──────────────────────────────────────────────

async function parseTrackerModule(buffer: ArrayBuffer, fileName: string): Promise<TrackerSong> {
  // Clear any Furnace module data from previous imports
  import('@engine/furnace-dispatch/FurnaceDispatchEngine').then(({ FurnaceDispatchEngine }) => {
    const engine = FurnaceDispatchEngine.getInstance();
    engine.setModuleWavetables(null);
    engine.setModuleSamples(null);
  }).catch(() => { /* dispatch engine not available — OK for non-Furnace files */ });

  const { loadModuleFile } = await import('@lib/import/ModuleLoader');
  const { convertModule, convertXMModule, convertMODModule } = await import('@lib/import/ModuleConverter');
  const { convertToInstrument } = await import('@lib/import/InstrumentConverter');

  const moduleInfo = await loadModuleFile(new File([buffer], fileName));
  if (!moduleInfo) throw new Error(`Failed to load ${fileName}`);

  let result;
  let instruments: InstrumentConfig[] = [];

  if (moduleInfo.nativeData?.patterns) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { format, patterns: nativePatterns, importMetadata, instruments: nativeInstruments } = moduleInfo.nativeData;
    const channelCount = importMetadata.originalChannelCount;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const instrumentNames = nativeInstruments?.map((i: any) => i.name) || [];

    if (format === 'XM') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      result = convertXMModule(nativePatterns as any, channelCount, importMetadata, instrumentNames, moduleInfo.arrayBuffer);
    } else if (format === 'MOD') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      result = convertMODModule(nativePatterns as any, channelCount, importMetadata, instrumentNames, moduleInfo.arrayBuffer);
    } else if (moduleInfo.metadata.song) {
      result = convertModule(moduleInfo.metadata.song);
    }

    if (nativeInstruments) {
      for (let i = 0; i < nativeInstruments.length; i++) {
        // Use the parsed instrument's original slot ID (not array index) so pattern
        // data references match correctly. The MOD/XM parsers skip empty slots, so
        // nativeInstruments[i] may not correspond to slot i+1.
        const slotId = nativeInstruments[i].id;
        const converted = convertToInstrument(nativeInstruments[i], slotId, format);
        instruments.push(...converted);
      }
    }
  } else if (moduleInfo.metadata.song) {
    result = convertModule(moduleInfo.metadata.song);
  }

  if (!result) throw new Error(`Failed to convert ${fileName}`);

  // Create basic synth instruments if none from native parser
  if (instruments.length === 0) {
    instruments = createFallbackInstruments(result.patterns, result.instrumentNames || []);
  }

  const modData = result.metadata?.modData;
  const order = result.order?.length ? result.order : result.patterns.map((_, i) => i);
  const format: TrackerFormat = (result.metadata?.sourceFormat as TrackerFormat) || 'XM';

  // Extract XM linear/amiga frequency mode from pattern metadata
  // XM flag bit 0: 1 = linear periods (most XMs), 0 = amiga periods
  const xmFreqType = result.patterns[0]?.importMetadata?.xmData?.frequencyType;
  const linearPeriods = format === 'XM' ? (xmFreqType === 'linear' || xmFreqType === undefined) : false;

  return {
    name: moduleInfo.metadata.title || fileName.replace(/\.[^/.]+$/, ''),
    format,
    patterns: result.patterns,
    instruments,
    songPositions: order,
    songLength: modData?.songLength ?? order.length,
    restartPosition: 0,
    numChannels: result.channelCount || result.patterns[0]?.channels?.length || 4,
    initialSpeed: modData?.initialSpeed ?? 6,
    initialBPM: modData?.initialBPM ?? 125,
    linearPeriods,
  };
}

// ─── Fallback instrument creation ─────────────────────────────────────────────

function createFallbackInstruments(patterns: Pattern[], instrumentNames: string[]): InstrumentConfig[] {
  const usedInstruments = new Set<number>();
  for (const pattern of patterns) {
    for (const channel of pattern.channels) {
      for (const cell of channel.rows) {
        if (cell.instrument !== null && cell.instrument > 0) {
          usedInstruments.add(cell.instrument);
        }
      }
    }
  }

  const oscTypes: Array<'sine' | 'square' | 'sawtooth' | 'triangle'> = ['sawtooth', 'square', 'triangle', 'sine'];
  const instruments: InstrumentConfig[] = [];

  for (const instNum of Array.from(usedInstruments).sort((a, b) => a - b)) {
    instruments.push({
      id: instNum,
      name: instrumentNames[instNum - 1] || `Instrument ${instNum}`,
      type: 'synth',
      synthType: 'Synth',
      effects: [],
      volume: -6,
      pan: 0,
      oscillator: { type: oscTypes[(instNum - 1) % oscTypes.length], detune: 0, octave: 0 },
    } as InstrumentConfig);
  }

  return instruments;
}
