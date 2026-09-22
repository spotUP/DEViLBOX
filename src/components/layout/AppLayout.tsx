/**
 * AppLayout - Main application layout container
 */

import React from 'react';
import { NavBar } from './NavBar';
import { MobileMenu } from './MobileMenu';
import { MobileTabBar } from './MobileTabBar';
import { useResponsiveSafe } from '@/contexts/ResponsiveContext';
import { useUIStore } from '@/stores';

interface AppLayoutProps {
  children: React.ReactNode;
  onShowSettings?: () => void;
  onShowExport?: () => void;
  onShowHelp?: () => void;
  onShowMasterFX?: () => void;
  onShowPatterns?: () => void;
  onLoad?: () => void;
  onSave?: () => void;
  onNew?: () => void;
  onClear?: () => void;
  onShowInstruments?: () => void;
  onShowPatternOrder?: () => void;
  onShowDrumpads?: () => void;
  onShowGrooveSettings?: () => void;
  onShowAuth?: () => void;
}

export const AppLayout: React.FC<AppLayoutProps> = ({
  children,
  onShowSettings,
  onShowExport,
  onShowHelp,
  onShowMasterFX,
  onShowPatterns,
  onLoad,
  onSave,
  onNew,
  onClear,
  onShowInstruments,
  onShowPatternOrder,
  onShowDrumpads,
  onShowGrooveSettings,
  onShowAuth,
}) => {
  // Phone chrome (hamburger + bottom tab bar) follows the D1 signal:
  // a coarse pointer AND a small screen. See src/hooks/useBreakpoint.ts.
  const { isPhone } = useResponsiveSafe();
  const activeView = useUIStore((s) => s.activeView);
  const isFullscreenView = activeView === 'vj';

  return (
    <div className="h-screen w-screen flex flex-col bg-dark-bg text-text-primary overflow-hidden">
      {/* Top Navigation Bar - Hidden on mobile and in fullscreen views (VJ) */}
      {!isFullscreenView && (
        <div className={isPhone ? 'hidden' : 'block'}>
          <NavBar />
        </div>
      )}

      {/* Mobile Hamburger Menu - Only shown on mobile */}
      {isPhone && (
        <MobileMenu
          onShowSettings={onShowSettings}
          onShowExport={onShowExport}
          onShowHelp={onShowHelp}
          onShowMasterFX={onShowMasterFX}
          onShowPatterns={onShowPatterns}
          onLoad={onLoad}
          onSave={onSave}
          onNew={onNew}
          onClear={onClear}
          onShowInstruments={onShowInstruments}
          onShowPatternOrder={onShowPatternOrder}
          onShowDrumpads={onShowDrumpads}
          onShowGrooveSettings={onShowGrooveSettings}
          onShowAuth={onShowAuth}
        />
      )}

      {/* Main Content Area — add bottom padding on mobile for tab bar */}
      <main
        key={isPhone ? activeView : 'desktop'}
        className={`flex-1 flex min-h-0 min-w-0 overflow-hidden ${isPhone ? 'mobile-bottom-padding animate-fade-in-fast' : ''}`}
      >
        {children}
      </main>

      {/* Mobile Bottom Tab Bar */}
      {isPhone && (
        <MobileTabBar onShowInstruments={onShowInstruments} />
      )}
    </div>
  );
};
