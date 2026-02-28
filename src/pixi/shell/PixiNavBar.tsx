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
import { useWorkbenchStore } from '@stores/useWorkbenchStore';
import { BUILTIN_WORKSPACES, springCameraTo, fitAllWindows } from '../workbench/WorkbenchExpose';

/** View window toggle buttons shown in the NavBar */
const VIEW_WINDOWS = [
  { id: 'tracker',     label: 'TRK' },
  { id: 'pianoroll',  label: 'PNO' },
  { id: 'arrangement',label: 'ARR' },
  { id: 'dj',         label: 'DJ'  },
  { id: 'vj',         label: 'VJ'  },
  { id: 'instrument', label: 'INS' },
] as const;

// ─── Workspace Picker Popup ───────────────────────────────────────────────────

const POPUP_W = 160;
const POPUP_ITEM_H = 24;

interface WorkspacePopupProps {
  /** Y offset below the button */
  offsetY: number;
  onClose: () => void;
}

const WorkspacePopup: React.FC<WorkspacePopupProps> = ({ offsetY, onClose }) => {
  const theme = usePixiTheme();
  const userWorkspaces = useWorkbenchStore((s) => s.workspaces);
  const saveWorkspace   = useWorkbenchStore((s) => s.saveWorkspace);
  const loadWorkspace   = useWorkbenchStore((s) => s.loadWorkspace);

  const allBuiltins = Object.keys(BUILTIN_WORKSPACES);
  const allUser     = Object.keys(userWorkspaces);
  const items = [
    ...allBuiltins.map((n) => ({ name: n, builtin: true })),
    ...allUser.map((n) => ({ name: n, builtin: false })),
    { name: '+ Save Current', builtin: false, isSave: true },
  ] as const;

  const itemCount = items.length;
  const popupH = itemCount * POPUP_ITEM_H + 8;

  const drawBg = useCallback((g: GraphicsType) => {
    g.clear();
    g.roundRect(0, 0, POPUP_W, popupH, 6);
    g.fill({ color: 0x0c0c18, alpha: 0.97 });
    g.roundRect(0, 0, POPUP_W, popupH, 6);
    g.stroke({ color: theme.border.color, alpha: 0.6, width: 1 });
  }, [popupH, theme]);

  const handleItem = useCallback((name: string, isSave: boolean, builtin: boolean) => {
    if (isSave) {
      const label = `Layout ${new Date().toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit' })}`;
      saveWorkspace(label);
    } else {
      if (builtin) {
        // Load built-in: apply windows directly then spring camera
        const ws = BUILTIN_WORKSPACES[name];
        const store = useWorkbenchStore.getState();
        for (const [id, w] of Object.entries(ws.windows)) {
          if (store.windows[id]) {
            store.moveWindow(id, w.x, w.y);
            store.resizeWindow(id, w.width, w.height);
            if (w.visible) store.showWindow(id);
            else store.hideWindow(id);
          }
        }
        springCameraTo(ws.camera);
      } else {
        loadWorkspace(name);
        springCameraTo(useWorkbenchStore.getState().camera);
      }
    }
    onClose();
  }, [saveWorkspace, loadWorkspace, onClose]);

  return (
    <pixiContainer y={offsetY} layout={{ position: 'absolute', width: POPUP_W }}>
      <pixiGraphics
        draw={drawBg}
        layout={{ position: 'absolute', width: POPUP_W, height: popupH }}
      />
      <pixiContainer layout={{ width: POPUP_W, flexDirection: 'column', paddingTop: 4 }}>
        {items.map((item) => (
          <WorkspaceItem
            key={item.name}
            label={item.name}
            isBuiltin={'builtin' in item ? item.builtin : false}
            isSave={'isSave' in item ? item.isSave : false}
            onPress={() => handleItem(item.name, 'isSave' in item ? !!item.isSave : false, 'builtin' in item ? item.builtin : false)}
          />
        ))}
      </pixiContainer>
    </pixiContainer>
  );
};

interface WorkspaceItemProps {
  label: string;
  isBuiltin: boolean;
  isSave: boolean;
  onPress: () => void;
}

const WorkspaceItem: React.FC<WorkspaceItemProps> = ({ label, isBuiltin, isSave, onPress }) => {
  const theme = usePixiTheme();
  const [hovered, setHovered] = useState(false);

  const drawBg = useCallback((g: GraphicsType) => {
    g.clear();
    if (hovered) {
      g.rect(2, 0, POPUP_W - 4, POPUP_ITEM_H);
      g.fill({ color: theme.bgHover.color });
    }
  }, [hovered, theme]);

  const textColor = isSave
    ? theme.accent.color
    : isBuiltin ? theme.textSecondary.color : theme.text.color;

  return (
    <pixiContainer
      eventMode="static"
      cursor="pointer"
      onPointerOver={() => setHovered(true)}
      onPointerOut={() => setHovered(false)}
      onPointerUp={onPress}
      layout={{ width: POPUP_W, height: POPUP_ITEM_H, paddingLeft: 12, alignItems: 'center' }}
    >
      <pixiGraphics draw={drawBg} layout={{ position: 'absolute', width: POPUP_W, height: POPUP_ITEM_H }} />
      <pixiBitmapText
        text={label}
        style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 11, fill: 0xffffff }}
        tint={textColor}
        layout={{ alignSelf: 'center' }}
      />
      {isBuiltin && (
        <pixiBitmapText
          text=" ★"
          style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 9, fill: 0xffffff }}
          tint={theme.textMuted.color}
          layout={{ alignSelf: 'center', marginLeft: 4 }}
        />
      )}
    </pixiContainer>
  );
};

const NAV_ROW1_H = 45;
const NAV_ROW2_H = 53;
const NAV_H = NAV_ROW1_H + NAV_ROW2_H;

export const PixiNavBar: React.FC = () => {
  const theme = usePixiTheme();
  const { width, height } = usePixiResponsive();

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

  // Workbench store — window visibility + 3D tilt
  const windows      = useWorkbenchStore((s) => s.windows);
  const toggleWindow = useWorkbenchStore((s) => s.toggleWindow);
  const isTilted     = useWorkbenchStore((s) => s.isTilted);
  const setTilted    = useWorkbenchStore((s) => s.setTilted);

  // Workspace picker popup state
  const [wsPickerOpen, setWsPickerOpen] = useState(false);

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

  // Fit all visible windows into view
  const handleFitAll = useCallback(() => {
    const ws = useWorkbenchStore.getState().windows;
    springCameraTo(fitAllWindows(ws, width, height));
  }, [width, height]);

  // Camera zoom presets — spring-animate to a fixed scale centred on screen
  const zoomToScale = useCallback((targetScale: number) => {
    const cam = useWorkbenchStore.getState().camera;
    const ratio = targetScale / cam.scale;
    const x = width  / 2 - (width  / 2 - cam.x) * ratio;
    const y = height / 2 - (height / 2 - cam.y) * ratio;
    springCameraTo({ x, y, scale: targetScale });
  }, [width, height]);

  // Bird's-eye: zoom way out so the whole layout is visible
  const handleBird = useCallback(() => {
    const ws = useWorkbenchStore.getState().windows;
    const cam = fitAllWindows(ws, width, height, 0.08);
    // Cap scale at 0.3 so it's always a wide-angle view
    springCameraTo({ ...cam, scale: Math.min(cam.scale, 0.3) });
  }, [width, height]);

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
          layout={{ marginRight: 16 }}
        />

        {/* View window toggle buttons */}
        {VIEW_WINDOWS.map(({ id, label }) => {
          const win = windows[id];
          const isOpen = win?.visible && !win?.minimized;
          return (
            <PixiButton
              key={id}
              label={label}
              variant="ft2"
              size="sm"
              active={isOpen}
              onClick={() => toggleWindow(id)}
              layout={{ marginRight: 4 }}
            />
          );
        })}

        {/* Spacer */}
        <pixiContainer layout={{ flex: 1 }} />

        {/* Camera presets: bird's-eye, fit-all, 1:1 */}
        <PixiButton
          label="BIRD"
          variant="ghost"
          size="sm"
          onClick={handleBird}
          layout={{ marginRight: 2 }}
        />
        <PixiButton
          label="FIT"
          variant="ghost"
          size="sm"
          onClick={handleFitAll}
          layout={{ marginRight: 2 }}
        />
        <PixiButton
          label="1:1"
          variant="ghost"
          size="sm"
          onClick={() => zoomToScale(1)}
          layout={{ marginRight: 4 }}
        />

        {/* WebGL 3D tilt toggle */}
        <PixiButton
          label="3D"
          variant="ft2"
          size="sm"
          active={isTilted}
          onClick={() => setTilted(!isTilted)}
          layout={{ marginRight: 8 }}
        />

        {/* Workspace snapshot picker */}
        <pixiContainer layout={{ position: 'relative', marginRight: 8 }}>
          <PixiButton
            label="LAYOUT"
            variant="ghost"
            size="sm"
            active={wsPickerOpen}
            onClick={() => setWsPickerOpen((v) => !v)}
          />
          {wsPickerOpen && (
            <WorkspacePopup offsetY={NAV_ROW1_H} onClose={() => setWsPickerOpen(false)} />
          )}
        </pixiContainer>

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
