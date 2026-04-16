/**
 * MobileTabBar - Bottom navigation for mobile devices
 * 5 tabs: Pattern, Instruments, Mixer, Arrangement, Pads
 * Tap to switch view. Long-press for contextual quick actions.
 */

import React, { useCallback, useState, useRef } from 'react';
import { Grid3X3, Music2, Disc3 } from 'lucide-react';
import { useUIStore } from '@stores/useUIStore';
import { useTrackerStore } from '@stores/useTrackerStore';
import { haptics } from '@/utils/haptics';
import { MOBILE_TAB_BAR_VIEWS } from '@/constants/viewOptions';

export type MobileTab = 'tracker' | 'instruments' | 'drumpad';

interface MobileTabBarProps {
  onShowInstruments?: () => void;
}

interface TabConfig {
  id: MobileTab;
  label: string;
  icon: React.ReactNode;
  isModal?: boolean;
}

interface QuickAction {
  label: string;
  action: () => void;
  destructive?: boolean;
}

// Icons for tab bar views (keyed by view value)
const TAB_ICONS: Record<string, React.ReactNode> = {
  tracker: <Grid3X3 size={20} />,
  drumpad: <Disc3 size={20} />,
};

// Build tabs from single source of truth, insert the special "instruments" modal tab after tracker
const tabs: TabConfig[] = (() => {
  const viewTabs: TabConfig[] = MOBILE_TAB_BAR_VIEWS.map(v => ({
    id: v.value as MobileTab,
    label: v.shortLabel,
    icon: TAB_ICONS[v.value] || <Grid3X3 size={20} />,
  }));
  // Insert instruments tab after the first tab (tracker)
  viewTabs.splice(1, 0, { id: 'instruments', label: 'Instr', icon: <Music2 size={20} />, isModal: true });
  return viewTabs;
})();

function getQuickActions(tabId: MobileTab): QuickAction[] {
  switch (tabId) {
    case 'tracker':
      return [
        { label: 'New Pattern', action: () => useTrackerStore.getState().addPattern() },
        { label: 'Duplicate Pattern', action: () => useTrackerStore.getState().duplicatePattern(useTrackerStore.getState().currentPatternIndex) },
        { label: 'Clear Pattern', action: () => useTrackerStore.getState().clearPattern(), destructive: true },
      ];
    default:
      return [];
  }
}

export const MobileTabBar: React.FC<MobileTabBarProps> = ({
  onShowInstruments,
}) => {
  const activeView = useUIStore((s) => s.activeView);
  const [quickActions, setQuickActions] = useState<{ actions: QuickAction[]; tabId: MobileTab } | null>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleTabChange = useCallback((tab: MobileTab) => {
    haptics.selection();
    if (tab === 'instruments') {
      onShowInstruments?.();
      return;
    }
    useUIStore.getState().setActiveView(tab as Exclude<MobileTab, 'instruments'>);
  }, [onShowInstruments]);

  const handlePointerDown = useCallback((tab: MobileTab) => {
    longPressTimer.current = setTimeout(() => {
      const actions = getQuickActions(tab);
      if (actions.length > 0) {
        haptics.heavy();
        setQuickActions({ actions, tabId: tab });
      }
    }, 500);
  }, []);

  const handlePointerUp = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  const handleQuickAction = useCallback((action: () => void) => {
    haptics.success();
    action();
    setQuickActions(null);
  }, []);

  return (
    <>
      <nav className="fixed bottom-0 left-0 right-0 z-[99990] bg-dark-bgSecondary border-t border-dark-border safe-area-bottom">
        <div className="flex items-stretch">
          {tabs.map((tab) => {
            const isActive = !tab.isModal && activeView === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => handleTabChange(tab.id)}
                onPointerDown={() => handlePointerDown(tab.id)}
                onPointerUp={handlePointerUp}
                onPointerLeave={handlePointerUp}
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

      {/* Quick actions popup — shown on long-press */}
      {quickActions && (
        <div
          className="fixed inset-0 z-[99991]"
          onClick={() => setQuickActions(null)}
        >
          <div
            className="absolute bottom-[60px] left-2 right-2 bg-dark-bgTertiary border border-dark-border rounded-xl shadow-2xl overflow-hidden animate-fade-in safe-area-bottom"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-3 py-2 border-b border-dark-border">
              <span className="text-[10px] font-mono text-text-muted uppercase tracking-wider">
                Quick Actions
              </span>
            </div>
            {quickActions.actions.map((action, i) => (
              <button
                key={i}
                onClick={() => handleQuickAction(action.action)}
                className={`w-full text-left px-4 py-3 text-sm transition-colors active:bg-dark-bgHover ${
                  action.destructive ? 'text-accent-error' : 'text-text-primary'
                }`}
              >
                {action.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );
};

export default MobileTabBar;
