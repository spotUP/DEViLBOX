/**
 * PixiTabBar — Project tabs for PixiNavBar.
 * Scrollable tab pills with close buttons and a new-tab button.
 */
import React, { useCallback, useState } from 'react';
import type { Graphics as GraphicsType } from 'pixi.js';
import { PIXI_FONTS } from '../fonts';
import { usePixiTheme } from '../theme';

export interface Tab { id: string; label: string; dirty?: boolean }

interface PixiTabBarProps {
  tabs: Tab[];
  activeTabId: string;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onNew: () => void;
  width: number;
  height?: number;
  layout?: Record<string, unknown>;
}

const TAB_MIN_W = 80;
const TAB_MAX_W = 160;
const TAB_H = 28;
const CLOSE_BTN_SIZE = 14;
const NEW_BTN_W = 28;
const PADDING_H = 10;

export const PixiTabBar: React.FC<PixiTabBarProps> = ({
  tabs,
  activeTabId,
  onSelect,
  onClose,
  onNew,
  width,
  height = TAB_H,
  layout: layoutProp,
}) => {
  const theme = usePixiTheme();
  const [scrollOffset, setScrollOffset] = useState(0);

  const tabW = Math.max(TAB_MIN_W, Math.min(TAB_MAX_W, Math.floor((width - NEW_BTN_W - 4) / Math.max(1, tabs.length))));
  const totalTabsW = tabs.length * tabW;
  const viewportW = width - NEW_BTN_W - 4;
  const canScrollLeft = scrollOffset > 0;
  const canScrollRight = totalTabsW - scrollOffset > viewportW;

  const drawBar = useCallback((g: GraphicsType) => {
    g.clear();
    g.rect(0, 0, width, height);
    g.fill({ color: theme.bgTertiary.color });
    g.rect(0, height - 1, width, 1);
    g.fill({ color: theme.border.color, alpha: 0.5 });
  }, [width, height, theme]);

  return (
    <pixiContainer
      layout={{ width, height, flexDirection: 'row', ...layoutProp }}
      eventMode="static"
    >
      <pixiGraphics draw={drawBar} layout={{ position: 'absolute', width, height }} />

      <pixiContainer
        layout={{ width: viewportW, height, overflow: 'hidden', flexDirection: 'row' }}
      >
        {tabs.map((tab) => (
          <PixiTab
            key={tab.id}
            tab={tab}
            isActive={tab.id === activeTabId}
            width={tabW}
            height={height}
            onSelect={() => onSelect(tab.id)}
            onClose={() => onClose(tab.id)}
            scrollOffset={scrollOffset}
          />
        ))}
        {tabs.map((tab, i) => (
          tab.id === activeTabId ? (
            <pixiGraphics
              key={`underline-${tab.id}`}
              draw={(g: GraphicsType) => {
                g.clear();
                g.rect(i * tabW - scrollOffset, height - 2, tabW, 2);
                g.fill({ color: theme.accent.color });
              }}
              layout={{ position: 'absolute', width, height }}
            />
          ) : null
        ))}
      </pixiContainer>

      {canScrollLeft && (
        <PixiTabScrollBtn
          label="◂"
          height={height}
          onClick={() => setScrollOffset(s => Math.max(0, s - tabW))}
        />
      )}
      {canScrollRight && (
        <PixiTabScrollBtn
          label="▸"
          height={height}
          onClick={() => setScrollOffset(s => s + tabW)}
        />
      )}

      <PixiTabNewBtn height={height} onClick={onNew} />
    </pixiContainer>
  );
};

interface PixiTabProps {
  tab: Tab;
  isActive: boolean;
  width: number;
  height: number;
  onSelect: () => void;
  onClose: () => void;
  scrollOffset: number;
}

const PixiTab: React.FC<PixiTabProps> = ({
  tab, isActive, width, height, onSelect, onClose,
}) => {
  const theme = usePixiTheme();
  const [hovered, setHovered] = useState(false);

  const maxLabelW = width - PADDING_H * 2 - CLOSE_BTN_SIZE - 4;
  const rawLabel = tab.label.length > 16 ? tab.label.slice(0, 14) + '…' : tab.label;
  const displayLabel = tab.dirty ? `${rawLabel} •` : rawLabel;

  const drawBg = useCallback((g: GraphicsType) => {
    g.clear();
    if (isActive) {
      g.rect(0, 0, width, height - 2);
      g.fill({ color: theme.bgSecondary.color });
    } else if (hovered) {
      g.rect(0, 0, width, height - 2);
      g.fill({ color: theme.bgHover.color, alpha: 0.5 });
    }
    g.rect(width - 1, 4, 1, height - 8);
    g.fill({ color: theme.border.color, alpha: 0.4 });
  }, [isActive, hovered, width, height, theme]);

  return (
    <pixiContainer
      eventMode="static"
      cursor="pointer"
      onPointerOver={() => setHovered(true)}
      onPointerOut={() => setHovered(false)}
      onPointerUp={onSelect}
      layout={{ width, height, flexDirection: 'row', alignItems: 'center', paddingLeft: PADDING_H }}
    >
      <pixiGraphics draw={drawBg} layout={{ position: 'absolute', width, height }} />
      <pixiBitmapText
        text={displayLabel}
        style={{ fontFamily: PIXI_FONTS.SANS_MEDIUM, fontSize: 11, fill: 0xffffff }}
        tint={isActive ? theme.text.color : theme.textSecondary.color}
        layout={{ flex: 1, maxWidth: maxLabelW }}
      />
      {(isActive || hovered) && (
        <pixiContainer
          eventMode="static"
          cursor="pointer"
          onPointerUp={(e) => { e.stopPropagation(); onClose(); }}
          layout={{ width: CLOSE_BTN_SIZE, height: CLOSE_BTN_SIZE, justifyContent: 'center', alignItems: 'center', marginRight: 4 }}
        >
          <pixiBitmapText
            text="×"
            style={{ fontFamily: PIXI_FONTS.SANS_BOLD, fontSize: 13, fill: 0xffffff }}
            tint={hovered ? theme.error.color : theme.textMuted.color}
            layout={{}}
          />
        </pixiContainer>
      )}
    </pixiContainer>
  );
};

const PixiTabScrollBtn: React.FC<{ label: string; height: number; onClick: () => void }> = ({ label, height, onClick }) => {
  const theme = usePixiTheme();
  return (
    <pixiContainer
      eventMode="static"
      cursor="pointer"
      onPointerUp={onClick}
      layout={{ width: 20, height, justifyContent: 'center', alignItems: 'center' }}
    >
      <pixiBitmapText
        text={label}
        style={{ fontFamily: PIXI_FONTS.SANS, fontSize: 12, fill: 0xffffff }}
        tint={theme.textSecondary.color}
        layout={{}}
      />
    </pixiContainer>
  );
};

const PixiTabNewBtn: React.FC<{ height: number; onClick: () => void }> = ({ height, onClick }) => {
  const theme = usePixiTheme();
  const [hovered, setHovered] = useState(false);
  return (
    <pixiContainer
      eventMode="static"
      cursor="pointer"
      onPointerOver={() => setHovered(true)}
      onPointerOut={() => setHovered(false)}
      onPointerUp={onClick}
      layout={{ width: NEW_BTN_W, height, justifyContent: 'center', alignItems: 'center' }}
    >
      <pixiBitmapText
        text="+"
        style={{ fontFamily: PIXI_FONTS.SANS_BOLD, fontSize: 16, fill: 0xffffff }}
        tint={hovered ? theme.accent.color : theme.textSecondary.color}
        layout={{}}
      />
    </pixiContainer>
  );
};
