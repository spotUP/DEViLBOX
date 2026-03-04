/**
 * PixiSelect — Dropdown select replacing DOM <select>.
 * PixiDropdownPanel — Shared dropdown panel used by PixiSelect and PixiMenuBar.
 *
 * Dropdowns register their screen position in usePixiDropdownStore when opened.
 * PixiGlobalDropdownLayer (in PixiRoot) renders them at zIndex 9999 — outside
 * every PixiWindow mask — so they always appear on top.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { FederatedPointerEvent, Container as ContainerType } from 'pixi.js';
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

  return (
    <layoutContainer
      alpha={visible ? 1 : 0}
      renderable={visible}
      layout={{
        width,
        height: panelH,
        flexDirection: 'column',
        padding: PANEL_PADDING,
        gap: 0,
        backgroundColor: theme.bgSecondary.color,
        borderWidth: 1,
        borderColor: theme.border.color,
        borderRadius: 4,
        ...layoutProp,
      }}
      eventMode={visible ? 'static' : 'none'}
      onPointerDown={(e: FederatedPointerEvent) => e.stopPropagation()}
    >
      {options.map((opt, i) => {
        const isGroup = opt.value === '__group__';
        return (
          <layoutContainer
            key={`${opt.value}-${i}`}
            eventMode={isGroup || opt.disabled ? 'none' : 'static'}
            cursor={isGroup || opt.disabled ? 'default' : 'pointer'}
            onPointerOver={() => !isGroup && !opt.disabled && setHoveredIndex(i)}
            onPointerOut={() => setHoveredIndex(null)}
            onPointerUp={() => { if (!isGroup && !opt.disabled) { onSelect(opt.value); onClose(); } }}
            layout={{
              width: width - PANEL_PADDING * 2,
              height: itemHeight,
              alignItems: 'center',
              paddingLeft: isGroup ? 4 : 8,
              backgroundColor: hoveredIndex === i ? theme.accent.color : undefined,
            }}
          >
            <pixiBitmapText
              text={opt.label}
              style={{ fontFamily: PIXI_FONTS.SANS, fontSize: 13, fill: 0xffffff }}
              tint={isGroup ? theme.textMuted.color : opt.disabled ? theme.textMuted.color : theme.text.color}
              alpha={isGroup ? 0.7 : opt.disabled ? 0.4 : 1}
              layout={{}}
            />
          </layoutContainer>
        );
      })}
    </layoutContainer>
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
    // Defer state update so React doesn't modify the PixiJS node tree
    // while the pointer event is still being dispatched (BindingError).
    requestAnimationFrame(() => {
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

  return (
    <layoutContainer
      ref={containerRef}
      eventMode={disabled ? 'none' : 'static'}
      cursor={disabled ? 'default' : 'pointer'}
      onPointerOver={() => setHovered(true)}
      onPointerOut={() => setHovered(false)}
      onPointerUp={handleToggle}
      alpha={disabled ? 0.4 : 1}
      layout={{
        width,
        height,
        backgroundColor: open ? theme.bgHover.color : hovered ? theme.bgHover.color : theme.bgTertiary.color,
        borderWidth: 1,
        borderColor: open ? theme.accent.color : theme.border.color,
        borderRadius: 3,
        ...layoutProp,
      }}
    >
      <pixiBitmapText
        text={selectedLabel}
        style={{ fontFamily: PIXI_FONTS.SANS, fontSize: 13, fill: 0xffffff }}
        tint={theme.textSecondary.color}
        layout={{ position: 'absolute', left: 6, top: (height - 13) / 2 }}
      />
      <pixiBitmapText
        text="▾"
        style={{ fontFamily: PIXI_FONTS.SANS, fontSize: 12, fill: 0xffffff }}
        tint={theme.textMuted.color}
        layout={{ position: 'absolute', left: width - 14, top: (height - 12) / 2 }}
      />
    </layoutContainer>
  );
};
