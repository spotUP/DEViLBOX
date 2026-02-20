/**
 * AppLayout - Main application layout container
 */

import React from 'react';
import { NavBar } from './NavBar';
import { MobileMenu } from './MobileMenu';
import { useResponsive } from '@/hooks/useResponsive';
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
  const { isMobile } = useResponsive();
  const activeView = useUIStore((s) => s.activeView);
  const isDJ = activeView === 'dj';

  return (
    <div className="h-screen w-screen flex flex-col bg-dark-bg text-text-primary overflow-hidden">
      {/* Top Navigation Bar - Hidden on mobile and in DJ mode */}
      {!isDJ && (
        <div className={isMobile ? 'hidden' : 'block'}>
          <NavBar />
        </div>
      )}

      {/* Mobile Hamburger Menu - Only shown on mobile */}
      {isMobile && (
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

      {/* Main Content Area */}
      <main className="flex-1 flex min-h-0 min-w-0 overflow-hidden">
        {children}
      </main>
    </div>
  );
};
