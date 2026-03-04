/**
 * PixiGlobalDropdownLayer — Root-level container that renders the active
 * dropdown at zIndex 9999, outside every PixiWindow mask.
 *
 * PixiSelect and PixiMenuBar register their open dropdown in
 * usePixiDropdownStore with a screen-space position (toGlobal). This layer
 * renders it at that position using Yoga's position:absolute layout, which
 * maps directly to screen coordinates in the root container.
 */

import React, { useCallback } from 'react';
import type { Graphics as GraphicsType, FederatedPointerEvent } from 'pixi.js';
import { usePixiDropdownStore } from '../stores/usePixiDropdownStore';
import { PixiDropdownPanel } from './PixiSelect';
import { PixiMenuItem, type MenuItem } from './PixiMenuBar';
import { usePixiTheme } from '../theme';

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
