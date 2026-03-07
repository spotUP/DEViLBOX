/**
 * PixiGlobalDropdownLayer — Root-level container that renders the active
 * dropdown at zIndex 9999, outside every PixiWindow mask.
 *
 * PixiSelect and PixiMenuBar register their open dropdown in
 * usePixiDropdownStore with a screen-space position (toGlobal). This layer
 * renders it at that position using Yoga's position:absolute layout, which
 * maps directly to screen coordinates in the root container.
 */

import React, { useCallback, useState } from 'react';
import type { Graphics as GraphicsType, FederatedPointerEvent } from 'pixi.js';
import { usePixiDropdownStore } from '../stores/usePixiDropdownStore';
import { PixiDropdownPanel } from './PixiSelect';
import { PixiMenuItem, type MenuItem } from './PixiMenuBar';
import { PixiColorPicker } from './PixiColorPicker';
import { usePixiTheme } from '../theme';
import type { ContextMenuItem } from '../input/PixiContextMenu';
import { PIXI_FONTS } from '../fonts';

// Large enough to cover any screen; drawn with near-zero alpha so it's
// invisible but still hittable for outside-click close behaviour.
const BACKDROP_SIZE = 20000;

const MENU_PANEL_PADDING = 4;
const SEP_H = 9;
const ITEM_H = 22;

function itemH(item: { type: string }): number {
  return item.type === 'separator' ? SEP_H : ITEM_H;
}

export const PixiGlobalDropdownLayer: React.FC = () => {
  const dropdown = usePixiDropdownStore(s => s.dropdown);

  const drawBackdrop = useCallback((g: GraphicsType) => {
    g.clear();
    g.rect(0, 0, BACKDROP_SIZE, BACKDROP_SIZE);
    // Near-zero alpha: invisible but the geometry exists so PixiJS hit-tests it.
    g.fill({ color: 0x000000, alpha: 0.01 });
  }, []);

  // IMPORTANT: Always render a stable wrapper container — never return null.
  // The parent root pixiContainer has sortableChildren=true. If this component
  // conditionally returns null, PixiJS's internal sort reorders children and
  // React's reconciler finds the wrong node index when trying to remove the
  // dropdown, causing BindingError: "Expected null or instance of Node, got
  // an instance of Node".
  return (
    <pixiContainer
      zIndex={9999}
      eventMode={dropdown ? 'static' : 'none'}
      layout={{ position: 'absolute', left: 0, top: 0, width: 0, height: 0 }}
    >
      {dropdown && (
        // Transparent backdrop rendered BEFORE (below) the panel so the
        // panel's e.stopPropagation() on pointerDown absorbs panel clicks.
        // Outside clicks reach this backdrop and close the dropdown.
        <pixiGraphics
          draw={drawBackdrop}
          layout={{ position: 'absolute', left: 0, top: 0, width: BACKDROP_SIZE, height: BACKDROP_SIZE }}
          eventMode="static"
          cursor="default"
          onPointerDown={() => dropdown.onClose()}
        />
      )}
      {dropdown?.kind === 'select' && (
        <pixiContainer
          key={dropdown.id}
          layout={{ position: 'absolute', left: dropdown.x, top: dropdown.y }}
          eventMode="static"
        >
          <PixiDropdownPanel
            visible={true}
            options={dropdown.options}
            onSelect={dropdown.onSelect}
            onClose={dropdown.onClose}
            width={dropdown.width}
            searchable={dropdown.searchable}
          />
        </pixiContainer>
      )}
      {dropdown?.kind === 'menu' && (
        <PixiGlobalMenuDropdown
          key={dropdown.id}
          x={dropdown.x}
          y={dropdown.y}
          width={dropdown.width}
          items={dropdown.items}
          onClose={dropdown.onClose}
        />
      )}
      {dropdown?.kind === 'contextMenu' && (
        <PixiGlobalContextMenu
          key={dropdown.id}
          x={dropdown.x}
          y={dropdown.y}
          items={dropdown.items}
          onClose={dropdown.onClose}
        />
      )}
      {dropdown?.kind === 'colorPicker' && (
        <PixiColorPicker
          key={dropdown.id}
          x={dropdown.x}
          y={dropdown.y}
          currentColor={dropdown.currentColor}
          onColorSelect={dropdown.onColorSelect}
          onClose={dropdown.onClose}
        />
      )}
    </pixiContainer>
  );
};

interface MenuDropdownProps {
  x: number;
  y: number;
  width: number;
  items: MenuItem[];
  onClose: () => void;
}

const PixiGlobalMenuDropdown: React.FC<MenuDropdownProps> = ({ x, y, width, items, onClose }) => {
  const theme = usePixiTheme();
  const panelH = items.reduce((sum, item) => sum + itemH(item), 0) + MENU_PANEL_PADDING * 2;
  const innerW = width - MENU_PANEL_PADDING * 2;

  return (
    <pixiContainer
      zIndex={9999}
      layout={{ position: 'absolute', left: x, top: y }}
      eventMode="static"
      onPointerDown={(e: FederatedPointerEvent) => e.stopPropagation()}
    >
      <layoutContainer
        layout={{
          width,
          height: panelH,
          flexDirection: 'column',
          padding: MENU_PANEL_PADDING,
          backgroundColor: theme.bgSecondary.color,
          borderWidth: 1,
          borderColor: theme.border.color,
          borderRadius: 4,
        }}
      >
        {items.map((item, j) => (
          <PixiMenuItem key={j} item={item} width={innerW} onClose={onClose} />
        ))}
      </layoutContainer>
    </pixiContainer>
  );
};

// ── Context Menu rendered at root level ─────────────────────────────────────

const CTX_MENU_W = 180;
const CTX_ITEM_H = 24;
const CTX_SEP_H = 9;
const CTX_PADDING = 4;

interface ContextMenuProps {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}

const PixiGlobalContextMenu: React.FC<ContextMenuProps> = ({ x, y, items, onClose }) => {
  const theme = usePixiTheme();
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [openSubmenuIndex, setOpenSubmenuIndex] = useState<number | null>(null);

  const panelH = items.reduce(
    (sum, item) => sum + (item.separator ? CTX_SEP_H : CTX_ITEM_H),
    0,
  ) + CTX_PADDING * 2;

  // Compute submenu panel position for the currently open submenu
  let submenuY = 0;
  let yOffset = CTX_PADDING;
  const rows: React.ReactNode[] = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const rowY = yOffset;
    if (i === openSubmenuIndex) submenuY = rowY;

    if (item.separator) {
      rows.push(
        <layoutContainer
          key={`sep-${i}`}
          layout={{
            position: 'absolute',
            top: rowY + 4,
            left: 8,
            width: CTX_MENU_W - 16,
            height: 1,
            backgroundColor: theme.border.color,
          }}
        />,
      );
      yOffset += CTX_SEP_H;
    } else {
      const hasSubmenu = !!(item.submenu && item.submenu.length > 0);
      const isHovered = hoveredIndex === i;
      rows.push(
        <layoutContainer
          key={i}
          eventMode={item.disabled ? 'none' : 'static'}
          cursor={item.disabled ? 'default' : 'pointer'}
          onPointerOver={() => {
            if (item.disabled) return;
            setHoveredIndex(i);
            if (hasSubmenu) setOpenSubmenuIndex(i);
            else setOpenSubmenuIndex(null);
          }}
          onPointerOut={() => {
            // Don't clear hover/submenu immediately — allow moving to submenu panel
            if (!hasSubmenu) setHoveredIndex(null);
          }}
          onPointerUp={() => {
            if (item.disabled || hasSubmenu) return;
            item.action?.();
            onClose();
          }}
          onClick={() => {
            if (item.disabled || hasSubmenu) return;
            item.action?.();
            onClose();
          }}
          alpha={item.disabled ? 0.4 : 1}
          layout={{
            position: 'absolute',
            top: rowY,
            left: 0,
            width: CTX_MENU_W,
            height: CTX_ITEM_H,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingLeft: 12,
            paddingRight: 8,
            backgroundColor: isHovered && !item.disabled ? theme.bgHover.color : undefined,
          }}
        >
          <pixiBitmapText
            eventMode="none"
            text={item.label}
            style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 13, fill: 0xffffff }}
            tint={item.disabled ? theme.textMuted.color : theme.text.color}
            layout={{}}
          />
          {hasSubmenu && (
            <pixiBitmapText
              eventMode="none"
              text="▸"
              style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 13, fill: 0xffffff }}
              tint={theme.textMuted.color}
              layout={{}}
            />
          )}
        </layoutContainer>,
      );
      yOffset += CTX_ITEM_H;
    }
  }

  // Submenu panel
  const openSubmenuItem = openSubmenuIndex !== null ? items[openSubmenuIndex] : null;
  const submenuItems = openSubmenuItem?.submenu;

  return (
    <pixiContainer
      zIndex={9999}
      layout={{ position: 'absolute', left: x, top: y }}
      eventMode="static"
      onPointerDown={(e: FederatedPointerEvent) => e.stopPropagation()}
    >
      <layoutContainer
        layout={{
          width: CTX_MENU_W,
          height: panelH,
          flexDirection: 'column',
          backgroundColor: theme.bgSecondary.color,
          borderWidth: 1,
          borderColor: theme.border.color,
          borderRadius: 6,
          overflow: 'hidden',
        }}
      >
        {rows}
      </layoutContainer>
      {submenuItems && submenuItems.length > 0 && (
        <PixiContextSubmenu
          items={submenuItems}
          x={CTX_MENU_W - 2}
          y={submenuY}
          onClose={onClose}
          onPointerLeave={() => { setOpenSubmenuIndex(null); setHoveredIndex(null); }}
        />
      )}
    </pixiContainer>
  );
};

// ── Submenu panel ───────────────────────────────────────────────────────────

interface SubmenuProps {
  items: ContextMenuItem[];
  x: number;
  y: number;
  onClose: () => void;
  onPointerLeave: () => void;
}

const PixiContextSubmenu: React.FC<SubmenuProps> = ({ items, x, y, onClose, onPointerLeave }) => {
  const theme = usePixiTheme();
  const [hoveredSub, setHoveredSub] = useState<number | null>(null);

  const subPanelH = items.reduce(
    (sum, item) => sum + (item.separator ? CTX_SEP_H : CTX_ITEM_H),
    0,
  ) + CTX_PADDING * 2;

  let subY = CTX_PADDING;
  const subRows: React.ReactNode[] = [];

  for (let j = 0; j < items.length; j++) {
    const sub = items[j];
    const rowY = subY;
    if (sub.separator) {
      subRows.push(
        <layoutContainer
          key={`sub-sep-${j}`}
          layout={{ position: 'absolute', top: rowY + 4, left: 8, width: CTX_MENU_W - 16, height: 1, backgroundColor: theme.border.color }}
        />,
      );
      subY += CTX_SEP_H;
    } else {
      const isSubHovered = hoveredSub === j;
      subRows.push(
        <layoutContainer
          key={`sub-${j}`}
          eventMode={sub.disabled ? 'none' : 'static'}
          cursor={sub.disabled ? 'default' : 'pointer'}
          onPointerOver={() => !sub.disabled && setHoveredSub(j)}
          onPointerOut={() => setHoveredSub(null)}
          onPointerUp={() => {
            if (sub.disabled) return;
            sub.action?.();
            onClose();
          }}
          onClick={() => {
            if (sub.disabled) return;
            sub.action?.();
            onClose();
          }}
          alpha={sub.disabled ? 0.4 : 1}
          layout={{
            position: 'absolute',
            top: rowY,
            left: 0,
            width: CTX_MENU_W,
            height: CTX_ITEM_H,
            alignItems: 'center',
            paddingLeft: 12,
            backgroundColor: isSubHovered && !sub.disabled ? theme.bgHover.color : undefined,
          }}
        >
          <pixiBitmapText
            eventMode="none"
            text={sub.label}
            style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 13, fill: 0xffffff }}
            tint={sub.disabled ? theme.textMuted.color : theme.text.color}
            layout={{}}
          />
        </layoutContainer>,
      );
      subY += CTX_ITEM_H;
    }
  }

  return (
    <pixiContainer
      layout={{ position: 'absolute', left: x, top: y }}
      eventMode="static"
      onPointerDown={(e: FederatedPointerEvent) => e.stopPropagation()}
      onPointerLeave={onPointerLeave}
    >
      <layoutContainer
        layout={{
          width: CTX_MENU_W,
          height: subPanelH,
          flexDirection: 'column',
          backgroundColor: theme.bgSecondary.color,
          borderWidth: 1,
          borderColor: theme.border.color,
          borderRadius: 6,
          overflow: 'hidden',
        }}
      >
        {subRows}
      </layoutContainer>
    </pixiContainer>
  );
};
