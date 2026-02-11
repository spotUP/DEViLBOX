/**
 * NKS Validation & Pre-Submission Audit
 *
 * Comprehensive validation functions per NKS SDK specifications:
 * - Preset metadata validation (names, bankchain, types, FX sub-types)
 * - Key name validation (25 char max, title case)
 * - Short name validation (12 char max)
 * - Preview pattern selection (by NKS type)
 * - Preview pattern precedence resolution
 * - Source artwork validation
 * - Full pre-submission audit
 */

import type { NKSPresetMetadata } from './types';
import { NKS_CONSTANTS, NKS_PREVIEW_SPEC } from './types';

// ============================================================================
// Preset Name Validation (SDK Section 6.1.3)
// ============================================================================

/**
 * Validate a preset name per NKS SDK naming rules.
 * - No leading or trailing whitespace
 * - No metadata in names (timestamps, author names in brackets)
 * - Must be human readable
 * - Max length from NKS_CONSTANTS
 */
export function validatePresetName(name: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!name || name.length === 0) {
    errors.push('Preset name is required');
    return { valid: false, errors };
  }

  if (name !== name.trim()) {
    errors.push('Preset name must not have leading or trailing whitespace');
  }

  if (name.length > NKS_CONSTANTS.MAX_PRESET_NAME_LENGTH) {
    errors.push(`Preset name exceeds ${NKS_CONSTANTS.MAX_PRESET_NAME_LENGTH} characters`);
  }

  // Check for metadata-like patterns (timestamps, version numbers)
  if (/^\d{8}/.test(name)) {
    errors.push('Preset name should not start with a date/timestamp (e.g., "20170131xS")');
  }
  if (/\[.*\]/.test(name) && /\d/.test(name)) {
    errors.push('Preset name should not contain metadata in brackets');
  }

  return { valid: errors.length === 0, errors };
}

// ============================================================================
// Bank Chain Validation (SDK Section 17.9)
// ============================================================================

/**
 * Validate bank chain structure.
 * - Required: at least 1 level
 * - Maximum: 3 levels (Product, Bank, Sub-Bank)
 */
export function validateBankChain(bankChain: string[]): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!bankChain || bankChain.length === 0) {
    errors.push('bankchain must have at least 1 entry');
  }
  if (bankChain && bankChain.length > 3) {
    errors.push(`bankchain must have max 3 entries (Product, Bank, Sub-Bank), got ${bankChain.length}`);
  }
  if (bankChain) {
    for (let i = 0; i < bankChain.length; i++) {
      if (!bankChain[i] || bankChain[i].trim().length === 0) {
        errors.push(`bankchain[${i}] must not be empty`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

// ============================================================================
// Type Tag Validation (SDK Section 6.2.4)
// ============================================================================

/**
 * Validate NKS type tags.
 * - For FX presets (deviceType === "FX"): sub-type is REQUIRED
 * - Types must be [type, subType] pairs
 */
export function validateTypeTags(
  types: string[][] | undefined,
  deviceType: string = 'INST',
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!types || types.length === 0) {
    // Types are recommended but not strictly required
    return { valid: true, errors };
  }

  for (let i = 0; i < types.length; i++) {
    const pair = types[i];
    if (!Array.isArray(pair) || pair.length < 2) {
      errors.push(`types[${i}] must be a [type, subType] pair`);
      continue;
    }

    if (!pair[0] || pair[0].trim().length === 0) {
      errors.push(`types[${i}][0] (type) must not be empty`);
    }

    // Sub-type is REQUIRED for FX presets per SDK Section 6.2.4
    if (deviceType === 'FX' && (!pair[1] || pair[1].trim().length === 0)) {
      errors.push(`types[${i}][1] (sub-type) is required for FX presets`);
    }
  }

  return { valid: errors.length === 0, errors };
}

// ============================================================================
// Key Name Validation (SDK Section 12.4.1)
// ============================================================================

/** Maximum key name length per SDK */
export const MAX_KEY_NAME_LENGTH = 25;

/**
 * Validate a light guide key name.
 * - Max 25 characters
 * - Title case (first letter of each word upper case)
 * - Only for Control mode notes
 */
export function validateKeyName(name: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (name.length > MAX_KEY_NAME_LENGTH) {
    errors.push(`Key name exceeds ${MAX_KEY_NAME_LENGTH} characters (got ${name.length})`);
  }

  // Check title case
  const words = name.split(/\s+/);
  for (const word of words) {
    if (word.length > 0 && word[0] !== word[0].toUpperCase()) {
      errors.push(`Key name should be in title case: "${word}" should start with uppercase`);
      break;
    }
  }

  return { valid: errors.length === 0, errors };
}

// ============================================================================
// Short Name Validation (SDK Section 6.2.3)
// ============================================================================

/** Maximum short name length per SDK */
export const MAX_SHORT_NAME_LENGTH = 12;

/**
 * Validate a product short name.
 * - Max 12 characters
 */
export function validateShortName(shortName: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!shortName || shortName.length === 0) {
    errors.push('Short name is required');
  }
  if (shortName && shortName.length > MAX_SHORT_NAME_LENGTH) {
    errors.push(`Short name exceeds ${MAX_SHORT_NAME_LENGTH} characters (got ${shortName.length})`);
  }

  return { valid: errors.length === 0, errors };
}

// ============================================================================
// Parameter Name Validation (SDK Section 9.3)
// ============================================================================

/** Maximum parameter name for fixed-spacing displays (S-Series MK1, Maschine MK1) */
export const MAX_PARAM_NAME_FIXED = 8;
/** Maximum parameter name for pixel-based displays (MK2/MK3) */
export const MAX_PARAM_NAME_PIXEL = 10;

/**
 * Validate a parameter name for hardware display.
 * - 8 chars max for fixed-spacing (MK1)
 * - Up to 10 chars on pixel-based (MK2/MK3) if it fits or is in abbreviation table
 */
export function validateParamName(
  name: string,
  targetMaxChars: number = MAX_PARAM_NAME_FIXED,
): { valid: boolean; warnings: string[] } {
  const warnings: string[] = [];

  if (name.length > targetMaxChars) {
    warnings.push(`Parameter name "${name}" (${name.length} chars) exceeds ${targetMaxChars}-char display limit`);
  }

  return { valid: true, warnings }; // Names are always technically valid, just may truncate
}

// ============================================================================
// Preview Pattern Selection (SDK Section 7.1.2)
// ============================================================================

/**
 * MIDI pattern paths for preview generation.
 * Per SDK Section 7.1.2.
 */
export const NKS_PREVIEW_PATTERNS = {
  'C3_1bar': 'generic/C3 - 1 bar.mid',       // General, velocity 100
  'C1_1bar': 'generic/C1 - 1 bar.mid',       // Bass presets
  'C0_1bar': 'generic/C0 - 1 bar.mid',       // Sub-bass presets
  'Pianos': 'generic/Pianos.mid',             // Piano presets (C Major chord)
  'Organs': 'generic/Organs.mid',             // Organ presets
  'SelfGenerating': 'generic/Self-Generating.mid', // Self-generating, trim to 6s
  'DrumKit_2bar': 'generic/Drum Kit - 2 bar.mid', // Drum kit patterns
} as const;

/**
 * Select the appropriate preview MIDI pattern based on the NKS type.
 * Per SDK Section 7.1.2 pattern selection rules.
 */
export function selectPreviewPattern(types?: string[][]): string {
  if (!types || types.length === 0) {
    return NKS_PREVIEW_PATTERNS.C3_1bar;
  }

  // Check primary type (first pair's type)
  const primaryType = types[0]?.[0]?.toLowerCase() || '';
  const primarySubType = types[0]?.[1]?.toLowerCase() || '';

  // Bass presets use lower octave
  if (primaryType === 'bass' || primarySubType.includes('bass')) {
    return NKS_PREVIEW_PATTERNS.C1_1bar;
  }

  // Piano presets
  if (primaryType === 'piano' || primaryType === 'keys' || primarySubType.includes('piano')) {
    return NKS_PREVIEW_PATTERNS.Pianos;
  }

  // Organ presets
  if (primaryType === 'organ' || primarySubType.includes('organ')) {
    return NKS_PREVIEW_PATTERNS.Organs;
  }

  // Drum presets
  if (primaryType === 'drums' || primaryType === 'percussion') {
    return NKS_PREVIEW_PATTERNS.DrumKit_2bar;
  }

  // Default: C3 at velocity 100
  return NKS_PREVIEW_PATTERNS.C3_1bar;
}

// ============================================================================
// Preview Pattern Precedence (SDK Section 7.2.3)
// ============================================================================

/**
 * Resolve which preview MIDI pattern to use based on precedence.
 * Order: preset > subbank > bank > product.
 */
export function resolvePreviewPattern(
  metadata: {
    product?: string;
    bank?: Record<string, string>;
    subbank?: Record<string, string>;
    preset?: Record<string, string>;
  },
  presetName: string,
  bankName?: string,
  subbankName?: string,
): string | undefined {
  // Highest priority: preset-specific pattern
  if (metadata.preset && presetName && metadata.preset[presetName]) {
    return metadata.preset[presetName];
  }

  // Second: subbank pattern
  if (metadata.subbank && subbankName && metadata.subbank[subbankName]) {
    return metadata.subbank[subbankName];
  }

  // Third: bank pattern
  if (metadata.bank && bankName && metadata.bank[bankName]) {
    return metadata.bank[bankName];
  }

  // Lowest priority: product default
  return metadata.product;
}

// ============================================================================
// Source Artwork Specifications (SDK Section 8.1)
// ============================================================================

/**
 * Source artwork file specifications required for NI submission.
 * These are the raw source files used by NI's Asset Designer tool.
 */
export const NKS_SOURCE_ARTWORK_SPECS = {
  /** Main product logo (mandatory) */
  sourceLogoA: {
    filenames: ['sourceLogoA.svg', 'sourceLogoA.png'],
    formats: ['svg', 'png'] as const,
    minHeightPx: 400,
    mandatory: true,
    description: 'Single-line product logo, no transparent margins/padding',
  },

  /** Additional/stacked product logo (optional) */
  sourceLogoB: {
    filenames: ['sourceLogoB.svg', 'sourceLogoB.png'],
    formats: ['svg', 'png'] as const,
    minHeightPx: 400,
    mandatory: false,
    description: 'Non-single-line (stacked) logo version',
  },

  /** Product artwork (mandatory) */
  sourceArtwork: {
    filenames: ['sourceArtwork.png'],
    formats: ['png'] as const,
    minWidth: 2000,
    minHeight: 2000,
    opaque: true,        // No alpha channel
    mandatory: true,
    description: 'Product artwork, opaque, minimum 2000x2000px',
  },

  /** Product screenshot (mandatory) */
  screenshot: {
    filenames: ['screenshot.png'],
    formats: ['png'] as const,
    ratio: '1:1',        // Must be actual display ratio
    noFrame: true,       // No OS/DAW/Kontakt frame
    mandatory: true,
    description: 'Product screenshot at 1:1 ratio, no OS/DAW frame',
  },
} as const;

/**
 * MST_plugin.png scaling algorithm per SDK Section 8.2.8.
 * Returns target dimensions for the scaled plugin screenshot.
 */
export function calculateMSTPluginDimensions(
  actualWidth: number,
  actualHeight: number,
): { width: number; height: number; scale: number } {
  const MAX_WIDTH = 190;
  const MAX_HEIGHT = 100;
  const SMALL_THRESHOLD_WIDTH = 1200;
  const SMALL_THRESHOLD_HEIGHT = 500;

  let scale: number;

  if (actualWidth < SMALL_THRESHOLD_WIDTH || actualHeight < SMALL_THRESHOLD_HEIGHT) {
    // Small GUI: use 20% of actual size
    scale = 0.2;
  } else {
    // Large GUI: scale to fit within 190x100
    scale = Math.min(MAX_WIDTH / actualWidth, MAX_HEIGHT / actualHeight);
  }

  return {
    width: Math.round(actualWidth * scale),
    height: Math.round(actualHeight * scale),
    scale,
  };
}

// ============================================================================
// Preview Spec Constants
// ============================================================================

/**
 * Extended preview specifications with tempo default.
 */
export const NKS_PREVIEW_FULL_SPEC = {
  ...NKS_PREVIEW_SPEC,
  DEFAULT_TEMPO_BPM: 120,     // Default tempo per SDK Section 7.1.1
  DEFAULT_VELOCITY: 100,       // Default note velocity
} as const;

// ============================================================================
// SDK Version Constants
// ============================================================================

export const NKS_SDK_VERSIONS = {
  /** Current NKS metadata version */
  METADATA_VERSION: 1,
  /** Minimum MASCHINE CP version required */
  MIN_MASCHINE_CP: '2.17.2',
  /** NKS SDK specification version */
  SDK_SPEC_VERSION: '2.0.2',
} as const;

// ============================================================================
// Comprehensive Pre-Submission Audit (SDK Section 15.1)
// ============================================================================

/** Pre-submission audit result */
export interface NKSAuditResult {
  passed: boolean;
  checks: Array<{
    name: string;
    passed: boolean;
    message: string;
  }>;
}

/**
 * Run a comprehensive pre-submission audit per SDK Section 15.1 checklist.
 * Validates all requirements for an NKS product submission to NI.
 */
export function auditNKSProduct(config: {
  metadata: NKSPresetMetadata;
  hasPreviewFiles: boolean;
  hasArtwork: boolean;
  hasNativeMap: boolean;
  hasLightGuide: boolean;
  hasServiceCenterXML: boolean;
  hasRegistryOrPlist: boolean;
  presetCount: number;
}): NKSAuditResult {
  const checks: NKSAuditResult['checks'] = [];

  // 1. Preset metadata
  const nameResult = validatePresetName(config.metadata.name);
  checks.push({
    name: 'Preset name valid',
    passed: nameResult.valid,
    message: nameResult.valid ? 'OK' : nameResult.errors.join('; '),
  });

  const bankResult = validateBankChain(config.metadata.bankChain);
  checks.push({
    name: 'Bank chain valid',
    passed: bankResult.valid,
    message: bankResult.valid ? 'OK' : bankResult.errors.join('; '),
  });

  const typeResult = validateTypeTags(config.metadata.types, config.metadata.deviceType);
  checks.push({
    name: 'Type tags valid',
    passed: typeResult.valid,
    message: typeResult.valid ? 'OK' : typeResult.errors.join('; '),
  });

  // 2. Preview files
  checks.push({
    name: 'Preview files present',
    passed: config.hasPreviewFiles,
    message: config.hasPreviewFiles ? 'OK' : 'All presets must have associated .ogg preview files',
  });

  // 3. Artwork
  checks.push({
    name: 'Artwork present',
    passed: config.hasArtwork,
    message: config.hasArtwork ? 'OK' : 'Artwork must be provided for all required asset types',
  });

  // 4. Native Map
  checks.push({
    name: 'Native Map present',
    passed: config.hasNativeMap,
    message: config.hasNativeMap ? 'OK' : 'All presets must include a Native Map (NICA chunk)',
  });

  // 5. Light Guide
  checks.push({
    name: 'Light Guide configured',
    passed: config.hasLightGuide,
    message: config.hasLightGuide ? 'OK' : 'Light Guide should be configured for keyboard-based instruments',
  });

  // 6. Deployment files
  checks.push({
    name: 'Service Center XML',
    passed: config.hasServiceCenterXML,
    message: config.hasServiceCenterXML ? 'OK' : 'Service Center XML template required for NI registration',
  });

  checks.push({
    name: 'Registry/Plist files',
    passed: config.hasRegistryOrPlist,
    message: config.hasRegistryOrPlist ? 'OK' : 'Windows registry or macOS plist required for content discovery',
  });

  // 7. Preset count
  checks.push({
    name: 'Has presets',
    passed: config.presetCount > 0,
    message: config.presetCount > 0 ? `${config.presetCount} presets` : 'At least one preset required',
  });

  return {
    passed: checks.every(c => c.passed),
    checks,
  };
}
