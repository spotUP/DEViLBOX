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
  /** Background color for the clip mask (should match parent bg to avoid visual artifacts) */
  bgColor?: number;
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
  bgColor,
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

  // Mouse wheel scrolling — stopPropagation prevents PixiJS scene-graph bubbling.
  // nativeEvent.preventDefault() is intentionally omitted: PixiJS registers the canvas
  // wheel listener as { passive: true }, so calling preventDefault() from a synthetic
  // handler fails silently and spams console warnings. Background scroll prevention is
  // handled upstream (PixiPatternEditor checks modalOpen before processing wheel events).
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
    // Anchor rect: sets bounding box = layout dimensions so @pixi/layout scale factor = 1.
    // Without this, the thin scrollbar content gets scaled to fill the full layout area.
    g.rect(0, 0, width, height).fill({ color: 0x000000, alpha: 0 });

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

  // Clip mask — PixiJS stencil mask for proper content clipping.
  // @pixi/layout's overflow:hidden does NOT create a real PixiJS mask,
  // so we need to set container.mask manually.
  const maskRef = useRef<GraphicsType>(null);

  const drawMask = useCallback((g: GraphicsType) => {
    g.clear();
    g.rect(0, 0, width, height);
    g.fill({ color: bgColor ?? 0x000000 });
  }, [width, height, bgColor]);

  // Apply the mask to the content container after both refs are set
  useEffect(() => {
    if (contentRef.current && maskRef.current) {
      contentRef.current.mask = maskRef.current;
    }
    return () => {
      if (contentRef.current) {
        contentRef.current.mask = null;
      }
    };
  });

  return (
    <pixiContainer
      eventMode="static"
      onWheel={handleWheel}
      layout={{
        width,
        height,
        ...layoutProp,
      }}
    >
      {/* Stencil mask for content clipping — must be renderable for PixiJS stencil system.
          Uses bgColor prop to match parent background so it's visually seamless. */}
      <pixiGraphics ref={maskRef} draw={drawMask} eventMode="none" />

      {/* Scrollable content — clipped by mask */}
      <pixiContainer ref={contentRef} eventMode="auto">
        {children}
      </pixiContainer>

      {/* Scrollbar overlay — eventMode="none" so it never intercepts pointer events */}
      {showScrollbar && (canScrollV || canScrollH) && (
        <pixiGraphics
          draw={drawScrollbar}
          eventMode="none"
          layout={{ position: 'absolute', width, height }}
        />
      )}
    </pixiContainer>
  );
};
