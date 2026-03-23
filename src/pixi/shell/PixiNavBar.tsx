/**
 * PixiNavBar — Modern single-row navigation bar.
 *
 * Three zones:
 *   Left (460px):  Logo + view selector pills (Tracker, Arrange, Piano, DJ, VJ, Studio)
 *   Center (flex):  PixiTransportBar (play/stop/BPM/position/loop)
 *   Right:  Volume knob, Save, Load, Collab, Auth, MIDI, Theme, Dock, DOM
 */

import React, { useCallback, useMemo, useRef } from 'react';
import type { FederatedPointerEvent, Container as ContainerType } from 'pixi.js';
import { PIXI_FONTS } from '../fonts';
import { usePixiTheme } from '../theme';
import { PixiButton } from '../components/PixiButton';
import { PixiKnob } from '../components/PixiKnob';
import { PixiSelect, type SelectOption } from '../components/PixiSelect';
import { usePixiResponsive } from '../hooks/usePixiResponsive';
import { useThemeStore, themes, useTabsStore, type ProjectTab } from '@stores';
import { useSettingsStore } from '@stores/useSettingsStore';
import { useUIStore } from '@stores/useUIStore';
import { useProjectStore } from '@stores/useProjectStore';
import { useAudioStore } from '@stores/useAudioStore';
import { useWorkbenchStore } from '@stores/useWorkbenchStore';
import { useCollaborationStore } from '@stores/useCollaborationStore';
import { useAuthStore } from '@stores/useAuthStore';
import { useMIDIStore } from '@stores/useMIDIStore';
import { useAIStore } from '@stores/useAIStore';
import { MODERN_NAV_H } from '../workbench/workbenchLayout';
import { serializeProjectToBlob } from '@hooks/useProjectPersistence';
import { PixiTransportBar } from './PixiTransportBar';
import { BUILD_VERSION } from '@constants/version';
import { usePixiDropdownStore } from '../stores/usePixiDropdownStore';
import { PixiDJSetBrowser } from '../views/dj/PixiDJSetBrowser';

const NAV_ROW_H = 52;
const TAB_ROW_H = MODERN_NAV_H - NAV_ROW_H; // 24px

// ─── View selector pills ─────────────────────────────────────────────────────

const VIEW_TABS = [
  { id: 'tracker',     label: 'Tracker' },
  { id: 'arrangement', label: 'Arrange' },
  { id: 'pianoroll',   label: 'Piano' },
  { id: 'mixer',       label: 'Mixer' },
  { id: 'dj',          label: 'DJ'  },
  { id: 'vj',          label: 'VJ'  },
  { id: 'studio',      label: 'Studio' },
  { id: 'split',       label: 'Split' },
] as const;

// ─── PixiNavBar ──────────────────────────────────────────────────────────────

export const PixiNavBar: React.FC = () => {
  const theme = usePixiTheme();
  const { width } = usePixiResponsive();

  // UI store — view switching
  const activeView = useUIStore((s) => s.activeView);
  const setActiveView = useUIStore((s) => s.setActiveView);

  // Theme store
  const currentThemeId = useThemeStore((s) => s.currentThemeId);
  const setTheme = useThemeStore((s) => s.setTheme);

  // Tabs store
  const tabs = useTabsStore((s) => s.tabs);
  const activeTabId = useTabsStore((s) => s.activeTabId);
  const addTab = useTabsStore((s) => s.addTab);
  const closeTab = useTabsStore((s) => s.closeTab);
  const setActiveTab = useTabsStore((s) => s.setActiveTab);

  // Settings store
  const setRenderMode = useSettingsStore((s) => s.setRenderMode);

  // Audio store — master volume
  const masterVolume = useAudioStore((s) => s.masterVolume);
  const setMasterVolume = useAudioStore((s) => s.setMasterVolume);

  // Collaboration store
  const collabStatus = useCollaborationStore((s) => s.status);

  // Auth store
  const authUser = useAuthStore((s) => s.user);

  // MIDI store
  const hasMIDI = useMIDIStore((s) => s.isInitialized && s.inputDevices.length > 0);

  // AI store
  const aiPanelOpen = useAIStore((s) => s.isOpen);
  const toggleAI = useAIStore((s) => s.toggle);

  // Exposé state
  const isStudio = activeView === 'studio';
  const workbenchExposeActive = useWorkbenchStore((s) => s.exposeActive);
  const toggleWorkbenchExpose = useWorkbenchStore((s) => s.toggleExpose);
  const viewExposeActive = useUIStore((s) => s.viewExposeActive);
  const toggleViewExpose = useUIStore((s) => s.toggleViewExpose);
  const exposeActive = isStudio ? workbenchExposeActive : viewExposeActive;
  const handleExpose = useCallback(() => {
    if (isStudio) toggleWorkbenchExpose();
    else toggleViewExpose();
  }, [isStudio, toggleWorkbenchExpose, toggleViewExpose]);

  // Project store
  const projectName = useProjectStore((s) => s.metadata?.name ?? 'project');

  // ─── Project Save ────────────────────────────────────────────────────────
  const handleSaveFile = useCallback(() => {
    try {
      const blob = serializeProjectToBlob();
      const safeName = (projectName || 'project').replace(/[^a-z0-9_\-. ]/gi, '_');
      const filename = `${safeName}.dvbx`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('[PixiNavBar] Failed to save project file:', err);
    }
  }, [projectName]);

  // ─── Project Load — open full file browser ────────────────────────────────
  const handleLoadFile = useCallback(() => {
    useUIStore.getState().setShowFileBrowser(true);
  }, []);

  // Theme options for dropdown
  const themeOptions = useMemo<SelectOption[]>(
    () => themes.map(t => ({ value: t.id, label: t.name.toUpperCase(), color: t.colors.accent })),
    [], // themes is module-level stable
  );

  const handleSwitchToDom = useCallback(() => {
    setRenderMode('dom');
  }, [setRenderMode]);

  // Collaboration modal
  const handleOpenCollab = useCallback(() => {
    useUIStore.getState().openModal('collaboration');
  }, []);

  // Auth modal / user dropdown
  const authContainerRef = useRef<ContainerType>(null);
  const AUTH_DROPDOWN_ID = 'nav-auth';
  const logout = useAuthStore((s) => s.logout);
  const handleOpenAuth = useCallback(() => {
    useUIStore.getState().openModal('auth');
  }, []);
  const handleAuthClick = useCallback(() => {
    if (!authUser) { handleOpenAuth(); return; }
    const el = authContainerRef.current;
    if (!el) return;
    const pos = el.toGlobal({ x: 0, y: NAV_ROW_H });
    requestAnimationFrame(() => {
      usePixiDropdownStore.getState().openDropdown({
        kind: 'select',
        id: AUTH_DROPDOWN_ID,
        x: pos.x,
        y: pos.y,
        width: 130,
        options: [
          { value: '__user__', label: `@${authUser.username}`, disabled: true },
          { value: 'logout', label: 'Sign Out' },
        ],
        onSelect: (v) => {
          if (v === 'logout') logout();
          usePixiDropdownStore.getState().closeDropdown(AUTH_DROPDOWN_ID);
        },
        onClose: () => usePixiDropdownStore.getState().closeDropdown(AUTH_DROPDOWN_ID),
      });
    });
  }, [authUser, handleOpenAuth, logout]);

  // MIDI device quick-picker
  const midiContainerRef = useRef<ContainerType>(null);
  const MIDI_DROPDOWN_ID = 'nav-midi';
  const handleMIDIClick = useCallback(() => {
    const el = midiContainerRef.current;
    if (!el) return;
    const pos = el.toGlobal({ x: 0, y: NAV_ROW_H });
    const { inputDevices: devs, selectedInputId: selId } = useMIDIStore.getState();
    const deviceOptions = devs.map(d => ({
      value: d.id,
      label: (selId === d.id ? '\u25cf ' : '\u25cb ') + d.name.slice(0, 18),
    }));
    requestAnimationFrame(() => {
      usePixiDropdownStore.getState().openDropdown({
        kind: 'select',
        id: MIDI_DROPDOWN_ID,
        x: pos.x,
        y: pos.y,
        width: 200,
        options: [
          { value: '__inp__', label: 'INPUT DEVICE' },
          ...(deviceOptions.length > 0 ? deviceOptions : [{ value: '__none__', label: 'No devices found', disabled: true }]),
          { value: '_settings', label: 'MIDI Settings...' },
        ],
        onSelect: (v) => {
          if (v === '_settings') {
            useUIStore.getState().openModal('settings');
          } else if (v !== '__inp__' && v !== '__none__') {
            useMIDIStore.getState().selectInput(v);
          }
          usePixiDropdownStore.getState().closeDropdown(MIDI_DROPDOWN_ID);
        },
        onClose: () => usePixiDropdownStore.getState().closeDropdown(MIDI_DROPDOWN_ID),
      });
    });
  }, []);

  // Download App modal
  const handleDownloadApp = useCallback(() => {
    useUIStore.getState().openModal('download');
  }, []);

  // Transport bar width: center zone gets whatever's left after left/right
  const LEFT_W = 460;
  const RIGHT_W = 488;
  const transportW = Math.max(200, width - LEFT_W - RIGHT_W);

  return (
    <layoutContainer
      layout={{
        width,
        height: MODERN_NAV_H,
        flexDirection: 'column',
        backgroundColor: theme.bgTertiary.color,
        borderBottomWidth: 1,
        borderColor: theme.border.color,
      }}
    >

      {/* ── Main nav row ── */}
      <pixiContainer layout={{ width, height: NAV_ROW_H, flexDirection: 'row', alignItems: 'center', flexShrink: 0 }}>

      {/* ═══ Left zone: Logo + view selector pills ═══ */}
      <pixiContainer
        layout={{
          width: LEFT_W,
          height: NAV_ROW_H,
          flexDirection: 'row',
          alignItems: 'center',
          paddingLeft: 16,
          gap: 6,
          flexShrink: 0,
        }}
      >
        {/* Logo */}
        <pixiBitmapText
          text="DEViLBOX"
          style={{ fontFamily: PIXI_FONTS.MONO_BOLD, fontSize: 16, fill: 0xffffff }}
          tint={theme.accent.color}
          layout={{ marginRight: 12 }}
        />

        {/* View selector buttons */}
        {VIEW_TABS.map(({ id, label }) => {
          const isActive = activeView === id;
          return (
            <PixiButton
              key={id}
              label={label}
              variant="ft2"
              size="sm"
              active={isActive}
              onClick={() => {
                // Close any active expose when switching views
                if (workbenchExposeActive) useWorkbenchStore.getState().setExposeActive(false);
                if (viewExposeActive) useUIStore.getState().setViewExposeActive(false);
                setActiveView(id as any);
              }}
            />
          );
        })}
      </pixiContainer>

      {/* ═══ Center zone: Transport ═══ */}
      <PixiTransportBar width={transportW} height={NAV_ROW_H} />

      {/* ═══ Right zone: Volume, Actions, Status ═══ */}
      <pixiContainer
        layout={{
          width: RIGHT_W,
          height: NAV_ROW_H,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'flex-end',
          paddingRight: 12,
          gap: 4,
          flexShrink: 0,
        }}
      >
        {/* Master Volume */}
        <PixiKnob
          value={masterVolume}
          min={-60}
          max={0}
          onChange={setMasterVolume}
          label="VOL"
          unit="dB"
          size="sm"
          defaultValue={0}
          formatValue={(v) => `${v.toFixed(0)}`}
          layout={{ marginRight: 4 }}
        />

        <PixiButton label="SAVE" variant="ghost" size="sm" onClick={handleSaveFile} width={44} />
        <PixiButton label="LOAD" variant="ghost" size="sm" onClick={handleLoadFile} width={44} />

        {/* Collaboration */}
        <PixiButton
          label={collabStatus === 'connected' ? 'LIVE' : 'COLLAB'}
          variant={collabStatus === 'connected' ? 'ft2' : 'ghost'}
          color={collabStatus === 'connected' ? 'green' : 'default'}
          size="sm"
          active={collabStatus === 'connected'}
          onClick={handleOpenCollab}
          width={48}
        />

        {/* DJ Sets */}
        <PixiDJSetBrowser />

        {/* Auth — shows sign-out dropdown when logged in */}
        <pixiContainer ref={authContainerRef} layout={{ flexShrink: 0 }}>
          <PixiButton
            label={authUser ? authUser.username.slice(0, 6) : 'LOGIN'}
            variant="ghost"
            size="sm"
            onClick={handleAuthClick}
            width={44}
          />
        </pixiContainer>

        {/* MIDI — opens device picker dropdown */}
        {hasMIDI && (
          <pixiContainer ref={midiContainerRef} layout={{ flexShrink: 0 }}>
            <PixiButton label="MIDI" variant="ghost" size="sm" onClick={handleMIDIClick} width={40} />
          </pixiContainer>
        )}

        {/* Exposé — shows in all views */}
        <PixiButton
          label="EXPOSÉ"
          variant={exposeActive ? 'ft2' : 'ghost'}
          size="sm"
          active={exposeActive}
          onClick={handleExpose}
          width={56}
        />

        {/* AI Assistant */}
        <PixiButton
          label="AI"
          variant={aiPanelOpen ? 'ft2' : 'ghost'}
          size="sm"
          active={aiPanelOpen}
          onClick={toggleAI}
          width={28}
        />

        <PixiSelect
          options={themeOptions}
          value={currentThemeId}
          onChange={setTheme}
          width={80}
          height={24}
          searchable
        />
        <PixiButton label="APP" variant="ghost" size="sm" onClick={handleDownloadApp} width={36} />
        <PixiButton label="DOM" variant="ghost" size="sm" onClick={handleSwitchToDom} width={36} />

        {/* Build version badge */}
        <pixiBitmapText
          text={BUILD_VERSION}
          style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 9, fill: 0xffffff }}
          tint={theme.textMuted.color}
          layout={{ marginLeft: 4 }}
        />
      </pixiContainer>

      </pixiContainer>{/* end main nav row */}

      {/* ── Project tab bar row ── */}
      <layoutContainer
        layout={{
          width,
          height: TAB_ROW_H,
          flexDirection: 'row',
          alignItems: 'center',
          paddingLeft: 8,
          paddingRight: 8,
          gap: 2,
          backgroundColor: theme.bgSecondary.color,
          borderTopWidth: 1,
          borderColor: theme.border.color,
          flexShrink: 0,
        }}
      >
        {tabs.map((tab: ProjectTab) => {
          const isActive = tab.id === activeTabId;
          return (
            <layoutContainer
              key={tab.id}
              eventMode="static"
              cursor="pointer"
              onPointerUp={() => setActiveTab(tab.id)}
              layout={{
                height: TAB_ROW_H - 4,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 4,
                paddingLeft: 8,
                paddingRight: tabs.length > 1 ? 4 : 8,
                backgroundColor: isActive ? theme.bg.color : theme.bgTertiary.color,
                borderWidth: 1,
                borderColor: isActive ? theme.accent.color : theme.border.color,
                borderRadius: 3,
              }}
            >
              <pixiBitmapText
                text={(tab.name || 'Untitled').toUpperCase() + (tab.isDirty ? ' *' : '')}
                style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 10, fill: 0xffffff }}
                tint={isActive ? theme.text.color : theme.textMuted.color}
                layout={{}}
                eventMode="none"
              />
              {tabs.length > 1 && (
                <layoutContainer
                  eventMode="static"
                  cursor="pointer"
                  onPointerUp={(e: FederatedPointerEvent) => { e.stopPropagation(); closeTab(tab.id); }}
                  layout={{ width: 12, height: 12, justifyContent: 'center', alignItems: 'center' }}
                >
                  <pixiBitmapText
                    text="x"
                    style={{ fontFamily: PIXI_FONTS.MONO_BOLD, fontSize: 9, fill: 0xffffff }}
                    tint={theme.textMuted.color}
                    layout={{}}
                    eventMode="none"
                  />
                </layoutContainer>
              )}
            </layoutContainer>
          );
        })}

        {/* Add tab button */}
        <layoutContainer
          eventMode="static"
          cursor="pointer"
          onPointerUp={() => addTab()}
          layout={{
            width: TAB_ROW_H - 4,
            height: TAB_ROW_H - 4,
            justifyContent: 'center',
            alignItems: 'center',
            backgroundColor: theme.bgTertiary.color,
            borderWidth: 1,
            borderColor: theme.border.color,
            borderRadius: 3,
          }}
        >
          <pixiBitmapText
            text="+"
            style={{ fontFamily: PIXI_FONTS.MONO_BOLD, fontSize: 12, fill: 0xffffff }}
            tint={theme.textMuted.color}
            layout={{}}
            eventMode="none"
          />
        </layoutContainer>
      </layoutContainer>

    </layoutContainer>
  );
};
