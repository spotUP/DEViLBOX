/**
 * Per-effect user preset storage — localStorage CRUD.
 * Key: 'devilbox:fx-presets:<effectType>' → JSON array of EffectPreset.
 */

import type { EffectPreset } from '@typedefs/instrument';

const KEY_PREFIX = 'devilbox:fx-presets:';

export function getUserPresets(effectType: string): EffectPreset[] {
  try {
    const raw = localStorage.getItem(KEY_PREFIX + effectType);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export function saveUserPreset(effectType: string, preset: EffectPreset): void {
  const presets = getUserPresets(effectType);
  // Replace if name exists, else append
  const idx = presets.findIndex(p => p.name === preset.name);
  if (idx >= 0) presets[idx] = preset;
  else presets.push(preset);
  localStorage.setItem(KEY_PREFIX + effectType, JSON.stringify(presets));
}

export function deleteUserPreset(effectType: string, name: string): void {
  const presets = getUserPresets(effectType).filter(p => p.name !== name);
  localStorage.setItem(KEY_PREFIX + effectType, JSON.stringify(presets));
}
