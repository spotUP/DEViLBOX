/**
 * NavBar - Top navigation bar with app title, tabs, and controls
 */

import React, { useState, useEffect } from 'react';
import { useProjectStore, useAudioStore, useTabsStore, useThemeStore, themes } from '@stores';
import { Plus, X, Palette } from 'lucide-react';
import { Oscilloscope } from '@components/visualization/Oscilloscope';

export const NavBar: React.FC = () => {
  const { metadata, isDirty } = useProjectStore();
  const { masterVolume, setMasterVolume } = useAudioStore();
  const { tabs, activeTabId, addTab, closeTab, setActiveTab, updateTabName, markTabDirty } = useTabsStore();
  const { currentThemeId, setTheme, getCurrentTheme } = useThemeStore();
  const [vizMode, setVizMode] = useState<'waveform' | 'spectrum'>('waveform');
  const [showThemeMenu, setShowThemeMenu] = useState(false);

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
    <div className="bg-dark-bgSecondary border-b border-dark-border">
      {/* Top Bar: Title and Volume */}
      <nav className="flex items-center justify-between px-4 py-2 border-b border-dark-border">
        {/* Left: App Title */}
        <div className="flex items-center gap-4">
          <h1 className="font-bold text-lg tracking-tight">
            <span className="text-accent-primary">DEViL</span><span className="text-text-primary">BOX</span>
          </h1>
          <span className="text-xs font-medium text-text-inverse bg-accent-primary px-2 py-0.5 rounded">
            v1.0.0
          </span>
        </div>

        {/* Right: Theme Switcher and Master Volume */}
        <div className="flex items-center gap-4">
          {/* Theme Switcher */}
          <div className="relative" data-theme-menu>
            <button
              onClick={() => setShowThemeMenu(!showThemeMenu)}
              className="flex items-center gap-2 px-2 py-1 rounded text-text-secondary hover:text-text-primary hover:bg-dark-bgHover transition-colors"
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

      {/* Bottom Bar: Oscilloscope (click to toggle mode) */}
      <div
        className="px-2 py-1 cursor-pointer"
        onClick={() => setVizMode(vizMode === 'waveform' ? 'spectrum' : 'waveform')}
        title={`Click to switch to ${vizMode === 'waveform' ? 'spectrum' : 'waveform'} view`}
      >
        <Oscilloscope width="auto" height={60} mode={vizMode} />
      </div>
    </div>
  );
};
