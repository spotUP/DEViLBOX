/**
 * Div — The <div> equivalent for the GL UI.
 *
 * Wraps @pixi/layout's <layoutContainer> with Tailwind class parsing via tw().
 * Handles backgroundColor, borderColor, borderRadius, overflow, and full flexbox layout
 * natively — no manual Graphics draws needed.
 *
 * Usage:
 *   <Div className="flex flex-col gap-4 p-6 bg-dark-bgSecondary border border-dark-border rounded-lg">
 *     <Txt className="text-sm text-text-muted">Hello</Txt>
 *   </Div>
 */

import React, { useMemo } from 'react';
import type { FederatedPointerEvent } from 'pixi.js';
import type { LayoutStyles } from '@pixi/layout';
import { usePixiTheme } from '../theme';
import { tw } from './tw';

interface DivProps {
  /** Tailwind class string — parsed into yoga layout props */
  className?: string;
  /** Explicit layout overrides (merged on top of className) */
  layout?: LayoutStyles;
  /** Pixi event mode */
  eventMode?: 'none' | 'passive' | 'auto' | 'static' | 'dynamic';
  /** CSS cursor */
  cursor?: string;
  /** Opacity 0-1 */
  alpha?: number;
  /** Pointer events */
  onPointerDown?: (e: FederatedPointerEvent) => void;
  onPointerUp?: (e: FederatedPointerEvent) => void;
  onPointerOver?: (e: FederatedPointerEvent) => void;
  onPointerOut?: (e: FederatedPointerEvent) => void;
  onPointerMove?: (e: FederatedPointerEvent) => void;
  /** Wheel event */
  onWheel?: (e: FederatedPointerEvent) => void;
  children?: React.ReactNode;
}

export const Div: React.FC<DivProps> = ({
  className,
  layout: layoutOverride,
  eventMode,
  cursor,
  alpha,
  onPointerDown,
  onPointerUp,
  onPointerOver,
  onPointerOut,
  onPointerMove,
  onWheel,
  children,
}) => {
  const theme = usePixiTheme();

  const computedLayout = useMemo(() => {
    const base = className ? tw(className, theme) : {};
    return layoutOverride ? { ...base, ...layoutOverride } : base;
  }, [className, theme, layoutOverride]);

  return (
    <layoutContainer
      layout={computedLayout}
      eventMode={eventMode}
      cursor={cursor}
      alpha={alpha}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerOver={onPointerOver}
      onPointerOut={onPointerOut}
      onPointerMove={onPointerMove}
      onWheel={onWheel}
    >
      {children}
    </layoutContainer>
  );
};
