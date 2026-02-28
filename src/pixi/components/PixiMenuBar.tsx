/**
 * PixiMenuBar — Horizontal menu bar with dropdown menus.
 * Used by PixiFT2Toolbar for File / Edit / Module / Help menus.
 */
import React, { useCallback, useState } from 'react';
import type { Graphics as GraphicsType, FederatedPointerEvent } from 'pixi.js';
import { PIXI_FONTS } from '../fonts';
import { usePixiTheme } from '../theme';

export type MenuSeparator = { type: 'separator' };
export type MenuAction = { type: 'action'; label: string; shortcut?: string; onClick: () => void; disabled?: boolean };
export type MenuCheckbox = { type: 'checkbox'; label: string; checked: boolean; onChange: (v: boolean) => void };
export type MenuItem = MenuSeparator | MenuAction | MenuCheckbox;
export interface Menu { label: string; items: MenuItem[] }

interface PixiMenuBarProps {
  menus: Menu[];
  height?: number;
  layout?: Record<string, unknown>;
}

const MENU_BTN_PADDING = 10;
const ITEM_H = 22;
const SEP_H = 9;
const DROPDOWN_MIN_W = 200;
const SHORTCUT_COL_W = 80;

function itemHeight(item: MenuItem): number {
  return item.type === 'separator' ? SEP_H : ITEM_H;
}

export const PixiMenuBar: React.FC<PixiMenuBarProps> = ({
  menus,
  height = 24,
  layout: layoutProp,
}) => {
  const [openMenuIndex, setOpenMenuIndex] = useState<number | null>(null);

  const openMenu = useCallback((i: number) => setOpenMenuIndex(i), []);
  const closeAll = useCallback(() => setOpenMenuIndex(null), []);

  return (
    <pixiContainer
      layout={{ flexDirection: 'row', height, alignItems: 'center', ...layoutProp }}
      eventMode="static"
    >
      {menus.map((menu, i) => {
        const isOpen = openMenuIndex === i;
        return (
          <PixiMenuButton
            key={menu.label}
            menu={menu}
            isOpen={isOpen}
            height={height}
            onOpen={() => openMenu(i)}
            onClose={closeAll}
            onHoverOpen={() => { if (openMenuIndex !== null && openMenuIndex !== i) openMenu(i); }}
          />
        );
      })}
    </pixiContainer>
  );
};

interface PixiMenuButtonProps {
  menu: Menu;
  isOpen: boolean;
  height: number;
  onOpen: () => void;
  onClose: () => void;
  onHoverOpen: () => void;
}

const PixiMenuButton: React.FC<PixiMenuButtonProps> = ({
  menu, isOpen, height, onOpen, onClose, onHoverOpen,
}) => {
  const theme = usePixiTheme();
  const [hovered, setHovered] = useState(false);

  const btnW = menu.label.length * 8 + MENU_BTN_PADDING * 2;

  const drawBtnBg = useCallback((g: GraphicsType) => {
    g.clear();
    if (!isOpen && !hovered) return;
    g.rect(0, 0, btnW, height);
    g.fill({ color: isOpen ? theme.accent.color : theme.bgHover.color, alpha: isOpen ? 0.25 : 0.5 });
  }, [isOpen, hovered, btnW, height, theme]);

  const dropdownH = menu.items.reduce((sum, item) => sum + itemHeight(item), 0) + 8;
  const dropdownW = DROPDOWN_MIN_W;

  const drawDropdownBg = useCallback((g: GraphicsType) => {
    g.clear();
    g.roundRect(0, 0, dropdownW, dropdownH, 4);
    g.fill({ color: theme.bgSecondary.color });
    g.roundRect(0, 0, dropdownW, dropdownH, 4);
    g.stroke({ color: theme.border.color, alpha: 0.8, width: 1 });
  }, [dropdownW, dropdownH, theme]);

  return (
    <pixiContainer
      eventMode="static"
      cursor="pointer"
      onPointerOver={() => { setHovered(true); onHoverOpen(); }}
      onPointerOut={() => setHovered(false)}
      onPointerUp={() => isOpen ? onClose() : onOpen()}
      layout={{ width: btnW, height, justifyContent: 'center', alignItems: 'center' }}
    >
      <pixiGraphics draw={drawBtnBg} layout={{ position: 'absolute', width: btnW, height }} />
      <pixiBitmapText
        text={menu.label}
        style={{ fontFamily: PIXI_FONTS.SANS, fontSize: 11, fill: 0xffffff }}
        tint={isOpen ? theme.accent.color : theme.textSecondary.color}
        layout={{}}
      />
      {isOpen && (
        <pixiContainer
          zIndex={300}
          eventMode="static"
          onPointerDown={(e: FederatedPointerEvent) => e.stopPropagation()}
          layout={{ position: 'absolute', top: height, left: 0, width: dropdownW, height: dropdownH, flexDirection: 'column', padding: 4 }}
        >
          <pixiGraphics draw={drawDropdownBg} layout={{ position: 'absolute', width: dropdownW, height: dropdownH }} />
          {menu.items.map((item, j) => (
            <PixiMenuItem key={j} item={item} width={dropdownW - 8} onClose={onClose} />
          ))}
        </pixiContainer>
      )}
    </pixiContainer>
  );
};

interface PixiMenuItemProps {
  item: MenuItem;
  width: number;
  onClose: () => void;
}

const PixiMenuItem: React.FC<PixiMenuItemProps> = ({ item, width, onClose }) => {
  const theme = usePixiTheme();
  const [hovered, setHovered] = useState(false);
  const h = itemHeight(item);

  if (item.type === 'separator') {
    return (
      <pixiContainer layout={{ width, height: h, justifyContent: 'center' }}>
        <pixiGraphics
          draw={(g: GraphicsType) => {
            g.clear();
            g.rect(0, h / 2 - 0.5, width, 1);
            g.fill({ color: theme.border.color, alpha: 0.5 });
          }}
          layout={{ width, height: h }}
        />
      </pixiContainer>
    );
  }

  const isDisabled = item.type === 'action' && item.disabled;
  const drawItemBg = useCallback((g: GraphicsType) => {
    g.clear();
    if (!hovered || isDisabled) return;
    g.roundRect(0, 0, width, h, 2);
    g.fill({ color: theme.accent.color, alpha: 0.2 });
  }, [hovered, isDisabled, width, h, theme]);

  const handleClick = useCallback(() => {
    if (isDisabled) return;
    if (item.type === 'action') { item.onClick(); onClose(); }
    else if (item.type === 'checkbox') { item.onChange(!item.checked); }
  }, [isDisabled, item, onClose]);

  const label = item.type === 'checkbox'
    ? `${item.checked ? '✓' : ' '}  ${item.label}`
    : item.label;
  const shortcut = item.type === 'action' ? (item.shortcut ?? '') : '';

  return (
    <pixiContainer
      eventMode={isDisabled ? 'none' : 'static'}
      cursor={isDisabled ? 'default' : 'pointer'}
      onPointerOver={() => setHovered(true)}
      onPointerOut={() => setHovered(false)}
      onPointerUp={handleClick}
      alpha={isDisabled ? 0.4 : 1}
      layout={{ width, height: h, alignItems: 'center', paddingLeft: 8 }}
    >
      <pixiGraphics draw={drawItemBg} layout={{ position: 'absolute', width, height: h }} />
      <pixiBitmapText
        text={label}
        style={{ fontFamily: PIXI_FONTS.SANS, fontSize: 11, fill: 0xffffff }}
        tint={theme.text.color}
        layout={{ flex: 1 }}
      />
      {shortcut && (
        <pixiBitmapText
          text={shortcut}
          style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 10, fill: 0xffffff }}
          tint={theme.textMuted.color}
          layout={{ width: SHORTCUT_COL_W, marginRight: 8 }}
        />
      )}
    </pixiContainer>
  );
};
