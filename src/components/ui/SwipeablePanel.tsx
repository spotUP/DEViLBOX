/**
 * SwipeablePanel - Horizontal swipe navigation between panels
 * Use for instrument switching, effect navigation, etc.
 */

import React, { useRef, useState, useCallback, useEffect } from 'react';
import { haptics } from '@/utils/haptics';

export interface SwipeablePanelProps {
  children: React.ReactNode;
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  threshold?: number; // Swipe threshold in px (default: 50)
  className?: string;
  disabled?: boolean;
}

export const SwipeablePanel: React.FC<SwipeablePanelProps> = ({
  children,
  onSwipeLeft,
  onSwipeRight,
  threshold = 50,
  className = '',
  disabled = false,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState(0);
  const dragStartX = useRef(0);
  const dragStartTime = useRef(0);

  // Handle drag start
  const handleDragStart = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    if (disabled) return;

    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    dragStartX.current = clientX;
    dragStartTime.current = Date.now();
    setIsDragging(true);
  }, [disabled]);

  // Handle drag move
  const handleDragMove = useCallback((e: TouchEvent | MouseEvent) => {
    if (!isDragging || disabled) return;

    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const delta = clientX - dragStartX.current;

    // Apply resistance at edges
    const resistance = 0.5;
    setDragOffset(delta * resistance);
  }, [isDragging, disabled]);

  // Handle drag end
  const handleDragEnd = useCallback(() => {
    if (!isDragging || disabled) return;

    const deltaX = dragOffset;
    const elapsed = Date.now() - dragStartTime.current;
    const velocity = Math.abs(deltaX) / elapsed; // px/ms

    // Trigger swipe if threshold met or velocity is high
    const shouldSwipe = Math.abs(deltaX) > threshold || velocity > 0.5;

    if (shouldSwipe) {
      if (deltaX > 0 && onSwipeRight) {
        haptics.selection();
        onSwipeRight();
      } else if (deltaX < 0 && onSwipeLeft) {
        haptics.selection();
        onSwipeLeft();
      }
    }

    setIsDragging(false);
    setDragOffset(0);
  }, [isDragging, disabled, dragOffset, threshold, onSwipeLeft, onSwipeRight]);

  // Add global listeners for drag
  useEffect(() => {
    if (!isDragging) return;

    window.addEventListener('touchmove', handleDragMove, { passive: false });
    window.addEventListener('mousemove', handleDragMove);
    window.addEventListener('touchend', handleDragEnd);
    window.addEventListener('mouseup', handleDragEnd);

    return () => {
      window.removeEventListener('touchmove', handleDragMove);
      window.removeEventListener('mousemove', handleDragMove);
      window.removeEventListener('touchend', handleDragEnd);
      window.removeEventListener('mouseup', handleDragEnd);
    };
  }, [isDragging, handleDragMove, handleDragEnd]);

  return (
    <div
      ref={containerRef}
      className={`swipeable-panel ${className}`}
      onTouchStart={handleDragStart}
      onMouseDown={handleDragStart}
      style={{
        transform: `translateX(${dragOffset}px)`,
        transition: isDragging ? 'none' : 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        touchAction: 'pan-y', // Allow vertical scroll, prevent horizontal
      }}
    >
      {children}
    </div>
  );
};

export default SwipeablePanel;
