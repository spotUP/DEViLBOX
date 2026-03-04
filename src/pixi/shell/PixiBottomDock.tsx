/**
 * PixiBottomDock — Resizable tabbed dock panel at the bottom of the modern shell.
 * Tabs: MIXER | DEVICE | MASTER FX
 * Supports resize via drag handle, collapse to 0, and expand.
 */

import React, { useCallback, useRef, useState } from 'react';
import type { Graphics as GraphicsType, FederatedPointerEvent } from 'pixi.js';
import { PIXI_FONTS } from '../fonts';
import { usePixiTheme } from '../theme';
import { MODERN_DOCK_TAB_H, MODERN_DOCK_MIN_H, MODERN_DOCK_MAX_H } from '../workbench/workbenchLayout';
import { PixiMasterFxView } from '../views/PixiMasterFxView';
import { PixiInstrumentEditor } from '../views/PixiInstrumentEditor';
import { PixiButton } from '../components/PixiButton';
import { useInstrumentStore } from '@stores/useInstrumentStore';
import { useUIStore } from '@stores/useUIStore';

// ─── Dock tab definitions ────────────────────────────────────────────────────

export type DockTab = 'device' | 'master-fx';

const DOCK_TABS: { id: DockTab; label: string }[] = [
  { id: 'device',    label: 'DEVICE' },
  { id: 'master-fx', label: 'MASTER FX' },
];

// ─── Instrument editor wrapper ───────────────────────────────────────────────

const InstrumentEditorDockPanel: React.FC = () => {
  const instrument = useInstrumentStore((s) =>
    s.instruments.find((i) => i.id === s.currentInstrumentId) ?? s.instruments[0]
  );
  const updateInstrument = useInstrumentStore((s) => s.updateInstrument);

  if (!instrument) return null;

  return (
    <PixiInstrumentEditor
      synthType={instrument.synthType}
      config={instrument as unknown as Record<string, unknown>}
      onChange={(updates) => updateInstrument(instrument.id, updates)}
      instrumentName={instrument.name}
    />
  );
};

// ─── Dock tab button ─────────────────────────────────────────────────────────

interface DockTabButtonProps {
  label: string;
  isActive: boolean;
  onPress: () => void;
}

const DockTabButton: React.FC<DockTabButtonProps> = ({ label, isActive, onPress }) => {
  const theme = usePixiTheme();
  const [hovered, setHovered] = useState(false);
  const W = Math.max(60, label.length * 8 + 20);

  const drawBg = useCallback((g: GraphicsType) => {
    g.clear();
    if (isActive) {
      // Active: accent bottom border, subtle fill
      g.rect(0, 0, W, MODERN_DOCK_TAB_H);
      g.fill({ color: theme.bgSecondary.color });
      g.rect(0, MODERN_DOCK_TAB_H - 2, W, 2);
      g.fill({ color: theme.accent.color });
    } else if (hovered) {
      g.rect(0, 0, W, MODERN_DOCK_TAB_H);
      g.fill({ color: theme.bgHover.color, alpha: 0.5 });
    }
  }, [W, isActive, hovered, theme]);

  return (
    <pixiContainer
      eventMode="static"
      cursor="pointer"
      onPointerOver={() => setHovered(true)}
      onPointerOut={() => setHovered(false)}
      onPointerUp={onPress}
      layout={{ width: W, height: MODERN_DOCK_TAB_H, justifyContent: 'center', alignItems: 'center' }}
    >
      <pixiGraphics draw={drawBg} layout={{ position: 'absolute', width: W, height: MODERN_DOCK_TAB_H }} />
      <pixiBitmapText
        text={label}
        style={{ fontFamily: PIXI_FONTS.SANS_SEMIBOLD, fontSize: 13, fill: 0xffffff }}
        tint={isActive ? theme.text.color : theme.textSecondary.color}
        layout={{}}
      />
    </pixiContainer>
  );
};

// ─── PixiBottomDock ──────────────────────────────────────────────────────────

interface PixiBottomDockProps {
  width: number;
  height: number;
  activeTab: DockTab;
  onChangeTab: (tab: DockTab) => void;
  onResize: (newHeight: number) => void;
  onCollapse: () => void;
  onUndock?: () => void;
}

export const PixiBottomDock: React.FC<PixiBottomDockProps> = ({
  width,
  height,
  activeTab,
  onChangeTab,
  onResize,
  onCollapse,
  onUndock,
}) => {
  const theme = usePixiTheme();
  const dragRef = useRef<{ startY: number; startH: number } | null>(null);

  // Resize handle (4px tall at top edge)
  const drawHandle = useCallback((g: GraphicsType) => {
    g.clear();
    g.rect(0, 0, width, 4);
    g.fill({ color: 0x000000, alpha: 0 }); // hit area
    // Visual indicator: small centered bar
    const barW = 40;
    const barX = (width - barW) / 2;
    g.roundRect(barX, 1, barW, 2, 1);
    g.fill({ color: theme.borderLight.color, alpha: 0.6 });
  }, [width, theme]);

  const handleResizeDown = useCallback((e: FederatedPointerEvent) => {
    e.stopPropagation();
    dragRef.current = { startY: e.globalY, startH: height };
    document.body.style.cursor = 'ns-resize';

    const onMove = (me: PointerEvent) => {
      if (!dragRef.current) return;
      const delta = dragRef.current.startY - me.clientY;
      const newH = Math.max(MODERN_DOCK_MIN_H, Math.min(MODERN_DOCK_MAX_H, dragRef.current.startH + delta));
      onResize(newH);
    };

    const onUp = () => {
      dragRef.current = null;
      document.body.style.cursor = '';
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
    };

    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  }, [height, onResize]);

  const contentH = height - MODERN_DOCK_TAB_H - 4; // -4 for resize handle

  return (
    <layoutContainer layout={{
      width, height, flexDirection: 'column',
      backgroundColor: theme.bgSecondary.color,
      borderTopWidth: 1,
      borderColor: theme.border.color,
    }}>

      {/* Resize handle */}
      <pixiGraphics
        draw={drawHandle}
        eventMode="static"
        cursor="ns-resize"
        onPointerDown={handleResizeDown}
        layout={{ width, height: 4, flexShrink: 0 }}
      />

      {/* Tab bar */}
      <pixiContainer layout={{
        width,
        height: MODERN_DOCK_TAB_H,
        flexDirection: 'row',
        alignItems: 'center',
        paddingLeft: 8,
        gap: 0,
        flexShrink: 0,
      }}>
        {DOCK_TABS.map((tab) => (
          <DockTabButton
            key={tab.id}
            label={tab.label}
            isActive={activeTab === tab.id}
            onPress={() => onChangeTab(tab.id)}
          />
        ))}

        {/* Spacer */}
        <pixiContainer layout={{ flex: 1 }} />

        {/* Instrument FX button */}
        <PixiButton
          label="INST FX"
          variant="ghost"
          size="sm"
          onClick={() => {
            const s = useUIStore.getState();
            s.modalOpen === 'instrumentFx' ? s.closeModal() : s.openModal('instrumentFx');
          }}
        />

        {/* Undock button */}
        <pixiContainer
          eventMode="static"
          cursor="pointer"
          onPointerUp={onUndock}
          alpha={onUndock ? 1 : 0.3}
          layout={{ width: 28, height: 28, justifyContent: 'center', alignItems: 'center', marginRight: 4 }}
        >
          <pixiBitmapText
            text={'\u2B06'}
            style={{ fontFamily: PIXI_FONTS.SANS, fontSize: 14, fill: 0xffffff }}
            tint={theme.textMuted.color}
            layout={{}}
          />
        </pixiContainer>

        {/* Close dock button */}
        <pixiContainer
          eventMode="static"
          cursor="pointer"
          onPointerUp={onCollapse}
          layout={{ width: 28, height: 28, justifyContent: 'center', alignItems: 'center', marginRight: 8 }}
        >
          <pixiBitmapText
            text={'\u2715'}
            style={{ fontFamily: PIXI_FONTS.SANS, fontSize: 14, fill: 0xffffff }}
            tint={theme.textMuted.color}
            layout={{}}
          />
        </pixiContainer>
      </pixiContainer>

      {/* Content area — only active tab is mounted.
          Inactive tabs unmount completely, stopping their useTick handlers
          (e.g. 16 mixer VU meters that redraw Graphics every frame). */}
      <pixiContainer key={activeTab} layout={{ width, height: Math.max(0, contentH), flexDirection: 'column', overflow: 'hidden' }}>
        <pixiContainer
          layout={{
            width,
            height: Math.max(0, contentH),
            flexDirection: 'column',
          }}
        >
          {activeTab === 'device' && <InstrumentEditorDockPanel />}
          {activeTab === 'master-fx' && <PixiMasterFxView />}
        </pixiContainer>
      </pixiContainer>
    </layoutContainer>
  );
};
