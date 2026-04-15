/**
 * NKS Auto-Mapper
 *
 * Automatically applies NKS parameter mappings when a MIDI controller connects.
 * Uses the comprehensive synth parameter maps to configure CC mappings without
 * requiring manual MIDI Learn.
 *
 * Benefits:
 * - Zero-configuration: CC mappings applied automatically
 * - Hardware display: Parameter names shown on MPK Mini/Maschine OLED
 * - Full coverage: All synth parameters pre-mapped
 * - Smart paging: Supports multi-page controllers
 */

import type { SynthType } from '@typedefs/instrument';
import { getNKSParametersForSynth, buildNKSPages } from './performance/synthParameterMaps';
import { useMIDIStore } from '@/stores/useMIDIStore';
import { updateNKSDisplay } from './performance/AkaiMIDIProtocol';
import type { MappableParameter } from './types';

/**
 * Auto-apply all NKS CC mappings for a synth
 *
 * @param synthType - Synth to map (e.g., 'TB303', 'OBXd', 'Dexed')
 * @returns Number of parameters mapped
 */
export function applyNKSMappingsForSynth(synthType: SynthType): number {
  const params = getNKSParametersForSynth(synthType);
  const midiStore = useMIDIStore.getState();

  let mappedCount = 0;

  // Apply CC mapping for each parameter that has a CC number
  for (const param of params) {
    if (!param.ccNumber) continue;
    if (param.isAutomatable === false) continue;

    try {
      // Extract parameter key from id (e.g., 'tb303.cutoff' → 'cutoff')
      // For simple synths, the ID IS the parameter key
      // For complex synths, extract the last segment
      const paramKey = param.id.includes('.') 
        ? param.id.split('.').pop()! 
        : param.id;

      midiStore.setMapping({
        ccNumber: param.ccNumber,
        parameter: paramKey as MappableParameter,
        min: param.min,
        max: param.max,
        curve: 'linear', // Default to linear curve
      });

      mappedCount++;
    } catch (err) {
      console.warn(`[NKSAutoMapper] Failed to map ${param.id}:`, err);
    }
  }

  console.log(`✅ [NKSAutoMapper] Auto-mapped ${mappedCount} CCs for ${synthType}`);
  return mappedCount;
}

/**
 * Configure controller knobs for a specific NKS page
 *
 * @param synthType - Synth type
 * @param pageIndex - Page index (0-based)
 * @returns Array of knob assignments for this page
 */
export function applyNKSPageToController(
  synthType: SynthType,
  pageIndex: number = 0
): Array<{ knobIndex: number; ccNumber: number; paramId: string; name: string }> {
  const params = getNKSParametersForSynth(synthType);
  const pages = buildNKSPages(params);

  if (pageIndex >= pages.length) {
    console.warn(`[NKSAutoMapper] Page ${pageIndex} does not exist for ${synthType}`);
    return [];
  }

  const page = pages[pageIndex];
  const pageParams = page.parameters.slice(0, 8); // Max 8 knobs

  // Build knob assignments
  const assignments = pageParams.map((param, i) => ({
    knobIndex: i,
    ccNumber: param.ccNumber || 0,
    paramId: param.id,
    name: param.name,
  }));

  // Update hardware display (MPK Mini, Maschine, etc.)
  try {
    const pages = buildNKSPages(getNKSParametersForSynth(synthType));
    updateNKSDisplay(synthType, pageIndex, pages.length, pageParams);
  } catch (err) {
    // Hardware display update is optional — controller may not support it
    console.debug(`[NKSAutoMapper] Display update not available:`, err);
  }

  console.log(`✅ [NKSAutoMapper] Configured page ${pageIndex} (${page.name}) with ${assignments.length} knobs`);
  return assignments;
}

/**
 * Auto-apply NKS mappings when switching to a new instrument
 *
 * Call this when:
 * - User selects a different instrument
 * - User opens synth editor
 * - Active view changes (tracker → synth editor)
 *
 * @param synthType - New synth type
 * @param pageIndex - Page to load (default: 0)
 */
export function syncNKSToSynth(synthType: SynthType, pageIndex: number = 0): void {
  applyNKSMappingsForSynth(synthType);
  applyNKSPageToController(synthType, pageIndex);
}

/**
 * Get total number of pages for a synth
 *
 * @param synthType - Synth type
 * @returns Number of NKS pages (8 params per page)
 */
export function getNKSPageCount(synthType: SynthType): number {
  const params = getNKSParametersForSynth(synthType);
  const pages = buildNKSPages(params);
  return pages.length;
}

/**
 * Navigate to next NKS page for current synth
 *
 * @param synthType - Current synth
 * @param currentPage - Current page index
 * @returns New page index (wraps around)
 */
export function nextNKSPage(synthType: SynthType, currentPage: number): number {
  const pageCount = getNKSPageCount(synthType);
  const nextPage = (currentPage + 1) % pageCount;
  applyNKSPageToController(synthType, nextPage);
  return nextPage;
}

/**
 * Navigate to previous NKS page for current synth
 *
 * @param synthType - Current synth
 * @param currentPage - Current page index
 * @returns New page index (wraps around)
 */
export function prevNKSPage(synthType: SynthType, currentPage: number): number {
  const pageCount = getNKSPageCount(synthType);
  const prevPage = (currentPage - 1 + pageCount) % pageCount;
  applyNKSPageToController(synthType, prevPage);
  return prevPage;
}

/**
 * Check if a synth has NKS parameter mappings
 *
 * @param synthType - Synth type to check
 * @returns True if synth has NKS mappings
 */
export function hasNKSMappings(synthType: SynthType): boolean {
  const params = getNKSParametersForSynth(synthType);
  return params.length > 0 && params.some(p => p.ccNumber !== undefined);
}

/**
 * Get list of all synths with NKS mappings
 *
 * @returns Array of synth types that have NKS parameter maps
 */
export function getNKSEnabledSynths(): SynthType[] {
  // This would need to iterate through all synth types
  // For now, return the known ones with complete maps
  return [
    'TB303',
    'OBXd',
    'Dexed',
    'Helm',
    'DubSiren',
    'SpaceLaser',
    'Synare',
    'MonoSynth',
    'DuoSynth',
    'PolySynth',
    'FMSynth',
    'ToneAM',
    'SuperSaw',
    'Organ',
    'DrumMachine',
    // ... (all synths in SYNTH_PARAMETER_MAPS)
  ] as SynthType[];
}
