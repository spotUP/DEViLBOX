/**
 * How the Master FX button shows the chain. An enabled master effect changes
 * every song's sound, so the button says so even while its panel is closed
 * (owner, 2026-10-08: four effects were on and nothing in the main UI showed
 * it - "the master fx button in the main ui needs an active state").
 */
export interface MasterFxButtonState {
  /** Enabled effects in the chain. */
  activeCount: number;
  label: string;
  title: string;
  /** Tailwind token classes for the button's colour state. */
  toneClass: string;
}

export function masterFxButtonState(
  effects: readonly { enabled?: boolean; type?: string }[],
  panelOpen: boolean,
): MasterFxButtonState {
  const active = effects.filter((e) => e.enabled !== false);
  const activeCount = active.length;
  const label = activeCount > 0 ? `Master FX (${activeCount})` : 'Master FX';
  const title = activeCount > 0
    ? `Master effects chain: ${active.map((e) => e.type ?? 'effect').join(', ')}`
    : 'Master effects chain (no effects active)';
  // Active uses the app's standard "on" button look (accent fill); an open
  // panel adds a ring on top, so open and active are both visible at once.
  const base = activeCount > 0
    ? 'bg-accent-primary/20 text-accent-primary'
    : 'bg-dark-bgSecondary text-text-secondary hover:text-text-primary';
  const toneClass = panelOpen ? `${base} ring-1 ring-accent-primary` : base;
  return { activeCount, label, title, toneClass };
}
