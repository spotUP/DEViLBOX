/**
 * PixiNavBar — Top navigation bar (36px) with view tabs, theme toggle, volume, MIDI indicator.
 * Reads from: useUIStore (activeView), useThemeStore, useAudioStore (masterVolume),
 *             useMIDIStore (isInitialized), useProjectStore (metadata).
 */

import { useCallback } from 'react';
import type { Graphics as GraphicsType } from 'pixi.js';
import { PIXI_FONTS } from '../fonts';
import { usePixiTheme } from '../theme';
import { useUIStore } from '@stores';
import { useThemeStore, themes } from '@stores/useThemeStore';
import { useProjectStore } from '@stores/useProjectStore';
import { useSettingsStore } from '@stores/useSettingsStore';

const NAV_HEIGHT = 36;

type ViewTab = 'tracker' | 'arrangement' | 'dj';
const VIEW_TABS: { id: ViewTab; label: string }[] = [
  { id: 'tracker', label: 'TRACKER' },
  { id: 'arrangement', label: 'ARRANGE' },
  { id: 'dj', label: 'DJ' },
];

export const PixiNavBar: React.FC = () => {
  const theme = usePixiTheme();

  // Store subscriptions
  const activeView = useUIStore(s => s.activeView);
  const setActiveView = useUIStore(s => s.setActiveView);
  const projectName = useProjectStore(s => s.metadata?.name || 'Untitled');
  const currentThemeId = useThemeStore(s => s.currentThemeId);
  const setTheme = useThemeStore(s => s.setTheme);

  // Cycle through themes
  const handleThemeToggle = useCallback(() => {
    const idx = themes.findIndex(t => t.id === currentThemeId);
    const next = themes[(idx + 1) % themes.length];
    setTheme(next.id);
  }, [currentThemeId, setTheme]);

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

  return (
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
  );
};
