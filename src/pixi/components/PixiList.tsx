/**
 * PixiList — Virtual scrolling list with object pooling.
 * Only renders visible items + buffer for performance.
 * Supports selection highlighting and keyboard navigation.
 */

import { useRef, useCallback, useState, useMemo } from 'react';
import type { Graphics as GraphicsType, FederatedWheelEvent } from 'pixi.js';
import { PIXI_FONTS } from '../fonts';
import { usePixiTheme } from '../theme';

interface PixiListItem {
  id: string;
  label: string;
  sublabel?: string;
}

interface PixiListProps {
  items: PixiListItem[];
  width: number;
  height: number;
  itemHeight?: number;
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  onDoubleClick?: (id: string) => void;
  /** Number of buffer items above/below viewport */
  buffer?: number;
  layout?: Record<string, unknown>;
}

export const PixiList: React.FC<PixiListProps> = ({
  items,
  width,
  height,
  itemHeight = 28,
  selectedId,
  onSelect,
  onDoubleClick,
  buffer = 3,
  layout: layoutProp,
}) => {
  const theme = usePixiTheme();
  const [scrollY, setScrollY] = useState(0);
  const lastClickRef = useRef<{ id: string; time: number }>({ id: '', time: 0 });

  const totalHeight = items.length * itemHeight;
  const maxScroll = Math.max(0, totalHeight - height);

  // Calculate visible range
  const startIdx = Math.max(0, Math.floor(scrollY / itemHeight) - buffer);
  const endIdx = Math.min(items.length, Math.ceil((scrollY + height) / itemHeight) + buffer);
  const visibleItems = useMemo(
    () => items.slice(startIdx, endIdx),
    [items, startIdx, endIdx],
  );

  const handleWheel = useCallback((e: FederatedWheelEvent) => {
    e.stopPropagation();
    setScrollY(prev => Math.max(0, Math.min(maxScroll, prev + e.deltaY)));
  }, [maxScroll]);

  const handleItemClick = useCallback((id: string) => {
    const now = Date.now();
    if (lastClickRef.current.id === id && now - lastClickRef.current.time < 300) {
      onDoubleClick?.(id);
      lastClickRef.current = { id: '', time: 0 };
    } else {
      onSelect?.(id);
      lastClickRef.current = { id, time: now };
    }
  }, [onSelect, onDoubleClick]);

  // Draw scrollbar
  const drawScrollbar = useCallback((g: GraphicsType) => {
    g.clear();
    if (maxScroll <= 0) return;

    const trackHeight = height - 4;
    const thumbHeight = Math.max(20, (height / totalHeight) * trackHeight);
    const thumbY = 2 + (scrollY / maxScroll) * (trackHeight - thumbHeight);

    g.roundRect(width - 8, 2, 6, trackHeight, 3);
    g.fill({ color: theme.bgActive.color, alpha: 0.3 });

    g.roundRect(width - 8, thumbY, 6, thumbHeight, 3);
    g.fill({ color: theme.textMuted.color, alpha: 0.4 });
  }, [width, height, totalHeight, scrollY, maxScroll, theme]);

  // Draw clipping mask
  const drawMask = useCallback((g: GraphicsType) => {
    g.clear();
    g.rect(0, 0, width, height);
    g.fill(0xffffff);
  }, [width, height]);

  return (
    <pixiContainer
      eventMode="static"
      onWheel={handleWheel}
      layout={{ width, height, overflow: 'hidden', ...layoutProp }}
    >
      <pixiGraphics draw={drawMask} layout={{ position: 'absolute' }} />

      {/* Virtual items */}
      {visibleItems.map((item, i) => {
        const actualIdx = startIdx + i;
        const y = actualIdx * itemHeight - scrollY;
        const isSelected = item.id === selectedId;
        const isEven = actualIdx % 2 === 0;

        return (
          <pixiContainer
            key={item.id}
            eventMode="static"
            cursor="pointer"
            onPointerUp={() => handleItemClick(item.id)}
            layout={{
              position: 'absolute',
              left: 0,
              top: y,
              width: width - 10,
              height: itemHeight,
              flexDirection: 'row',
              alignItems: 'center',
              paddingLeft: 8,
            }}
          >
            {/* Row background */}
            <pixiGraphics
              draw={(g) => {
                g.clear();
                g.rect(0, 0, width - 10, itemHeight);
                if (isSelected) {
                  g.fill({ color: theme.accent.color, alpha: 0.15 });
                } else {
                  g.fill({ color: isEven ? theme.bg.color : theme.bgSecondary.color, alpha: 0.5 });
                }
              }}
              layout={{ position: 'absolute', width: width - 10, height: itemHeight }}
            />

            <pixiBitmapText
              text={item.label}
              style={{
                fontFamily: PIXI_FONTS.MONO,
                fontSize: 12,
                fill: 0xffffff,
              }}
              tint={isSelected ? theme.accent.color : theme.text.color}
              layout={{}}
            />

            {item.sublabel && (
              <pixiBitmapText
                text={item.sublabel}
                style={{
                  fontFamily: PIXI_FONTS.MONO,
                  fontSize: 10,
                  fill: 0xffffff,
                }}
                tint={theme.textMuted.color}
                layout={{ marginLeft: 8 }}
              />
            )}
          </pixiContainer>
        );
      })}

      {/* Scrollbar */}
      <pixiGraphics draw={drawScrollbar} layout={{ position: 'absolute', width, height }} />
    </pixiContainer>
  );
};
