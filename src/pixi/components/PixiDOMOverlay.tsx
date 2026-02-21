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

import { useRef, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { Container as ContainerType } from 'pixi.js';

interface PixiDOMOverlayProps {
  layout: Record<string, unknown>;   // @pixi/layout flex props
  children: React.ReactNode;          // React DOM children to render
  zIndex?: number;                     // Default 10
  className?: string;                  // Optional class on wrapper div
  style?: React.CSSProperties;        // Additional styles on wrapper div
}

export const PixiDOMOverlay: React.FC<PixiDOMOverlayProps> = ({
  layout,
  children,
  zIndex = 10,
  className,
  style,
}) => {
  const containerRef = useRef<ContainerType>(null);
  const portalRef = useRef<HTMLDivElement | null>(null);
  const rootRef = useRef<Root | null>(null);

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
            const globalPos = el.toGlobal({ x: 0, y: 0 });
            const x = Math.round(globalPos.x);
            const y = Math.round(globalPos.y);
            const w = Math.round(computed.width);
            const h = Math.round(computed.height);

            if (x !== prevX || y !== prevY || w !== prevW || h !== prevH) {
              prevX = x; prevY = y; prevW = w; prevH = h;
              div.style.left = `${x}px`;
              div.style.top = `${y}px`;
              div.style.width = `${w}px`;
              div.style.height = `${h}px`;
              div.style.display = '';
            }
          }
        }
      }
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, []);

  // Only return the Pixi container — the DOM overlay is managed imperatively
  return <pixiContainer ref={containerRef} layout={layout} />;
};
