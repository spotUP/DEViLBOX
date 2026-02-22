/**
 * PixiList — Virtual scrolling list with object pooling.
 * Only renders visible items + buffer for performance.
 * Supports selection highlighting and keyboard navigation.
 */

import { useRef, useCallback, useState, useMemo } from 'react';
import type { Graphics as GraphicsType, FederatedWheelEvent, FederatedPointerEvent } from 'pixi.js';
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

  // Scrollbar geometry
  const trackHeight = height - 4;
  const thumbHeight = maxScroll > 0 ? Math.max(20, (height / totalHeight) * trackHeight) : 0;
  const thumbY = maxScroll > 0 ? 2 + (scrollY / maxScroll) * (trackHeight - thumbHeight) : 2;

  // Scrollbar drag state
  const isDraggingRef = useRef(false);
  const dragOffsetRef = useRef(0);

  // Global pointer move/up for scrollbar drag (attached to the list container)
  const handlePointerMove = useCallback((e: FederatedPointerEvent) => {
    if (!isDraggingRef.current || maxScroll <= 0) return;
    const newThumbY = e.globalY - dragOffsetRef.current;
    const ratio = Math.max(0, Math.min(1, (newThumbY - 2) / (trackHeight - thumbHeight)));
    setScrollY(ratio * maxScroll);
  }, [maxScroll, trackHeight, thumbHeight]);

  const handlePointerUp = useCallback(() => {
    isDraggingRef.current = false;
  }, []);

  const handleScrollbarDown = useCallback((e: FederatedPointerEvent) => {
    if (maxScroll <= 0) return;
    e.stopPropagation();
    isDraggingRef.current = true;
    // Offset from top of thumb to pointer
    dragOffsetRef.current = e.globalY - thumbY;
  }, [maxScroll, thumbY]);

  // Draw scrollbar track
  const drawScrollbarTrack = useCallback((g: GraphicsType) => {
    g.clear();
    if (maxScroll <= 0) return;
    g.roundRect(0, 2, 6, trackHeight, 3);
    g.fill({ color: theme.bgActive.color, alpha: 0.3 });
  }, [trackHeight, maxScroll, theme]);

  // Draw scrollbar thumb
  const drawScrollbarThumb = useCallback((g: GraphicsType) => {
    g.clear();
    if (maxScroll <= 0) return;
    g.roundRect(0, 0, 6, thumbHeight, 3);
    g.fill({ color: isDraggingRef.current ? theme.accent.color : theme.textMuted.color, alpha: isDraggingRef.current ? 0.6 : 0.4 });
  }, [thumbHeight, maxScroll, theme]);

  // Draw list background (uses theme color, not white)
  const drawListBg = useCallback((g: GraphicsType) => {
    g.clear();
    g.rect(0, 0, width, height);
    g.fill({ color: theme.bg.color });
  }, [width, height, theme]);

  return (
    <pixiContainer
      eventMode="static"
      onWheel={handleWheel}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerUpOutside={handlePointerUp}
      layout={{ width, height, overflow: 'hidden', ...layoutProp }}
    >
      <pixiGraphics draw={drawListBg} layout={{ position: 'absolute', width, height }} />

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
                  g.fill({ color: isEven ? theme.bg.color : theme.bgSecondary.color });
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

      {/* Scrollbar track + draggable thumb */}
      {maxScroll > 0 && (
        <pixiContainer layout={{ position: 'absolute', left: width - 8, top: 0, width: 6, height }}>
          <pixiGraphics draw={drawScrollbarTrack} layout={{ position: 'absolute', width: 6, height }} />
          <pixiGraphics
            draw={drawScrollbarThumb}
            eventMode="static"
            cursor="pointer"
            onPointerDown={handleScrollbarDown}
            layout={{ position: 'absolute', top: thumbY, width: 6, height: thumbHeight }}
          />
        </pixiContainer>
      )}
    </pixiContainer>
  );
};
