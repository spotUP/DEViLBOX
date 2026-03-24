/**
 * UADEPrefixParsers — UADE-only prefix-based format routing + catch-all
 *
 * Handles ~60 Amiga formats identified by filename prefix (e.g., "bd.", "hot.", "cust.")
 * that have no native parser — they go directly to UADE.
 * Also includes the UADE catch-all for formats detected by magic bytes.
 */

import type { TrackerSong } from '@/engine/TrackerReplayer';
import type { FormatEnginePreferences } from '@/stores/useSettingsStore';
import type { UADEMetadata } from '@/engine/uade/UADEEngine';
import { getBasename } from './withFallback';

/**
 * UADE-only prefix formats with no native parser.
 * All eagleplayer.conf prefix= entries not covered by native parsers.
 */
const UADE_ONLY_PREFIXES = [
  // ArtAndMagic, AMOS, Sierra-AGI
  'aam.', 'abk.', 'agi.',
  // AshleyHogg
  'ah.',
  // ActionAmics (prefix form), BeathovenSynthesizer
  'ast.', 'bss.', 'bvs.',
  // ChipTracker (Chuck Biscuits Archive)
  'chip.', 'cba.',
  // CoreDesign
  'cd.',
  // FutureComposer-BSI, custom
  'bfc.', 'bsi.', 'fc-bsi.', 'cus.', 'cust.', 'custom.',
  // DaveLowe WTD variant
  'dlw.',
  // DynamicSynthesizer, DariusZendeh (DavidHanney handled by DavidHanneyParser)
  'dns.', 'dz.', 'mkiio.',
  // EarAche, EMS (mg.* was GlueMon alias — handled by GlueMonParser; ea.* = EarAche still UADE)
  'ea.', 'ems.', 'emsv6.',
  // ForgottenWorlds (GlueMon handled by GlueMonParser)
  'fw.',
  // FredEditor/Monitor (fredmon prefix)
  'fredmon.',
  // FuturePlayer2 (fp2 prefix, also pat. follin)
  'fp2.',
  // HowieDavies, MajorTom variants
  'hd.', 'hn.', 'thn.', 'mtp2.', 'arp.',
  // JochenHippel base (hip.*, mcmd.*, sog.*) — different from CoSo and 7V
  'hip.', 'mcmd.', 'sog.',
  // MarkII, MusiclineEditor (MikeDavies handled by AmigaFormatParsers with classic mode)
  'mk2.', 'mkii.', 'ml.',
  // MaxTrax
  'mxt.',
  // Silmarils
  'mok.', 'sil.',
  // NoiseTracker/ProTracker variant
  'nt.',
  // NTSP
  'ntsp.',
  // PaulSummers
  'psum.',
  // Pokeynoise
  'pn.',
  // RiffRaff, SeanConnolly (sc2 = SeanConnolly2)
  'riff.', 's-c.', 'scn.', 'sc2.',
  // RobHubbardST
  'rhst.', 'rho.',
  // RonKlaren
  'rkl.',
  // SonicArranger variants, SpeedyA1System
  'sa-p.', 'lion.', 'sa_old.', 'sas.',
  // SCUMM, SynthDream
  'scumm.', 'sdr.',
  // SoundProgrammingLanguage, SoundImages
  'spl.', 'tw.',
  // SUN-Tronic, SynTracker, StoneTracker
  'sun.', 'synmod.', 'st.',
  // TimFollin
  'tf.',
  // AHX thx prefix (AbyssHighestExperience — thx.* prefix form of AHX)
  'thx.',
  // TFMX variant prefixes (all handled by UADE)
  'tfhd1.5.', 'tfhd7v.', 'tfhdpro.', 'tfmx1.5.', 'tfmx7v.', 'tfmxpro.',
  // TomyTracker
  'tomy.',
  // VoodooSupremeSynthesizer
  'vss.',
] as const;

/**
 * Try to route a file to UADE via prefix matching or catch-all detection.
 * Returns TrackerSong or null if not matched.
 */
export async function tryUADEPrefixParse(
  buffer: ArrayBuffer,
  filename: string,
  originalFileName: string,
  prefs: FormatEnginePreferences,
  subsong: number,
  preScannedMeta?: UADEMetadata,
): Promise<TrackerSong | null> {
  const base = getBasename(filename);

  // ── UADE-only prefix formats (matches both prefix.name and name.prefix) ──
  const ext = base.slice(base.lastIndexOf('.') + 1);
  const matchedPrefix = UADE_ONLY_PREFIXES.find(p => base.startsWith(p) || p === `${ext}.`);
  if (matchedPrefix) {
    // Normalize extension-form filename to prefix form so UADE selects the right replayer.
    // e.g. "deepspace.mk2" → "mk2.deepspace" (UADE keys off the filename prefix).
    let uadeFileName = originalFileName;
    if (!base.startsWith(matchedPrefix)) {
      const dot = base.lastIndexOf('.');
      if (dot > 0) uadeFileName = `${base.slice(dot + 1)}.${base.slice(0, dot)}`;
    }
    const { parseUADEFile } = await import('@lib/import/formats/UADEParser');
    return parseUADEFile(buffer, uadeFileName, prefs.uade ?? 'enhanced', subsong, preScannedMeta);
  }

  // ── UADE catch-all: 130+ exotic Amiga formats ───────────────────────────
  const { isUADEFormat, parseUADEFile } = await import('@lib/import/formats/UADEParser');
  if (isUADEFormat(filename)) {
    return await parseUADEFile(buffer, originalFileName, prefs.uade ?? 'enhanced', subsong, preScannedMeta);
  }

  return null;
}
