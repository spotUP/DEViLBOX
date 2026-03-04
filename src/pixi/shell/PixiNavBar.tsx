/**
 * PixiNavBar — Modern single-row navigation bar.
 *
 * Three zones:
 *   Left (460px):  Logo + view selector pills (Tracker, Arrange, Piano, DJ, VJ, Studio)
 *   Center (flex):  PixiTransportBar (play/stop/BPM/position/loop)
 *   Right:  Volume knob, Save, Load, Collab, Auth, MIDI, Theme, Dock, DOM
 */

import React, { useCallback } from 'react';
import { PIXI_FONTS } from '../fonts';
import { usePixiTheme } from '../theme';
import { PixiButton } from '../components/PixiButton';
import { PixiKnob } from '../components/PixiKnob';
import { usePixiResponsive } from '../hooks/usePixiResponsive';
import { useThemeStore, themes } from '@stores/useThemeStore';
import { useSettingsStore } from '@stores/useSettingsStore';
import { useUIStore } from '@stores/useUIStore';
import { useProjectStore } from '@stores/useProjectStore';
import { useAudioStore } from '@stores/useAudioStore';
import { useWorkbenchStore } from '@stores/useWorkbenchStore';
import { useCollaborationStore } from '@stores/useCollaborationStore';
import { useAuthStore } from '@stores/useAuthStore';
import { useMIDIStore } from '@stores/useMIDIStore';
import { MODERN_NAV_H } from '../workbench/workbenchLayout';
import { serializeProjectToBlob } from '@hooks/useProjectPersistence';
import { PixiTransportBar } from './PixiTransportBar';

// ─── View selector pills ─────────────────────────────────────────────────────

const VIEW_TABS = [
  { id: 'tracker',     label: 'Tracker' },
  { id: 'arrangement', label: 'Arrange' },
  { id: 'pianoroll',   label: 'Piano' },
  { id: 'mixer',       label: 'Mixer' },
  { id: 'dj',          label: 'DJ'  },
  { id: 'vj',          label: 'VJ'  },
  { id: 'studio',      label: 'Studio' },
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

  // Theme cycling
  const handleThemeCycle = useCallback(() => {
    const idx = themes.findIndex((t) => t.id === currentThemeId);
    const next = themes[(idx + 1) % themes.length];
    setTheme(next.id);
  }, [currentThemeId, setTheme]);

  const handleSwitchToDom = useCallback(() => {
    setRenderMode('dom');
  }, [setRenderMode]);

  // Collaboration modal
  const handleOpenCollab = useCallback(() => {
    useUIStore.getState().openModal('collaboration');
  }, []);

  // Auth modal
  const handleOpenAuth = useCallback(() => {
    useUIStore.getState().openModal('auth');
  }, []);

  // MIDI / Settings modal
  const handleOpenMIDI = useCallback(() => {
    useUIStore.getState().openModal('settings');
  }, []);

  // Transport bar width: center zone gets whatever's left after left/right
  const LEFT_W = 460;
  const RIGHT_W = 440;
  const transportW = Math.max(200, width - LEFT_W - RIGHT_W);

  return (
    <layoutContainer
      layout={{
        width,
        height: MODERN_NAV_H,
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: theme.bgTertiary.color,
        borderBottomWidth: 1,
        borderColor: theme.border.color,
      }}
    >

      {/* ═══ Left zone: Logo + view selector pills ═══ */}
      <pixiContainer
        layout={{
          width: LEFT_W,
          height: MODERN_NAV_H,
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
          style={{ fontFamily: PIXI_FONTS.MONO_BOLD, fontSize: 14, fill: 0xffffff }}
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
      <PixiTransportBar width={transportW} height={MODERN_NAV_H} />

      {/* ═══ Right zone: Volume, Actions, Status ═══ */}
      <pixiContainer
        layout={{
          width: RIGHT_W,
          height: MODERN_NAV_H,
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

        {/* Auth */}
        <PixiButton
          label={authUser ? authUser.username.slice(0, 6) : 'LOGIN'}
          variant="ghost"
          size="sm"
          onClick={handleOpenAuth}
          width={44}
        />

        {/* MIDI */}
        {hasMIDI && (
          <PixiButton label="MIDI" variant="ghost" size="sm" onClick={handleOpenMIDI} width={40} />
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

        <PixiButton label="THEME" variant="ghost" size="sm" onClick={handleThemeCycle} width={52} />
        <PixiButton label="DOM" variant="ghost" size="sm" onClick={handleSwitchToDom} width={36} />
      </pixiContainer>
    </layoutContainer>
  );
};
