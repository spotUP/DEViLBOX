/**
 * NavBar - Top navigation bar with app title, tabs, and controls
 */

import React, { useState, useEffect } from 'react';
import { useProjectStore, useAudioStore, useTabsStore, useThemeStore, themes } from '@stores';
import { useAuthStore } from '@stores/useAuthStore';
import { useCollaborationStore } from '@stores/useCollaborationStore';
import { BUILD_HASH, BUILD_DATE, BUILD_NUMBER } from '@constants/version';
import { Plus, X, Palette, Download, LogIn, LogOut, Cloud, Users } from 'lucide-react';
import { MIDIToolbarDropdown } from '@components/midi/MIDIToolbarDropdown';
import { DownloadModal } from '@components/dialogs/DownloadModal';
import { AuthModal } from '@components/dialogs/AuthModal';
import { CollaborationModal } from '@components/collaboration/CollaborationModal';
import { Button } from '@components/ui/Button';
import { isElectron } from '@utils/electron';

const NavBarComponent: React.FC = () => {
  // PERFORMANCE OPTIMIZATION: Use individual selectors to prevent unnecessary re-renders
  const metadata = useProjectStore((state) => state.metadata);
  const isDirty = useProjectStore((state) => state.isDirty);

  const masterVolume = useAudioStore((state) => state.masterVolume);
  const setMasterVolume = useAudioStore((state) => state.setMasterVolume);

  const tabs = useTabsStore((state) => state.tabs);
  const activeTabId = useTabsStore((state) => state.activeTabId);
  const addTab = useTabsStore((state) => state.addTab);
  const closeTab = useTabsStore((state) => state.closeTab);
  const setActiveTab = useTabsStore((state) => state.setActiveTab);
  const updateTabName = useTabsStore((state) => state.updateTabName);
  const markTabDirty = useTabsStore((state) => state.markTabDirty);

  const currentThemeId = useThemeStore((state) => state.currentThemeId);
  const setTheme = useThemeStore((state) => state.setTheme);
  const getCurrentTheme = useThemeStore((state) => state.getCurrentTheme);

  const [showThemeMenu, setShowThemeMenu] = useState(false);
  const [showDownloadModal, setShowDownloadModal] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showCollabModal, setShowCollabModal] = useState(false);

  // Collab state
  const collabStatus = useCollaborationStore((s) => s.status);
  const collabViewMode = useCollaborationStore((s) => s.viewMode);
  const setCollabViewMode = useCollaborationStore((s) => s.setViewMode);

  const handleCollabClick = () => {
    if (collabStatus === 'connected' && collabViewMode === 'split') {
      // Already in split view — just focus it (no-op)
      return;
    }
    if (collabStatus === 'connected') {
      // Switch to split view
      setCollabViewMode('split');
    } else {
      // Show modal to create/join room
      setShowCollabModal(true);
    }
  };

  // Auth state
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const isServerAvailable = useAuthStore((state) => state.isServerAvailable);
  const checkServerAvailability = useAuthStore((state) => state.checkServerAvailability);

  // Check server availability on mount
  useEffect(() => {
    checkServerAvailability();
  }, [checkServerAvailability]);

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


  const currentTheme = getCurrentTheme();

  // Sync tab name with project metadata
  useEffect(() => {
    if (metadata.name && activeTabId) {
      updateTabName(activeTabId, metadata.name);
    }
  }, [metadata.name, activeTabId, updateTabName]);

  // Sync tab dirty state with project
  useEffect(() => {
    if (activeTabId) {
      markTabDirty(activeTabId, isDirty);
    }
  }, [isDirty, activeTabId, markTabDirty]);

  // Auto-close collab modal when connection succeeds
  useEffect(() => {
    if (collabStatus === 'connected') {
      setShowCollabModal(false);
    }
  }, [collabStatus]);

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

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value, 10);
    setMasterVolume(value);
  };

  const handleAddTab = () => {
    addTab();
  };

  const handleCloseTab = (e: React.MouseEvent, tabId: string) => {
    e.stopPropagation();
    closeTab(tabId);
  };

  return (
    <div className="bg-dark-bgSecondary border-b border-dark-border relative z-40">
      {/* Top Bar: Title and Volume */}
      <nav className="flex items-center justify-between px-4 py-2 border-b border-dark-border">
        {/* Left: App Title */}
        <div className="flex items-center gap-4">
          <h1 className="font-bold text-lg tracking-tight">
            <span className="text-accent-primary">DEViLBOX</span>
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
          {!isElectron() && isServerAvailable && (
            <div className="relative" data-user-menu>
              {user ? (
                // Logged in - show user dropdown
                <>
                  <button
                    onClick={() => setShowUserMenu(!showUserMenu)}
                    className="flex items-center gap-2 px-2 py-1 rounded text-text-secondary hover:text-text-primary hover:bg-dark-bgHover transition-colors"
                    title={`Logged in as ${user.username}`}
                  >
                    <Cloud size={16} className="text-accent-success" />
                    <span className="text-sm hidden sm:inline">{user.username}</span>
                  </button>
                  {showUserMenu && (
                    <div className="absolute right-0 top-full mt-1 bg-dark-bgTertiary border border-dark-border rounded-md shadow-lg z-50 min-w-[160px]">
                      <div className="px-3 py-2 border-b border-dark-border">
                        <p className="text-xs text-text-muted">Signed in as</p>
                        <p className="text-sm font-medium text-text-primary truncate">{user.username}</p>
                      </div>
                      <button
                        onClick={() => {
                          logout();
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
                  <span className="hidden sm:inline">Sign In</span>
                </Button>
              )}
            </div>
          )}

          {/* Collab Button */}
          <Button
            variant={collabStatus === 'connected' ? 'primary' : 'ghost'}
            size="sm"
            onClick={handleCollabClick}
            icon={<Users size={14} />}
            iconPosition="left"
            title={collabStatus === 'connected' ? 'Collaboration active' : 'Start live collaboration'}
          >
            <span className="hidden sm:inline">
              {collabStatus === 'connected' ? 'Collab' : 'Collab'}
            </span>
            {collabStatus === 'connected' && (
              <span className="w-1.5 h-1.5 rounded-full bg-accent-success animate-pulse ml-1" />
            )}
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
              <span className="text-sm">{currentTheme.name}</span>
            </button>
            {showThemeMenu && (
              <div className="absolute right-0 top-full mt-1 bg-dark-bgTertiary border border-dark-border rounded-md shadow-lg z-50 min-w-[140px]">
                {themes.map((theme) => (
                  <button
                    key={theme.id}
                    onClick={() => {
                      setTheme(theme.id);
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
            value={masterVolume}
            onChange={handleVolumeChange}
            min="-60"
            max="0"
            step="1"
            className="w-24"
            title={`Volume: ${masterVolume} dB`}
          />
        </div>
      </nav>

      {/* Tab Bar */}
      <div className="flex items-center px-2 py-1 border-b border-dark-border bg-dark-bgTertiary">
        {/* Tabs */}
        <div className="flex items-center gap-1 flex-1 overflow-x-auto scrollbar-none">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`
                group flex items-center gap-2 px-3 py-1.5 rounded-t-md text-sm font-medium
                transition-all duration-150 min-w-0 max-w-[200px]
                ${activeTabId === tab.id
                  ? 'bg-dark-bg text-text-primary border-t border-x border-dark-border -mb-px'
                  : 'bg-dark-bgSecondary text-text-secondary hover:text-text-primary hover:bg-dark-bg/50'
                }
              `}
            >
              <span className="truncate">
                {tab.name || 'Untitled'}
                {tab.isDirty && <span className="text-accent-primary ml-1">*</span>}
              </span>
              {tabs.length > 1 && (
                <span
                  onClick={(e) => handleCloseTab(e, tab.id)}
                  className={`
                    flex-shrink-0 p-0.5 rounded hover:bg-dark-border/50
                    ${activeTabId === tab.id ? 'opacity-60 hover:opacity-100' : 'opacity-0 group-hover:opacity-60 hover:!opacity-100'}
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
      </div>

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
    </div>
  );
};

// PERFORMANCE: Wrap in React.memo to prevent unnecessary re-renders
export const NavBar = React.memo(NavBarComponent);