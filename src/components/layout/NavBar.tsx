/**
 * NavBar - Top navigation bar with app title, tabs, and controls
 */

import React, { useState, useEffect } from 'react';
import { useThemeStore, themes } from '@stores';
import { BUILD_HASH, BUILD_DATE, BUILD_NUMBER } from '@constants/version';
import { Plus, X, Palette, Download, LogIn, LogOut, Cloud, Users, Monitor, Settings } from 'lucide-react';
import { MIDIToolbarDropdown } from '@components/midi/MIDIToolbarDropdown';
import { DJSetBrowser } from '@components/dj/DJSetBrowser';
import { DownloadModal } from '@components/dialogs/DownloadModal';
import { SettingsModal } from '@components/dialogs/SettingsModal';
import { AuthModal } from '@components/dialogs/AuthModal';
import { CollaborationModal } from '@components/collaboration/CollaborationModal';
import { Button } from '@components/ui/Button';
import { isElectron } from '@utils/electron';
import { useNavBar } from '@hooks/views/useNavBar';
import { VIEW_OPTIONS, switchView } from '@/constants/viewOptions';
import { useUIStore } from '@stores';

const NavBarComponent: React.FC = () => {
  const n = useNavBar();

  const currentThemeId = useThemeStore((state) => state.currentThemeId);
  const editorFullscreen = useUIStore((state) => state.editorFullscreen);

  const [showThemeMenu, setShowThemeMenu] = useState(false);
  const [showDownloadModal, setShowDownloadModal] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showCollabModal, setShowCollabModal] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  // Auto-close collab modal when connection succeeds (DOM-local modal state)
  useEffect(() => {
    if (n.collabStatus === 'connected') {
      setShowCollabModal(false);
    }
  }, [n.collabStatus]);

  // Close user menu when clicking outside
  useEffect(() => {
    if (!showUserMenu) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('[data-user-menu]')) {
        setShowUserMenu(false);
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [showUserMenu]);

  // Close theme menu when clicking outside
  useEffect(() => {
    if (!showThemeMenu) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('[data-theme-menu]')) {
        setShowThemeMenu(false);
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [showThemeMenu]);

  const handleCollabClick = () => {
    if (n.collabStatus === 'connected' && n.collabViewMode === 'split') {
      return;
    }
    if (n.collabStatus === 'connected') {
      n.handleOpenCollab();
    } else {
      setShowCollabModal(true);
    }
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    n.setMasterVolume(parseInt(e.target.value, 10));
  };

  const handleAddTab = () => {
    n.addTab();
  };

  const handleCloseTab = (e: React.MouseEvent, tabId: string) => {
    e.stopPropagation();
    n.closeTab(tabId);
  };

  return (
    <div className="bg-dark-bgSecondary border-b border-dark-border relative z-40">
      {/* Top Bar: Title and Volume */}
      <nav className="flex items-center justify-between px-4 py-2 border-b border-dark-border">
        {/* Left: App Title */}
        <div className="flex items-center gap-4">
          <h1 className="font-bold text-lg tracking-tight">
            <span className="text-text-primary">DEViLBOX</span>
          </h1>
          <span
            className="text-xs font-medium text-text-inverse bg-accent-primary px-2 py-0.5 rounded cursor-help"
            title={`${BUILD_HASH} • ${BUILD_DATE}`}
          >
            1.0.{BUILD_NUMBER}
          </span>
        </div>

        {/* Right: MIDI, Theme Switcher and Master Volume */}
        <div className="flex items-center gap-4">
          {/* Cloud Login/User Button (Web only) */}
          {!isElectron() && n.isServerAvailable && (
            <div className="relative" data-user-menu>
              {n.authUser ? (
                // Logged in - show user dropdown
                <>
                  <button
                    onClick={() => setShowUserMenu(!showUserMenu)}
                    className="flex items-center gap-2 px-2 py-1 rounded text-text-secondary hover:text-text-primary hover:bg-dark-bgHover transition-colors"
                    title={`Logged in as ${n.authUser.username}`}
                  >
                    <Cloud size={16} className="text-accent-success" />
                    <span className="text-sm hidden sm:inline">{n.authUser.username}</span>
                  </button>
                  {showUserMenu && (
                    <div className="absolute right-0 top-full mt-1 bg-dark-bgTertiary border border-dark-border rounded-md shadow-lg z-[99990] min-w-[160px]">
                      <div className="px-3 py-2 border-b border-dark-border">
                        <p className="text-xs text-text-muted">Signed in as</p>
                        <p className="text-sm font-medium text-text-primary truncate">{n.authUser.username}</p>
                      </div>
                      <button
                        onClick={() => {
                          n.logout();
                          setShowUserMenu(false);
                        }}
                        className="w-full text-left px-3 py-2 text-sm text-text-secondary hover:bg-dark-bgHover hover:text-text-primary transition-colors flex items-center gap-2"
                      >
                        <LogOut size={14} />
                        Sign Out
                      </button>
                    </div>
                  )}
                </>
              ) : (
                // Not logged in - show login button
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowAuthModal(true)}
                  icon={<LogIn size={14} />}
                  iconPosition="left"
                  title="Sign in to save files to the cloud"
                >
                  <span className="hidden sm:inline whitespace-nowrap">Sign In</span>
                </Button>
              )}
            </div>
          )}

          {/* Collab Button */}
          <Button
            variant={n.collabStatus === 'connected' ? 'primary' : 'ghost'}
            size="sm"
            onClick={handleCollabClick}
            icon={<Users size={14} />}
            iconPosition="left"
            title={n.collabStatus === 'connected' ? 'Collaboration active' : 'Start live collaboration'}
          >
            <span className="hidden sm:inline">
              {n.collabStatus === 'connected' ? 'Collab' : 'Collab'}
            </span>
            {n.collabStatus === 'connected' && (
              <span className="w-1.5 h-1.5 rounded-full bg-accent-success animate-pulse ml-1" />
            )}
          </Button>

          {/* View Switcher */}
          <select
            value={n.activeView}
            onChange={(e) => switchView(e.target.value, n.activeView)}
            className="bg-dark-bgTertiary text-text-primary text-sm border border-dark-border rounded px-2 py-1 outline-none focus:border-accent-primary"
            title="Switch view"
          >
            {VIEW_OPTIONS.map((v) => (
              <option key={v.value} value={v.value}>{v.label}</option>
            ))}
          </select>

          {/* Settings */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowSettings(true)}
            icon={<Settings size={14} />}
            iconPosition="left"
            title="Settings (Ctrl+,)"
          >
            <span className="hidden sm:inline">Settings</span>
          </Button>

          {/* Download Button (Web only) */}
          {!isElectron() && (
            <Button
              variant="primary"
              size="sm"
              onClick={() => setShowDownloadModal(true)}
              icon={<Download size={14} />}
              iconPosition="left"
              title="Download Desktop App"
            >
              <span className="hidden sm:inline uppercase whitespace-nowrap">Desktop App</span>
            </Button>
          )}

          {/* Switch to DOM mode — only shown when running in GL/WebGL mode */}
          {n.renderMode === 'webgl' && (
            <Button
              variant="ghost"
              size="sm"
              onClick={n.handleSwitchToDom}
              icon={<Monitor size={14} />}
              iconPosition="left"
              title="Switch to DOM rendering mode"
            >
              <span className="hidden sm:inline">DOM</span>
            </Button>
          )}

          {/* Info button moved to FT2 toolbar */}

          {/* DJ Sets — only shown in DJ and VJ views */}
          {(n.activeView === 'dj' || n.activeView === 'vj') && <DJSetBrowser />}

          {/* MIDI Settings */}
          <MIDIToolbarDropdown />

          {/* Theme Switcher */}
          <div className="relative" data-theme-menu>
            <button
              onClick={() => setShowThemeMenu(!showThemeMenu)}
              className="flex items-center gap-2 px-2 py-1 rounded text-text-secondary hover:text-text-primary hover:bg-dark-bgHover transition-colors whitespace-nowrap"
              title="Change theme"
            >
              <Palette size={16} />
              <span className="text-sm">{n.currentTheme.name}</span>
            </button>
            {showThemeMenu && (
              <div className="absolute right-0 top-full mt-1 bg-dark-bgTertiary border border-dark-border rounded-md shadow-lg z-[99990] min-w-[140px]">
                {themes.map((theme) => (
                  <button
                    key={theme.id}
                    onClick={() => {
                      n.setTheme(theme.id);
                      setShowThemeMenu(false);
                    }}
                    className={`
                      w-full text-left px-3 py-2 text-sm transition-colors flex items-center gap-2
                      ${currentThemeId === theme.id
                        ? 'bg-dark-bgActive text-text-primary'
                        : 'text-text-secondary hover:bg-dark-bgHover hover:text-text-primary'
                      }
                    `}
                  >
                    <span
                      className="w-3 h-3 rounded-full border border-dark-borderLight"
                      style={{ backgroundColor: theme.colors.accent }}
                    />
                    {theme.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Master Volume */}
          <input
            type="range"
            value={n.masterVolume}
            onChange={handleVolumeChange}
            min="-60"
            max="0"
            step="1"
            className="w-24"
            title={`Volume: ${n.masterVolume} dB`}
          />
        </div>
      </nav>

      {/* Tab Bar — hidden in DJ/VJ views and editor fullscreen */}
      {n.activeView !== 'dj' && n.activeView !== 'vj' && !editorFullscreen && <div className="flex items-center px-2 py-1 border-b border-dark-border bg-dark-bgTertiary">
        {/* Tabs */}
        <div className="flex items-center gap-1 flex-1 overflow-x-auto scrollbar-none">
          {n.tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => n.setActiveTab(tab.id)}
              className={`
                group flex items-center gap-2 px-3 py-1.5 rounded-t-md text-sm font-medium
                transition-all duration-150 min-w-0 max-w-[200px]
                ${n.activeTabId === tab.id
                  ? 'bg-dark-bg text-text-primary border-t border-x border-dark-border -mb-px'
                  : 'bg-dark-bgSecondary text-text-secondary hover:text-text-primary hover:bg-dark-bg/50'
                }
              `}
            >
              <span className="truncate">
                {tab.name || 'Untitled'}
                {tab.isDirty && <span className="text-accent-primary ml-1">*</span>}
              </span>
              {n.tabs.length > 1 && (
                <span
                  onClick={(e) => handleCloseTab(e, tab.id)}
                  className={`
                    flex-shrink-0 p-0.5 rounded hover:bg-dark-border/50
                    ${n.activeTabId === tab.id ? 'opacity-60 hover:opacity-100' : 'opacity-0 group-hover:opacity-60 hover:!opacity-100'}
                  `}
                >
                  <X size={12} />
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Add Tab Button */}
        <button
          onClick={handleAddTab}
          className="flex-shrink-0 p-1.5 ml-1 rounded hover:bg-dark-border/50 text-text-muted hover:text-text-primary transition-colors"
          title="New project tab"
        >
          <Plus size={16} />
        </button>
      </div>}

      {/* Download Modal */}
      <DownloadModal
        isOpen={showDownloadModal}
        onClose={() => setShowDownloadModal(false)}
      />

      {/* Auth Modal */}
      <AuthModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
      />

      {/* Collaboration Modal */}
      {showCollabModal && (
        <CollaborationModal
          isOpen={showCollabModal}
          onClose={() => setShowCollabModal(false)}
        />
      )}

      {/* Settings Modal */}
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
    </div>
  );
};

// PERFORMANCE: Wrap in React.memo to prevent unnecessary re-renders
export const NavBar = React.memo(NavBarComponent);
