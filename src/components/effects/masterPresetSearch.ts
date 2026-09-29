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

/** Effects shape needed to fingerprint a chain — matches EffectConfig structurally. */
export interface FingerprintableEffect {
  type: string;
  enabled?: boolean;
  parameters?: Record<string, number | string>;
}

/**
 * A stable identity string for an effects chain: each effect's type, enabled
 * flag and sorted parameters, joined in order. Two chains with the same
 * fingerprint are the same preset — key order inside `parameters` doesn't
 * matter, effect order and enabled/disabled state do.
 */
export function fingerprintMasterEffects(effects: readonly FingerprintableEffect[]): string {
  return effects
    .map((fx) => {
      const params = fx.parameters ?? {};
      const sortedParams = Object.keys(params).sort().map((k) => `${k}=${params[k]}`).join(',');
      return `${fx.type}|${fx.enabled !== false ? 1 : 0}|${sortedParams}`;
    })
    .join('~');
}

/**
 * The factory or user preset whose effects fingerprint-match the current
 * master chain, or `null` when the chain is empty or matches no preset (the
 * caller shows "No FX" / "Custom" for those two cases respectively). Shared
 * by MasterEffectsModal and MasterEffectsPanel so both derive the same
 * "Presets: <name>" label and row highlight from one fingerprinting rule.
 */
export function matchMasterPresetName<
  F extends { name: string; effects: readonly FingerprintableEffect[] },
  U extends { name: string; effects: readonly FingerprintableEffect[] },
>(
  currentEffects: readonly FingerprintableEffect[],
  factoryPresets: readonly F[],
  userPresets: readonly U[],
): string | null {
  if (currentEffects.length === 0) return null;
  const current = fingerprintMasterEffects(currentEffects);
  for (const p of factoryPresets) {
    if (fingerprintMasterEffects(p.effects) === current) return p.name;
  }
  for (const p of userPresets) {
    if (fingerprintMasterEffects(p.effects) === current) return p.name;
  }
  return null;
}

/** The Presets button's label: "No FX" for an empty chain, the matched preset's name, or "Custom". */
export function masterPresetButtonLabel(hasEffects: boolean, matchedName: string | null): string {
  if (!hasEffects) return 'No FX';
  return matchedName ?? 'Custom';
}
