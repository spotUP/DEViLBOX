/**
 * PixiNavBar — Pure Pixi navigation bar. No DOM overlay.
 *
 * Row 1 (45px): "DEViLBOX" logo text, spacer, theme switcher button, DOM mode button
 * Row 2 (53px): PixiTabBar with project tabs
 */

import React, { useCallback, useState } from 'react';
import type { Graphics as GraphicsType } from 'pixi.js';
import { PIXI_FONTS } from '../fonts';
import { usePixiTheme } from '../theme';
import { PixiButton } from '../components/PixiButton';
import { PixiTabBar, type Tab } from '../components/PixiTabBar';
import { usePixiResponsive } from '../hooks/usePixiResponsive';
import { useTabsStore } from '@stores/useTabsStore';
import { useThemeStore, themes } from '@stores/useThemeStore';
import { useSettingsStore } from '@stores/useSettingsStore';

const NAV_ROW1_H = 45;
const NAV_ROW2_H = 53;
const NAV_H = NAV_ROW1_H + NAV_ROW2_H;

export const PixiNavBar: React.FC = () => {
  const theme = usePixiTheme();
  const { width } = usePixiResponsive();

  // Tabs store
  const storeTabs = useTabsStore((s) => s.tabs);
  const activeTabId = useTabsStore((s) => s.activeTabId);
  const addTab = useTabsStore((s) => s.addTab);
  const closeTab = useTabsStore((s) => s.closeTab);
  const setActiveTab = useTabsStore((s) => s.setActiveTab);

  // Theme store
  const currentThemeId = useThemeStore((s) => s.currentThemeId);
  const setTheme = useThemeStore((s) => s.setTheme);

  // Settings store
  const setRenderMode = useSettingsStore((s) => s.setRenderMode);

  // Theme cycle button state
  const [themeHovered, setThemeHovered] = useState(false);

  // Map ProjectTab[] → Tab[] (ProjectTab uses `name`, Tab expects `label`)
  const tabs: Tab[] = storeTabs.map((t) => ({
    id: t.id,
    label: t.name,
    dirty: t.isDirty,
  }));

  // Theme cycling — cycle through available themes
  const handleThemeCycle = useCallback(() => {
    const idx = themes.findIndex((t) => t.id === currentThemeId);
    const next = themes[(idx + 1) % themes.length];
    setTheme(next.id);
  }, [currentThemeId, setTheme]);

  const handleSwitchToDom = useCallback(() => {
    setRenderMode('dom');
  }, [setRenderMode]);

  // Row 1 background
  const drawRow1Bg = useCallback((g: GraphicsType) => {
    g.clear();
    g.rect(0, 0, width, NAV_ROW1_H);
    g.fill({ color: theme.bg.color });
    // Bottom border
    g.rect(0, NAV_ROW1_H - 1, width, 1);
    g.fill({ color: theme.border.color, alpha: 0.5 });
  }, [width, theme]);

  // Overall container background (full height)
  const drawOuterBg = useCallback((g: GraphicsType) => {
    g.clear();
    g.rect(0, 0, width, NAV_H);
    g.fill({ color: theme.bg.color });
    // Bottom border under entire nav
    g.rect(0, NAV_H - 1, width, 1);
    g.fill({ color: theme.border.color, alpha: 0.4 });
  }, [width, theme]);

  return (
    <pixiContainer
      layout={{
        width,
        height: NAV_H,
        flexDirection: 'column',
      }}
    >
      {/* Full-height background */}
      <pixiGraphics
        draw={drawOuterBg}
        layout={{ position: 'absolute', width, height: NAV_H }}
      />

      {/* Row 1: Logo + controls */}
      <pixiContainer
        layout={{
          width,
          height: NAV_ROW1_H,
          flexDirection: 'row',
          alignItems: 'center',
          paddingLeft: 16,
          paddingRight: 12,
        }}
      >
        <pixiGraphics
          draw={drawRow1Bg}
          layout={{ position: 'absolute', width, height: NAV_ROW1_H }}
        />

        {/* Logo */}
        <pixiBitmapText
          text="DEViLBOX"
          style={{ fontFamily: PIXI_FONTS.MONO_BOLD, fontSize: 16, fill: 0xffffff }}
          tint={theme.accent.color}
          layout={{ flex: 1 }}
        />

        {/* Theme cycler */}
        <PixiButton
          label="THEME"
          variant="ghost"
          size="sm"
          onClick={handleThemeCycle}
          layout={{ marginRight: 8 }}
        />

        {/* Switch to DOM mode */}
        <PixiButton
          label="DOM"
          variant="ghost"
          size="sm"
          onClick={handleSwitchToDom}
        />
      </pixiContainer>

      {/* Row 2: Tab bar */}
      <PixiTabBar
        tabs={tabs}
        activeTabId={activeTabId}
        onSelect={setActiveTab}
        onClose={closeTab}
        onNew={addTab}
        width={width}
        height={NAV_ROW2_H}
        layout={{ flexShrink: 0 }}
      />
    </pixiContainer>
  );
};
