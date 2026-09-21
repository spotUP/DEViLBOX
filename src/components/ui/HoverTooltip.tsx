/**
 * Hover tooltips that cost no layout.
 *
 * The Dub Deck used to carry a status line above the move rows, rendered even
 * when empty so that filling it would not jog the buttons under the pointer.
 * That reserved a row of vertical space permanently to describe one button
 * occasionally — on a surface where vertical space is what lets a performer
 * see the moves without scrolling. Replaced on 2026-09-21 at the user's
 * request.
 *
 * Why not the native `title` attribute, which those buttons already had: it
 * waits about a second before appearing, which is slower than the bar it
 * replaces and too slow to be read mid-take.
 *
 * The tooltip renders in a portal on `document.body` at fixed coordinates
 * taken from the hovered element's own rectangle. Both parts matter: the deck
 * nests scrollable, clipping containers, so a tooltip positioned inside the
 * tree gets cut off by whichever ancestor has `overflow: hidden`; and
 * anchoring to the element rather than the pointer keeps it still instead of
 * trailing the mouse.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/** Gap between the hovered control and the tooltip, in pixels. */
const OFFSET_PX = 8;
/** Keep the tooltip this far inside the viewport edges. */
const MARGIN_PX = 8;

interface TooltipState {
  label: string;
  /** Centre of the anchor, viewport coordinates. */
  x: number;
  /** Top of the anchor, viewport coordinates. */
  top: number;
  /** Bottom of the anchor, for the flip-below case. */
  bottom: number;
}

export interface HoverTooltipProps {
  onMouseEnter: (e: React.MouseEvent<HTMLElement>) => void;
  onMouseLeave: () => void;
  'aria-label': string;
}

export interface HoverTooltip {
  /**
   * Props for one control. The label becomes both the tooltip text and the
   * control's accessible name, so the description cannot drift from what a
   * screen reader is told.
   */
  hoverProps: (label: string) => HoverTooltipProps;
  /** Render once, anywhere. Null while nothing is hovered. */
  tooltip: React.ReactNode;
  /** Hide immediately — for a click that opens a menu, or a panic. */
  hide: () => void;
}

export function useHoverTooltip(): HoverTooltip {
  const [state, setState] = useState<TooltipState | null>(null);
  const nodeRef = useRef<HTMLDivElement | null>(null);
  const [flipBelow, setFlipBelow] = useState(false);

  const hide = useCallback(() => setState(null), []);

  const hoverProps = useCallback((label: string): HoverTooltipProps => ({
    onMouseEnter: (e: React.MouseEvent<HTMLElement>) => {
      const r = e.currentTarget.getBoundingClientRect();
      setState({ label, x: r.left + r.width / 2, top: r.top, bottom: r.bottom });
    },
    onMouseLeave: hide,
    'aria-label': label,
  }), [hide]);

  // A pointer press, a scroll or a key means the pointer is no longer telling
  // the truth about what is under it. Capture phase, because a handler on the
  // button itself may stop the event before it reaches the window.
  useEffect(() => {
    if (!state) return;
    const opts = { capture: true } as const;
    window.addEventListener('pointerdown', hide, opts);
    window.addEventListener('scroll', hide, { capture: true, passive: true });
    window.addEventListener('keydown', hide, opts);
    return () => {
      window.removeEventListener('pointerdown', hide, opts);
      window.removeEventListener('scroll', hide, opts);
      window.removeEventListener('keydown', hide, opts);
    };
  }, [state, hide]);

  // Flip under the control when there is not room above it. Measured after
  // paint, because the height depends on how the text wrapped.
  useEffect(() => {
    if (!state) { setFlipBelow(false); return; }
    const h = nodeRef.current?.offsetHeight ?? 0;
    setFlipBelow(state.top - h - OFFSET_PX < MARGIN_PX);
  }, [state]);

  let tooltip: React.ReactNode = null;
  if (state && typeof document !== 'undefined') {
    const y = flipBelow ? state.bottom + OFFSET_PX : state.top - OFFSET_PX;
    tooltip = createPortal(
      <div
        ref={nodeRef}
        role="tooltip"
        className="fixed z-[100] pointer-events-none max-w-xs px-2 py-1 rounded border border-dark-borderLight bg-dark-bg text-text-primary text-xs font-mono shadow-lg"
        style={{
          left: state.x,
          top: y,
          transform: `translate(-50%, ${flipBelow ? '0' : '-100%'})`,
        }}
      >
        {state.label}
      </div>,
      document.body,
    );
  }

  return { hoverProps, tooltip, hide };
}
