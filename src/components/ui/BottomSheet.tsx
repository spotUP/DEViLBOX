/**
 * BottomSheet - swipeable bottom panel for a phone.
 * Snap points, drag-to-dismiss, backdrop tap-to-close.
 *
 * Revived in Phase 3 of thoughts/shared/plans/2026-09-22-responsive-mobile.md,
 * where it had been exported with zero consumers since it was written. It is
 * where a desktop panel goes on a phone: `ResponsivePanel` with
 * `phone="sheet"` renders one of these. Brought onto the design system on the
 * way back in — `<Button>` for the close control, pointer events for the drag.
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { haptics } from '@/utils/haptics';
import { Button } from './Button';

export interface BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  snapPoints?: number[]; // Viewport height percentages [0.25, 0.5, 0.9]
  defaultSnap?: number; // Index into snapPoints
  title?: string;
  showCloseButton?: boolean;
  dismissible?: boolean; // Allow swipe-to-dismiss
}

export const BottomSheet: React.FC<BottomSheetProps> = ({
  isOpen,
  onClose,
  children,
  snapPoints = [0.5, 0.9],
  defaultSnap = 0,
  title,
  showCloseButton = true,
  dismissible = true,
}) => {
  const [currentSnapIndex, setCurrentSnapIndex] = useState(defaultSnap);
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState(0);
  const sheetRef = useRef<HTMLDivElement>(null);
  const dragStartY = useRef(0);
  const dragStartHeight = useRef(0);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  // Calculate height based on snap point
  const snapHeight = snapPoints[currentSnapIndex] * window.innerHeight;
  const currentHeight = isDragging ? dragStartHeight.current - dragOffset : snapHeight;

  // Handle drag start
  const handleDragStart = useCallback((e: React.PointerEvent) => {
    dragStartY.current = e.clientY;
    dragStartHeight.current = currentHeight;
    setIsDragging(true);
    haptics.soft();
  }, [currentHeight]);

  // Handle drag move
  const handleDragMove = useCallback((e: PointerEvent) => {
    if (!isDragging) return;
    const delta = dragStartY.current - e.clientY;
    setDragOffset(delta);
  }, [isDragging]);

  // Handle drag end
  const handleDragEnd = useCallback(() => {
    if (!isDragging) return;

    const newHeight = currentHeight;
    const viewportHeight = window.innerHeight;

    // Find nearest snap point
    let nearestSnapIndex = 0;
    let minDistance = Math.abs(snapPoints[0] * viewportHeight - newHeight);

    snapPoints.forEach((snap, index) => {
      const distance = Math.abs(snap * viewportHeight - newHeight);
      if (distance < minDistance) {
        minDistance = distance;
        nearestSnapIndex = index;
      }
    });

    // If dragged down significantly and dismissible, close
    if (dismissible && newHeight < snapPoints[0] * viewportHeight * 0.7) {
      haptics.success();
      onClose();
    } else {
      haptics.selection();
      setCurrentSnapIndex(nearestSnapIndex);
    }

    setIsDragging(false);
    setDragOffset(0);
  }, [isDragging, currentHeight, snapPoints, dismissible, onClose]);

  // Add global listeners for drag
  useEffect(() => {
    if (!isDragging) return;

    const handleMove = (e: PointerEvent) => {
      e.preventDefault();
      handleDragMove(e);
    };

    window.addEventListener('pointermove', handleMove, { passive: false });
    window.addEventListener('pointerup', handleDragEnd);
    window.addEventListener('pointercancel', handleDragEnd);

    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleDragEnd);
      window.removeEventListener('pointercancel', handleDragEnd);
    };
  }, [isDragging, handleDragMove, handleDragEnd]);

  // Prevent body scroll when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = '';
      };
    }
  }, [isOpen]);

  // Focus management: save focus, auto-focus sheet, restore on close
  useEffect(() => {
    if (!isOpen) return;
    previouslyFocusedRef.current = document.activeElement as HTMLElement;

    requestAnimationFrame(() => {
      if (!sheetRef.current) return;
      const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
      const firstFocusable = sheetRef.current.querySelector<HTMLElement>(FOCUSABLE);
      if (firstFocusable) firstFocusable.focus();
      else sheetRef.current.focus();
    });

    return () => {
      const prev = previouslyFocusedRef.current;
      if (prev && typeof prev.focus === 'function') {
        requestAnimationFrame(() => prev.focus());
      }
    };
  }, [isOpen]);

  // Keyboard: Escape to close, Tab trap
  useEffect(() => {
    if (!isOpen) return;

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && dismissible) {
        e.preventDefault();
        onClose();
        return;
      }

      if (e.key === 'Tab' && sheetRef.current) {
        const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
        const focusable = Array.from(sheetRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey) {
          if (document.activeElement === first || !sheetRef.current.contains(document.activeElement)) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last || !sheetRef.current.contains(document.activeElement)) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };

    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, dismissible, onClose]);

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-[99990]">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 transition-opacity"
        onClick={dismissible ? onClose : undefined}
        style={{ opacity: isDragging ? 0.3 : 0.5 }}
      />

      {/* Bottom Sheet */}
      <div
        ref={sheetRef}
        className="absolute bottom-0 left-0 right-0 bg-dark-bgSecondary rounded-t-2xl shadow-2xl flex flex-col"
        style={{
          height: `${currentHeight}px`,
          transition: isDragging ? 'none' : 'height 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          touchAction: 'none',
        }}
      >
        {/* Drag handle */}
        <div
          className="flex-shrink-0 flex flex-col items-center pt-2 pb-3 cursor-grab active:cursor-grabbing"
          style={{ touchAction: 'none' }}
          onPointerDown={handleDragStart}
        >
          <div className="w-12 h-1 bg-text-muted/30 rounded-full" />
        </div>

        {/* Header */}
        {(title || showCloseButton) && (
          <div className="flex-shrink-0 flex items-center justify-between px-4 pb-3 border-b border-dark-border">
            {title && (
              <h3 className="text-base font-mono font-semibold text-text-primary">
                {title}
              </h3>
            )}
            {showCloseButton && (
              <Button variant="ghost" onClick={onClose} aria-label="Close">
                <X size={20} />
              </Button>
            )}
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-auto safe-bottom">
          {children}
        </div>
      </div>
    </div>,
    document.body
  );
};

export default BottomSheet;
