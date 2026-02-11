/**
 * NKS Leap Expansion Support
 *
 * Implements Leap SDK v1.0.1 specifications for creating
 * Leap-compatible sample expansion packs:
 * - Kit type taxonomy
 * - Sample naming conventions
 * - Macro assignment structure (16 params, last 2 reserved)
 * - Background image specifications
 * - Delivery package structure
 * - Audio preview requirements
 */

// ============================================================================
// Kit Types (Leap SDK Section 7.1)
// ============================================================================

/**
 * Official Leap Kit Types.
 * Only these values are accepted for kit tagging.
 */
export const LEAP_KIT_TYPES = [
  'Acoustic Kit',
  'Analog Kit',
  'Artist Kit',
  'Digital Kit',
  'Melodic Kit',
  'Perc Kit',
  'Special Kit',
  'Vinyl Kit',
  'Vocal Kit',
] as const;

export type LeapKitType = typeof LEAP_KIT_TYPES[number];

/**
 * Validate a kit type string against the official Leap taxonomy.
 */
export function isValidLeapKitType(type: string): type is LeapKitType {
  return (LEAP_KIT_TYPES as readonly string[]).includes(type);
}

// ============================================================================
// Sample Specifications
// ============================================================================

/** Accepted sample formats for Leap expansions */
export const LEAP_SAMPLE_FORMATS = ['wav', 'aiff', 'rex', 'rc2', 'rcy'] as const;

export type LeapSampleFormat = typeof LEAP_SAMPLE_FORMATS[number];

/** Recommended minimum sample quality */
export const LEAP_SAMPLE_SPEC = {
  MIN_BIT_DEPTH: 24,
  MIN_SAMPLE_RATE: 44100,
  MAX_SAMPLES_PER_KIT: 16,
  RECOMMENDED_KITS: 10,       // Approximately 10 kits recommended
} as const;

/**
 * Sample naming convention per Leap SDK:
 * - Loops: SoundType[[BPM]] [Key] KitName[#].[Extension]
 * - One-shots: SoundType [Key] KitName[#].wav
 *
 * Note: Key, scale, and tempo from filenames are NOT read by the Leap engine.
 * Kontakt detects key and tempo from file metadata and audio analysis.
 */
export interface LeapSampleNaming {
  soundType: string;           // e.g., "Bass", "Synth String"
  bpm?: number;                // Optional BPM for loops (in brackets)
  key?: string;                // Musical key, e.g., "A#m", "Gm"
  kitName: string;             // Kit name
  variation?: number;          // Optional variation number
  extension: LeapSampleFormat;
}

/**
 * Format a sample filename per Leap naming convention.
 */
export function formatLeapSampleName(naming: LeapSampleNaming): string {
  const parts: string[] = [naming.soundType];

  if (naming.bpm !== undefined) {
    parts[0] += `[${naming.bpm}]`;
  }

  if (naming.key) {
    parts.push(naming.key);
  }

  let kitPart = naming.kitName;
  if (naming.variation !== undefined) {
    kitPart += ` ${naming.variation}`;
  }
  parts.push(kitPart);

  return `${parts.join(' ')}.${naming.extension}`;
}

/**
 * Parse a Leap sample filename into its components.
 */
export function parseLeapSampleName(filename: string): Partial<LeapSampleNaming> {
  const result: Partial<LeapSampleNaming> = {};

  // Remove extension
  const dotIndex = filename.lastIndexOf('.');
  if (dotIndex >= 0) {
    result.extension = filename.substring(dotIndex + 1).toLowerCase() as LeapSampleFormat;
    filename = filename.substring(0, dotIndex);
  }

  // Extract BPM from brackets
  const bpmMatch = filename.match(/\[(\d+)\]/);
  if (bpmMatch) {
    result.bpm = parseInt(bpmMatch[1], 10);
    filename = filename.replace(bpmMatch[0], '');
  }

  // Extract variation number at end
  const varMatch = filename.match(/\s+(\d+)$/);
  if (varMatch) {
    result.variation = parseInt(varMatch[1], 10);
    filename = filename.replace(varMatch[0], '');
  }

  // Remaining parts: SoundType [Key] KitName
  const parts = filename.trim().split(/\s+/);
  if (parts.length >= 1) {
    result.soundType = parts[0];
  }

  // Key detection (pattern: note + optional sharp/flat + optional minor)
  if (parts.length >= 2) {
    const keyPattern = /^[A-G][#b]?m?$/;
    for (let i = 1; i < parts.length; i++) {
      if (keyPattern.test(parts[i])) {
        result.key = parts[i];
        result.kitName = parts.slice(i + 1).join(' ');
        break;
      }
    }
    if (!result.kitName) {
      result.kitName = parts.slice(1).join(' ');
    }
  }

  return result;
}

// ============================================================================
// Macro Assignment Structure
// ============================================================================

/**
 * Leap macro assignment structure.
 * 8 macro knobs total, last 2 reserved for Reverb and Delay.
 */
export const LEAP_MACRO_CONFIG = {
  TOTAL_MACROS: 8,
  USER_MACROS: 6,              // Macros 1-6 freely assignable
  RESERVED_MACRO_REVERB: 7,    // Macro 7: always Reverb send
  RESERVED_MACRO_DELAY: 8,     // Macro 8: always Delay send
  MAX_PARAMS_PER_MACRO: 16,    // Up to 16 parameters assignable per macro
} as const;

/** Individual macro assignment */
export interface LeapMacroAssignment {
  macroIndex: number;          // 1-8
  name: string;                // Display name for the macro
  parameters: LeapMacroTarget[];
}

/** Target parameter for a macro */
export interface LeapMacroTarget {
  sampleIndex: number;         // Which sample (0-15)
  parameterType: string;       // e.g., 'filter_cutoff', 'volume', 'send_reverb'
  minValue?: number;           // Macro range minimum (optional)
  maxValue?: number;           // Macro range maximum (optional)
}

/**
 * Create a default macro assignment layout for a Leap kit.
 * Macros 7-8 are pre-assigned to Reverb and Delay sends.
 */
export function createDefaultLeapMacros(): LeapMacroAssignment[] {
  const macros: LeapMacroAssignment[] = [];

  // User macros (1-6) - empty by default
  for (let i = 1; i <= LEAP_MACRO_CONFIG.USER_MACROS; i++) {
    macros.push({
      macroIndex: i,
      name: `Macro ${i}`,
      parameters: [],
    });
  }

  // Reserved: Macro 7 = Reverb Send
  macros.push({
    macroIndex: LEAP_MACRO_CONFIG.RESERVED_MACRO_REVERB,
    name: 'Reverb',
    parameters: [],  // Auto-assigned to reverb send for all samples
  });

  // Reserved: Macro 8 = Delay Send
  macros.push({
    macroIndex: LEAP_MACRO_CONFIG.RESERVED_MACRO_DELAY,
    name: 'Delay',
    parameters: [],  // Auto-assigned to delay send for all samples
  });

  return macros;
}

// ============================================================================
// Background Image Specifications
// ============================================================================

/**
 * Leap background image specifications per SDK.
 */
export const LEAP_BACKGROUND_SPEC = {
  /** Full background dimensions (HiDPI - 2x default Kontakt size) */
  WIDTH: 1940,
  HEIGHT: 1360,
  FORMAT: 'png' as const,

  /** Instrument header height (baked into background) */
  HEADER_HEIGHT: 95,

  /** Artwork live area (visible portion) */
  LIVE_AREA_HEIGHT: 768,

  /** Partner branding logo safe area */
  PARTNER_LOGO: {
    WIDTH: 656,
    HEIGHT: 236,
    INNER_MARGIN: 48,
    POSITION: 'top-right' as const,
    COLORS: ['white', 'black'] as const,  // Full white or black only
    MIN_CONTRAST_RATIO: 4.5,
  },
} as const;

/** Source artwork specs for mandatory assets */
export const LEAP_ARTWORK_SPECS = {
  /** Main product logo (mandatory) */
  SOURCE_LOGO_A: {
    filename: 'sourceLogoA',
    formats: ['svg', 'png'] as const,
    minHeightPx: 400,           // Min resolution for bitmaps
    description: 'Main product logo, no transparent margins',
  },

  /** Additional product logo (optional) */
  SOURCE_LOGO_B: {
    filename: 'sourceLogoB',
    formats: ['svg', 'png'] as const,
    minHeightPx: 400,
    description: 'Additional product logo (optional)',
  },

  /** Product artwork (mandatory) */
  SOURCE_ARTWORK: {
    filename: 'sourceArtwork',
    format: 'png' as const,
    minWidth: 2000,
    minHeight: 2000,
    description: 'Product artwork, opaque (no alpha), min 2000x2000px',
  },

  /** Product screenshot (mandatory) */
  SCREENSHOT: {
    filename: 'screenshot',
    format: 'png' as const,
    description: 'Product screenshot at 1:1, no OS/DAW frame',
  },
} as const;

// ============================================================================
// Delivery Package Structure
// ============================================================================

/**
 * Leap expansion delivery package directory structure.
 *
 * ExpansionName/
 *   unencoded/
 *     Artwork/
 *       Assets/      (production-ready visual assets, NKS Asset Designer output)
 *       Sources/     (source files: background artwork, logo as vector)
 *     Effects/       (currently not used for Leap)
 *     Kits/
 *       .previews/   (OGG preview files, one per kit)
 *       Kit1.nki
 *       Kit2.nki
 *     Samples/
 *       Kit1/
 *         sample1.wav
 *       Kit2/
 *         sample2.wav
 */
export interface LeapDeliveryPackage {
  expansionName: string;
  kits: LeapKit[];
}

export interface LeapKit {
  name: string;                // Kit name (also .nki filename)
  kitType: LeapKitType;        // Official kit type tag
  subType?: string;            // Sub-type tag
  samples: LeapSample[];       // Up to 16 samples
  previewFile?: string;        // OGG preview filename
}

export interface LeapSample {
  filename: string;
  soundType: string;
  characterTags?: string[];    // NKS character tags
}

/**
 * Generate the complete delivery directory listing for a Leap package.
 */
export function getLeapPackageStructure(pkg: LeapDeliveryPackage): string[] {
  const paths: string[] = [];
  const base = `${pkg.expansionName}/unencoded`;

  // Artwork directories
  paths.push(`${base}/Artwork/Assets/`);
  paths.push(`${base}/Artwork/Sources/`);
  paths.push(`${base}/Artwork/Sources/sourceLogoA.svg`);
  paths.push(`${base}/Artwork/Sources/sourceArtwork.png`);
  paths.push(`${base}/Artwork/Sources/screenshot.png`);

  // Effects (placeholder, not used for Leap)
  paths.push(`${base}/Effects/`);

  // Kits directory with previews
  paths.push(`${base}/Kits/`);
  paths.push(`${base}/Kits/.previews/`);

  for (const kit of pkg.kits) {
    paths.push(`${base}/Kits/${kit.name}.nki`);
    if (kit.previewFile) {
      paths.push(`${base}/Kits/.previews/${kit.previewFile}`);
    }
  }

  // Samples directory
  paths.push(`${base}/Samples/`);
  for (const kit of pkg.kits) {
    paths.push(`${base}/Samples/${kit.name}/`);
    for (const sample of kit.samples) {
      paths.push(`${base}/Samples/${kit.name}/${sample.filename}`);
    }
  }

  return paths;
}

// ============================================================================
// Audio Preview Requirements
// ============================================================================

/**
 * Leap preview audio specifications (same as NKS core).
 */
export const LEAP_PREVIEW_SPEC = {
  FORMAT: 'ogg' as const,     // OGG/Vorbis required
  MAX_DURATION_S: 6,
  TARGET_LUFS: -19,
  PEAK_DB: -3,
  NO_SILENCE_AT_START: true,   // Must not start with silence
  ONE_PER_KIT: true,           // Exactly one preview per kit
  MUST_BE_REPRESENTATIVE: true, // Preview should represent the kit, not be a demo
} as const;

// ============================================================================
// Validation
// ============================================================================

/** Validation result */
export interface LeapValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Validate a Leap expansion package structure.
 */
export function validateLeapPackage(pkg: LeapDeliveryPackage): LeapValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!pkg.expansionName || pkg.expansionName.trim().length === 0) {
    errors.push('Expansion name is required');
  }

  if (pkg.kits.length === 0) {
    errors.push('At least one kit is required');
  }

  // Check for unique filenames across all kits
  const allFilenames = new Set<string>();
  for (const kit of pkg.kits) {
    // Validate kit type
    if (!isValidLeapKitType(kit.kitType)) {
      errors.push(`Kit "${kit.name}": invalid kit type "${kit.kitType}". Must be one of: ${LEAP_KIT_TYPES.join(', ')}`);
    }

    // Validate sample count
    if (kit.samples.length > LEAP_SAMPLE_SPEC.MAX_SAMPLES_PER_KIT) {
      errors.push(`Kit "${kit.name}": has ${kit.samples.length} samples, max is ${LEAP_SAMPLE_SPEC.MAX_SAMPLES_PER_KIT}`);
    }

    if (kit.samples.length === 0) {
      errors.push(`Kit "${kit.name}": must have at least one sample`);
    }

    // Check preview
    if (!kit.previewFile) {
      warnings.push(`Kit "${kit.name}": missing preview file (one OGG preview per kit is required)`);
    }

    // Check unique filenames
    for (const sample of kit.samples) {
      if (allFilenames.has(sample.filename)) {
        errors.push(`Duplicate sample filename across expansion: "${sample.filename}"`);
      }
      allFilenames.add(sample.filename);
    }
  }

  if (pkg.kits.length > 20) {
    warnings.push(`Expansion has ${pkg.kits.length} kits. Around 10 is recommended.`);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

// ============================================================================
// Leap Effects (Global FX Chain)
// ============================================================================

/**
 * Leap global effects chain structure.
 * Two sections: Insert FX (creative) and Main FX (dynamics).
 * Two send effect slots: Delay (A) and Reverb (B).
 */
export const LEAP_EFFECTS_CHAIN = {
  INSERT_FX: {
    description: 'Creative insert effects, can be bypassed per sample',
    position: 'pre-send',
  },
  MAIN_FX: {
    description: 'Dynamics processing on master output',
    position: 'post-send',
  },
  SEND_A: {
    name: 'Delay',
    description: 'Send effect slot A - Delay',
    macroIndex: LEAP_MACRO_CONFIG.RESERVED_MACRO_DELAY,
  },
  SEND_B: {
    name: 'Reverb',
    description: 'Send effect slot B - Reverb',
    macroIndex: LEAP_MACRO_CONFIG.RESERVED_MACRO_REVERB,
  },
} as const;
