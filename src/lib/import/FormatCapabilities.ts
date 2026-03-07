/**
 * FormatCapabilities.ts — Determines what DEViLBOX can do with each format.
 *
 * Used by the import dialog to show warnings about read-only formats,
 * non-exportable formats, and formats without pattern display.
 */

// ── Editable format labels ───────────────────────────────────────────────────
// Format labels (from FormatRegistry/moduleInfo.metadata.type) that have pattern editors.

const EDITABLE_FORMAT_LABELS = new Set([
  // libopenmpt standard
  'MOD', 'XM', 'IT', 'S3M',
  // Native editors
  'HivelyTracker', 'Oktalyzer', 'OctaMED', 'DigiBooster', 'DigiBooster Pro',
  'Future Composer', 'SoundFX', 'JamCracker Pro',
  'MusicLine Editor', 'Klystrack',
  'GoatTracker',
  // Furnace
  'Furnace', 'DefleMask / X-Tracker',
]);

/** Format families (from FormatRegistry) that are always editable */
const EDITABLE_FAMILIES = new Set([
  'libopenmpt', 'furnace',
]);

// ── Exportable format labels ─────────────────────────────────────────────────
// Formats that can be exported to their native binary format (beyond .dbx).

const NATIVE_EXPORTABLE_LABELS = new Set([
  'MOD', 'XM',
  'HivelyTracker',
  'Furnace',
  'Oktalyzer', 'OctaMED', 'DigiBooster', 'DigiBooster Pro',
  'Future Composer',
  'JamCracker Pro',
  'Klystrack',
  'MusicLine Editor',
  // Chip export formats (VGM/NSF/etc.) are always available regardless of import format
]);

// ── WASM-only replay format labels ───────────────────────────────────────────
// These have no pattern data — they're just passed as raw binary to WASM engines.

const NO_PATTERN_DISPLAY_LABELS = new Set([
  'SNDH/SC68',       // Atari ST
  'PMD',             // PC-98
  'MDX',             // X68000
  // Not in FormatRegistry — matched by extension fallback:
  'PreTracker', 'Music Assembler', 'Hippel ST', 'Sonix Music Driver',
  'PxTone', 'Organya', 'EUP', 'IXS', 'Psycle',
  'ZXTune',
]);

/** Extensions of formats that are WASM-only with no pattern display */
const NO_PATTERN_DISPLAY_EXTENSIONS = new Set([
  '.prt', '.ptcop', '.pttune', '.org', '.eup', '.ixs', '.psy',
  '.pt3', '.pt2', '.pt1', '.stc', '.st1', '.st3', '.stp', '.vtx', '.psg',
  '.psm', '.sqt', '.psc', '.asc', '.gtr', '.ftc', '.ayc',
  '.cop', '.tfc', '.tfd', '.tf0', '.pdt', '.chi', '.str', '.dst', '.dmm', '.et1',
  '.sndh', '.sc68',
  '.mdx', '.pmd',
]);

/** Extensions of formats that are NOT editable */
const NOT_EDITABLE_EXTENSIONS = new Set([
  ...NO_PATTERN_DISPLAY_EXTENSIONS,
  // UADE-only formats that have pattern data but no dedicated editor:
  // (These are played via UADE as read-only)
]);

// ── Furnace chip alternatives ────────────────────────────────────────────────

interface FurnaceAlternative {
  chipName: string;
  description: string;
}

const FURNACE_ALTERNATIVES_BY_EXT: Record<string, FurnaceAlternative> = {
  '.sndh': {
    chipName: 'AY-3-8910',
    description: 'Create a new Furnace project with the AY-3-8910 chip (YM2149 compatible) to compose editable Atari ST music.',
  },
  '.sc68': {
    chipName: 'AY-3-8910',
    description: 'Create a new Furnace project with the AY-3-8910 chip (YM2149 compatible) to compose editable Atari ST music.',
  },
  '.pt3': {
    chipName: 'AY-3-8910',
    description: 'Create a new Furnace project with the AY-3-8910 chip to compose editable ZX Spectrum music.',
  },
  '.vtx': {
    chipName: 'AY-3-8910',
    description: 'Create a new Furnace project with the AY-3-8910 chip to compose editable ZX Spectrum music.',
  },
  '.psg': {
    chipName: 'AY-3-8910',
    description: 'Create a new Furnace project with the AY-3-8910 chip to compose editable AY/PSG music.',
  },
  '.eup': {
    chipName: 'YM2612 + AY',
    description: 'Create a new Furnace project with the Genesis (YM2612 + PSG) chip to compose editable FM Towns music.',
  },
  '.mdx': {
    chipName: 'YM2151',
    description: 'Create a new Furnace project with the YM2151 (OPM) chip to compose editable X68000 music.',
  },
  '.pmd': {
    chipName: 'YM2608',
    description: 'Create a new Furnace project with the YM2608 (OPNA) chip to compose editable PC-98 music.',
  },
};

// Map several ZX Spectrum extensions to AY alternative
for (const ext of ['.pt2', '.pt1', '.stc', '.st1', '.st3', '.stp', '.psm', '.sqt', '.psc', '.asc', '.gtr', '.ftc', '.ayc', '.cop', '.tfc', '.tfd', '.tf0', '.pdt', '.chi', '.str', '.dst', '.dmm', '.et1']) {
  FURNACE_ALTERNATIVES_BY_EXT[ext] = {
    chipName: 'AY-3-8910',
    description: 'Create a new Furnace project with the AY-3-8910 chip to compose editable ZX Spectrum / AY music.',
  };
}

// ── Public API ───────────────────────────────────────────────────────────────

export interface FormatCapabilityInfo {
  /** Whether the format has a pattern editor in DEViLBOX */
  isEditable: boolean;
  /** Whether the format can be exported to its native binary format */
  isNativeExportable: boolean;
  /** Whether the format has pattern data to display (vs WASM-only replay) */
  hasPatternData: boolean;
  /** Furnace chip alternative suggestion (if available) */
  furnaceAlternative?: FurnaceAlternative;
}

/**
 * Determine capabilities for a format based on the format label and filename.
 *
 * @param formatLabel  The human-readable format label (e.g. "HivelyTracker", "SNDH/SC68")
 * @param filename     The original filename for extension-based fallback
 * @param formatFamily Optional FormatFamily string from FormatRegistry
 */
export function getFormatCapabilities(
  formatLabel: string,
  filename: string,
  formatFamily?: string,
): FormatCapabilityInfo {
  const ext = filename.slice(filename.lastIndexOf('.')).toLowerCase();

  // Editable?
  const isEditable =
    EDITABLE_FORMAT_LABELS.has(formatLabel) ||
    (formatFamily != null && EDITABLE_FAMILIES.has(formatFamily)) ||
    !NOT_EDITABLE_EXTENSIONS.has(ext);

  // Exportable to native format?
  const isNativeExportable = NATIVE_EXPORTABLE_LABELS.has(formatLabel);

  // Has pattern data to display?
  const hasPatternData =
    !NO_PATTERN_DISPLAY_LABELS.has(formatLabel) &&
    !NO_PATTERN_DISPLAY_EXTENSIONS.has(ext);

  // Furnace chip alternative?
  const furnaceAlternative = FURNACE_ALTERNATIVES_BY_EXT[ext];

  return {
    isEditable,
    isNativeExportable,
    hasPatternData,
    furnaceAlternative,
  };
}
