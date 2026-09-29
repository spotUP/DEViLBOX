import type { MasterFxPreset } from '@constants/fxPresets';

/** The words a preset answers to: its name, description, category and the effects in it. */
function haystack(p: MasterFxPreset): string {
  return [p.name, p.description, p.category, ...p.effects.map((e) => e.type)].join(' ').toLowerCase();
}

/**
 * Factory presets grouped by category (categories and names alphabetical),
 * keeping only presets that contain every word of `query`.
 */
export function groupMasterPresets(presets: readonly MasterFxPreset[], query: string): [string, MasterFxPreset[]][] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const groups = new Map<string, MasterFxPreset[]>();
  for (const p of presets) {
    if (words.length > 0) {
      const text = haystack(p);
      if (!words.every((w) => text.includes(w))) continue;
    }
    const list = groups.get(p.category) ?? [];
    list.push(p);
    groups.set(p.category, list);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([cat, list]) => [cat, [...list].sort((a, b) => a.name.localeCompare(b.name))]);
}

/** User presets whose name contains every word of `query`. */
export function filterUserPresets<T extends { name: string }>(presets: readonly T[], query: string): T[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  return presets.filter((p) => words.every((w) => p.name.toLowerCase().includes(w)));
}
