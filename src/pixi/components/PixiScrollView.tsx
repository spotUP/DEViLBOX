/**
 * PixiScrollView — Scrollable container with themed scrollbars.
 * Wraps content and provides vertical/horizontal scrolling via mouse wheel
 * and drag-to-scroll. Uses masking to clip content.
 */

import { useRef, useCallback, useEffect, useState } from 'react';
import type { Container as ContainerType, FederatedWheelEvent } from 'pixi.js';
import type { Graphics as GraphicsType } from 'pixi.js';
import { usePixiTheme } from '../theme';

interface PixiScrollViewProps {
  width: number;
  height: number;
  /** Total content height (for virtual scrolling calculation) */
  contentHeight?: number;
  /** Total content width */
  contentWidth?: number;
  /** Scroll direction */
  direction?: 'vertical' | 'horizontal' | 'both';
  /** Show scrollbar track */
  showScrollbar?: boolean;
  children?: React.ReactNode;
  layout?: Record<string, unknown>;
}

export const PixiScrollView: React.FC<PixiScrollViewProps> = ({
  width,
  height,
  contentHeight = height,
  contentWidth = width,
  direction = 'vertical',
  showScrollbar = true,
  children,
  layout: layoutProp,
}) => {
  const theme = usePixiTheme();
  const [scrollY, setScrollY] = useState(0);
  const [scrollX, setScrollX] = useState(0);
  const contentRef = useRef<ContainerType>(null);

  const maxScrollY = Math.max(0, contentHeight - height);
  const maxScrollX = Math.max(0, contentWidth - width);

  const scrollBarWidth = 6;
  const canScrollV = direction !== 'horizontal' && maxScrollY > 0;
  const canScrollH = direction !== 'vertical' && maxScrollX > 0;

  // Mouse wheel scrolling
  const handleWheel = useCallback((e: FederatedWheelEvent) => {
    e.stopPropagation();
    if (canScrollV) {
      setScrollY(prev => Math.max(0, Math.min(maxScrollY, prev + e.deltaY)));
    }
    if (canScrollH) {
      setScrollX(prev => Math.max(0, Math.min(maxScrollX, prev + e.deltaX)));
    }
  }, [canScrollV, canScrollH, maxScrollY, maxScrollX]);

  // Update content position
  useEffect(() => {
    if (contentRef.current) {
      contentRef.current.y = -scrollY;
      contentRef.current.x = -scrollX;
    }
  }, [scrollY, scrollX]);

  // Draw scrollbar
  const drawScrollbar = useCallback((g: GraphicsType) => {
    g.clear();

    if (canScrollV && showScrollbar) {
      // Vertical scrollbar track
      const trackHeight = height - 4;
      const thumbHeight = Math.max(20, (height / contentHeight) * trackHeight);
      const thumbY = 2 + (scrollY / maxScrollY) * (trackHeight - thumbHeight);

      // Track
      g.roundRect(width - scrollBarWidth - 2, 2, scrollBarWidth, trackHeight, 3);
      g.fill({ color: theme.bgActive.color, alpha: 0.3 });

      // Thumb
      g.roundRect(width - scrollBarWidth - 2, thumbY, scrollBarWidth, thumbHeight, 3);
      g.fill({ color: theme.textMuted.color, alpha: 0.4 });
    }

    if (canScrollH && showScrollbar) {
      const trackWidth = width - 4;
      const thumbWidth = Math.max(20, (width / contentWidth) * trackWidth);
      const thumbX = 2 + (scrollX / maxScrollX) * (trackWidth - thumbWidth);

      g.roundRect(2, height - scrollBarWidth - 2, trackWidth, scrollBarWidth, 3);
      g.fill({ color: theme.bgActive.color, alpha: 0.3 });

      g.roundRect(thumbX, height - scrollBarWidth - 2, thumbWidth, scrollBarWidth, 3);
      g.fill({ color: theme.textMuted.color, alpha: 0.4 });
    }
  }, [width, height, contentHeight, contentWidth, scrollY, scrollX, maxScrollY, maxScrollX, canScrollV, canScrollH, showScrollbar, theme]);

  // Clipping mask
  const drawMask = useCallback((g: GraphicsType) => {
    g.clear();
    g.rect(0, 0, width, height);
    g.fill({ color: 0xffffff });
  }, [width, height]);

  return (
    <pixiContainer
      eventMode="static"
      onWheel={handleWheel}
      layout={{
        width,
        height,
        overflow: 'hidden',
        ...layoutProp,
      }}
    >
      {/* Clipping mask */}
      <pixiGraphics draw={drawMask} layout={{ position: 'absolute' }} />

      {/* Scrollable content */}
      <pixiContainer ref={contentRef}>
        {children}
      </pixiContainer>

      {/* Scrollbar overlay */}
      {showScrollbar && (canScrollV || canScrollH) && (
        <pixiGraphics
          draw={drawScrollbar}
          layout={{ position: 'absolute', width, height }}
        />
      )}
    </pixiContainer>
  );
};
