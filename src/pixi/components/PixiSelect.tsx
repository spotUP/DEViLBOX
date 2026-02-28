/**
 * PixiSelect — Dropdown select replacing DOM <select>.
 * PixiDropdownPanel — Shared dropdown panel used by PixiSelect and PixiMenuBar.
 */
import React, { useCallback, useEffect, useState } from 'react';
import type { Graphics as GraphicsType, FederatedPointerEvent } from 'pixi.js';
import { PIXI_FONTS } from '../fonts';
import { usePixiTheme } from '../theme';

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

  // Close on outside click — only listen when the panel is actually open
  useEffect(() => {
    if (!visible) return;
    const handler = () => onClose();
    document.addEventListener('pointerdown', handler, { capture: true });
    return () => document.removeEventListener('pointerdown', handler, true);
  }, [onClose, visible]);

  const drawPanel = useCallback((g: GraphicsType) => {
    g.clear();
    g.roundRect(0, 0, width, panelH, 4);
    g.fill({ color: theme.bgSecondary.color });
    g.roundRect(0, 0, width, panelH, 4);
    g.stroke({ color: theme.border.color, alpha: 0.8, width: 1 });
  }, [width, panelH, theme]);

  return (
    <pixiContainer
      // Use alpha+renderable instead of visible — @pixi/layout detaches Yoga nodes
      // when visible=false, causing BindingErrors on re-show. alpha/renderable are
      // not intercepted by the layout system so Yoga stays intact.
      alpha={visible ? 1 : 0}
      renderable={visible}
      zIndex={200}
      layout={{
        position: 'absolute',
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

  const selectedLabel = options.find(o => o.value === value)?.label ?? placeholder;

  const drawBg = useCallback((g: GraphicsType) => {
    g.clear();
    g.roundRect(0, 0, width, height, 3);
    g.fill({ color: open ? theme.bgHover.color : hovered ? theme.bgHover.color : theme.bgTertiary.color });
    g.roundRect(0, 0, width, height, 3);
    g.stroke({ color: open ? theme.accent.color : theme.border.color, alpha: open ? 0.7 : 0.6, width: 1 });
  }, [width, height, open, hovered, theme]);

  return (
    <pixiContainer
      eventMode={disabled ? 'none' : 'static'}
      cursor={disabled ? 'default' : 'pointer'}
      onPointerOver={() => setHovered(true)}
      onPointerOut={() => setHovered(false)}
      onPointerUp={() => setOpen(o => !o)}
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
      <PixiDropdownPanel
        visible={open}
        options={options}
        onSelect={onChange}
        onClose={() => setOpen(false)}
        width={Math.max(width, 160)}
        layout={{ position: 'absolute', top: height + 2 }}
      />
    </pixiContainer>
  );
};
