/**
 * TabStrip - one row of tab buttons (role=tablist). Shared by the DJ deck panel
 * tabs and the deck FX pad pages, so a tab looks and behaves one way.
 * Wraps rather than overflows: a long strip never widens its container.
 */

export interface TabStripTab<Id extends string> {
  id: Id;
  label: string;
  title?: string;
}

export interface TabStripProps<Id extends string> {
  tabs: ReadonlyArray<TabStripTab<Id>>;
  active: Id;
  onChange: (id: Id) => void;
  ariaLabel: string;
  className?: string;
  /** Tighter tab padding, for a strip that must stay on one row in a narrow column. */
  dense?: boolean;
}

export function TabStrip<Id extends string>({ tabs, active, onChange, ariaLabel, className = '', dense = false }: TabStripProps<Id>) {
  return (
    <div role="tablist" aria-label={ariaLabel} className={`flex flex-wrap items-center gap-1 min-w-0 ${className}`}>
      {tabs.map((tab) => {
        const selected = tab.id === active;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(tab.id)}
            title={tab.title}
            className={`flex-1 whitespace-nowrap ${dense ? 'px-1' : 'px-2.5'} py-1 rounded text-xs font-bold transition-colors ${
              selected
                ? 'bg-accent-primary/20 text-accent-primary border border-accent-primary/40'
                : 'bg-dark-bgTertiary text-text-muted border border-dark-border hover:text-text-secondary'
            }`}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
