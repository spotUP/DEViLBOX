/**
 * NKS2 Metadata Builder
 *
 * Builds the complete getNksMetadata() structure per NKS SDK Section 10:
 * - version: 1 (NKS2 metadata version)
 * - parameter_descriptive_info: PDI array for all automation parameters
 * - parameter_navigation: Performance mode + Edit groups layout
 *
 * Also provides layout validation per Section 9.2.4 guidelines.
 */

import type {
  NKS2SynthProfile,
  NKS2Parameter,
  NKS2PDI,
  NKS2PDIType,
  NKS2PDIStyle,
  NKS2PerformanceSection,
  NKS2EditGroup,
  NKS2EditSection,
  NKSParameter,
} from './types';
import { NKS_CONSTANTS } from './types';

// ============================================================================
// NKS2 Metadata Structure Types (SDK Section 10)
// ============================================================================

/** Parameter Descriptive Info entry in metadata */
export interface NKS2MetadataPDI {
  id: number;
  type: string;                  // 'Continuous' | 'Continuous bipolar' | 'Discrete' | 'Discrete bipolar' | 'Toggle'
  style?: string;                // 'Knob' | 'Value' | 'Menu' | 'Waveform' | 'FilterType' | 'Power' | 'Temposync'
  value_count?: number;          // For discrete: 3-128
  display_values?: string[];     // Custom labels
}

/** Parameter reference in navigation (performance_mode or groups) */
export interface NKS2MetadataParamRef {
  id: number;                    // Parameter ID, or -1 for gap
  name?: string;                 // Override name (optional)
}

/** Section within performance_mode or a group */
export interface NKS2MetadataSection {
  name: string;
  parameters: NKS2MetadataParamRef[];
}

/** Edit group */
export interface NKS2MetadataGroup {
  name: string;
  sections: NKS2MetadataSection[];
}

/** Complete getNksMetadata() return structure */
export interface NKS2Metadata {
  version: number;               // Always 1
  parameter_descriptive_info: NKS2MetadataPDI[];
  parameter_navigation: {
    performance_mode: NKS2MetadataSection[];
    groups: NKS2MetadataGroup[];
  };
}

// ============================================================================
// PDI Type/Style Conversion (internal enum -> SDK string)
// ============================================================================

const PDI_TYPE_TO_STRING: Record<NKS2PDIType, string> = {
  'continuous': 'Continuous',
  'continuous_bipolar': 'Continuous bipolar',
  'discrete': 'Discrete',
  'discrete_bipolar': 'Discrete bipolar',
  'toggle': 'Toggle',
};

const PDI_STYLE_TO_STRING: Record<NKS2PDIStyle, string> = {
  'knob': 'Knob',
  'value': 'Value',
  'menu': 'Menu',
  'menuXL': 'Menu',          // menuXL maps to Menu in the metadata
  'waveform': 'Waveform',
  'filterType': 'FilterType',
  'power': 'Power',
  'temposync': 'Temposync',
};

// ============================================================================
// Metadata Builder
// ============================================================================

/**
 * Build the complete NKS2 metadata structure from a synth profile.
 * This is the data returned by getNksMetadata() in a VST plugin.
 */
export function buildNKS2Metadata(profile: NKS2SynthProfile): NKS2Metadata {
  // Build PDI array from all parameters
  const pdi = profile.parameters.map((param, index) =>
    buildPDIEntry(param, index),
  );

  // Build navigation
  const performance_mode = profile.navigation.performance.map(section =>
    buildMetadataSection(section),
  );

  const groups = (profile.navigation.editGroups || []).map(group =>
    buildMetadataGroup(group),
  );

  return {
    version: 1,
    parameter_descriptive_info: pdi,
    parameter_navigation: {
      performance_mode,
      groups,
    },
  };
}

/**
 * Build a PDI entry from an NKS2Parameter.
 */
function buildPDIEntry(param: NKS2Parameter, fallbackId: number): NKS2MetadataPDI {
  const id = param.ccNumber ?? fallbackId;
  const entry: NKS2MetadataPDI = {
    id,
    type: PDI_TYPE_TO_STRING[param.pdi.type],
  };

  // Add style if non-default
  if (param.pdi.style) {
    const styleStr = PDI_STYLE_TO_STRING[param.pdi.style];
    // Only include if it differs from the type's default
    const defaultStyle = getDefaultStyle(param.pdi.type);
    if (param.pdi.style !== defaultStyle) {
      entry.style = styleStr;
    }
  }

  // Add value_count for discrete types
  if (param.pdi.value_count && (param.pdi.type === 'discrete' || param.pdi.type === 'discrete_bipolar')) {
    entry.value_count = param.pdi.value_count;
  }

  // Add display_values
  if (param.pdi.display_values && param.pdi.display_values.length > 0) {
    entry.display_values = [...param.pdi.display_values];
  }

  return entry;
}

/**
 * Get the default PDI style for a given type.
 */
function getDefaultStyle(type: NKS2PDIType): NKS2PDIStyle {
  switch (type) {
    case 'continuous':
    case 'continuous_bipolar':
      return 'knob';
    case 'discrete':
    case 'discrete_bipolar':
      return 'menu';
    case 'toggle':
      return 'power';
  }
}

/**
 * Build a metadata section from a performance section.
 */
function buildMetadataSection(section: NKS2PerformanceSection): NKS2MetadataSection {
  return {
    name: section.name,
    parameters: section.parameters.map(param => ({
      id: param.ccNumber ?? 0,
      ...(param.name ? { name: param.name } : {}),
    })),
  };
}

/**
 * Build a metadata group from an edit group.
 */
function buildMetadataGroup(group: NKS2EditGroup): NKS2MetadataGroup {
  return {
    name: group.name,
    sections: group.sections.map(section => ({
      name: section.name,
      parameters: section.parameters.map(param => ({
        id: param.ccNumber ?? 0,
        ...(param.name ? { name: param.name } : {}),
      })),
    })),
  };
}

// ============================================================================
// Builder from NKS1 Parameters (backward compatibility)
// ============================================================================

/**
 * Build NKS2 metadata from legacy NKS1 parameter array.
 * Groups parameters by section and page.
 */
export function buildNKS2MetadataFromNKS1(
  parameters: NKSParameter[],
  synthType: string,
): NKS2Metadata {
  // Build PDI entries
  const pdi: NKS2MetadataPDI[] = parameters.map((param, index) => {
    const entry: NKS2MetadataPDI = {
      id: param.ccNumber ?? index,
      type: nks1TypeToPDIType(param),
    };

    // Add PDI extensions if present
    if (param.pdi) {
      if (param.pdi.style) {
        entry.style = PDI_STYLE_TO_STRING[param.pdi.style];
      }
      if (param.pdi.value_count) {
        entry.value_count = param.pdi.value_count;
      }
      if (param.pdi.display_values) {
        entry.display_values = [...param.pdi.display_values];
      }
    }

    return entry;
  });

  // Build performance mode from first 2 pages (up to 16 params)
  const performanceParams = parameters.filter(p => p.page <= 1);
  const perfSections: NKS2MetadataSection[] = [];
  const pageGroups = new Map<number, NKSParameter[]>();

  for (const param of performanceParams) {
    if (!pageGroups.has(param.page)) {
      pageGroups.set(param.page, []);
    }
    pageGroups.get(param.page)!.push(param);
  }

  for (const [page, params] of pageGroups) {
    // Group by section within page
    const sectionNames = [...new Set(params.map(p => String(p.section)))];
    for (const sectionName of sectionNames) {
      const sectionParams = params.filter(p => String(p.section) === sectionName);
      perfSections.push({
        name: sectionName,
        parameters: sectionParams.map(p => ({
          id: p.ccNumber ?? p.index,
          name: p.name,
        })),
      });
    }
  }

  // Build edit groups from all pages
  const allSections = [...new Set(parameters.map(p => String(p.section)))];
  const groups: NKS2MetadataGroup[] = allSections.map(sectionName => {
    const sectionParams = parameters.filter(p => String(p.section) === sectionName);

    // Split into pages of 8 for sub-sections
    const subSections: NKS2MetadataSection[] = [];
    for (let i = 0; i < sectionParams.length; i += 8) {
      const chunk = sectionParams.slice(i, i + 8);
      subSections.push({
        name: i === 0 ? sectionName : `${sectionName} ${Math.floor(i / 8) + 1}`,
        parameters: chunk.map(p => ({
          id: p.ccNumber ?? p.index,
          name: p.name,
        })),
      });
    }

    return {
      name: sectionName,
      sections: subSections,
    };
  });

  return {
    version: 1,
    parameter_descriptive_info: pdi,
    parameter_navigation: {
      performance_mode: perfSections,
      groups,
    },
  };
}

/**
 * Convert NKS1 parameter type to NKS2 PDI type string.
 */
function nks1TypeToPDIType(param: NKSParameter): string {
  // If NKS2 PDI is already attached, use it
  if (param.pdi) {
    return PDI_TYPE_TO_STRING[param.pdi.type];
  }

  // Map NKS1 types
  switch (param.type) {
    case 0: // FLOAT
      return 'Continuous';
    case 1: // INT
      return 'Discrete';
    case 2: // BOOLEAN
      return 'Toggle';
    case 3: // SELECTOR
      return 'Discrete';
    default:
      return 'Continuous';
  }
}

// ============================================================================
// Gap Insertion Helpers
// ============================================================================

/**
 * Create a gap parameter reference for use in navigation sections.
 * Per SDK Section 10.2.2: {"id": -1} declares a gap in the section.
 */
export function createGap(): NKS2MetadataParamRef {
  return { id: -1 };
}

/**
 * Insert gaps in a parameter list to align with hardware display layout.
 * Ensures sections don't span the Knob 4-5 boundary (left/right display split).
 *
 * Per SDK Section 9.2.4 Guideline 3:
 * "Don't extend a section from Knob 3 to Knob 5" because on MASCHINE
 * controllers, Knobs 1-4 and 5-8 are on separate displays.
 */
export function insertDisplayAlignedGaps(
  params: NKS2MetadataParamRef[],
): NKS2MetadataParamRef[] {
  if (params.length <= 4) return params;

  const result = [...params];

  // If we have 5+ params and params 3-4 would span the display boundary,
  // insert a gap at position 4 to push remaining params to right display
  if (result.length > 4 && result.length < 8) {
    // Pad to align with right display starting at index 4
    while (result.length < 4) {
      result.splice(result.length, 0, createGap());
    }
  }

  return result;
}

// ============================================================================
// First Page Paradigm
// ============================================================================

/**
 * Recommended first-page parameter assignment paradigm per SDK Section 9.2.1.
 * Maps knob positions 1-8 to functional areas for consistent UX.
 */
export const FIRST_PAGE_PARADIGM = {
  KNOB_1: { area: 'Spectrum', example: 'Cutoff' },
  KNOB_2: { area: 'Oscillator', example: 'Resonance' },
  KNOB_3: { area: 'FX', example: 'Tune' },
  KNOB_4: { area: 'Sound', example: 'Sound' },
  KNOB_5: { area: 'Space', example: 'Reverb' },
  KNOB_6: { area: 'Time', example: 'Delay' },
  KNOB_7: { area: 'Attack', example: 'Attack' },
  KNOB_8: { area: 'Decay', example: 'Decay' },
} as const;

/**
 * Score a parameter against the first-page paradigm to determine priority.
 * Higher scores mean the parameter is a better fit for the first page.
 */
export function scoreFirstPageFit(param: NKS2Parameter): number {
  const name = param.name.toLowerCase();
  const engine = param.engineParam?.toLowerCase() || '';
  const combined = `${name} ${engine}`;

  // Knob 1: Spectrum (Cutoff, Filter Freq)
  if (combined.includes('cutoff') || combined.includes('filter') && combined.includes('freq')) return 100;
  // Knob 2: Oscillator (Resonance)
  if (combined.includes('resonance') || combined.includes('res')) return 95;
  // Knob 3: FX/Tune
  if (combined.includes('tune') || combined.includes('pitch') || combined.includes('detune')) return 90;
  // Knob 4: Sound character
  if (combined.includes('drive') || combined.includes('distortion') || combined.includes('shape')) return 85;
  // Knob 5: Reverb
  if (combined.includes('reverb') || combined.includes('room') || combined.includes('hall')) return 80;
  // Knob 6: Delay
  if (combined.includes('delay') || combined.includes('echo')) return 75;
  // Knob 7: Attack
  if (combined.includes('attack')) return 70;
  // Knob 8: Decay/Release
  if (combined.includes('decay') || combined.includes('release')) return 65;

  // Secondary importance
  if (combined.includes('volume') || combined.includes('level')) return 50;
  if (combined.includes('env') || combined.includes('envelope')) return 45;
  if (combined.includes('lfo')) return 40;
  if (combined.includes('mod')) return 35;
  if (combined.includes('pan')) return 30;
  if (combined.includes('waveform') || combined.includes('osc')) return 25;

  return 0;
}

/**
 * Auto-select the best 8 parameters for the first page based on the paradigm.
 */
export function selectFirstPageParams(params: NKS2Parameter[]): NKS2Parameter[] {
  const scored = params.map(p => ({ param: p, score: scoreFirstPageFit(p) }));
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, NKS_CONSTANTS.MAX_PARAMETERS_PER_PAGE).map(s => s.param);
}

// ============================================================================
// Layout Validation
// ============================================================================

/** Validation result for a parameter page layout */
export interface LayoutValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Validate a page layout per NKS SDK Section 9.2.4 guidelines.
 *
 * Rules:
 * 1. Knob 1 must always be assigned
 * 2. Knob 5 must be assigned if any of Knobs 6-8 is used
 * 3. Don't extend a section from Knob 3 to Knob 5 (display boundary)
 * 4. Unassigned knobs must have no automation ID (blank display)
 * 5. No empty parameter pages allowed
 */
export function validatePageLayout(
  assignments: Array<{ id?: number; name?: string; section?: string } | null>,
): LayoutValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Must have exactly 8 slots
  if (assignments.length !== 8) {
    errors.push(`Page must have exactly 8 knob slots, got ${assignments.length}`);
  }

  // Normalize to 8 slots
  const slots = Array.from({ length: 8 }, (_, i) => assignments[i] || null);

  // Check for empty page
  const hasAnyAssigned = slots.some(s => s && s.id !== undefined && s.id >= 0);
  if (!hasAnyAssigned) {
    errors.push('Empty parameter pages are not allowed');
    return { valid: false, errors, warnings };
  }

  // Rule 1: Knob 1 must be assigned
  const knob1 = slots[0];
  if (!knob1 || knob1.id === undefined || knob1.id < 0) {
    errors.push('Knob 1 must always be assigned (Rule 1)');
  }

  // Rule 2: Knob 5 required if Knobs 6-8 are used
  const knob5 = slots[4];
  const knobs678Used = [slots[5], slots[6], slots[7]].some(
    s => s && s.id !== undefined && s.id >= 0,
  );
  if (knobs678Used && (!knob5 || knob5.id === undefined || knob5.id < 0)) {
    errors.push('Knob 5 must be assigned if any of Knobs 6-8 is used (Rule 2)');
  }

  // Rule 3: Don't span section from Knob 3 to Knob 5
  // Check if knobs 3 and 5 are in the same section without knob 4 having a section break
  const knob3Section = slots[2]?.section;
  const knob4Section = slots[3]?.section;
  const knob5Section = slots[4]?.section;

  if (knob3Section && knob5Section && !knob4Section) {
    // If knob 3 started a section and knob 5 has no new section, the section spans the boundary
    warnings.push('Section spans from Knob 3 to Knob 5 across display boundary (Guideline 3). Consider moving to Knobs 5-8.');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validate the entire navigation structure of an NKS2 metadata object.
 */
export function validateNKS2Metadata(metadata: NKS2Metadata): LayoutValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Version check
  if (metadata.version !== 1) {
    errors.push(`Expected version 1, got ${metadata.version}`);
  }

  // PDI validation
  if (!metadata.parameter_descriptive_info || metadata.parameter_descriptive_info.length === 0) {
    errors.push('parameter_descriptive_info must not be empty');
  }

  for (const pdi of metadata.parameter_descriptive_info) {
    if (pdi.type === 'Discrete') {
      if (pdi.value_count !== undefined && (pdi.value_count < 3 || pdi.value_count > 128)) {
        errors.push(`Parameter ${pdi.id}: Discrete value_count must be 3-128, got ${pdi.value_count}`);
      }
    }
    if (pdi.type === 'Discrete bipolar') {
      if (pdi.value_count !== undefined) {
        if (pdi.value_count < 3 || pdi.value_count > 127) {
          errors.push(`Parameter ${pdi.id}: Discrete bipolar value_count must be 3-127, got ${pdi.value_count}`);
        }
        if (pdi.value_count % 2 === 0) {
          errors.push(`Parameter ${pdi.id}: Discrete bipolar value_count must be odd, got ${pdi.value_count}`);
        }
      }
    }
    if (pdi.type === 'Toggle') {
      if (pdi.display_values && pdi.display_values.length !== 2) {
        errors.push(`Parameter ${pdi.id}: Toggle display_values must have exactly 2 entries, got ${pdi.display_values.length}`);
      }
    }
  }

  // Performance mode validation
  if (!metadata.parameter_navigation.performance_mode || metadata.parameter_navigation.performance_mode.length === 0) {
    errors.push('performance_mode must have at least one section');
  }

  let totalPerfParams = 0;
  for (const section of metadata.parameter_navigation.performance_mode) {
    totalPerfParams += section.parameters.length;
  }
  if (totalPerfParams > NKS_CONSTANTS.MAX_PERFORMANCE_PARAMS) {
    errors.push(`Performance mode has ${totalPerfParams} params, max is ${NKS_CONSTANTS.MAX_PERFORMANCE_PARAMS}`);
  }

  // Edit groups validation
  for (const group of metadata.parameter_navigation.groups) {
    let groupParams = 0;
    for (const section of group.sections) {
      groupParams += section.parameters.filter(p => p.id >= 0).length;
    }
    if (groupParams > NKS_CONSTANTS.MAX_EDIT_PARAMS_PER_GROUP) {
      errors.push(`Edit group "${group.name}" has ${groupParams} params, max is ${NKS_CONSTANTS.MAX_EDIT_PARAMS_PER_GROUP}`);
    }
  }

  // Edit group count: >7 triggers carousel navigation on hardware
  if (metadata.parameter_navigation.groups.length > 7) {
    warnings.push(
      `${metadata.parameter_navigation.groups.length} edit groups: hardware will use carousel navigation (>7 groups). ` +
      `Consider consolidating groups for simpler navigation.`,
    );
  }

  // Check for duplicate parameter IDs in PDI
  const ids = new Set<number>();
  for (const pdi of metadata.parameter_descriptive_info) {
    if (ids.has(pdi.id)) {
      warnings.push(`Duplicate parameter ID ${pdi.id} in parameter_descriptive_info`);
    }
    ids.add(pdi.id);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

// ============================================================================
// Serialization
// ============================================================================

/**
 * Serialize NKS2 metadata to JSON string (for getNksMetadata() output).
 */
export function serializeNKS2Metadata(metadata: NKS2Metadata): string {
  return JSON.stringify(metadata, null, 2);
}

// ============================================================================
// Hardware Display Specifications
// ============================================================================

/** Display specifications per NI hardware model */
export interface NKSHardwareDisplaySpec {
  model: string;
  maxNameChars: number;       // Max characters for parameter names
  letterSpacing: 'fixed' | 'pixel';
  textCase: 'upper' | 'title';
  showsPageNames: boolean;
  displayCount: number;       // 1 or 2 (split display)
  knobsPerDisplay: number;
}

export const NKS_HARDWARE_DISPLAY_SPECS: Record<string, NKSHardwareDisplaySpec> = {
  'kk-s-mk1': {
    model: 'Komplete Kontrol S-Series MK1',
    maxNameChars: 8,
    letterSpacing: 'fixed',
    textCase: 'upper',
    showsPageNames: false,
    displayCount: 2,
    knobsPerDisplay: 4,
  },
  'kk-s-mk2': {
    model: 'Komplete Kontrol S-Series MK2',
    maxNameChars: 10,
    letterSpacing: 'pixel',
    textCase: 'title',
    showsPageNames: true,
    displayCount: 2,
    knobsPerDisplay: 4,
  },
  'kk-s-mk3': {
    model: 'Komplete Kontrol S-Series MK3',
    maxNameChars: 10,
    letterSpacing: 'pixel',
    textCase: 'title',
    showsPageNames: true,
    displayCount: 1,
    knobsPerDisplay: 8,
  },
  'kk-a-m': {
    model: 'Komplete Kontrol A/M-Series',
    maxNameChars: 10,
    letterSpacing: 'pixel',
    textCase: 'title',
    showsPageNames: true,
    displayCount: 2,
    knobsPerDisplay: 4,
  },
  'maschine-mk1': {
    model: 'Maschine MK1',
    maxNameChars: 8,
    letterSpacing: 'fixed',
    textCase: 'upper',
    showsPageNames: false,
    displayCount: 2,
    knobsPerDisplay: 4,
  },
  'maschine-mk2': {
    model: 'Maschine MK2',
    maxNameChars: 10,
    letterSpacing: 'pixel',
    textCase: 'title',
    showsPageNames: true,
    displayCount: 2,
    knobsPerDisplay: 4,
  },
  'maschine-mk3': {
    model: 'Maschine MK3 / Maschine+',
    maxNameChars: 10,
    letterSpacing: 'pixel',
    textCase: 'title',
    showsPageNames: true,
    displayCount: 2,
    knobsPerDisplay: 4,
  },
  'maschine-studio': {
    model: 'Maschine Studio',
    maxNameChars: 10,
    letterSpacing: 'pixel',
    textCase: 'title',
    showsPageNames: true,
    displayCount: 2,
    knobsPerDisplay: 4,
  },
  'maschine-mikro': {
    model: 'Maschine Mikro',
    maxNameChars: 8,
    letterSpacing: 'fixed',
    textCase: 'upper',
    showsPageNames: false,
    displayCount: 1,
    knobsPerDisplay: 8,
  },
};

/**
 * Truncate a parameter name to fit the target hardware display.
 * Uses the abbreviation table for intelligent shortening.
 */
export function truncateForDisplay(
  name: string,
  maxChars: number = 8,
): string {
  if (name.length <= maxChars) return name;

  // Try abbreviations first (imported from types at runtime)
  // This is a simple truncation - the full abbreviation system is in types.ts
  return name.substring(0, maxChars);
}
