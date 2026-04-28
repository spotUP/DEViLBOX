/**
 * NavBar - Top navigation bar with app title, tabs, and controls
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { BUILD_HASH, BUILD_DATE, BUILD_NUMBER } from '@constants/version';
import { Plus, X, Download, LogOut, User, Users, Settings, Lightbulb, Play } from 'lucide-react';
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
import { useTourStore } from '@stores/useTourStore';
import { useProjectStore } from '@stores/useProjectStore';
import { useTabsStore } from '@stores/useTabsStore';
import { CustomSelect } from '@components/common/CustomSelect';
import { ServerStatusBadges } from './ServerStatusBadges';
import { useDubStore } from '@stores/useDubStore';
import { useTransportStore } from '@stores/useTransportStore';
import { useHistoryStore } from '@stores/useHistoryStore';
import { useFT2ToolbarActions } from '@stores/useFT2ToolbarActions';

const NavBarComponent: React.FC = () => {
  const n = useNavBar();

  const editorFullscreen = useUIStore((state) => state.editorFullscreen);
  const openModal = useUIStore((state) => state.openModal);
  const modalOpen = useUIStore((state) => state.modalOpen);
  const closeModal = useUIStore((state) => state.closeModal);
  const tourActive = useTourStore((s) => s.isActive);

  // Dub deck transport bar — shown in header when strip is expanded so FT2
  // toolbar action row can be hidden to reclaim vertical space.
  const stripCollapsed = useDubStore((s) => s.stripCollapsed);
  const isPlaying = useTransportStore((s) => s.isPlaying);
  const isLooping = useTransportStore((s) => s.isLooping);
  const isPlayingSong    = isPlaying && !isLooping;
  const isPlayingPattern = isPlaying && isLooping;
  const canUndo = useHistoryStore((s) => s.canUndo);
  const canRedo = useHistoryStore((s) => s.canRedo);
  const ft2Actions = useFT2ToolbarActions();
  // Expanding the dub deck also sets editorFullscreen=true (DubDeckStrip line 408),
  // so we must NOT gate on !editorFullscreen — that would make the condition impossible.
  const dubDeckTransportActive = n.activeView === 'tracker' && !stripCollapsed;

  const handleStartTour = useCallback(async () => {
    const { getTourEngine } = await import('@/engine/tour/TourEngine');
    getTourEngine().start();
  }, []);

  const [showDownloadModal, setShowDownloadModal] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  // Auto-close collab modal when connection succeeds
  useEffect(() => {
    if (n.collabStatus === 'connected' && modalOpen === 'collab') {
      closeModal();
    }
  }, [n.collabStatus, modalOpen, closeModal]);

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

  const handleAddTab = () => {
    n.addTab();
  };

  const handleCloseTab = (e: React.MouseEvent, tabId: string) => {
    e.stopPropagation();
    n.closeTab(tabId);
  };

  // ── Editable tab name ───────────────────────────────────────────────────
  const [editingTabId, setEditingTabId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const editInputRef = useRef<HTMLInputElement>(null);

  const commitTabRename = useCallback(() => {
    if (editingTabId && editingName.trim()) {
      useTabsStore.getState().updateTabName(editingTabId, editingName.trim());
      // Also update the project metadata if this is the active tab
      if (editingTabId === n.activeTabId) {
        useProjectStore.getState().setMetadata({ name: editingName.trim() });
      }
    }
    setEditingTabId(null);
  }, [editingTabId, editingName, n.activeTabId]);

  const startTabEdit = useCallback((tabId: string, currentName: string) => {
    setEditingTabId(tabId);
    setEditingName(currentName || 'Untitled');
    // Focus the input on next render
    requestAnimationFrame(() => editInputRef.current?.select());
  }, []);

  return (
    <div className="bg-dark-bgSecondary border-b border-dark-border relative z-40">
      {/* Top Bar: Title and Volume */}
      <nav className="grid grid-cols-3 items-center px-4 py-2 border-b border-dark-border">
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
          <ServerStatusBadges />
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
          <button
            onClick={() => openModal('tips', { initialTab: 'tips' })}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-accent-warning/10 text-accent-warning hover:bg-accent-warning/20 transition-colors"
            title="Tip of the Day"
          >
            <Lightbulb size={14} />
            <span className="text-xs font-bold uppercase tracking-tight">Tips</span>
          </button>
          {!tourActive && (
            <button
              onClick={handleStartTour}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-accent-primary/10 text-accent-primary hover:bg-accent-primary/20 transition-colors"
              title="Start guided tour (Ctrl+Shift+T)"
            >
              <Play size={14} />
              <span className="text-xs font-bold uppercase tracking-tight">Tour</span>
            </button>
          )}
        </div>

        {/* Center: FT2 transport — visible when dub deck is expanded */}
        <div className="flex items-center justify-center gap-1">
        {dubDeckTransportActive && (<>
            <Button
              variant={isPlayingSong ? 'danger' : 'primary'}
              size="sm"
              onClick={() => ft2Actions.playSong?.()}
            >{isPlayingSong ? 'Stop Song' : 'Play Song'}</Button>
            <Button
              variant={isPlayingPattern ? 'danger' : 'primary'}
              size="sm"
              onClick={() => ft2Actions.playPattern?.()}
            >{isPlayingPattern ? 'Stop Pattern' : 'Play Pattern'}</Button>
            <div className="w-px h-4 bg-dark-border mx-0.5 shrink-0" />
            <Button variant="ghost" size="sm" onClick={() => ft2Actions.openFileBrowser?.()}>Load</Button>
            <Button variant="ghost" size="sm" onClick={() => ft2Actions.save?.()}>Save</Button>
            <Button variant="ghost" size="sm" onClick={() => ft2Actions.undo?.()} disabled={!canUndo()}>Undo</Button>
            <Button variant="ghost" size="sm" onClick={() => ft2Actions.redo?.()} disabled={!canRedo()}>Redo</Button>
          </>)}
        </div>

        {/* Right: View Switcher, Settings, MIDI */}
        <div className="flex items-center justify-end gap-2">
          {/* View Switcher */}
          <CustomSelect
            value={n.activeView}
            onChange={(v) => switchView(v, n.activeView)}
            options={VIEW_OPTIONS.map((v) => ({ value: v.value, label: v.label }))}
            title="Switch view"
          />

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

          {/* DJ Sets — only shown in DJ and VJ views */}
          {(n.activeView === 'dj' || n.activeView === 'vj') && <DJSetBrowser />}

          {/* Collab */}
          <button
            onClick={() => useUIStore.getState().openModal('collab')}
            className={`flex items-center gap-1 px-2 py-1 text-[10px] font-medium rounded transition-colors ${
              n.collabStatus === 'connected'
                ? 'bg-accent-primary/20 text-accent-primary'
                : 'text-text-secondary hover:text-text-primary hover:bg-dark-bgHover'
            }`}
            title={n.collabStatus === 'connected' ? 'Collaboration active' : 'Start live collaboration'}
          >
            <Users size={14} />
            <span className="hidden sm:inline">Collab</span>
            {n.collabStatus === 'connected' && (
              <span className="w-1.5 h-1.5 rounded-full bg-accent-success animate-pulse" />
            )}
          </button>

          {/* Sign In / User Menu (far right, Web only) */}
          {!isElectron() && n.isServerAvailable && (
            <div className="relative" data-user-menu>
              {n.authUser ? (
                <>
                  <button
                    onClick={() => setShowUserMenu(!showUserMenu)}
                    className="flex items-center gap-2 px-2 py-1 rounded text-[10px] text-text-secondary hover:text-text-primary hover:bg-dark-bgHover transition-colors"
                    title={`Logged in as ${n.authUser.username}`}
                  >
                    <User size={14} className="text-accent-success" />
                    <span className="hidden sm:inline">{n.authUser.username}</span>
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
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowAuthModal(true)}
                  icon={<User size={14} />}
                  iconPosition="left"
                  title="Sign in to save files to the cloud"
                >
                  <span className="hidden sm:inline whitespace-nowrap">Sign In</span>
                </Button>
              )}
            </div>
          )}
        </div>
      </nav>

      {/* Tab Bar — hidden in DJ/VJ views and editor fullscreen */}
      {n.activeView !== 'dj' && n.activeView !== 'vj' && !editorFullscreen && <div className="flex items-center px-2 py-1 border-b border-dark-border bg-dark-bgTertiary">
        {/* Tabs */}
        <div className="flex items-center gap-1 overflow-x-auto scrollbar-none">
          {n.tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => n.setActiveTab(tab.id)}
              onDoubleClick={() => startTabEdit(tab.id, tab.name)}
              className={`
                group flex items-center gap-2 px-3 py-1.5 rounded-t-md text-sm font-medium
                transition-all duration-150 flex-shrink-0
                ${n.activeTabId === tab.id
                  ? 'bg-dark-bg text-text-primary border-t border-x border-dark-border -mb-px'
                  : 'bg-dark-bgSecondary text-text-secondary hover:text-text-primary hover:bg-dark-bg/50'
                }
              `}
            >
              {editingTabId === tab.id ? (
                <input
                  ref={editInputRef}
                  type="text"
                  value={editingName}
                  onChange={(e) => setEditingName(e.target.value)}
                  onBlur={commitTabRename}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitTabRename();
                    if (e.key === 'Escape') setEditingTabId(null);
                    e.stopPropagation();
                  }}
                  onClick={(e) => e.stopPropagation()}
                  className="bg-dark-bgSecondary border border-accent-primary/50 rounded px-1 py-0 text-sm font-medium text-text-primary outline-none min-w-[80px]"
                  autoFocus
                />
              ) : (
                <span>
                  {tab.name || 'Untitled'}
                  {tab.isDirty && <span className="text-accent-primary ml-1">*</span>}
                </span>
              )}
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
          className="flex-shrink-0 p-1.5 rounded hover:bg-dark-border/50 text-text-muted hover:text-text-primary transition-colors"
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
      {modalOpen === 'collab' && (
        <CollaborationModal
          isOpen={true}
          onClose={() => closeModal()}
        />
      )}

      {/* Settings Modal */}
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
    </div>
  );
};

// PERFORMANCE: Wrap in React.memo to prevent unnecessary re-renders
export const NavBar = React.memo(NavBarComponent);
