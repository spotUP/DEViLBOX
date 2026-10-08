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
  const toneClass = panelOpen
    ? 'bg-accent-primary/20 text-accent-primary'
    : activeCount > 0
      ? 'bg-accent-warning/15 text-accent-warning border border-accent-warning/50'
      : 'bg-dark-bgSecondary text-text-secondary hover:text-text-primary';
  return { activeCount, label, title, toneClass };
}
