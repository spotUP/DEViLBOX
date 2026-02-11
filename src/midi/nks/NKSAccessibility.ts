/**
 * NKS Accessibility Support
 *
 * Implements accessibility features per NKS SDK Section 5:
 * - Text-to-speech for parameter names and values
 * - Hierarchical parameter organization for screen readers
 * - Accessibility mode detection for supported hardware
 * - Clear labeling and description guidelines
 *
 * Supported hardware accessibility modes:
 * - Komplete Kontrol MK2: Shift+Mixer
 * - Komplete Kontrol A/M-series: Shift+Ideas
 * - Maschine MK3/+: External Accessibility Helper app
 */

import type {
  NKSParameter,
  NKS2Parameter,
  NKS2PDI,
  NKSAccessibilityConfig,
} from './types';
import { NKS_PARAM_ABBREVIATIONS } from './types';

// ============================================================================
// Text-to-Speech
// ============================================================================

/** Active speech synthesis instance */
let speechEnabled = false;

/**
 * Enable or disable text-to-speech for NKS parameter announcements.
 * Uses the browser's built-in SpeechSynthesis API.
 */
export function setAccessibilityEnabled(enabled: boolean): void {
  speechEnabled = enabled;
  if (enabled) {
    speak('NKS accessibility enabled');
  }
}

/**
 * Check if accessibility mode is currently active.
 */
export function isAccessibilityEnabled(): boolean {
  return speechEnabled;
}

/**
 * Check if the browser supports speech synthesis.
 */
export function isSpeechSynthesisSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

/**
 * Speak a text string using the browser's speech synthesis.
 * Cancels any currently speaking utterance.
 */
export function speak(text: string, priority: 'polite' | 'assertive' = 'polite'): void {
  if (!speechEnabled || !isSpeechSynthesisSupported()) return;

  const synth = window.speechSynthesis;

  if (priority === 'assertive') {
    synth.cancel(); // Interrupt current speech
  }

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 1.1;  // Slightly faster for parameter scanning
  utterance.pitch = 1.0;
  utterance.volume = 0.8;

  synth.speak(utterance);
}

/**
 * Stop all current speech.
 */
export function stopSpeaking(): void {
  if (isSpeechSynthesisSupported()) {
    window.speechSynthesis.cancel();
  }
}

// ============================================================================
// Parameter Announcements
// ============================================================================

/**
 * Announce a parameter name and its current value.
 * Per SDK Section 5: "Clear, non-abbreviated labeling"
 */
export function announceParameter(name: string, value: string, unit?: string): void {
  const fullName = expandAbbreviation(name);
  const text = unit ? `${fullName}: ${value} ${unit}` : `${fullName}: ${value}`;
  speak(text);
}

/**
 * Announce a page change.
 */
export function announcePage(pageName: string, pageIndex: number, totalPages: number): void {
  speak(`Page ${pageIndex + 1} of ${totalPages}: ${pageName}`, 'assertive');
}

/**
 * Announce a synth/instrument change.
 */
export function announceInstrument(synthType: string, presetName?: string): void {
  const parts = [synthType];
  if (presetName) parts.push(presetName);
  speak(parts.join(', '), 'assertive');
}

/**
 * Announce a parameter value change with its PDI type context.
 */
export function announceParameterChange(
  name: string,
  value: number,
  pdi?: NKS2PDI,
): void {
  const fullName = expandAbbreviation(name);
  let valueText: string;

  if (pdi) {
    switch (pdi.type) {
      case 'toggle':
        valueText = value >= 0.5 ? 'on' : 'off';
        break;
      case 'discrete':
      case 'discrete_bipolar':
        if (pdi.display_values && pdi.value_count) {
          const index = Math.round(value * (pdi.value_count - 1));
          valueText = pdi.display_values[Math.min(index, pdi.display_values.length - 1)] || `step ${index}`;
        } else {
          valueText = `${Math.round(value * (pdi.value_count || 1))}`;
        }
        break;
      case 'continuous_bipolar':
        valueText = `${((value * 2 - 1) * 100).toFixed(0)} percent`;
        break;
      default:
        valueText = `${(value * 100).toFixed(0)} percent`;
    }
  } else {
    valueText = `${(value * 100).toFixed(0)} percent`;
  }

  speak(`${fullName}: ${valueText}`);
}

/**
 * Announce navigation to an Edit group.
 */
export function announceEditGroup(groupName: string, groupIndex: number, totalGroups: number): void {
  speak(`Group ${groupIndex + 1} of ${totalGroups}: ${groupName}`, 'assertive');
}

// ============================================================================
// Parameter Descriptions
// ============================================================================

/**
 * Expand parameter name abbreviations for spoken output.
 * Per SDK Section 5.1.4: use clear, non-abbreviated labeling.
 */
export function expandAbbreviation(name: string): string {
  // Build reverse lookup: abbreviation -> full name
  for (const [full, abbrev] of Object.entries(NKS_PARAM_ABBREVIATIONS)) {
    if (name === abbrev || name.includes(abbrev)) {
      return name.replace(abbrev, full);
    }
  }
  return name;
}

/**
 * Generate a screen-reader-friendly description of a parameter.
 */
export function describeParameter(param: NKSParameter | NKS2Parameter): string {
  const parts = [expandAbbreviation(param.name)];

  // Add type description
  if ('pdi' in param && param.pdi) {
    switch (param.pdi.type) {
      case 'continuous':
        parts.push('continuous control');
        break;
      case 'continuous_bipolar':
        parts.push('bipolar control, center is neutral');
        break;
      case 'discrete':
        if (param.pdi.value_count) {
          parts.push(`selector with ${param.pdi.value_count} options`);
        }
        break;
      case 'toggle':
        parts.push('on off switch');
        break;
    }

    if (param.pdi.style === 'waveform') {
      parts.push('waveform selector');
    } else if (param.pdi.style === 'filterType') {
      parts.push('filter type selector');
    }
  }

  // Add unit info
  if (param.unit) {
    parts.push(`measured in ${param.unit}`);
  }

  return parts.join(', ');
}

// ============================================================================
// Hierarchical Parameter Organization
// ============================================================================

/**
 * Build accessibility config from NKS parameters.
 * Groups parameters into logical sections for screen reader navigation.
 */
export function buildAccessibilityConfig(
  parameters: NKSParameter[],
): NKSAccessibilityConfig {
  const descriptions: Record<string, string> = {};
  const groupMap = new Map<string, string[]>();

  for (const param of parameters) {
    descriptions[param.id] = describeParameter(param);

    const section = String(param.section);
    if (!groupMap.has(section)) {
      groupMap.set(section, []);
    }
    groupMap.get(section)!.push(param.id);
  }

  const groups = Array.from(groupMap.entries()).map(([name, parameterIds]) => ({
    name,
    description: `${name} parameters, ${parameterIds.length} controls`,
    parameterIds,
  }));

  return {
    textToSpeechEnabled: speechEnabled,
    parameterDescriptions: descriptions,
    groups,
  };
}

/**
 * Build accessibility config from NKS2 parameters.
 */
export function buildNKS2AccessibilityConfig(
  parameters: NKS2Parameter[],
): NKSAccessibilityConfig {
  const descriptions: Record<string, string> = {};
  const groups: NKSAccessibilityConfig['groups'] = [];

  // Single flat group for NKS2 params (groups come from NKS2Navigation)
  const ids: string[] = [];

  for (const param of parameters) {
    descriptions[param.id] = describeParameter(param);
    ids.push(param.id);
  }

  groups.push({
    name: 'All Parameters',
    description: `${ids.length} available controls`,
    parameterIds: ids,
  });

  return {
    textToSpeechEnabled: speechEnabled,
    parameterDescriptions: descriptions,
    groups,
  };
}

// ============================================================================
// ARIA Support
// ============================================================================

/**
 * Generate ARIA attributes for an NKS parameter control.
 * For use in React components rendering NKS parameters.
 */
export function getAriaAttributes(
  param: NKSParameter | NKS2Parameter,
  currentValue: number,
): Record<string, string> {
  const attrs: Record<string, string> = {
    'role': 'slider',
    'aria-label': expandAbbreviation(param.name),
    'aria-valuemin': '0',
    'aria-valuemax': '1',
    'aria-valuenow': currentValue.toFixed(3),
  };

  if ('pdi' in param && param.pdi) {
    switch (param.pdi.type) {
      case 'toggle':
        attrs['role'] = 'switch';
        attrs['aria-checked'] = currentValue >= 0.5 ? 'true' : 'false';
        delete attrs['aria-valuemin'];
        delete attrs['aria-valuemax'];
        delete attrs['aria-valuenow'];
        break;
      case 'discrete':
        attrs['role'] = 'listbox';
        if (param.pdi.display_values && param.pdi.value_count) {
          const index = Math.round(currentValue * (param.pdi.value_count - 1));
          attrs['aria-valuetext'] = param.pdi.display_values[index] || '';
        }
        break;
    }
  }

  if (param.unit) {
    const text = attrs['aria-valuetext'] || `${(currentValue * 100).toFixed(0)}%`;
    attrs['aria-valuetext'] = `${text} ${param.unit}`;
  }

  return attrs;
}
