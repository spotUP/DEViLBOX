/**
 * BottomSheet - Swipeable bottom panel for mobile
 * Supports snap points, drag-to-dismiss, and backdrop tap-to-close
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { haptics } from '@/utils/haptics';

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

  // Calculate height based on snap point
  const snapHeight = snapPoints[currentSnapIndex] * window.innerHeight;
  const currentHeight = isDragging ? dragStartHeight.current - dragOffset : snapHeight;

  // Handle drag start
  const handleDragStart = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    dragStartY.current = clientY;
    dragStartHeight.current = currentHeight;
    setIsDragging(true);
    haptics.soft();
  }, [currentHeight]);

  // Handle drag move
  const handleDragMove = useCallback((e: TouchEvent | MouseEvent) => {
    if (!isDragging) return;

    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    const delta = dragStartY.current - clientY;
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

    const handleMove = (e: TouchEvent | MouseEvent) => {
      e.preventDefault();
      handleDragMove(e);
    };

    window.addEventListener('touchmove', handleMove, { passive: false });
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('touchend', handleDragEnd);
    window.addEventListener('mouseup', handleDragEnd);

    return () => {
      window.removeEventListener('touchmove', handleMove);
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('touchend', handleDragEnd);
      window.removeEventListener('mouseup', handleDragEnd);
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

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-50">
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
          onTouchStart={handleDragStart}
          onMouseDown={handleDragStart}
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
              <button
                onClick={onClose}
                className="p-2 rounded-lg hover:bg-dark-bgHover transition-colors touch-target"
                aria-label="Close"
              >
                <X size={20} className="text-text-muted" />
              </button>
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
