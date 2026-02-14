/**
 * AppLayout - Main application layout container
 */

import React from 'react';
import { NavBar } from './NavBar';
import { MobileMenu } from './MobileMenu';
import { useResponsive } from '@/hooks/useResponsive';

interface AppLayoutProps {
  children: React.ReactNode;
  onShowSettings?: () => void;
  onShowExport?: () => void;
  onShowHelp?: () => void;
  onShowMasterFX?: () => void;
  onShowPatterns?: () => void;
}

export const AppLayout: React.FC<AppLayoutProps> = ({
  children,
  onShowSettings,
  onShowExport,
  onShowHelp,
  onShowMasterFX,
  onShowPatterns,
}) => {
  const { isMobile } = useResponsive();

  return (
    <div className="h-screen flex flex-col bg-dark-bg text-text-primary overflow-y-hidden">
      {/* Top Navigation Bar - Hidden on mobile */}
      <div className={isMobile ? 'hidden' : 'block'}>
        <NavBar />
      </div>

      {/* Mobile Hamburger Menu - Only shown on mobile */}
      {isMobile && (
        <MobileMenu
          onShowSettings={onShowSettings}
          onShowExport={onShowExport}
          onShowHelp={onShowHelp}
          onShowMasterFX={onShowMasterFX}
          onShowPatterns={onShowPatterns}
        />
      )}

      {/* Main Content Area */}
      <main className="flex-1 flex min-h-0 overflow-y-hidden">
        {children}
      </main>
    </div>
  );
};
