/**
 * PixiNavBar — Top navigation bar (36px) with view tabs, theme toggle, volume, MIDI indicator.
 * Reads from: useUIStore (activeView), useThemeStore, useAudioStore (masterVolume),
 *             useMIDIStore (isInitialized), useProjectStore (metadata).
 */

import { useCallback } from 'react';
import type { Graphics as GraphicsType } from 'pixi.js';
import { PIXI_FONTS } from '../fonts';
import { usePixiTheme } from '../theme';
import { PixiButton } from '../components';
import { PixiDOMOverlay } from '../components/PixiDOMOverlay';
import { useUIStore } from '@stores';
import { useAudioStore } from '@stores/useAudioStore';
import { useThemeStore, themes } from '@stores/useThemeStore';
import { useProjectStore } from '@stores/useProjectStore';
import { useSettingsStore } from '@stores/useSettingsStore';
import { useCollaborationStore } from '@stores/useCollaborationStore';
import { useTabsStore } from '@stores/useTabsStore';
import { MIDIToolbarDropdown } from '@components/midi/MIDIToolbarDropdown';
import { useMIDIStore } from '@stores/useMIDIStore';
import { APP_VERSION } from '@/constants/version';

const NAV_HEIGHT = 36;
const TAB_BAR_HEIGHT = 28;

type ViewTab = 'tracker' | 'arrangement' | 'dj' | 'drumpad' | 'pianoroll';
const VIEW_TABS: { id: ViewTab; label: string }[] = [
  { id: 'tracker', label: 'TRACKER' },
  { id: 'arrangement', label: 'ARRANGE' },
  { id: 'pianoroll', label: 'PIANO' },
  { id: 'dj', label: 'DJ' },
  { id: 'drumpad', label: 'PADS' },
];

export const PixiNavBar: React.FC = () => {
  const theme = usePixiTheme();

  // Store subscriptions
  const activeView = useUIStore(s => s.activeView);
  const setActiveView = useUIStore(s => s.setActiveView);
  const projectName = useProjectStore(s => s.metadata?.name || 'Untitled');
  const currentThemeId = useThemeStore(s => s.currentThemeId);
  const setTheme = useThemeStore(s => s.setTheme);
  const masterVolume = useAudioStore(s => s.masterVolume);
  const masterMuted = useAudioStore(s => s.masterMuted);
  const collabStatus = useCollaborationStore(s => s.status);
  const openModal = useUIStore(s => s.openModal);
  const tabs = useTabsStore(s => s.tabs);
  const hasMIDI = useMIDIStore(s => s.isInitialized && s.inputDevices.length > 0);

  // Cycle through themes
  const handleThemeToggle = useCallback(() => {
    const idx = themes.findIndex(t => t.id === currentThemeId);
    const next = themes[(idx + 1) % themes.length];
    setTheme(next.id);
  }, [currentThemeId, setTheme]);

  // Master volume control
  const handleVolUp = useCallback(() => {
    const s = useAudioStore.getState();
    s.setMasterVolume(Math.min(0, s.masterVolume + 3));
  }, []);

  const handleVolDown = useCallback(() => {
    const s = useAudioStore.getState();
    s.setMasterVolume(Math.max(-60, s.masterVolume - 3));
  }, []);

  const handleMuteToggle = useCallback(() => {
    useAudioStore.getState().toggleMasterMute();
  }, []);

  // Collaboration
  const handleCollab = useCallback(() => {
    const cs = useCollaborationStore.getState();
    if (cs.status === 'connected') {
      cs.setViewMode('split');
    } else {
      openModal('collaboration');
    }
  }, [openModal]);

  // Switch back to DOM mode
  const handleSwitchToDom = useCallback(() => {
    useSettingsStore.getState().setRenderMode('dom');
  }, []);

  const drawBg = useCallback((g: GraphicsType) => {
    g.clear();
    // Use large width — layout container clips to actual width
    const w = 4000;
    // Background
    g.rect(0, 0, w, NAV_HEIGHT);
    g.fill({ color: theme.bgSecondary.color });
    // Bottom border
    g.rect(0, NAV_HEIGHT - 1, w, 1);
    g.fill({ color: theme.border.color, alpha: theme.border.alpha });
  }, [theme]);

  const showTabBar = tabs.length > 1;

  return (
    <pixiContainer
      layout={{
        width: '100%',
        height: showTabBar ? NAV_HEIGHT + TAB_BAR_HEIGHT : NAV_HEIGHT,
        flexDirection: 'column',
      }}
    >
    <pixiContainer
      layout={{
        width: '100%',
        height: NAV_HEIGHT,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingLeft: 12,
        paddingRight: 12,
      }}
    >
      {/* Background */}
      <pixiGraphics
        draw={drawBg}
        layout={{ position: 'absolute', width: '100%', height: NAV_HEIGHT }}
      />

      {/* App title */}
      <pixiBitmapText
        text="DEViLBOX"
        style={{ fontFamily: PIXI_FONTS.MONO_BOLD, fontSize: 13, fill: 0xffffff }}
        tint={theme.accent.color}
        layout={{ marginRight: 4 }}
      />

      {/* Version badge */}
      <pixiBitmapText
        text={APP_VERSION}
        style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 8, fill: 0xffffff }}
        tint={theme.textMuted.color}
        layout={{ marginRight: 8 }}
      />

      {/* Separator */}
      <pixiGraphics
        draw={(g) => {
          g.clear();
          g.rect(0, 6, 1, NAV_HEIGHT - 12);
          g.fill({ color: theme.border.color, alpha: 0.4 });
        }}
        layout={{ width: 1, height: NAV_HEIGHT }}
      />

      {/* View tabs */}
      {VIEW_TABS.map(tab => {
        const isActive = activeView === tab.id;
        return (
          <pixiContainer
            key={tab.id}
            eventMode="static"
            cursor="pointer"
            onPointerUp={() => setActiveView(tab.id)}
            layout={{
              height: NAV_HEIGHT,
              paddingLeft: 10,
              paddingRight: 10,
              justifyContent: 'center',
              alignItems: 'center',
            }}
          >
            {/* Active tab indicator */}
            {isActive && (
              <pixiGraphics
                draw={(g) => {
                  g.clear();
                  g.rect(0, NAV_HEIGHT - 2, 60, 2);
                  g.fill({ color: theme.accent.color });
                }}
                layout={{ position: 'absolute', bottom: 0 }}
              />
            )}
            <pixiBitmapText
              text={tab.label}
              style={{
                fontFamily: PIXI_FONTS.MONO,
                fontSize: 11,
                fill: 0xffffff,
              }}
              tint={isActive ? theme.accent.color : theme.textMuted.color}
              layout={{}}
            />
          </pixiContainer>
        );
      })}

      {/* Spacer */}
      <pixiContainer layout={{ flex: 1 }} />

      {/* Project name */}
      <pixiBitmapText
        text={projectName}
        style={{ fontFamily: PIXI_FONTS.SANS, fontSize: 11, fill: 0xffffff }}
        tint={theme.textSecondary.color}
        layout={{ marginRight: 12 }}
      />

      {/* Collab button */}
      <PixiButton
        label={collabStatus === 'connected' ? 'COLLAB' : 'Collab'}
        variant={collabStatus === 'connected' ? 'ft2' : 'ghost'}
        color={collabStatus === 'connected' ? 'green' : undefined}
        size="sm"
        active={collabStatus === 'connected'}
        onClick={handleCollab}
      />

      {/* Separator */}
      <pixiGraphics
        draw={(g) => {
          g.clear();
          g.rect(0, 6, 1, NAV_HEIGHT - 12);
          g.fill({ color: theme.border.color, alpha: 0.4 });
        }}
        layout={{ width: 1, height: NAV_HEIGHT }}
      />

      {/* Master volume */}
      <pixiContainer layout={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginRight: 8 }}>
        <PixiButton
          label={masterMuted ? 'MUTED' : 'VOL'}
          variant={masterMuted ? 'ft2' : 'ghost'}
          color={masterMuted ? 'red' : undefined}
          size="sm"
          active={masterMuted}
          onClick={handleMuteToggle}
        />
        <PixiButton label="-" variant="ghost" size="sm" onClick={handleVolDown} />
        <pixiBitmapText
          text={masterMuted ? 'MUTE' : `${masterVolume} dB`}
          style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 9, fill: 0xffffff }}
          tint={masterMuted ? theme.error.color : theme.textSecondary.color}
          layout={{}}
        />
        <PixiButton label="+" variant="ghost" size="sm" onClick={handleVolUp} />
      </pixiContainer>

      {/* Theme toggle */}
      <pixiContainer
        eventMode="static"
        cursor="pointer"
        onPointerUp={handleThemeToggle}
        layout={{
          height: 24,
          paddingLeft: 6,
          paddingRight: 6,
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        <pixiGraphics
          draw={(g) => {
            g.clear();
            g.roundRect(0, 0, 50, 22, 4);
            g.stroke({ color: theme.border.color, alpha: 0.5, width: 1 });
          }}
          layout={{ position: 'absolute', width: 50, height: 22 }}
        />
        <pixiBitmapText
          text="THEME"
          style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 9, fill: 0xffffff }}
          tint={theme.textMuted.color}
          layout={{}}
        />
      </pixiContainer>

      {/* MIDI toolbar dropdown */}
      {hasMIDI && (
        <PixiDOMOverlay
          layout={{ height: 28, width: 90 }}
          style={{ overflow: 'visible', zIndex: 100 }}
        >
          <MIDIToolbarDropdown />
        </PixiDOMOverlay>
      )}

      {/* DOM/WebGL toggle */}
      <pixiContainer
        eventMode="static"
        cursor="pointer"
        onPointerUp={handleSwitchToDom}
        layout={{
          height: 24,
          paddingLeft: 6,
          paddingRight: 6,
          justifyContent: 'center',
          alignItems: 'center',
          marginLeft: 4,
        }}
      >
        <pixiGraphics
          draw={(g) => {
            g.clear();
            g.roundRect(0, 0, 44, 22, 4);
            g.fill({ color: theme.accent.color, alpha: 0.15 });
            g.roundRect(0, 0, 44, 22, 4);
            g.stroke({ color: theme.accent.color, alpha: 0.5, width: 1 });
          }}
          layout={{ position: 'absolute', width: 44, height: 22 }}
        />
        <pixiBitmapText
          text="DOM"
          style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 9, fill: 0xffffff }}
          tint={theme.accent.color}
          layout={{}}
        />
      </pixiContainer>
    </pixiContainer>

    {/* Tab bar (shown when multiple project tabs open) */}
    {showTabBar && (
      <PixiDOMOverlay
        layout={{ width: '100%', height: TAB_BAR_HEIGHT }}
        style={{
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          padding: '0 8px',
          background: '#181825',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
        }}
      >
        <PixiTabBar />
      </PixiDOMOverlay>
    )}
    </pixiContainer>
  );
};

// ─── Tab Bar (DOM) ──────────────────────────────────────────────────────────

const PixiTabBar: React.FC = () => {
  const tabs = useTabsStore(s => s.tabs);
  const activeTabId = useTabsStore(s => s.activeTabId);
  const addTab = useTabsStore(s => s.addTab);
  const closeTab = useTabsStore(s => s.closeTab);
  const setActiveTab = useTabsStore(s => s.setActiveTab);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flex: 1, overflow: 'hidden' }}>
      {tabs.map(tab => (
        <button
          key={tab.id}
          onClick={() => setActiveTab(tab.id)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '2px 10px',
            fontSize: '11px',
            fontFamily: 'monospace',
            background: activeTabId === tab.id ? '#1e1e2e' : '#11111b',
            color: activeTabId === tab.id ? '#cdd6f4' : '#6c7086',
            border: activeTabId === tab.id ? '1px solid rgba(255,255,255,0.12)' : '1px solid transparent',
            borderRadius: '4px 4px 0 0',
            cursor: 'pointer',
            maxWidth: '160px',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          <span>{tab.name || 'Untitled'}{tab.isDirty ? ' *' : ''}</span>
          {tabs.length > 1 && (
            <span
              onClick={(e) => { e.stopPropagation(); closeTab(tab.id); }}
              style={{
                padding: '0 2px',
                borderRadius: '2px',
                opacity: 0.5,
                cursor: 'pointer',
                fontSize: '10px',
              }}
              onMouseEnter={(e) => { (e.target as HTMLElement).style.opacity = '1'; }}
              onMouseLeave={(e) => { (e.target as HTMLElement).style.opacity = '0.5'; }}
            >
              ×
            </span>
          )}
        </button>
      ))}
      <button
        onClick={addTab}
        style={{
          padding: '2px 6px',
          fontSize: '14px',
          background: 'transparent',
          color: '#6c7086',
          border: 'none',
          cursor: 'pointer',
          borderRadius: '4px',
        }}
        title="New project tab"
      >
        +
      </button>
    </div>
  );
};
