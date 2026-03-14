/**
 * PixiSelect — Dropdown select replacing DOM <select>.
 * PixiDropdownPanel — Shared dropdown panel used by PixiSelect and PixiMenuBar.
 *
 * Dropdowns register their screen position in usePixiDropdownStore when opened.
 * PixiGlobalDropdownLayer (in PixiRoot) renders them at zIndex 9999 — outside
 * every PixiWindow mask — so they always appear on top.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FederatedPointerEvent, FederatedWheelEvent, Container as ContainerType, Graphics as GraphicsType } from 'pixi.js';
import { PIXI_FONTS } from '../fonts';
import { usePixiTheme } from '../theme';
import { usePixiDropdownStore } from '../stores/usePixiDropdownStore';
import { PixiPureTextInput } from '../input/PixiPureTextInput';

export interface SelectOption {
  value: string;
  label: string;
  group?: string;
  disabled?: boolean;
  /** Optional CSS hex accent color to show as a leading swatch dot (e.g. '#00d4aa') */
  color?: string;
}

// ─── Color swatch dot ─────────────────────────────────────────────────────────

const SWATCH_SIZE = 8;
/** Always-mounted swatch: visible when `color` is provided, invisible when not.
 * Consistent tree structure prevents @pixi/layout BindingErrors. */
const ColorSwatch: React.FC<{ color?: string }> = ({ color }) => {
  const hexNum = color ? parseInt(color.replace('#', ''), 16) : 0;
  const draw = useCallback((g: GraphicsType) => {
    g.clear();
    if (color) {
      g.circle(SWATCH_SIZE / 2, SWATCH_SIZE / 2, SWATCH_SIZE / 2 - 0.5);
      g.fill({ color: hexNum });
    }
  }, [color, hexNum]);
  return (
    <pixiGraphics
      draw={draw}
      alpha={color ? 1 : 0}
      layout={{ width: SWATCH_SIZE, height: SWATCH_SIZE, alignSelf: 'center', marginRight: 4 }}
    />
  );
};

interface PixiDropdownPanelProps {
  options: SelectOption[];
  onSelect: (value: string) => void;
  onClose: () => void;
  width: number;
  visible?: boolean;
  maxItems?: number;
  itemHeight?: number;
  layout?: Record<string, unknown>;
  searchable?: boolean;
}

const ITEM_H = 22;
const PANEL_PADDING = 4;

export const PixiDropdownPanel: React.FC<PixiDropdownPanelProps> = ({
  options,
  onSelect,
  onClose,
  width,
  visible = true,
  maxItems = 20,
  itemHeight = ITEM_H,
  layout: layoutProp,
  searchable = false,
}) => {
  const theme = usePixiTheme();
  // hoveredIndex state removed — direct PixiJS tint used instead to avoid BindingErrors
  const [scrollOffset, setScrollOffset] = useState(0);
  const [searchFilter, setSearchFilter] = useState('');

  // Filter options when searchable
  const filteredOptions = useMemo(() => {
    if (!searchable || !searchFilter) return options;
    const lower = searchFilter.toLowerCase();
    return options.filter(o => o.label.toLowerCase().includes(lower) || o.value === '');
  }, [options, searchFilter, searchable]);

  // Show swatch column only if any option has a color — keeps structure identical for all items
  const hasSwatch = useMemo(() => options.some(o => !!o.color), [options]);

  const visibleCount = Math.min(filteredOptions.length, maxItems);
  const searchInputH = searchable ? 28 : 0;
  const panelH = visibleCount * itemHeight + PANEL_PADDING * 2 + searchInputH;
  const needsScroll = filteredOptions.length > maxItems;
  const maxScroll = Math.max(0, filteredOptions.length - maxItems);

  // Reset scroll when options or filter change
  useEffect(() => { setScrollOffset(0); }, [options, searchFilter]);

  const handleWheel = useCallback((e: FederatedWheelEvent) => {
    if (!needsScroll) return;
    e.stopPropagation();
    setScrollOffset(prev => Math.max(0, Math.min(maxScroll, prev + (e.deltaY > 0 ? 1 : -1))));
  }, [needsScroll, maxScroll]);

  const visibleOptions = needsScroll
    ? filteredOptions.slice(scrollOffset, scrollOffset + maxItems)
    : filteredOptions;

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
        overflow: 'hidden',
        ...layoutProp,
      }}
      eventMode={visible ? 'static' : 'none'}
      onPointerDown={(e: FederatedPointerEvent) => e.stopPropagation()}
      onWheel={handleWheel}
    >
      {/* Search filter input */}
      {searchable && (
        <PixiPureTextInput
          value={searchFilter}
          onChange={setSearchFilter}
          placeholder="Filter..."
          width={width - PANEL_PADDING * 2}
          height={22}
          fontSize={11}
          layout={{ marginBottom: 4 }}
        />
      )}
      {/* Scroll-up indicator */}
      {needsScroll && scrollOffset > 0 && (
        <layoutContainer layout={{ width: width - PANEL_PADDING * 2, height: 2, backgroundColor: theme.accent.color, borderRadius: 1 }} />
      )}
      {visibleOptions.map((opt, vi) => {
        const i = needsScroll ? vi + scrollOffset : vi;
        const isGroup = opt.value === '__group__';
        return (
          <layoutContainer
            key={`${opt.value}-${i}`}
            eventMode={isGroup || opt.disabled ? 'none' : 'static'}
            cursor={isGroup || opt.disabled ? 'default' : 'pointer'}
            onPointerOver={(e: { currentTarget: ContainerType }) => { if (!isGroup && !opt.disabled) e.currentTarget.tint = theme.accent.color; }}
            onPointerOut={(e: { currentTarget: ContainerType }) => { e.currentTarget.tint = 0xffffff; }}
            onPointerUp={() => { if (!isGroup && !opt.disabled) { onSelect(opt.value); onClose(); } }}
            onClick={() => { if (!isGroup && !opt.disabled) { onSelect(opt.value); onClose(); } }}
            layout={{
              width: width - PANEL_PADDING * 2,
              height: itemHeight,
              alignItems: 'center',
              flexDirection: 'row',
              paddingLeft: isGroup ? 4 : 8,
            }}
          >
            {/* Color swatch — always mounted for consistent tree; invisible when no color */}
            {hasSwatch && <ColorSwatch color={opt.color} />}
            <pixiBitmapText
              eventMode="none"
              text={opt.label}
              style={{ fontFamily: PIXI_FONTS.SANS, fontSize: 13, fill: 0xffffff }}
              tint={isGroup ? theme.textMuted.color : opt.disabled ? theme.textMuted.color : theme.text.color}
              alpha={isGroup ? 0.7 : opt.disabled ? 0.4 : 1}
              layout={{}}
            />
          </layoutContainer>
        );
      })}
      {/* Scroll-down indicator */}
      {needsScroll && scrollOffset < maxScroll && (
        <layoutContainer layout={{ width: width - PANEL_PADDING * 2, height: 2, backgroundColor: theme.accent.color, borderRadius: 1 }} />
      )}
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
  searchable?: boolean;
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
  searchable = false,
}) => {
  const theme = usePixiTheme();
  const [open, setOpen] = useState(false);
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
        searchable,
      });
    });
  }, [open, height, dropdownWidth, options, closeDropdown, searchable]);

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
      searchable,
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options, dropdownWidth, searchable]);

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
      onPointerOver={(e: { currentTarget: ContainerType }) => { e.currentTarget.tint = 0xdddddd; }}
      onPointerOut={(e: { currentTarget: ContainerType }) => { e.currentTarget.tint = 0xffffff; }}
      onPointerUp={handleToggle}
      onClick={handleToggle}
      alpha={disabled ? 0.4 : 1}
      layout={{
        width,
        height,
        backgroundColor: open ? theme.bgHover.color : theme.bgTertiary.color,
        borderWidth: 1,
        borderColor: open ? theme.accent.color : theme.border.color,
        borderRadius: 3,
        ...layoutProp,
      }}
    >
      <pixiBitmapText
        eventMode="none"
        text={selectedLabel}
        style={{ fontFamily: PIXI_FONTS.SANS, fontSize: 13, fill: 0xffffff }}
        tint={theme.textSecondary.color}
        layout={{ position: 'absolute', left: 6, top: (height - 13) / 2 }}
      />
      <pixiBitmapText
        eventMode="none"
        text="▾"
        style={{ fontFamily: PIXI_FONTS.SANS, fontSize: 12, fill: 0xffffff }}
        tint={theme.textMuted.color}
        layout={{ position: 'absolute', left: width - 14, top: (height - 12) / 2 }}
      />
    </layoutContainer>
  );
};
