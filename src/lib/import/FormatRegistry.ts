/**
 * FormatRegistry — Single source of truth for all supported music file formats.
 *
 * Every format DEViLBOX can load is defined here once. Consumers (ImportModuleDialog,
 * ModuleLoader, GlobalDragDropHandler, UnifiedFileLoader, parseModuleToSong) all
 * derive their format lists, extension sets, and detection logic from this registry.
 *
 * Adding a new format = adding one entry here. No other file needs format lists.
 */

import { isGoatTrackerSong } from './formats/GoatTrackerDetect';
import { isSunTronicV13Format } from './formats/SunTronicV13';
import { hasMonotoneSignature } from './formats/monotoneGrid';
import { FORMAT_REGISTRY, type FormatDefinition } from './formatRegistryData';
import { detectFormat } from './formatFilenameMatcher';

// The data and the filename matcher live in leaf modules the API server can
// reach without this file's app graph; they are re-exported so every existing
// importer keeps its import path.
export * from './formatRegistryData';
export { getFormatExtensions, isSupportedFormat, detectFormat } from './formatFilenameMatcher';

/**
 * Content-magic fallback for files whose NAME reveals nothing (extensionless
 * Amiga rips like `newest_play`, `paradroid.final`). Reads only the header, so
 * it's cheap to run on the handful of files a name-based check rejected. Keep the
 * checks here unambiguous (strong magics only) so this never steals a drop from
 * another format. Currently: SunTronic V1.3 "Delirium" hunk executables.
 */
export function isSupportedByHeader(bytes: Uint8Array): boolean {
  return isSunTronicV13Format(bytes);
}

/**
 * Detection by name, corrected by content where one extension names two
 * formats. `detectFormat` answers from the name alone and is what the
 * registry declares; this is what the loader, the song index and the headless
 * sweep use when they hold the bytes, so all three agree (2026-10-05
 * broken-formats sweep: 16 GoatTracker songs were indexed as Zound Monitor
 * and rendered through UADE, Digital Tracker and Imago Orpheus modules went
 * to AdPlug, PiyoPiyo to PMD98).
 *
 * The rules are the collisions themselves, nothing else: a file whose name
 * resolves to a format that is not in this table keeps that answer.
 */
export function detectFormatFromContent(filename: string, bytes: Uint8Array): FormatDefinition | null {
  const byName = detectFormat(filename);
  const lower = filename.toLowerCase();
  const ext = lower.slice(lower.lastIndexOf('.') + 1);
  const ascii = (at: number, text: string): boolean => {
    if (bytes.length < at + text.length) return false;
    for (let i = 0; i < text.length; i++) if (bytes[at + i] !== text.charCodeAt(i)) return false;
    return true;
  };
  const byKey = (key: string): FormatDefinition | null => FORMAT_REGISTRY.find((f) => f.key === key) ?? null;

  switch (ext) {
    case 'sng':
      // THE .sng rule (U4.5), the only one: every opener (drop, file browser,
      // jukebox, MCP, restore), the song index and the sweep reach it here.
      // Three formats use .sng. GoatTracker carries its GTS!..GTS5 magic,
      // Richard Joseph 'RJP' + 'SMOD'; what is left is Zound Monitor, the only
      // other claimant (the registry's name-only answer for every .sng, which
      // is why a name alone must never classify one).
      if (isGoatTrackerSong(bytes)) return byKey('goatTracker');
      if (ascii(0, 'RJP') && ascii(4, 'SMOD')) return byKey('richardJoseph');
      break;
    case 'dtm':
      // Digital Tracker (Atari Falcon, libopenmpt) starts 'D.T.'; AdPlug's DTM
      // (DeFy Adlib Tracker) starts 'DeFy DTM '.
      if (ascii(0, 'D.T.')) return byKey('dtm');
      break;
    case 'imf':
      // Imago Orpheus carries 'IM10' at offset 60; id Software IMF has no magic.
      if (ascii(60, 'IM10')) return byKey('imagoOrpheus');
      break;
    case 'snd':
      // Atari ST SNDH carries 'SNDH' at offset 12 (or is ICE!-packed); the
      // Amiga formats that share `.snd` have neither. Every SNDH collection
      // names its files `.snd`, and all of them went to UADE (2026-10-05).
      if (ascii(12, 'SNDH') || ascii(0, 'ICE!')) return byKey('sndh');
      break;
    case 'mon':
      // MONOTONE (PC speaker tracker) starts with the Pascal string "MONOTONE";
      // Maniacs of Noise has no magic and is the name-only answer for .mon.
      if (hasMonotoneSignature(bytes)) return byKey('monotone');
      break;
    case 'mod':
      // ChipTracker (KRIS) modules circulate named .mod; they carry 'KRIS' at
      // offset 952 where a ProTracker module has sample headers, and the MOD
      // parser rejects them.
      if (ascii(952, 'KRIS')) return byKey('kris');
      break;
    case 'pmd':
      // Studio Pixel PiyoPiyo starts 'PMD'; PC-98 PMD98 files start with a version byte.
      if (ascii(0, 'PMD')) return byKey('piyoPiyo');
      break;
    default:
      break;
  }
  return byName;
}

/**
 * Get all formats that are playable by libopenmpt in the ImportModuleDialog preview.
 */
export function getLibopenmptPlayableKeys(): Set<string> {
  return new Set(
    FORMAT_REGISTRY
      .filter(f => f.libopenmptPlayable)
      .map(f => f.key)
  );
}

/**
 * Get all format keys that are native-only (no UADE/libopenmpt toggle).
 */
export function getNativeOnlyKeys(): Set<string> {
  return new Set(
    FORMAT_REGISTRY
      .filter(f => f.nativeOnly)
      .map(f => f.key)
  );
}

