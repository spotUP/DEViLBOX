/**
 * MobileTabBar - Bottom navigation for mobile devices
 * 5 tabs: Pattern, Instruments, Mixer, Arrangement, Pads
 * Instruments tab opens modal. Haptic feedback on switch.
 */

import React, { useCallback } from 'react';
import { Grid3X3, Music2, Sliders, LayoutList, Disc3 } from 'lucide-react';
import { useUIStore } from '@stores/useUIStore';
import { haptics } from '@/utils/haptics';

export type MobileTab = 'tracker' | 'instruments' | 'mixer' | 'arrangement' | 'drumpad';

interface MobileTabBarProps {
  onShowInstruments?: () => void;
}

interface TabConfig {
  id: MobileTab;
  label: string;
  icon: React.ReactNode;
  isModal?: boolean;
}

const tabs: TabConfig[] = [
  { id: 'tracker', label: 'Pattern', icon: <Grid3X3 size={20} /> },
  { id: 'instruments', label: 'Instr', icon: <Music2 size={20} />, isModal: true },
  { id: 'mixer', label: 'Mixer', icon: <Sliders size={20} /> },
  { id: 'arrangement', label: 'Arrange', icon: <LayoutList size={20} /> },
  { id: 'drumpad', label: 'Pads', icon: <Disc3 size={20} /> },
];

export const MobileTabBar: React.FC<MobileTabBarProps> = ({
  onShowInstruments,
}) => {
  const activeView = useUIStore((s) => s.activeView);

  const handleTabChange = useCallback((tab: MobileTab) => {
    haptics.selection();
    if (tab === 'instruments') {
      onShowInstruments?.();
      return;
    }
    useUIStore.getState().setActiveView(tab as Exclude<MobileTab, 'instruments'>);
  }, [onShowInstruments]);

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-[99990] bg-dark-bgSecondary border-t border-dark-border safe-area-bottom">
      <div className="flex items-stretch">
        {tabs.map((tab) => {
          const isActive = !tab.isModal && activeView === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => handleTabChange(tab.id)}
              className={`
                flex-1 flex flex-col items-center justify-center gap-0.5
                py-1.5 min-h-[52px] transition-all active:scale-95
                ${isActive
                  ? 'text-accent-primary bg-accent-primary/10'
                  : 'text-text-muted active:bg-dark-bgTertiary'
                }
              `}
              aria-current={isActive ? 'page' : undefined}
            >
              <span className={`transition-transform ${isActive ? 'scale-110' : ''}`}>
                {tab.icon}
              </span>
              <span className="text-[10px] font-medium">{tab.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};

export default MobileTabBar;
