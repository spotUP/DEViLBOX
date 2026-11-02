import type { SynthType } from '../../types/instrument';
import { PRESET_CATEGORIES, type PresetCategory } from './index';
import { isBankVisible } from '../nostalgicPlayerPresets';

/** The categories the preset browser lists for the open song's allowed synth types (null = unlocked project). */
export function visibleFactoryCategories(allowed: readonly SynthType[] | null): PresetCategory[] {
  return (Object.keys(PRESET_CATEGORIES) as PresetCategory[]).filter((c) => isBankVisible(c, allowed));
}
