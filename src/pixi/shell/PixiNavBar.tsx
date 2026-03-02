/**
 * PixiNavBar — Modern single-row navigation bar.
 *
 * Three zones:
 *   Left (160px):  Logo + view selector pills (TRK, ARR, PRD, DJ, VJ)
 *   Center (flex):  PixiTransportBar (play/stop/BPM/position/loop)
 *   Right (160px):  Save, Load, Theme, Dock toggle, DOM toggle
 */

import React, { useCallback } from 'react';
import type { Graphics as GraphicsType } from 'pixi.js';
import { PIXI_FONTS } from '../fonts';
import { usePixiTheme } from '../theme';
import { PixiButton } from '../components/PixiButton';
import { usePixiResponsive } from '../hooks/usePixiResponsive';
import { useThemeStore, themes } from '@stores/useThemeStore';
import { useSettingsStore } from '@stores/useSettingsStore';
import { useUIStore } from '@stores/useUIStore';
import { useProjectStore } from '@stores/useProjectStore';
import { MODERN_NAV_H } from '../workbench/workbenchLayout';
import { serializeProjectToBlob, loadProjectFromObject } from '@hooks/useProjectPersistence';
import { PixiTransportBar } from './PixiTransportBar';

// ─── View selector pills ─────────────────────────────────────────────────────

const VIEW_TABS = [
  { id: 'tracker',     label: 'TRK' },
  { id: 'arrangement', label: 'ARR' },
  { id: 'pianoroll',   label: 'PRD' },
  { id: 'dj',          label: 'DJ'  },
  { id: 'vj',          label: 'VJ'  },
] as const;

// ─── PixiNavBar ──────────────────────────────────────────────────────────────

interface PixiNavBarProps {
  /** Whether the bottom dock is collapsed (shows expand pill if true) */
  dockCollapsed?: boolean;
  /** Callback to expand the dock */
  onExpandDock?: () => void;
}

export const PixiNavBar: React.FC<PixiNavBarProps> = ({
  dockCollapsed = false,
  onExpandDock,
}) => {
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

  // ─── Project Load ────────────────────────────────────────────────────────
  const handleLoadFile = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.dvbx,.json';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const data = JSON.parse(text) as unknown;
        const ok = await loadProjectFromObject(data);
        if (!ok) {
          console.warn('[PixiNavBar] Failed to load project — incompatible or outdated file.');
        }
      } catch (err) {
        console.error('[PixiNavBar] Failed to parse project file:', err);
      }
    };
    input.click();
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

  // Background
  const drawBg = useCallback((g: GraphicsType) => {
    g.clear();
    g.rect(0, 0, width, MODERN_NAV_H);
    g.fill({ color: theme.bgTertiary.color });
    // Bottom border
    g.rect(0, MODERN_NAV_H - 1, width, 1);
    g.fill({ color: theme.border.color, alpha: 0.4 });
  }, [width, theme]);

  // Transport bar width: center zone gets whatever's left after left/right
  const LEFT_W = 280;
  const RIGHT_W = 240;
  const transportW = Math.max(200, width - LEFT_W - RIGHT_W);

  return (
    <pixiContainer
      layout={{
        width,
        height: MODERN_NAV_H,
        flexDirection: 'row',
        alignItems: 'center',
      }}
    >
      <pixiGraphics
        draw={drawBg}
        layout={{ position: 'absolute', width, height: MODERN_NAV_H }}
      />

      {/* ═══ Left zone: Logo + view selector pills ═══ */}
      <pixiContainer
        layout={{
          width: LEFT_W,
          height: MODERN_NAV_H,
          flexDirection: 'row',
          alignItems: 'center',
          paddingLeft: 16,
          gap: 4,
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
              onClick={() => setActiveView(id as any)}
              width={36}
            />
          );
        })}
      </pixiContainer>

      {/* ═══ Center zone: Transport ═══ */}
      <PixiTransportBar width={transportW} height={MODERN_NAV_H} />

      {/* ═══ Right zone: Actions ═══ */}
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
        <PixiButton label="SAVE" variant="ghost" size="sm" onClick={handleSaveFile} width={44} />
        <PixiButton label="LOAD" variant="ghost" size="sm" onClick={handleLoadFile} width={44} />

        {/* Dock expand pill (visible when dock is collapsed) */}
        <PixiButton
          label="DOCK"
          variant="ft2"
          size="sm"
          active={!dockCollapsed}
          onClick={() => dockCollapsed ? onExpandDock?.() : undefined}
          width={44}
        />

        <PixiButton label="THEME" variant="ghost" size="sm" onClick={handleThemeCycle} width={52} />
        <PixiButton label="DOM" variant="ghost" size="sm" onClick={handleSwitchToDom} width={36} />
      </pixiContainer>
    </pixiContainer>
  );
};
