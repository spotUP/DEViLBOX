/**
 * Which desktop panels are reachable on a phone, and which one is open.
 *
 * Phase 3 of thoughts/shared/plans/2026-09-22-responsive-mobile.md. A panel
 * that `ResponsivePanel` relocates into a sheet registers itself here on
 * mount; `MobilePanelBar` reads the registry to draw one button per panel, so
 * a panel becomes reachable by declaring how it degrades and nothing else.
 *
 * The registry is presentation state only — no panel's DATA lives here.
 */
import { create } from 'zustand';

export interface MobilePanelEntry {
  id: string;
  /** Full English words, as the button label and the sheet title. */
  title: string;
  /** Order in the bar; lower first. Ties fall back to registration order. */
  order: number;
}

interface MobilePanelState {
  panels: MobilePanelEntry[];
  openPanelId: string | null;
  registerPanel: (entry: MobilePanelEntry) => void;
  unregisterPanel: (id: string) => void;
  openPanel: (id: string) => void;
  closePanel: () => void;
  togglePanel: (id: string) => void;
}

export const useMobilePanelStore = create<MobilePanelState>((set) => ({
  panels: [],
  openPanelId: null,

  registerPanel: (entry) =>
    set((s) => {
      const without = s.panels.filter((p) => p.id !== entry.id);
      return { panels: [...without, entry].sort((a, b) => a.order - b.order) };
    }),

  unregisterPanel: (id) =>
    set((s) => ({
      panels: s.panels.filter((p) => p.id !== id),
      // A panel that unmounts while open must not leave the sheet stuck open
      // over a panel that no longer exists.
      openPanelId: s.openPanelId === id ? null : s.openPanelId,
    })),

  openPanel: (id) => set({ openPanelId: id }),
  closePanel: () => set({ openPanelId: null }),
  togglePanel: (id) => set((s) => ({ openPanelId: s.openPanelId === id ? null : id })),
}));
