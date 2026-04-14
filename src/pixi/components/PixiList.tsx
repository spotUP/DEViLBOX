/**
 * PixiList — Virtual scrolling list with object pooling.
 * Only renders visible items + buffer for performance.
 * Supports selection highlighting, keyboard navigation, and inline star ratings.
 */

import { useRef, useCallback, useState, useMemo } from 'react';
import { Rectangle } from 'pixi.js';
import type { Graphics as GraphicsType, FederatedWheelEvent, FederatedPointerEvent } from 'pixi.js';
import { PIXI_FONTS } from '../fonts';
import { usePixiTheme } from '../theme';
import { PixiIcon } from './PixiIcon';

/** Draw a 5-pointed star into a Graphics object */
function drawStar(g: GraphicsType, cx: number, cy: number, r: number, points: number, innerRatio: number, color: number, alpha = 1) {
  const inner = r * innerRatio;
  const step = Math.PI / points;
  g.moveTo(cx + r * Math.sin(0), cy - r * Math.cos(0));
  for (let i = 1; i < points * 2; i++) {
    const radius = i % 2 === 0 ? r : inner;
    const angle = i * step;
    g.lineTo(cx + radius * Math.sin(angle), cy - radius * Math.cos(angle));
  }
  g.closePath();
  g.fill({ color, alpha });
}

export interface PixiListItemRating {
  /** Community average (0-5) */
  avg: number;
  /** Total votes */
  count: number;
  /** Current user's rating (1-5), or undefined if not rated */
  userRating?: number;
}

export interface PixiListAction {
  label: string;
  color?: number;
  onClick: () => void;
}

export interface PixiListItem {
  id: string;
  label: string;
  labelColor?: number;
  sublabel?: string;
  /** Hex color for a small category dot rendered before the label */
  dotColor?: number;
  /** FontAudio icon name — when set, renders a PixiIcon instead of a colored dot */
  iconName?: string;
  /** Tint color for the icon (defaults to textMuted) */
  iconColor?: number;
  /** Star rating data — if present, 5 interactive stars are shown */
  rating?: PixiListItemRating;
  /** Action buttons shown on hover (right-aligned) */
  actions?: PixiListAction[];
}

interface PixiListProps {
  items: PixiListItem[];
  width: number;
  height: number;
  itemHeight?: number;
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  onDoubleClick?: (id: string) => void;
  onRightClick?: (id: string, e: React.MouseEvent) => void;
  /** Callback when a star is clicked. rating=1..5. */
  onRate?: (id: string, rating: number) => void;
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
  onRightClick,
  onRate,
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

  const handleItemPointerDown = useCallback((id: string, e: any) => {
    console.log('[PixiList] PointerDown:', { id, button: e.button, globalX: e.globalX, globalY: e.globalY });
    // Right-click (button 2) triggers context menu
    if (e.button === 2) {
      // Convert Pixi event to React MouseEvent-like object
      const fakeEvent = {
        preventDefault: () => {},
        stopPropagation: () => {},
        clientX: e.globalX || 0,
        clientY: e.globalY || 0,
      } as React.MouseEvent;
      console.log('[PixiList] Right-click detected, calling onRightClick with:', fakeEvent);
      onRightClick?.(id, fakeEvent);
      return;
    }
  }, [onRightClick]);

  // Scrollbar geometry
  const trackHeight = height - 4;
  const thumbHeight = maxScroll > 0 ? Math.max(20, (height / totalHeight) * trackHeight) : 0;
  const thumbY = maxScroll > 0 ? 2 + (scrollY / maxScroll) * (trackHeight - thumbHeight) : 2;

  // Scrollbar drag state
  const isDraggingRef = useRef(false);
  const dragOffsetRef = useRef(0);

  // Root container ref for coordinate conversion
  const rootRef = useRef<import('pixi.js').Container | null>(null);

  // Global pointer move/up for scrollbar drag + row hover tracking
  const handlePointerMove = useCallback((e: FederatedPointerEvent) => {
    // Scrollbar drag
    if (isDraggingRef.current && maxScroll > 0) {
      const newThumbY = e.globalY - dragOffsetRef.current;
      const ratio = Math.max(0, Math.min(1, (newThumbY - 2) / (trackHeight - thumbHeight)));
      setScrollY(ratio * maxScroll);
    }
    // Row hover tracking — compute which row is under pointer from local Y
    const root = rootRef.current;
    if (root) {
      const local = root.toLocal(e.global);
      const rowIdx = Math.floor((local.y + scrollY) / itemHeight);
      const startIdx = Math.floor(scrollY / itemHeight);
      const endIdx = startIdx + Math.ceil(height / itemHeight) + buffer * 2;
      if (rowIdx >= 0 && rowIdx < items.length && rowIdx >= startIdx - buffer && rowIdx < endIdx) {
        setHoveredItemId(items[rowIdx].id);
      } else {
        setHoveredItemId(null);
      }
    }
  }, [maxScroll, trackHeight, thumbHeight, scrollY, itemHeight, height, buffer, items]);

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

  // Star rating constants
  const STAR_SIZE = 16;
  const STAR_GAP = 2;
  const STAR_FILLED = 0xf59e0b;   // amber-500
  const STAR_EMPTY = 0xffffff;    // white (40% alpha applied via container)
  const STAR_USER = 0xfbbf24;     // amber-400 (brighter for user's own)

  const [hoveredItemId, setHoveredItemId] = useState<string | null>(null);
  const [hoveredStar, setHoveredStar] = useState<{ itemId: string; star: number } | null>(null);

  const handleStarClick = useCallback((itemId: string, star: number) => {
    if (!onRate) return;
    const item = items.find(i => i.id === itemId);
    // Click same star = remove rating (signal with 0)
    onRate(itemId, item?.rating?.userRating === star ? 0 : star);
  }, [onRate, items]);

  return (
    <pixiContainer
      ref={rootRef as any}
      eventMode="static"
      hitArea={new Rectangle(0, 0, width, height)}
      onWheel={handleWheel}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerUpOutside={handlePointerUp}
      onPointerLeave={() => setHoveredItemId(null)}
      layout={{ width, height, overflow: 'hidden', backgroundColor: theme.bg.color, ...layoutProp }}
    >

      {/* Virtual items */}
      {visibleItems.map((item, i) => {
        const actualIdx = startIdx + i;
        const y = actualIdx * itemHeight - scrollY;
        const isSelected = item.id === selectedId;
        const isHovered = item.id === hoveredItemId;
        const isEven = actualIdx % 2 === 0;

        const rowBgTint = isSelected ? theme.accent.color : isHovered ? theme.accent.color : theme.bg.color;
        const rowBgAlpha = isSelected ? 0.15 : isHovered ? 0.08 : isEven ? 1 : 0.85;

        return (
          <pixiContainer
            key={item.id}
            eventMode="static"
            cursor="pointer"
            hitArea={new Rectangle(0, 0, width - 10, itemHeight)}
            onClick={() => handleItemClick(item.id)}
            onPointerDown={(e: any) => handleItemPointerDown(item.id, e)}
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
            {/* Row background — uses tint+alpha (reactive) instead of draw (cached) */}
            <pixiGraphics
              draw={(g) => { g.clear(); g.rect(0, 0, width - 10, itemHeight).fill(0xffffff); }}
              tint={rowBgTint}
              alpha={rowBgAlpha}
              eventMode="none"
              layout={{ position: 'absolute', width: width - 10, height: itemHeight }}
            />

            {item.iconName ? (
              <PixiIcon
                name={item.iconName}
                size={14}
                color={item.iconColor ?? theme.textMuted.color}
                layout={{ flexShrink: 0, marginRight: 5 }}
              />
            ) : item.dotColor != null ? (
              <layoutContainer
                layout={{ width: 6, height: 6, flexShrink: 0, marginRight: 5, backgroundColor: item.dotColor!, borderRadius: 1 }}
              />
            ) : null}
            <pixiBitmapText
              eventMode="none"
              text={item.label}
              style={{
                fontFamily: PIXI_FONTS.MONO,
                fontSize: 14,
                fill: 0xffffff,
              }}
              tint={item.labelColor ?? (isSelected ? theme.accent.color : theme.text.color)}
              layout={{ flex: 1 }}
            />

            {item.sublabel && (
              <pixiBitmapText
                eventMode="none"
                text={item.sublabel}
                style={{
                  fontFamily: PIXI_FONTS.MONO,
                  fontSize: 12,
                  fill: 0xffffff,
                }}
                tint={theme.textMuted.color}
                layout={{ flexShrink: 0, marginRight: 8 }}
              />
            )}

            {/* Hover action buttons (right-aligned) */}
            {isHovered && item.actions && item.actions.length > 0 && (
              <pixiContainer
                eventMode="static"
                layout={{ flexDirection: 'row', flexShrink: 0, gap: 2, marginRight: 4 }}
              >
                {item.actions.map((action, ai) => (
                  <pixiContainer
                    key={ai}
                    eventMode="static"
                    cursor="pointer"
                    onPointerUp={(e: FederatedPointerEvent) => { e.stopPropagation(); action.onClick(); }}
                    layout={{
                      height: itemHeight - 4,
                      paddingLeft: 5,
                      paddingRight: 5,
                      justifyContent: 'center',
                      alignItems: 'center',
                      backgroundColor: action.color ?? theme.accent.color,
                      borderRadius: 3,
                    }}
                  >
                    <pixiBitmapText
                      eventMode="none"
                      text={action.label}
                      style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 10, fill: 0xffffff }}
                      layout={{}}
                    />
                  </pixiContainer>
                ))}
              </pixiContainer>
            )}

            {/* Star ratings */}
            {item.rating != null && onRate && (
              <pixiContainer
                eventMode="static"
                layout={{ flexDirection: 'row', flexShrink: 0, gap: STAR_GAP, marginRight: 6, alignItems: 'center' }}
              >
                {[1, 2, 3, 4, 5].map(star => {
                  const avg = item.rating!.avg;
                  const userR = item.rating!.userRating;
                  const isHovered = hoveredStar?.itemId === item.id && hoveredStar.star >= star;
                  const isFilled = userR ? star <= userR : star <= Math.round(avg);
                  const color = isHovered ? STAR_USER : (userR && star <= userR) ? STAR_USER : isFilled ? STAR_FILLED : STAR_EMPTY;
                  const alpha = color === STAR_EMPTY ? 0.4 : 1;

                  return (
                    <pixiGraphics
                      key={star}
                      eventMode="static"
                      cursor="pointer"
                      draw={(g) => {
                        g.clear();
                        drawStar(g, STAR_SIZE / 2, STAR_SIZE / 2, STAR_SIZE / 2, 5, 0.45, color, alpha);
                      }}
                      onPointerEnter={() => setHoveredStar({ itemId: item.id, star })}
                      onPointerLeave={() => setHoveredStar(null)}
                      onPointerUp={(e: FederatedPointerEvent) => {
                        e.stopPropagation();
                        handleStarClick(item.id, star);
                      }}
                      layout={{ width: STAR_SIZE, height: STAR_SIZE }}
                    />
                  );
                })}
                {item.rating!.count > 0 && (
                  <pixiBitmapText
                    eventMode="none"
                    text={`(${item.rating!.count})`}
                    style={{ fontFamily: PIXI_FONTS.MONO, fontSize: 9, fill: 0xffffff }}
                    tint={theme.textMuted.color}
                    layout={{ marginLeft: 2 }}
                  />
                )}
              </pixiContainer>
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
