/**
 * MobileTabBar - Bottom navigation for mobile devices
 * Three tabs: Pattern, Instruments, Controls
 */

import React from 'react';
import { Grid3X3, Music2, SlidersHorizontal } from 'lucide-react';

export type MobileTab = 'pattern' | 'instruments' | 'controls';

interface MobileTabBarProps {
  activeTab: MobileTab;
  onTabChange: (tab: MobileTab) => void;
}

interface TabConfig {
  id: MobileTab;
  label: string;
  icon: React.ReactNode;
}

const tabs: TabConfig[] = [
  { id: 'pattern', label: 'Pattern', icon: <Grid3X3 size={20} /> },
  { id: 'instruments', label: 'Instruments', icon: <Music2 size={20} /> },
  { id: 'controls', label: 'Controls', icon: <SlidersHorizontal size={20} /> },
];

export const MobileTabBar: React.FC<MobileTabBarProps> = ({
  activeTab,
  onTabChange,
}) => {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-dark-bgSecondary border-t border-dark-border safe-area-bottom">
      <div className="flex items-stretch">
        {tabs.filter(tab => tab && tab.icon).map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`
                flex-1 flex flex-col items-center justify-center gap-1
                py-2 min-h-[56px] transition-colors
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
              <span className="text-[10px] font-medium">{tab.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};

export default MobileTabBar;
