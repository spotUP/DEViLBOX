/**
 * PixiMenuBar — Horizontal menu bar with dropdown menus.
 * Used by PixiFT2Toolbar for File / Edit / Module / Help menus.
 *
 * Dropdowns register in usePixiDropdownStore so they are rendered by
 * PixiGlobalDropdownLayer at root stage level — above all PixiWindow masks.
 */
import React, { useCallback, useRef, useState } from 'react';
import type { Graphics as GraphicsType, Container as ContainerType } from 'pixi.js';
import { PIXI_FONTS } from '../fonts';
import { usePixiTheme } from '../theme';
import { usePixiDropdownStore } from '../stores/usePixiDropdownStore';

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
const DROPDOWN_MIN_W = 200;
const SEP_H = 9;
const ITEM_H = 22;

function itemHeight(item: MenuItem): number {
  return item.type === 'separator' ? SEP_H : ITEM_H;
}

let _menuIdCounter = 0;

export const PixiMenuBar: React.FC<PixiMenuBarProps> = ({
  menus,
  height = 24,
  layout: layoutProp,
}) => {
  const [openMenuIndex, setOpenMenuIndex] = useState<number | null>(null);

  const openMenu = useCallback((i: number) => setOpenMenuIndex(i), []);
  const closeAll = useCallback(() => {
    setOpenMenuIndex(null);
    usePixiDropdownStore.getState().closeAll();
  }, []);

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
            menuIndex={i}
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
  menuIndex: number;
  menu: Menu;
  isOpen: boolean;
  height: number;
  onOpen: () => void;
  onClose: () => void;
  onHoverOpen: () => void;
}

const PixiMenuButton: React.FC<PixiMenuButtonProps> = ({
  menuIndex, menu, isOpen, height, onOpen, onClose, onHoverOpen,
}) => {
  const theme = usePixiTheme();
  const [hovered, setHovered] = useState(false);
  const containerRef = useRef<ContainerType>(null);
  const idRef = useRef(`pixi-menu-${menuIndex}-${++_menuIdCounter}`);

  const btnW = menu.label.length * 8 + MENU_BTN_PADDING * 2;
  const dropdownW = DROPDOWN_MIN_W;

  const handleOpen = useCallback(() => {
    onOpen();
    const el = containerRef.current;
    if (!el) return;
    const pos = el.toGlobal({ x: 0, y: height });
    usePixiDropdownStore.getState().openDropdown({
      kind: 'menu',
      id: idRef.current,
      x: pos.x,
      y: pos.y,
      width: dropdownW,
      items: menu.items,
      onClose,
    });
  }, [onOpen, height, dropdownW, menu.items, onClose]);

  const handleToggle = useCallback(() => {
    if (isOpen) {
      onClose();
    } else {
      handleOpen();
    }
  }, [isOpen, onClose, handleOpen]);

  const handleHoverOpen = useCallback(() => {
    if (isOpen) return;
    onHoverOpen();
    // If a different menu is open, switch to this one
    const store = usePixiDropdownStore.getState();
    if (store.dropdown && store.dropdown.id !== idRef.current) {
      handleOpen();
    }
  }, [isOpen, onHoverOpen, handleOpen]);

  const drawBtnBg = useCallback((g: GraphicsType) => {
    g.clear();
    if (!isOpen && !hovered) return;
    g.rect(0, 0, btnW, height);
    g.fill({ color: isOpen ? theme.accent.color : theme.bgHover.color, alpha: isOpen ? 0.25 : 0.5 });
  }, [isOpen, hovered, btnW, height, theme]);

  return (
    <pixiContainer
      ref={containerRef}
      eventMode="static"
      cursor="pointer"
      onPointerOver={() => { setHovered(true); handleHoverOpen(); }}
      onPointerOut={() => setHovered(false)}
      onPointerUp={handleToggle}
      layout={{ width: btnW, height, justifyContent: 'center', alignItems: 'center' }}
    >
      <pixiGraphics draw={drawBtnBg} layout={{ position: 'absolute', width: btnW, height }} />
      <pixiBitmapText
        text={menu.label}
        style={{ fontFamily: PIXI_FONTS.SANS, fontSize: 11, fill: 0xffffff }}
        tint={isOpen ? theme.accent.color : theme.textSecondary.color}
        layout={{}}
      />
    </pixiContainer>
  );
};

// ── PixiMenuItem — exported for use in PixiGlobalDropdownLayer ───────────────

interface PixiMenuItemProps {
  item: MenuItem;
  width: number;
  onClose: () => void;
}

const SEP_ITEM_H = SEP_H;

export const PixiMenuItem: React.FC<PixiMenuItemProps> = ({ item, width, onClose }) => {
  const theme = usePixiTheme();
  const [hovered, setHovered] = useState(false);
  const h = itemHeight(item);

  if (item.type === 'separator') {
    return (
      <pixiContainer layout={{ width, height: SEP_ITEM_H, justifyContent: 'center' }}>
        <pixiGraphics
          draw={(g: GraphicsType) => {
            g.clear();
            g.rect(0, SEP_ITEM_H / 2 - 0.5, width, 1);
            g.fill({ color: theme.border.color, alpha: 0.5 });
          }}
          layout={{ width, height: SEP_ITEM_H }}
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
          layout={{ width: 80, marginRight: 8 }}
        />
      )}
    </pixiContainer>
  );
};
