/**
 * The filename matcher: does a file name belong to a format DEViLBOX loads.
 * A leaf module (the format data and the UADE extension set only), so the API
 * server uses it without the app graph. FormatRegistry.ts re-exports it.
 */

import { FORMAT_REGISTRY, type FormatDefinition } from './formatRegistryData';
import { isUADEFormat } from './uadeExtensions';

let _extensionSetCache: Set<string> | null = null;
let _allExtensionsCache: string[] | null = null;

/** Extract all unique extensions from registry entries that have extRegex */
function buildExtensionSet(): Set<string> {
  if (_extensionSetCache) return _extensionSetCache;
  const exts = new Set<string>();
  for (const fmt of FORMAT_REGISTRY) {
    if (!fmt.extRegex) continue;
    // Extract extension literals from regex source, e.g. /\.(hvl|ahx)$/i → ['.hvl', '.ahx']
    const src = fmt.extRegex.source;
    const m = src.match(/^\\\.\(?([^)$]+)\)?\$$/);
    if (m) {
      for (const ext of m[1].split('|')) {
        exts.add(`.${ext.replace(/\\/g, '')}`);
      }
    }
  }
  _extensionSetCache = exts;
  return exts;
}

/**
 * Get all supported file extensions as an array of lowercase strings.
 * Replaces ModuleLoader.getSupportedExtensions().
 */
export function getFormatExtensions(): string[] {
  if (_allExtensionsCache) return _allExtensionsCache;
  _allExtensionsCache = [...buildExtensionSet()].sort();
  return _allExtensionsCache;
}

/**
 * Check if a filename matches any registered format.
 * Replaces ModuleLoader.isSupportedModule().
 */
export function isSupportedFormat(filename: string): boolean {
  const lower = filename.toLowerCase();
  const ext = lower.slice(lower.lastIndexOf('.'));
  if (buildExtensionSet().has(ext)) return true;
  // Check prefix-based formats (both prefix.name and name.prefix)
  const base = getBasename(lower);
  const extNoDot = ext.slice(1); // '.sog' → 'sog'
  if (FORMAT_REGISTRY.some(fmt =>
    fmt.prefixes?.some(p => base.startsWith(p) || p === `${extNoDot}.`)
  )) return true;
  // A format that declares only an extension still answers to its name written
  // first: `mdat.rocknroll` is as much a TFMX module as `rocknroll.mdat`.
  const head = firstSegment(base);
  if (head && buildExtensionSet().has(`.${head}`)) return true;
  // Fallback: check UADE extension/prefix list (covers ~80 PTK-Prowiz packed
  // format variants and other UADE-only formats not in the FORMAT_REGISTRY)
  return isUADEFormat(lower);
}


/** The first dot-segment of a basename — `mdat` in `mdat.rocknroll`. */
export function firstSegment(base: string): string {
  const dot = base.indexOf('.');
  return dot === -1 ? '' : base.slice(0, dot);
}

/** Extract basename from a path (handles both / and \\ separators) */
export function getBasename(filepath: string): string {
  return (filepath.split('/').pop() ?? filepath).split('\\').pop() ?? filepath;
}

/**
 * Detect the format of a file by name (and optionally buffer for magic bytes).
 * Returns the first matching FormatDefinition or null.
 * Replaces detectNativeFormat() in ImportModuleDialog.
 */
export function detectFormat(filename: string): FormatDefinition | null {
  const lower = filename.toLowerCase();
  const base = getBasename(lower);
  const ext = lower.slice(lower.lastIndexOf('.') + 1);
  const head = firstSegment(base);

  // Pass 1 — what the registry DECLARES. An explicit declaration always wins,
  // which is what keeps the ten genuine ambiguities resolving the way their
  // author meant: `ml.tune` is MusicLine while `tune.ml` is Medley, `fc.tune`
  // is FutureComposer while `tune.fc` is ASAP, and so on.
  for (const fmt of FORMAT_REGISTRY) {
    if (fmt.matchMode === 'extension' || fmt.matchMode === 'both') {
      if (fmt.extRegex?.test(lower)) return fmt;
    }
    if (fmt.matchMode === 'prefix' || fmt.matchMode === 'both') {
      // Match both prefix form (prefix.songname) and extension form (songname.prefix)
      if (fmt.prefixes?.some(p => base.startsWith(p) || p === `${ext}.`)) return fmt;
    }
  }

  // Pass 2 — every format answers to BOTH spellings. The Amiga scene names the
  // same module either way round, and both live side by side in one directory:
  // `mdat.rocknroll` next to `primemover_01.hot`, `jpn.virocop-14` next to
  // `gyroscope.mon`. 121 registry entries declare prefixes, 75 declare only an
  // extension, and those 75 simply did not answer to their own name written
  // first — 192 spellings that resolved to nothing (audited 2026-09-24).
  //
  // The extension regex is the authority on a format's tokens, so the head of
  // the name is tested against it as if it were the extension. Running this
  // only after pass 1 means an implicit match can never take a file away from
  // a format that asked for it by name.
  if (head) {
    const asExt = `.${head}`;
    for (const fmt of FORMAT_REGISTRY) {
      if (fmt.matchMode === 'prefix') continue;
      if (fmt.extRegex?.test(asExt)) return fmt;
    }
  }
  return null;
}
