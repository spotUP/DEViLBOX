/**
 * PixiDOMOverlay — Bridge that tracks a PixiJS container's layout bounds
 * and renders React DOM children in a positioned overlay div.
 *
 * Because everything inside <Application> runs through the Pixi reconciler,
 * we can't use react-dom's createPortal here. Instead we:
 *   1. Return only a <pixiContainer> (valid Pixi element) for layout participation
 *   2. Imperatively create a <div> on document.body
 *   3. Use createRoot() to mount children into that div (independent React root)
 *   4. RAF-poll the container's @pixi/layout computed bounds to reposition the div
 */

import { useRef, useEffect, useMemo } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { Container as ContainerType } from 'pixi.js';
import { useWorkbenchStore } from '@stores/useWorkbenchStore';

interface PixiDOMOverlayProps {
  layout: Record<string, unknown>;   // @pixi/layout flex props
  children: React.ReactNode;          // React DOM children to render
  zIndex?: number;                     // Default 10
  className?: string;                  // Optional class on wrapper div
  style?: React.CSSProperties;        // Additional styles on wrapper div
  /** When false, hides both the Pixi container and DOM portal without unmounting.
   *  Use instead of conditional rendering to avoid @pixi/layout BindingErrors. */
  visible?: boolean;
  /** When true, measure DOM content height and update Pixi layout to match.
   *  Eliminates gaps caused by hardcoded height constants not matching actual
   *  rendered DOM content height. The initial `layout.height` serves as a
   *  fallback until the first measurement arrives. */
  autoHeight?: boolean;
}

export const PixiDOMOverlay: React.FC<PixiDOMOverlayProps> = ({
  layout,
  children,
  zIndex = 10,
  className,
  style,
  visible = true,
  autoHeight = false,
}) => {
  const containerRef = useRef<ContainerType>(null);
  const portalRef = useRef<HTMLDivElement | null>(null);
  const rootRef = useRef<Root | null>(null);
  const autoHeightRef = useRef(autoHeight);
  autoHeightRef.current = autoHeight;
  const visibleRef = useRef(visible);
  visibleRef.current = visible;
  // Hide DOM overlays during WebGL tilt — they can't participate in the GL transform
  const isTilted = useWorkbenchStore((s) => s.isTilted);
  const isTiltedRef = useRef(isTilted);
  isTiltedRef.current = isTilted;
  // Persist the last measured autoHeight value so parent re-renders
  // don't overwrite it with the caller's static height prop.
  const measuredHeightRef = useRef<number | null>(null);

  // Create imperitive DOM container + React root on mount
  useEffect(() => {
    const div = document.createElement('div');
    if (className) div.className = className;
    div.style.position = 'fixed';
    div.style.zIndex = String(zIndex);
    div.style.pointerEvents = 'auto';
    div.style.display = 'none'; // Hidden until we have valid bounds
    if (style) {
      Object.assign(div.style, style);
    }
    document.body.appendChild(div);
    portalRef.current = div;
    rootRef.current = createRoot(div);

    return () => {
      rootRef.current?.unmount();
      rootRef.current = null;
      div.remove();
      portalRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // className, zIndex, style are treated as static

  // Render children into the portal root whenever they change
  useEffect(() => {
    rootRef.current?.render(children);
  }, [children]);

  // Auto-height: measure DOM content and update Pixi layout to match
  useEffect(() => {
    if (!autoHeight) return;
    const div = portalRef.current;
    const el = containerRef.current;
    if (!div || !el) return;

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const h = Math.round(entry.contentRect.height);
        if (h > 0 && h !== measuredHeightRef.current) {
          measuredHeightRef.current = h;
          const elLayout = (el as any).layout;
          if (elLayout?.style) {
            elLayout.style.height = h;
          }
        }
      }
    });
    ro.observe(div);
    return () => ro.disconnect();
  }, [autoHeight]);

  // RAF loop — reads layout-computed bounds and repositions the portal div
  useEffect(() => {
    let rafId: number;
    let frame = 0;
    let prevX = -1, prevY = -1, prevW = -1, prevH = -1;

    const tick = () => {
      frame++;
      // Throttle to every 2nd frame
      if (frame % 2 === 0) {
        const el = containerRef.current;
        const div = portalRef.current;
        if (el && div) {
          // Read @pixi/layout computed dimensions (yoga engine output)
          const elLayout = (el as any).layout;
          const computed = elLayout?._computedLayout as
            | { width: number; height: number } | undefined;

          if (computed && computed.width > 0 && computed.height > 0) {
            const globalTL = el.toGlobal({ x: 0, y: 0 });
            const globalBR = el.toGlobal({ x: computed.width, y: computed.height });
            const x = Math.round(globalTL.x);
            const y = Math.round(globalTL.y);
            // Use BR-TL so width/height correctly reflect camera scale transforms
            const w = Math.round(Math.abs(globalBR.x - globalTL.x));
            const h = Math.round(Math.abs(globalBR.y - globalTL.y));

            if (x !== prevX || y !== prevY || w !== prevW || h !== prevH) {
              prevX = x; prevY = y; prevW = w; prevH = h;
              div.style.left = `${x}px`;
              div.style.top = `${y}px`;
              div.style.width = `${w}px`;
              // When autoHeight is enabled, don't constrain the div height —
              // let the div size to its DOM content naturally. The ResizeObserver
              // feeds the measured content height back to the Pixi layout.
              if (!autoHeightRef.current) {
                div.style.height = `${h}px`;
              }
              if (visibleRef.current && !isTiltedRef.current) {
                div.style.display = '';
              }
            }
            // Hide/show when visible or isTilted changes without bounds change
            div.style.display = (visibleRef.current && !isTiltedRef.current) ? (prevW > 0 ? '' : 'none') : 'none';
          } else {
            // Zero/invalid bounds — parent is hidden (width:0 from always-mount pattern).
            // Keep the div hidden so it doesn't leak at its last known position.
            div.style.display = 'none';
          }
        }
      }
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, []);

  // When autoHeight is active, override the caller's static height with the
  // last ResizeObserver measurement. This prevents parent re-renders from
  // resetting the Pixi layout height back to the hardcoded prop value,
  // which caused progressive layout drift (elements scrolling down & shrinking).
  const effectiveLayout = useMemo(() => {
    if (autoHeight && measuredHeightRef.current !== null) {
      return { ...layout, height: measuredHeightRef.current };
    }
    return layout;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout, autoHeight]);
  // Note: measuredHeightRef is a ref — we read it during render but don't
  // depend on it. The ResizeObserver imperatively updates elLayout.style.height,
  // and the effectiveLayout ensures the next React re-render won't overwrite it.

  // Only return the Pixi container — the DOM overlay is managed imperatively
  return <pixiContainer ref={containerRef} layout={effectiveLayout} />;
};
