// src/hooks/views/useNavBar.ts
/**
 * useNavBar — Shared logic hook for NavBar (DOM) and PixiNavBar (Pixi).
 *
 * Both bars call this hook and keep only their renderer-specific markup.
 * All store subscriptions, local state, effects, and handlers live here.
 */

import { useEffect, useCallback, useMemo } from 'react';
import { useProjectStore, useAudioStore, useTabsStore, useThemeStore, useUIStore, themes } from '@stores';
import { useAuthStore } from '@stores/useAuthStore';
import { useCollaborationStore } from '@stores/useCollaborationStore';
import { useMIDIStore } from '@stores/useMIDIStore';
import { useAIStore } from '@stores/useAIStore';
import { serializeProjectToBlob } from '@hooks/useProjectPersistence';

// Matches PixiSelect's SelectOption shape — defined here to avoid Pixi dep in a shared hook
export interface NavBarThemeOption {
  value: string;
  label: string;
  color?: string;
}

// ─── Constants (exported for renderers) ──────────────────────────────────────

import { NAV_BAR_VIEWS } from '@/constants/viewOptions';

export const VIEW_TABS = NAV_BAR_VIEWS.map(v => ({ id: v.value, label: v.shortLabel }));

export type ViewTabId = string;

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useNavBar() {
  // ── Project store ─────────────────────────────────────────────────────────
  const metadata = useProjectStore((s) => s.metadata);
  const isDirty = useProjectStore((s) => s.isDirty);
  const projectName = metadata?.name ?? 'project';

  // ── Audio store ──────────────────────────────────────────────────────────
  const masterVolume = useAudioStore((s) => s.masterVolume);
  const setMasterVolume = useAudioStore((s) => s.setMasterVolume);

  // ── Tabs store ───────────────────────────────────────────────────────────
  const tabs = useTabsStore((s) => s.tabs);
  const activeTabId = useTabsStore((s) => s.activeTabId);
  const addTab = useTabsStore((s) => s.addTab);
  const closeTab = useTabsStore((s) => s.closeTab);
  const setActiveTab = useTabsStore((s) => s.setActiveTab);
  const updateTabName = useTabsStore((s) => s.updateTabName);
  const markTabDirty = useTabsStore((s) => s.markTabDirty);

  // ── Theme store ──────────────────────────────────────────────────────────
  const currentThemeId = useThemeStore((s) => s.currentThemeId);
  const setTheme = useThemeStore((s) => s.setTheme);
  const getCurrentTheme = useThemeStore((s) => s.getCurrentTheme);

  // ── UI store ─────────────────────────────────────────────────────────────
  const activeView = useUIStore((s) => s.activeView);
  const setActiveView = useUIStore((s) => s.setActiveView);
  const viewExposeActive = useUIStore((s) => s.viewExposeActive);
  const toggleViewExpose = useUIStore((s) => s.toggleViewExpose);


  // ── Collaboration store ───────────────────────────────────────────────────
  const collabStatus = useCollaborationStore((s) => s.status);
  const collabViewMode = useCollaborationStore((s) => s.viewMode);
  const setCollabViewMode = useCollaborationStore((s) => s.setViewMode);

  // ── Auth store ────────────────────────────────────────────────────────────
  const authUser = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const isServerAvailable = useAuthStore((s) => s.isServerAvailable);
  const checkServerAvailability = useAuthStore((s) => s.checkServerAvailability);

  // ── MIDI store ────────────────────────────────────────────────────────────
  const hasMIDI = useMIDIStore((s) => s.isInitialized && s.inputDevices.length > 0);

  // ── AI store ──────────────────────────────────────────────────────────────
  const aiPanelOpen = useAIStore((s) => s.isOpen);
  const toggleAI = useAIStore((s) => s.toggle);

  // ── Computed ──────────────────────────────────────────────────────────────
  const currentTheme = getCurrentTheme();
  const exposeActive = viewExposeActive;

  const themeOptions = useMemo<NavBarThemeOption[]>(
    () => themes.map((t) => ({ value: t.id, label: t.name.toUpperCase(), color: t.colors.accent })),
    [],
  );

  // ── Effects ───────────────────────────────────────────────────────────────

  // Check server availability on mount
  useEffect(() => {
    checkServerAvailability();
  }, [checkServerAvailability]);

  // Sync tab name with project metadata
  useEffect(() => {
    if (metadata?.name && activeTabId) {
      updateTabName(activeTabId, metadata.name);
    }
  }, [metadata?.name, activeTabId, updateTabName]);

  // Sync tab dirty state with project
  useEffect(() => {
    if (activeTabId) {
      markTabDirty(activeTabId, isDirty);
    }
  }, [isDirty, activeTabId, markTabDirty]);

  // Auto-close collab modal when connection succeeds
  useEffect(() => {
    if (collabStatus === 'connected') {
      useUIStore.getState().closeModal();
    }
  }, [collabStatus]);

  // ── Handlers ─────────────────────────────────────────────────────────────

  const handleSaveFile = useCallback(() => {
    try {
      const blob = serializeProjectToBlob();
      const safeName = (projectName || 'project').replace(/[^a-z0-9_\-. ]/gi, '_');
      const filename = `${safeName}.dbx`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('[NavBar] Failed to save project file:', err);
    }
  }, [projectName]);

  const handleLoadFile = useCallback(() => {
    useUIStore.getState().setShowFileBrowser(true);
  }, []);

  const handleOpenCollab = useCallback(() => {
    if (collabStatus === 'connected' && collabViewMode === 'split') {
      return;
    }
    if (collabStatus === 'connected') {
      setCollabViewMode('split');
    } else {
      useUIStore.getState().openModal('collaboration');
    }
  }, [collabStatus, collabViewMode, setCollabViewMode]);

  const handleOpenAuth = useCallback(() => {
    useUIStore.getState().openModal('auth');
  }, []);

  const handleOpenDownload = useCallback(() => {
    useUIStore.getState().openModal('download');
  }, []);

  const handleOpenModuleInfo = useCallback(() => {
    requestAnimationFrame(() => useUIStore.getState().openModal('moduleInfo'));
  }, []);

  const handleExpose = useCallback(() => {
    toggleViewExpose();
  }, [toggleViewExpose]);

  const handleSwitchView = useCallback((id: ViewTabId) => {
    if (viewExposeActive) useUIStore.getState().setViewExposeActive(false);
    setActiveView(id as any);
  }, [viewExposeActive, setActiveView]);

  // ── Return ────────────────────────────────────────────────────────────────

  return {
    // Project
    metadata,
    isDirty,
    projectName,
    // Audio
    masterVolume,
    setMasterVolume,
    // Tabs
    tabs,
    activeTabId,
    addTab,
    closeTab,
    setActiveTab,
    // Theme
    currentThemeId,
    setTheme,
    currentTheme,
    themeOptions,
    themes,
    // UI / view
    activeView,
    setActiveView,
    viewExposeActive,
    exposeActive,
    // Collab
    collabStatus,
    collabViewMode,
    // Auth
    authUser,
    logout,
    isServerAvailable,
    // MIDI
    hasMIDI,
    // AI
    aiPanelOpen,
    toggleAI,
    // Handlers
    handleSaveFile,
    handleLoadFile,
    handleOpenCollab,
    handleOpenAuth,
    handleOpenDownload,
    handleOpenModuleInfo,
    handleExpose,
    handleSwitchView,
  };
}
