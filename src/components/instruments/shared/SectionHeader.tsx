/**
 * SectionHeader — Colored accent dot + bold title.
 *
 * Replaces 5+ inline copies across instrument editors and effects.
 * Two sizes: 'sm' (instrument editors) and 'lg' (effect editors, with glow).
 */

interface SectionHeaderProps {
  color: string;
  title: string;
  /** 'sm' = w-1 h-4 dot, text-sm (default). 'lg' = w-1.5 h-5 dot with glow, text-xs font-black. */
  size?: 'sm' | 'lg';
}

export function SectionHeader({ color, title, size = 'sm' }: SectionHeaderProps) {
  if (size === 'lg') {
    return (
      <div className="flex items-center gap-2.5 mb-4">
        <div className="w-1.5 h-5 rounded-full" style={{ backgroundColor: color, boxShadow: `0 0 8px ${color}60` }} />
        <h3 className="text-xs font-black text-white/90 uppercase tracking-[0.15em]">{title}</h3>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2 mb-4">
      <div className="w-1 h-4 rounded-full" style={{ backgroundColor: color }} />
      <h3 className="text-sm font-bold text-text-primary uppercase tracking-wide">{title}</h3>
    </div>
  );
}
