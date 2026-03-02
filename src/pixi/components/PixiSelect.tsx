/**
 * PixiSelect — Dropdown select replacing DOM <select>.
 * PixiDropdownPanel — Shared dropdown panel used by PixiSelect and PixiMenuBar.
 *
 * Dropdowns register their screen position in usePixiDropdownStore when opened.
 * PixiGlobalDropdownLayer (in PixiRoot) renders them at zIndex 9999 — outside
 * every PixiWindow mask — so they always appear on top.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { Graphics as GraphicsType, FederatedPointerEvent, Container as ContainerType } from 'pixi.js';
import { PIXI_FONTS } from '../fonts';
import { usePixiTheme } from '../theme';
import { usePixiDropdownStore } from '../stores/usePixiDropdownStore';

export interface SelectOption {
  value: string;
  label: string;
  group?: string;
  disabled?: boolean;
}

interface PixiDropdownPanelProps {
  options: SelectOption[];
  onSelect: (value: string) => void;
  onClose: () => void;
  width: number;
  visible?: boolean;
  maxItems?: number;
  itemHeight?: number;
  layout?: Record<string, unknown>;
}

const ITEM_H = 22;
const PANEL_PADDING = 4;

export const PixiDropdownPanel: React.FC<PixiDropdownPanelProps> = ({
  options,
  onSelect,
  onClose,
  width,
  visible = true,
  maxItems = 12,
  itemHeight = ITEM_H,
  layout: layoutProp,
}) => {
  const theme = usePixiTheme();
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const visibleCount = Math.min(options.length, maxItems);
  const panelH = visibleCount * itemHeight + PANEL_PADDING * 2;

  // Outside-click close is handled by the transparent backdrop rendered in
  // PixiGlobalDropdownLayer — no document-level listener needed here.
  // (A document capture listener fires before PixiJS dispatches events, which
  // would unmount items before their onPointerUp selection handler could run.)

  const drawPanel = useCallback((g: GraphicsType) => {
    g.clear();
    g.roundRect(0, 0, width, panelH, 4);
    g.fill({ color: theme.bgSecondary.color });
    g.roundRect(0, 0, width, panelH, 4);
    g.stroke({ color: theme.border.color, alpha: 0.8, width: 1 });
  }, [width, panelH, theme]);

  return (
    <pixiContainer
      alpha={visible ? 1 : 0}
      renderable={visible}
      layout={{
        width,
        height: panelH,
        flexDirection: 'column',
        padding: PANEL_PADDING,
        gap: 0,
        ...layoutProp,
      }}
      eventMode={visible ? 'static' : 'none'}
      onPointerDown={(e: FederatedPointerEvent) => e.stopPropagation()}
    >
      <pixiGraphics
        draw={drawPanel}
        layout={{ position: 'absolute', width, height: panelH }}
      />
      {options.map((opt, i) => {
        const isGroup = opt.value === '__group__';
        return (
          <pixiContainer
            key={`${opt.value}-${i}`}
            eventMode={isGroup || opt.disabled ? 'none' : 'static'}
            cursor={isGroup || opt.disabled ? 'default' : 'pointer'}
            onPointerOver={() => !isGroup && !opt.disabled && setHoveredIndex(i)}
            onPointerOut={() => setHoveredIndex(null)}
            onPointerUp={() => { if (!isGroup && !opt.disabled) { onSelect(opt.value); onClose(); } }}
            layout={{ width: width - PANEL_PADDING * 2, height: itemHeight, alignItems: 'center', paddingLeft: isGroup ? 4 : 8 }}
          >
            <pixiGraphics
              draw={(g: GraphicsType) => {
                g.clear();
                if (hoveredIndex !== i) return;
                g.rect(0, 0, width - PANEL_PADDING * 2, itemHeight);
                g.fill({ color: theme.accent.color, alpha: 0.2 });
              }}
              layout={{ position: 'absolute', width: width - PANEL_PADDING * 2, height: itemHeight }}
            />
            <pixiBitmapText
              text={opt.label}
              style={{ fontFamily: PIXI_FONTS.SANS, fontSize: 11, fill: 0xffffff }}
              tint={isGroup ? theme.textMuted.color : opt.disabled ? theme.textMuted.color : theme.text.color}
              alpha={isGroup ? 0.7 : opt.disabled ? 0.4 : 1}
              layout={{}}
            />
          </pixiContainer>
        );
      })}
    </pixiContainer>
  );
};

interface PixiSelectProps {
  options: SelectOption[];
  value: string;
  onChange: (value: string) => void;
  width?: number;
  height?: number;
  placeholder?: string;
  disabled?: boolean;
  layout?: Record<string, unknown>;
}

let _selectIdCounter = 0;

export const PixiSelect: React.FC<PixiSelectProps> = ({
  options,
  value,
  onChange,
  width = 120,
  height = 24,
  placeholder = 'Select...',
  disabled = false,
  layout: layoutProp,
}) => {
  const theme = usePixiTheme();
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState(false);
  const containerRef = useRef<ContainerType>(null);
  // Stable ID for this select instance
  const idRef = useRef(`pixi-select-${++_selectIdCounter}`);
  // Keep latest callbacks stable for store registration
  const onChangeRef = useRef(onChange);
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);

  const selectedLabel = options.find(o => o.value === value)?.label ?? placeholder;
  const dropdownWidth = Math.max(width, 160);

  const closeDropdown = useCallback(() => {
    setOpen(false);
    usePixiDropdownStore.getState().closeDropdown(idRef.current);
  }, []);

  const handleToggle = useCallback(() => {
    if (open) {
      closeDropdown();
      return;
    }
    const el = containerRef.current;
    if (!el) return;
    // Compute screen-space position of the bottom-left of this trigger
    const pos = el.toGlobal({ x: 0, y: height + 2 });
    setOpen(true);
    usePixiDropdownStore.getState().openDropdown({
      kind: 'select',
      id: idRef.current,
      x: pos.x,
      y: pos.y,
      width: dropdownWidth,
      options,
      onSelect: (v) => { onChangeRef.current(v); closeDropdown(); },
      onClose: closeDropdown,
    });
  }, [open, height, dropdownWidth, options, closeDropdown]);

  // If options or other props change while open, update the store entry
  useEffect(() => {
    if (!open) return;
    const el = containerRef.current;
    if (!el) return;
    const pos = el.toGlobal({ x: 0, y: height + 2 });
    usePixiDropdownStore.getState().openDropdown({
      kind: 'select',
      id: idRef.current,
      x: pos.x,
      y: pos.y,
      width: dropdownWidth,
      options,
      onSelect: (v) => { onChangeRef.current(v); closeDropdown(); },
      onClose: closeDropdown,
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options, dropdownWidth]);

  // Clean up store entry on unmount
  useEffect(() => {
    const id = idRef.current;
    return () => usePixiDropdownStore.getState().closeDropdown(id);
  }, []);

  const drawBg = useCallback((g: GraphicsType) => {
    g.clear();
    g.roundRect(0, 0, width, height, 3);
    g.fill({ color: open ? theme.bgHover.color : hovered ? theme.bgHover.color : theme.bgTertiary.color });
    g.roundRect(0, 0, width, height, 3);
    g.stroke({ color: open ? theme.accent.color : theme.border.color, alpha: open ? 0.7 : 0.6, width: 1 });
  }, [width, height, open, hovered, theme]);

  return (
    <pixiContainer
      ref={containerRef}
      eventMode={disabled ? 'none' : 'static'}
      cursor={disabled ? 'default' : 'pointer'}
      onPointerOver={() => setHovered(true)}
      onPointerOut={() => setHovered(false)}
      onPointerUp={handleToggle}
      alpha={disabled ? 0.4 : 1}
      layout={{ width, height, ...layoutProp }}
    >
      <pixiGraphics draw={drawBg} layout={{ position: 'absolute', width, height }} />
      <pixiBitmapText
        text={selectedLabel}
        style={{ fontFamily: PIXI_FONTS.SANS, fontSize: 11, fill: 0xffffff }}
        tint={theme.textSecondary.color}
        layout={{ position: 'absolute', left: 6, top: (height - 11) / 2 }}
      />
      <pixiBitmapText
        text="▾"
        style={{ fontFamily: PIXI_FONTS.SANS, fontSize: 10, fill: 0xffffff }}
        tint={theme.textMuted.color}
        layout={{ position: 'absolute', left: width - 14, top: (height - 10) / 2 }}
      />
    </pixiContainer>
  );
};
