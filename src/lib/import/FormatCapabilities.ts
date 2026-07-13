/**
 * FormatCapabilities.ts — Determines what DEViLBOX can do with each format.
 *
 * Used by the import dialog to show warnings about read-only formats,
 * non-exportable formats, and formats without pattern display.
 *
 * Editability / native-exportability are now DERIVED from the single
 * {@link EditableFormatRegistry} source of truth (a registered pattern codec or
 * synth voice ⇒ editable; a registered exporter or chip-RAM codec ⇒ exportable).
 * The two hand-lists below have shrunk to only the SURVIVORS the registry cannot
 * yet express — each group is annotated with why it survives. When you add a
 * format's codec/exporter/synth to `EditableFormatRegistry.builtins`, its label
 * should drop out of these lists (the parity test in
 * `src/lib/formats/__tests__/editableFormatRegistry.parity.test.ts` guards that
 * no format silently loses or gains a capability during that move).
 */

import '@lib/formats/EditableFormatRegistry.builtins';
import {
  getRegistryEditableLabels,
  getRegistryExportableLabels,
} from '@lib/formats/EditableFormatRegistry';

// Registry-derived label sets, computed once after builtins register.
const REGISTRY_EDITABLE_LABELS = getRegistryEditableLabels();
const REGISTRY_EXPORTABLE_LABELS = getRegistryExportableLabels();

// ── Editable format labels (SURVIVORS ONLY) ──────────────────────────────────
// Labels that are editable but that the registry does not (yet) cover. Must
// match FormatRegistry label strings exactly. Everything the registry covers via
// a pattern codec or synth voice is derived and intentionally absent here.

const EDITABLE_FORMAT_LABELS = new Set([
  // ── libopenmpt / pc-tracker aliases (editable via family + label parity;
  //    no dedicated chip-RAM codec, so not registry-derived) ──
  'ProTracker MOD', 'FastTracker II XM', 'Impulse Tracker', 'ScreamTracker 3',

  // ── Own-engine editors with no UADE pattern codec registered ──
  'Furnace', 'DefleMask / X-Tracker', 'GoatTracker', 'PreTracker',

  // ── uade-only prefix aliases (family 'uade-only' ⇒ no fallback; kept explicit) ──
  'InStereo!', 'Rob Hubbard ST', 'Core Design', 'Paul Summers', 'Ashley Hogg',
  'TomyTracker', 'SynTracker',

  // ── Compiled-68k / packed Amiga formats editable via chip-RAM patching but
  //    with NO registered pattern codec yet (export/edit wired ad-hoc, not via
  //    the encoder registry) — genuine survivors until a codec descriptor lands ──
  'Richard Joseph', 'Mark Cooksey', 'Jeroen Tel', 'Sound Master',
  'Jason Page', 'Jason Brooke', 'Laxity', 'Fred Gray',
  'Jochen Hippel ST', 'Jochen Hippel 7V', 'Special FX',
  'Time Tracker', 'Cinemaware', 'Fashion Tracker',
  'Tomy Tracker', 'Sean Conran', 'Thomas Hermann',
  'Janko Mrsic-Flogel', 'Sound Player',
  'Wally Beben', 'Steve Barrett',
  'Paul Shields', 'Paul Robotham', 'Paul Tonge',
  'Pierre Adane', 'Andrew Parton', 'Custom Made',
  'Digital Sonix Chrome', 'Jesper Olsen', 'Kim Christensen',
  'Maximum Effect', 'MIDI Loriciel',
  'On Escapee', 'Maniacs of Noise', 'Martin Walker',
  'Desire', 'MultiMedia Sound', 'Synth Pack', 'MMDC',
  'Medley', 'Infogrames', 'Quartet',
  'NovoTrade Packer', 'Alcatraz Packer', 'Blade Packer',
  'Mosh Packer', 'Nick Pelling Packer', 'Peter Verswyvelen Packer',
  'GlueMon',
]);

/** Format families (from FormatRegistry) that are always editable */
const EDITABLE_FAMILIES = new Set([
  'libopenmpt', 'furnace', 'pc-tracker',
]);

// ── Exportable format labels (SURVIVORS ONLY) ────────────────────────────────
// Labels that are natively exportable but that the registry does not (yet)
// cover. Everything with a registered dedicated exporter or chip-RAM codec is
// derived and intentionally absent here.

const NATIVE_EXPORTABLE_LABELS = new Set([
  // ── libopenmpt / pc-tracker aliases (also exportable via family) ──
  'ProTracker MOD', 'FastTracker II XM', 'Impulse Tracker', 'ScreamTracker 3',

  // ── Furnace (family 'furnace' is NOT in NATIVE_EXPORTABLE_FAMILIES) ──
  'Furnace',

  // ── uade-only prefix aliases ──
  'InStereo!', 'Rob Hubbard ST', 'Core Design', 'Paul Summers', 'Ashley Hogg',

  // ── Compiled-68k / packed Amiga exportable via chip-RAM readback but with NO
  //    registered pattern codec yet (genuine survivors) ──
  'Richard Joseph', 'Mark Cooksey', 'Jeroen Tel', 'Sound Master',
  'Jason Page', 'Jason Brooke', 'Laxity', 'Fred Gray',
  'Jochen Hippel ST', 'Jochen Hippel 7V', 'Special FX',
  'Time Tracker', 'Cinemaware', 'Fashion Tracker',
  'Tomy Tracker', 'Sean Conran', 'Thomas Hermann',
  'Janko Mrsic-Flogel', 'Sound Player',
  'Wally Beben', 'Steve Barrett',
  'Paul Shields', 'Paul Robotham', 'Paul Tonge',
  'Pierre Adane', 'Andrew Parton', 'Custom Made',
  'Digital Sonix Chrome', 'Jesper Olsen', 'Kim Christensen',
  'Maximum Effect', 'MIDI Loriciel',
  'On Escapee', 'Maniacs of Noise', 'Martin Walker',
  'Desire', 'MultiMedia Sound', 'Synth Pack', 'MMDC',
  'Medley', 'Infogrames', 'Quartet',
  'NovoTrade Packer', 'Alcatraz Packer', 'Blade Packer',
  'Mosh Packer', 'Nick Pelling Packer', 'Peter Verswyvelen Packer',
  'GlueMon',
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
  // 0. DERIVED: a pattern codec or synth voice is registered for this label.
  // 1. Explicitly listed survivor label (registry can't express it yet)
  // 2. Editable family (libopenmpt, furnace, pc-tracker)
  // 3. Fallback: editable if has pattern data and not a WASM-only or uade-only format
  const isEditable =
    REGISTRY_EDITABLE_LABELS.has(formatLabel) ||
    EDITABLE_FORMAT_LABELS.has(formatLabel) ||
    (formatFamily != null && EDITABLE_FAMILIES.has(formatFamily)) ||
    (formatFamily !== 'uade-only' &&
     !NO_PATTERN_DISPLAY_LABELS.has(formatLabel) &&
     !NO_PATTERN_DISPLAY_EXTENSIONS.has(ext));

  // Exportable to native format?
  // 0. DERIVED: a dedicated exporter or chip-RAM pattern codec is registered.
  const isNativeExportable =
    REGISTRY_EXPORTABLE_LABELS.has(formatLabel) ||
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
