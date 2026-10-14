/**
 * AnchoredPopover - a panel that opens next to a trigger and closes on a click
 * outside it or Escape.
 *
 * Rendered in a portal on document.body, so no `overflow-hidden` ancestor can clip
 * it. Opens by click only (no hover state), so a coarse pointer can use it too.
 * Position is read from the anchor when it opens: below it (default) or above it,
 * kept inside the window.
 */

import React, { useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';

export interface AnchoredPopoverProps {
  open: boolean;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLElement | null>;
  /** Which side of the anchor the panel opens on. */
  placement?: 'below' | 'above';
  /** Classes of the panel (width etc). */
  className?: string;
  children: React.ReactNode;
}

const GAP = 4;
const EDGE = 8;

export const AnchoredPopover: React.FC<AnchoredPopoverProps> = ({
  open,
  onClose,
  anchorRef,
  placement = 'below',
  className = '',
  children,
}) => {
  // Placed by a callback ref as the panel mounts (once per open): the anchor's
  // rect is a DOM read, and writing the position straight to the element avoids
  // a second render with the panel at the wrong place.
  const place = useCallback(
    (el: HTMLDivElement | null): void => {
      const anchor = anchorRef.current;
      if (!el || !anchor) return;
      const r = anchor.getBoundingClientRect();
      el.style.left = `${Math.max(EDGE, Math.min(r.left, window.innerWidth - el.offsetWidth - EDGE))}px`;
      if (placement === 'below') {
        el.style.top = `${r.bottom + GAP}px`;
      } else {
        el.style.bottom = `${window.innerHeight - r.top + GAP}px`;
      }
    },
    [anchorRef, placement],
  );

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <>
      {/* Invisible backdrop: a click outside the panel closes it */}
      <div className="fixed inset-0 z-[99988]" onClick={onClose} data-popover-backdrop />
      <div
        ref={place}
        className={`fixed z-[99989] ${className}`}
        role="dialog"
        data-anchored-popover
      >
        {children}
      </div>
    </>,
    document.body,
  );
};
