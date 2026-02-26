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

  // ── TCB Tracker ───────────────────────────────────────────────────────────
  if (/\.tcb$/.test(filename)) {
    try {
      const { isTCBTrackerFormat, parseTCBTrackerFile } = await import('@lib/import/formats/TCBTrackerParser');
      if (isTCBTrackerFormat(buffer)) {
        return parseTCBTrackerFile(buffer, file.name);
      }
    } catch (err) {
      console.warn(`[TCBTrackerParser] Native parse failed for ${filename}, falling back to UADE:`, err);
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
  if (/\.(rh|rhp)$/.test(filename)) {
    const uadeMode = prefs.uade ?? 'enhanced';
    if (prefs.robHubbard !== 'uade') {
      try {
        const { parseRobHubbardFile } = await import('@lib/import/formats/RobHubbardParser');
        return parseRobHubbardFile(buffer, file.name);
      } catch (err) {
        console.warn(`[RobHubbardParser] Native parse failed for ${filename}, falling back to UADE:`, err);
      }
    }
    const { parseUADEFile } = await import('@lib/import/formats/UADEParser');
    return parseUADEFile(buffer, file.name, uadeMode, subsong, preScannedMeta);
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
          const result = parseSymphonieProFile(bytes, file.name);
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
    try {
      const { isPumaTrackerFormat, parsePumaTrackerFile } = await import('@lib/import/formats/PumaTrackerParser');
      if (isPumaTrackerFormat(buffer)) {
        return parsePumaTrackerFile(buffer, file.name);
      }
    } catch (err) {
      console.warn(`[PumaTrackerParser] Native parse failed for ${filename}, falling back to UADE:`, err);
    }
    const { parseUADEFile } = await import('@lib/import/formats/UADEParser');
    const uadeMode = prefs.uade ?? 'enhanced';
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
  // .667 files — identified by 'gf' magic (0x67, 0x66) at offset 0.
  if (/\.667$/.test(filename)) {
    const uadeMode = prefs.uade ?? 'enhanced';
    if (prefs.composer667 === 'native') {
      try {
        const { isComposer667Format, parseComposer667File } = await import('@lib/import/formats/Composer667Parser');
        const bytes = new Uint8Array(buffer);
        if (isComposer667Format(bytes)) {
          const result = parseComposer667File(bytes, file.name);
          if (result) return result;
        }
      } catch (err) {
        console.warn(`[Composer667Parser] Native parse failed for ${filename}, falling back to UADE:`, err);
      }
    }
    const { parseUADEFile } = await import('@lib/import/formats/UADEParser');
    return parseUADEFile(buffer, file.name, uadeMode, subsong, preScannedMeta);
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

  // ── Ben Daglish ───────────────────────────────────────────────────────────
  // .bd files — identified by M68k assembler signatures (no magic bytes).
  if (/\.bd$/.test(filename)) {
    const uadeMode = prefs.uade ?? 'enhanced';
    if (prefs.benDaglish === 'native') {
      try {
        const { isBenDaglishFormat, parseBenDaglishFile } = await import('@lib/import/formats/BenDaglishParser');
        const bytes = new Uint8Array(buffer);
        if (isBenDaglishFormat(bytes)) {
          const result = parseBenDaglishFile(bytes, file.name);
          if (result) return result;
        }
      } catch (err) {
        console.warn(`[BenDaglishParser] Native parse failed for ${filename}, falling back to UADE:`, err);
      }
    }
    const { parseUADEFile } = await import('@lib/import/formats/UADEParser');
    return parseUADEFile(buffer, file.name, uadeMode, subsong, preScannedMeta);
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
  if (/\.st$/.test(filename)) {
    const uadeMode = prefs.uade ?? 'enhanced';
    if (prefs.sawteeth === 'native') {
      try {
        const { isSawteethFormat, parseSawteethFile } = await import('@lib/import/formats/SawteethParser');
        const bytes = new Uint8Array(buffer);
        if (isSawteethFormat(bytes)) {
          const result = parseSawteethFile(bytes, file.name);
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
  // Two-file format: song (.mus) + samples (SMP.set); UADE handles audio.
  if (/\.(ufo|mus)$/i.test(filename)) {
    const uadeMode = prefs.uade ?? 'enhanced';
    if (prefs.ufo === 'native') {
      try {
        const { isUFOFormat, parseUFOFile } = await import('@lib/import/formats/UFOParser');
        if (isUFOFormat(new Uint8Array(buffer))) {
          const result = await parseUFOFile(buffer, file.name);
          if (result) return result;
        }
      } catch (err) {
        console.warn(`[UFOParser] Native parse failed for ${filename}, falling back to UADE:`, err);
      }
    }
    const { parseUADEFile: parseUADE_ufo } = await import('@lib/import/formats/UADEParser');
    return parseUADE_ufo(buffer, file.name, uadeMode, subsong, preScannedMeta);
  }

  // ── FM Tracker (.fmt) ─────────────────────────────────────────────────────
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
        console.warn(`[FMTrackerParser] Native parse failed for ${filename}, falling back to OpenMPT:`, err);
      }
    }
    // Fall through to libopenmpt
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
        console.warn(`[MadTracker2Parser] Native parse failed for ${filename}, falling back to OpenMPT:`, err);
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
        console.warn(`[PSMParser] Native parse failed for ${filename}, falling back to OpenMPT:`, err);
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
  if (/\.(smus|snx|tiny)$/i.test(filename)) {
    const uadeMode = prefs.uade ?? 'enhanced';
    if (prefs.iffSmus === 'native') {
      try {
        const { isIffSmusFormat, parseIffSmusFile } = await import('@lib/import/formats/IffSmusParser');
        if (isIffSmusFormat(buffer)) {
          const result = await parseIffSmusFile(buffer, file.name);
          if (result) return result;
        }
      } catch (err) {
        console.warn(`[IffSmusParser] Native parse failed for ${filename}, falling back to UADE:`, err);
      }
    }
    const { parseUADEFile: parseUADE_smus } = await import('@lib/import/formats/UADEParser');
    return parseUADE_smus(buffer, file.name, uadeMode, subsong, preScannedMeta);
  }

  // ── Magnetic Fields Packer (.mfp / mfp.*) ────────────────────────────────
  // Amiga 4-channel format (Shaun Southern). Files use either 'mfp.songname'
  // prefix naming or conventional 'songname.mfp' extension naming.
  if (/\.mfp$/i.test(filename) || /^mfp\./i.test((filename.split('/').pop() ?? filename).split('\\').pop() ?? filename)) {
    const uadeMode = prefs.uade ?? 'enhanced';
    if (prefs.mfp === 'native') {
      try {
        const { isMFPFormat, parseMFPFile } = await import('@lib/import/formats/MFPParser');
        if (isMFPFormat(buffer, file.name)) {
          const result = await parseMFPFile(buffer, file.name);
          if (result) return result;
        }
      } catch (err) {
        console.warn(`[MFPParser] Native parse failed for ${filename}, falling back to UADE:`, err);
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
  // .rjp and .sng are already in the UADE extension list; this block intercepts
  // them early to optionally extract richer metadata before delegating to UADE.
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
          if (isRJPFormat(new Uint8Array(buffer))) {
            const result = await parseRJPFile(buffer, file.name);
            if (result) return result;
          }
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
  // always delegates to UADE (which bundles samples in module archives).
  if (/\.ss$/i.test(filename)) {
    const { parseUADEFile: parseUADE_ss } = await import('@lib/import/formats/UADEParser');
    return parseUADE_ss(buffer, file.name, prefs.uade ?? 'enhanced', subsong, preScannedMeta);
  }

  // ── Tronic (.trc/.dp/.tro/.tronic) ───────────────────────────────────────
  // Amiga tracker by Stefan Hartmann. No native parser; always delegates to UADE.
  if (/\.(trc|dp|tro|tronic)$/i.test(filename)) {
    const { parseUADEFile: parseUADE_trc } = await import('@lib/import/formats/UADEParser');
    return parseUADE_trc(buffer, file.name, prefs.uade ?? 'enhanced', subsong, preScannedMeta);
  }

  // ── Dave Lowe (.dl / DL.* prefix) ─────────────────────────────────────────
  // Compiled 68k Amiga music format. Magic: three specific opcodes at offsets 0,4,8.
  {
    const _dlBase = (filename.split('/').pop() ?? filename).toLowerCase();
    const _mightBeDL = /\.dl$/i.test(filename) || /\.dl_deli$/i.test(filename) || _dlBase.startsWith('dl.');
    if (_mightBeDL) {
      const uadeMode = prefs.uade ?? 'enhanced';
      if (prefs.daveLowe === 'native') {
        try {
          const { isDaveLoweFormat, parseDaveLoweFile } = await import('@lib/import/formats/DaveLoweParser');
          if (isDaveLoweFormat(new Uint8Array(buffer))) {
            const result = await parseDaveLoweFile(buffer, file.name);
            if (result) return result;
          }
        } catch (err) {
          console.warn(`[DaveLoweParser] Native parse failed for ${filename}, falling back to UADE:`, err);
        }
      }
      const { parseUADEFile: parseUADE_dl } = await import('@lib/import/formats/UADEParser');
      return parseUADE_dl(buffer, file.name, uadeMode, subsong, preScannedMeta);
    }
  }

  // ── Leggless Music Editor (.lme / LME.*) ────────────────────────────────────
  // Amiga 4-channel format (Leggless Music Editor). Magic: "LME" bytes + zero at offset 36.
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

  // ── Mark Cooksey / Don Adan (mc.* / mcr.* / mco.* prefix) ─────────────────
  // Compiled 68k Amiga music format. Three sub-variants: Old (D040D040 magic),
  // New/Medium (601A + 48E780F0), and Rare (4DFA + DFF000 hardware register).
  {
    const _mcBase = (filename.split('/').pop() ?? filename).split('\\').pop()!.toLowerCase();
    const _mightBeMC = _mcBase.startsWith('mc.') || _mcBase.startsWith('mcr.') || _mcBase.startsWith('mco.');
    if (_mightBeMC) {
      const uadeMode = prefs.uade ?? 'enhanced';
      if (prefs.markCooksey === 'native') {
        try {
          const { isMarkCookseyFormat, parseMarkCookseyFile } = await import('@lib/import/formats/MarkCookseyParser');
          if (isMarkCookseyFormat(buffer, filename)) {
            const result = await parseMarkCookseyFile(buffer, file.name);
            if (result) return result;
          }
        } catch (err) {
          console.warn(`[MarkCookseyParser] Native parse failed for ${filename}, falling back to UADE:`, err);
        }
      }
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
      const uadeMode = prefs.uade ?? 'enhanced';
      if (prefs.jeroenTel === 'native') {
        try {
          const { isJeroenTelFormat, parseJeroenTelFile } = await import('@lib/import/formats/JeroenTelParser');
          if (isJeroenTelFormat(buffer, filename)) {
            const result = await parseJeroenTelFile(buffer, file.name);
            if (result) return result;
          }
        } catch (err) {
          console.warn(`[JeroenTelParser] Native parse failed for ${filename}, falling back to UADE:`, err);
        }
      }
      const { parseUADEFile: parseUADE_jt } = await import('@lib/import/formats/UADEParser');
      return parseUADE_jt(buffer, file.name, uadeMode, subsong, preScannedMeta);
    }
  }

  // ── Quartet / Quartet PSG / Quartet ST (qpa.* / sqt.* / qts.* prefix) ──────
  // Amiga/ST 4-channel format family. QPA uses tempo+0x50 detection;
  // SQT uses four BRA.W instructions + LEA pattern; QTS uses speed word + 0x0056.
  {
    const _qBase = (filename.split('/').pop() ?? filename).split('\\').pop()!.toLowerCase();
    const _mightBeQuartet = _qBase.startsWith('qpa.') || _qBase.startsWith('sqt.') || _qBase.startsWith('qts.');
    if (_mightBeQuartet) {
      const uadeMode = prefs.uade ?? 'enhanced';
      if (prefs.quartet === 'native') {
        try {
          const { isQuartetFormat, parseQuartetFile } = await import('@lib/import/formats/QuartetParser');
          if (isQuartetFormat(buffer, filename)) {
            const result = await parseQuartetFile(buffer, file.name);
            if (result) return result;
          }
        } catch (err) {
          console.warn(`[QuartetParser] Native parse failed for ${filename}, falling back to UADE:`, err);
        }
      }
      const { parseUADEFile: parseUADE_quartet } = await import('@lib/import/formats/UADEParser');
      return parseUADE_quartet(buffer, file.name, uadeMode, subsong, preScannedMeta);
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
