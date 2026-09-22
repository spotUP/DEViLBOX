/**
 * One button per panel that `ResponsivePanel` moved into a sheet.
 *
 * This is what makes "the Dub Deck exists on a phone" a consequence of the
 * architecture rather than a task someone has to remember: a panel declares
 * `phone="sheet"`, registers itself, and appears here. Phase 3 of
 * thoughts/shared/plans/2026-09-22-responsive-mobile.md.
 */
import React from 'react';
import { useMobilePanelStore } from '@stores/useMobilePanelStore';
import { useResponsiveSafe } from '@/contexts/ResponsiveContext';

export const MobilePanelBar: React.FC = () => {
  const { isPhone } = useResponsiveSafe();
  const panels = useMobilePanelStore((s) => s.panels);
  const openPanelId = useMobilePanelStore((s) => s.openPanelId);
  const togglePanel = useMobilePanelStore((s) => s.togglePanel);

  if (!isPhone || panels.length === 0) return null;

  return (
    <div className="flex-shrink-0 flex items-stretch gap-1 px-1 py-1 overflow-x-auto bg-dark-bgSecondary border-b border-dark-border">
      {panels.map((panel) => (
        <button
          key={panel.id}
          type="button"
          onClick={() => togglePanel(panel.id)}
          aria-pressed={openPanelId === panel.id}
          className={`flex-shrink-0 px-2 min-h-[36px] rounded text-[10px] font-mono uppercase tracking-wide border transition-colors ${
            openPanelId === panel.id
              ? 'bg-accent-primary/20 border-accent-primary text-accent-primary'
              : 'bg-dark-bgTertiary border-dark-borderLight text-text-secondary'
          }`}
        >
          {panel.title}
        </button>
      ))}
    </div>
  );
};

export default MobilePanelBar;
