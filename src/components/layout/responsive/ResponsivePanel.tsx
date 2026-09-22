/**
 * How one panel degrades on a phone.
 *
 * Phase 3 of thoughts/shared/plans/2026-09-22-responsive-mobile.md. Before it,
 * "mobile" was a SECOND COMPONENT TREE: below the phone threshold
 * `TrackerView` returned `MobileTrackerView` and never reached its own return,
 * so twelve panels — the Dub Deck among them — were not narrow on a phone,
 * they were not mounted. Nothing you can write in CSS fixes an unmounted
 * component.
 *
 * One tree now, and each panel says what happens to it when the screen is a
 * phone:
 *
 *   keep      render as-is (it already fits, or it collapses itself)
 *   hide      not worth the space; the information is available elsewhere
 *   collapse  a disclosure header the user can open in place
 *   sheet     moved into a BottomSheet, reachable from `MobilePanelBar`
 *
 * Off a phone the component renders its children and nothing else — no
 * wrapper element — so the desktop tree is byte-for-byte the layout it was.
 */
import React, { useEffect, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { useResponsiveSafe } from '@/contexts/ResponsiveContext';
import { useMobilePanelStore } from '@stores/useMobilePanelStore';
import { BottomSheet } from '@components/ui/BottomSheet';

export type PhoneBehaviour = 'keep' | 'hide' | 'collapse' | 'sheet';

export interface ResponsivePanelProps {
  /** Stable id — also the sheet's identity in the panel registry. */
  id: string;
  /** Full English words: the disclosure label, button label and sheet title. */
  title: string;
  phone: PhoneBehaviour;
  /** `collapse` only: start expanded. Default closed, which is the point. */
  defaultExpanded?: boolean;
  /** `sheet` only: position in the panel bar. */
  order?: number;
  children: React.ReactNode;
}

export const ResponsivePanel: React.FC<ResponsivePanelProps> = ({
  id,
  title,
  phone,
  defaultExpanded = false,
  order = 0,
  children,
}) => {
  const { isPhone } = useResponsiveSafe();
  const [expanded, setExpanded] = useState(defaultExpanded);

  const openPanelId = useMobilePanelStore((s) => s.openPanelId);
  const closePanel = useMobilePanelStore((s) => s.closePanel);

  // Register only while this really is a sheet, so the bar never offers a
  // button for a panel that is currently rendered inline.
  const isSheet = isPhone && phone === 'sheet';
  useEffect(() => {
    if (!isSheet) return;
    const { registerPanel, unregisterPanel } = useMobilePanelStore.getState();
    registerPanel({ id, title, order });
    return () => unregisterPanel(id);
  }, [isSheet, id, title, order]);

  if (!isPhone || phone === 'keep') return <>{children}</>;

  if (phone === 'hide') return null;

  if (phone === 'collapse') {
    return (
      <div className="flex-shrink-0 border-b border-dark-border">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="w-full flex items-center gap-1 px-2 py-1.5 bg-dark-bgSecondary text-text-secondary hover:bg-dark-bgHover"
          aria-expanded={expanded}
        >
          {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          <span className="text-[10px] font-mono uppercase tracking-wide">{title}</span>
        </button>
        {expanded && <div className="max-h-[40vh] overflow-auto">{children}</div>}
      </div>
    );
  }

  // sheet
  return (
    <BottomSheet isOpen={openPanelId === id} onClose={closePanel} title={title}>
      {children}
    </BottomSheet>
  );
};

export default ResponsivePanel;
