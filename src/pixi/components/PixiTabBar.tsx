/**
 * PixiTabBar — Project tabs for PixiNavBar.
 * Scrollable tab pills with close buttons and a new-tab button.
 * Uses layoutContainer native bg/border — no manual Graphics.
 */
import React, { useCallback, useState } from 'react';
import type { Graphics as GraphicsType } from 'pixi.js';
import { PIXI_FONTS } from '../fonts';
import { FAD_ICONS } from '../fontaudioIcons';
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

  return (
    <layoutContainer
      layout={{
        width,
        height,
        flexDirection: 'row',
        backgroundColor: theme.bgTertiary.color,
        borderBottomWidth: 1,
        borderColor: theme.border.color,
        ...layoutProp,
      }}
      eventMode="static"
    >

      <pixiContainer
        layout={{ width: viewportW, height, overflow: 'hidden', flexDirection: 'row' }}
      >
        {tabs.map((tab, i) => (
          <PixiTab
            key={tab.id}
            tab={tab}
            isActive={tab.id === activeTabId}
            width={tabW}
            height={height}
            onSelect={() => onSelect(tab.id)}
            onClose={() => onClose(tab.id)}
            tabIndex={i}
            scrollOffset={scrollOffset}
          />
        ))}
      </pixiContainer>

      <PixiTabScrollBtn
        label=""
        icon="caret-left"
        height={height}
        visible={canScrollLeft}
        onClick={() => setScrollOffset(s => Math.max(0, s - tabW))}
      />
      <PixiTabScrollBtn
        label=""
        icon="caret-right"
        height={height}
        visible={canScrollRight}
        onClick={() => setScrollOffset(s => s + tabW)}
      />

      <PixiTabNewBtn height={height} onClick={onNew} />
    </layoutContainer>
  );
};

interface PixiTabProps {
  tab: Tab;
  isActive: boolean;
  width: number;
  height: number;
  onSelect: () => void;
  onClose: () => void;
  tabIndex: number;
  scrollOffset: number;
}

const PixiTab: React.FC<PixiTabProps> = ({
  tab, isActive, width, height, onSelect, onClose, tabIndex, scrollOffset,
}) => {
  const theme = usePixiTheme();
  const [hovered, setHovered] = useState(false);

  const maxLabelW = width - PADDING_H * 2 - CLOSE_BTN_SIZE - 4;
  const rawLabel = tab.label.length > 16 ? tab.label.slice(0, 14) + '…' : tab.label;
  const displayLabel = tab.dirty ? `${rawLabel} •` : rawLabel;
  const showClose = isActive || hovered;

  const drawUnderline = useCallback((g: GraphicsType) => {
    g.clear();
    if (!isActive) return;
    g.rect(tabIndex * width - scrollOffset, height - 2, width, 2);
    g.fill({ color: theme.accent.color });
  }, [isActive, tabIndex, width, scrollOffset, height, theme]);

  return (
    <layoutContainer
      eventMode="static"
      cursor="pointer"
      onPointerOver={() => setHovered(true)}
      onPointerOut={() => setHovered(false)}
      onPointerUp={onSelect}
      layout={{
        width,
        height,
        flexDirection: 'row',
        alignItems: 'center',
        paddingLeft: PADDING_H,
        backgroundColor: isActive ? theme.bgSecondary.color : hovered ? theme.bgHover.color : undefined,
        borderRightWidth: 1,
        borderColor: theme.border.color,
      }}
    >
      {/* Active underline — always rendered, only visible when active */}
      <pixiGraphics eventMode="none" draw={drawUnderline} layout={{ position: 'absolute', width, height }} />
      <pixiBitmapText
        eventMode="none"
        text={displayLabel}
        style={{ fontFamily: PIXI_FONTS.SANS_MEDIUM, fontSize: 13, fill: 0xffffff }}
        tint={isActive ? theme.text.color : theme.textSecondary.color}
        layout={{ flex: 1, maxWidth: maxLabelW }}
      />
      {/* Close button — always in layout tree, hidden via alpha to avoid @pixi/layout BindingError */}
      <pixiContainer
        eventMode={showClose ? 'static' : 'none'}
        cursor="pointer"
        alpha={showClose ? 1 : 0}
        onPointerUp={(e: { stopPropagation: () => void }) => { e.stopPropagation(); onClose(); }}
        layout={{ width: CLOSE_BTN_SIZE, height: CLOSE_BTN_SIZE, justifyContent: 'center', alignItems: 'center', marginRight: 4 }}
      >
        <pixiBitmapText
          eventMode="none"
          text="×"
          style={{ fontFamily: PIXI_FONTS.SANS_BOLD, fontSize: 15, fill: 0xffffff }}
          tint={hovered ? theme.error.color : theme.textMuted.color}
          layout={{}}
        />
      </pixiContainer>
    </layoutContainer>
  );
};

const PixiTabScrollBtn: React.FC<{ label: string; icon?: string; height: number; visible: boolean; onClick: () => void }> = ({ icon, height, visible, onClick }) => {
  const theme = usePixiTheme();
  const iconChar = icon ? FAD_ICONS[icon] : undefined;
  return (
    <pixiContainer
      eventMode={visible ? 'static' : 'none'}
      cursor="pointer"
      onPointerUp={onClick}
      alpha={visible ? 1 : 0}
      layout={{ width: 20, height, justifyContent: 'center', alignItems: 'center' }}
    >
      {iconChar && (
        <pixiBitmapText
          eventMode="none"
          text={iconChar}
          style={{ fontFamily: PIXI_FONTS.ICONS, fontSize: 14, fill: 0xffffff }}
          tint={theme.textSecondary.color}
          layout={{}}
        />
      )}
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
        style={{ fontFamily: PIXI_FONTS.SANS_BOLD, fontSize: 18, fill: 0xffffff }}
        tint={hovered ? theme.accent.color : theme.textSecondary.color}
        layout={{}}
      />
    </pixiContainer>
  );
};
