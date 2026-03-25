/**
 * MobileTabBar - Bottom navigation for mobile devices
 * Integrates with useUIStore.activeView for view switching.
 * Instruments tab opens the modal rather than switching view.
 */

import React, { useCallback } from 'react';
import { Grid3X3, Music2, Sliders, LayoutList, Piano, Disc3 } from 'lucide-react';
import { useUIStore } from '@stores/useUIStore';

export type MobileTab = 'tracker' | 'instruments' | 'mixer' | 'arrangement' | 'pianoroll' | 'drumpad';

interface MobileTabBarProps {
  onShowInstruments?: () => void;
}

interface TabConfig {
  id: MobileTab;
  label: string;
  icon: React.ReactNode;
  /** If true, opens a modal instead of switching activeView */
  isModal?: boolean;
}

const tabs: TabConfig[] = [
  { id: 'tracker', label: 'Pattern', icon: <Grid3X3 size={20} /> },
  { id: 'instruments', label: 'Instr', icon: <Music2 size={20} />, isModal: true },
  { id: 'mixer', label: 'Mixer', icon: <Sliders size={20} /> },
  { id: 'arrangement', label: 'Arrange', icon: <LayoutList size={20} /> },
  { id: 'pianoroll', label: 'Piano', icon: <Piano size={20} /> },
  { id: 'drumpad', label: 'Pads', icon: <Disc3 size={20} /> },
];

export const MobileTabBar: React.FC<MobileTabBarProps> = ({
  onShowInstruments,
}) => {
  const activeView = useUIStore((s) => s.activeView);

  const handleTabChange = useCallback((tab: MobileTab) => {
    if (tab === 'instruments') {
      // Open instruments modal instead of switching view
      onShowInstruments?.();
      return;
    }
    // All other tabs map directly to activeView values
    useUIStore.getState().setActiveView(tab as Exclude<MobileTab, 'instruments'>);
  }, [onShowInstruments]);

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-[99990] bg-dark-bgSecondary border-t border-dark-border safe-area-bottom">
      <div className="flex items-stretch overflow-x-auto scrollbar-none">
        {tabs.map((tab) => {
          const isActive = !tab.isModal && activeView === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => handleTabChange(tab.id)}
              className={`
                flex-1 flex flex-col items-center justify-center gap-0.5
                py-1.5 min-h-[52px] min-w-[60px] transition-colors
                ${isActive
                  ? 'text-accent-primary bg-accent-primary/10'
                  : 'text-text-muted hover:text-text-secondary active:bg-dark-bgTertiary'
                }
              `}
              aria-current={isActive ? 'page' : undefined}
            >
              <span className={isActive ? 'scale-110 transition-transform' : ''}>
                {tab.icon}
              </span>
              <span className="text-[9px] font-medium">{tab.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};

export default MobileTabBar;
