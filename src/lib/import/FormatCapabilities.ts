/**
 * FormatCapabilities.ts — Determines what DEViLBOX can do with each format.
 *
 * Used by the import dialog to show warnings about read-only formats,
 * non-exportable formats, and formats without pattern display.
 *
 * Keep these lists in sync with:
 *   - src/engine/uade/encoders/  (UADE chip RAM encoders → editable + exportable)
 *   - src/lib/export/            (native format exporters → exportable)
 *   - src/lib/import/FormatRegistry.ts  (format labels must match exactly)
 */

// ── Editable format labels ───────────────────────────────────────────────────
// Format labels (from FormatRegistry) that have pattern editors.
// Must match FormatRegistry label strings exactly.

const EDITABLE_FORMAT_LABELS = new Set([
  // ── libopenmpt standard ──
  'MOD', 'XM', 'IT', 'S3M',
  'ProTracker MOD', 'FastTracker II XM', 'Impulse Tracker', 'ScreamTracker 3',

  // ── Furnace ──
  'Furnace', 'DefleMask / X-Tracker',

  // ── Native editors (non-UADE) ──
  'HivelyTracker', 'Klystrack', 'GoatTracker', 'MusicLine Editor', 'PreTracker',

  // ── Amiga native with UADE chip RAM editing ──
  'Oktalyzer', 'OctaMED', 'DigiBooster', 'DigiBooster Pro',
  'Future Composer', 'Sound-FX', 'JamCracker Pro',
  'SoundMon', 'SidMon 1', 'Quadra Composer', 'Sonic Arranger',
  'InStereo! 2', 'InStereo! 1', 'InStereo!',
  'Digital Mugician', 'Art of Noise', 'Fred Editor',
  'Graoumf Tracker 2', 'Synthesis',
  'Digital Sound Studio', 'Chuck Biscuits',
  "Image's Music System", 'IceTracker',
  'Game Music Creator', 'Sound Control',
  'KRIS / ChipTracker', 'Delta Music', 'Delta Music 2',
  'Magnetic Fields Packer', 'ProTracker 3.6',
  'Zound Monitor', 'TCB Tracker', 'XMF', 'Composer 667',
  'TFMX',

  // ── Non-UADE with own WASM engine + edit/export ──
  'Digital Symphony', 'Puma Tracker', 'Symphonie Pro',
  'Future Player', 'SidMon II', 'Music Assembler',

  // ── Native parsers with dedicated encoders ──
  'AMOS Music Bank',

  // ── Compiled 68k / packed Amiga with chip RAM pattern editing ──
  'Rob Hubbard', 'Rob Hubbard ST', 'David Whittaker',
  'Activision Pro', 'Ron Klaren', 'Richard Joseph',
  'Mark Cooksey', 'Jeroen Tel', 'Sound Master', 'Sound Factory',
  'Jason Page', 'Jason Brooke', 'Laxity', 'Fred Gray',
  'Jochen Hippel ST', 'Jochen Hippel 7V', 'Special FX',
  'Time Tracker', 'Cinemaware', 'Fashion Tracker',
  'Tomy Tracker', 'Sean Conran', 'Thomas Hermann',
  'Core Design', 'Janko Mrsic-Flogel', 'Sound Player',
  'Wally Beben', 'Steve Barrett', 'Paul Summers',
  'Paul Shields', 'Paul Robotham', 'Paul Tonge',
  'Pierre Adane', 'Andrew Parton', 'Custom Made',
  'Digital Sonix Chrome', 'Jesper Olsen', 'Kim Christensen',
  'Ashley Hogg', 'Maximum Effect', 'MIDI Loriciel',
  'On Escapee', 'Maniacs of Noise', 'Martin Walker',
  'Desire', 'MultiMedia Sound', 'Synth Pack', 'MMDC',
  'Medley', 'Infogrames', 'Quartet',
  'NovoTrade Packer', 'Alcatraz Packer', 'Blade Packer',
  'Mosh Packer', 'Nick Pelling Packer', 'Peter Verswyvelen Packer',
  'SunTronic', 'GlueMon', 'Sean Connolly',
  'Art and Magic', 'Mike Davies', 'Mark II', 'Sonic Arranger SAS', 'A-Pro-Sys',
]);

/** Format families (from FormatRegistry) that are always editable */
const EDITABLE_FAMILIES = new Set([
  'libopenmpt', 'furnace', 'pc-tracker',
]);

// ── Exportable format labels ─────────────────────────────────────────────────
// Formats that can be exported to their native binary format (beyond .dbx).
// UADE formats with encoders export via chip RAM dump (UADEChipEditor).

const NATIVE_EXPORTABLE_LABELS = new Set([
  // ── libopenmpt standard ──
  'MOD', 'XM', 'IT', 'S3M',
  'ProTracker MOD', 'FastTracker II XM', 'Impulse Tracker', 'ScreamTracker 3',

  // ── Furnace ──
  'Furnace',

  // ── Native editors with dedicated exporters ──
  'HivelyTracker', 'Klystrack', 'MusicLine Editor', 'JamCracker Pro', 'PreTracker',

  // ── Amiga native with UADE chip RAM export ──
  'Oktalyzer', 'OctaMED', 'DigiBooster', 'DigiBooster Pro',
  'Future Composer', 'Sound-FX',
  'SoundMon', 'SidMon 1', 'Quadra Composer', 'Sonic Arranger',
  'InStereo! 2', 'InStereo! 1', 'InStereo!',
  'Digital Mugician', 'Art of Noise', 'Fred Editor',
  'Graoumf Tracker 2', 'Synthesis',
  'Digital Sound Studio', 'Chuck Biscuits',
  "Image's Music System", 'IceTracker',
  'Game Music Creator', 'Sound Control',
  'KRIS / ChipTracker', 'Delta Music', 'Delta Music 2',
  'Magnetic Fields Packer', 'ProTracker 3.6',
  'Zound Monitor', 'TCB Tracker', 'XMF', 'Composer 667',
  'TFMX',

  // ── Non-UADE with dedicated exporters ──
  'Digital Symphony', 'Puma Tracker', 'Symphonie Pro',
  'Future Player', 'SidMon II', 'Music Assembler',

  // ── Native parsers with dedicated exporters ──
  'AMOS Music Bank',

  // ── Compiled 68k / packed Amiga with chip RAM export ──
  'Rob Hubbard', 'Rob Hubbard ST', 'David Whittaker',
  'Activision Pro', 'Ron Klaren', 'Richard Joseph',
  'Mark Cooksey', 'Jeroen Tel', 'Sound Master', 'Sound Factory',
  'Jason Page', 'Jason Brooke', 'Laxity', 'Fred Gray',
  'Jochen Hippel ST', 'Jochen Hippel 7V', 'Special FX',
  'Time Tracker', 'Cinemaware', 'Fashion Tracker',
  'Tomy Tracker', 'Sean Conran', 'Thomas Hermann',
  'Core Design', 'Janko Mrsic-Flogel', 'Sound Player',
  'Wally Beben', 'Steve Barrett', 'Paul Summers',
  'Paul Shields', 'Paul Robotham', 'Paul Tonge',
  'Pierre Adane', 'Andrew Parton', 'Custom Made',
  'Digital Sonix Chrome', 'Jesper Olsen', 'Kim Christensen',
  'Ashley Hogg', 'Maximum Effect', 'MIDI Loriciel',
  'On Escapee', 'Maniacs of Noise', 'Martin Walker',
  'Desire', 'MultiMedia Sound', 'Synth Pack', 'MMDC',
  'Medley', 'Infogrames', 'Quartet',
  'NovoTrade Packer', 'Alcatraz Packer', 'Blade Packer',
  'Mosh Packer', 'Nick Pelling Packer', 'Peter Verswyvelen Packer',
  'SunTronic', 'GlueMon', 'Sean Connolly',
  'Art and Magic', 'Mike Davies', 'Mark II', 'Sonic Arranger SAS', 'A-Pro-Sys',

  // ── AdLib/OPL with OPL3 exporters (RAD, IMF, RAW) ──
  'AdPlug',
]);

/** Format families that can export via libopenmpt WASM (to IT/S3M) */
const NATIVE_EXPORTABLE_FAMILIES = new Set([
  'pc-tracker', 'libopenmpt',
]);

// ── WASM-only replay format labels ───────────────────────────────────────────
// These have no pattern data — they're just passed as raw binary to WASM engines.

const NO_PATTERN_DISPLAY_LABELS = new Set([
  'SNDH/SC68',       // Atari ST
  'PMD',             // PC-98
  'MDX',             // X68000
  // Not in FormatRegistry — matched by extension fallback:
  'Ben Daglish', 'Hippel ST', 'Sonix Music Driver',
  'PxTone', 'Organya', 'EUP', 'IXS', 'Psycle',
  'ZXTune',
]);

/** Extensions of formats that are WASM-only with no pattern display */
const NO_PATTERN_DISPLAY_EXTENSIONS = new Set([
  '.ptcop', '.pttune', '.org', '.eup', '.ixs', '.psy',
  '.pt3', '.pt2', '.pt1', '.stc', '.st1', '.st3', '.stp', '.vtx', '.psg',
  '.psm', '.sqt', '.psc', '.asc', '.gtr', '.ftc', '.ayc',
  '.cop', '.tfc', '.tfd', '.tf0', '.pdt', '.chi', '.str', '.dst', '.dmm', '.et1',
  '.sndh', '.sc68',
  '.mdx', '.pmd',
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
  // 1. Explicitly listed label
  // 2. Editable family (libopenmpt, furnace, pc-tracker)
  // 3. Fallback: editable if has pattern data and not a WASM-only or uade-only format
  const isEditable =
    EDITABLE_FORMAT_LABELS.has(formatLabel) ||
    (formatFamily != null && EDITABLE_FAMILIES.has(formatFamily)) ||
    (formatFamily !== 'uade-only' &&
     !NO_PATTERN_DISPLAY_LABELS.has(formatLabel) &&
     !NO_PATTERN_DISPLAY_EXTENSIONS.has(ext));

  // Exportable to native format?
  const isNativeExportable =
    NATIVE_EXPORTABLE_LABELS.has(formatLabel) ||
    (formatFamily != null && NATIVE_EXPORTABLE_FAMILIES.has(formatFamily));

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
