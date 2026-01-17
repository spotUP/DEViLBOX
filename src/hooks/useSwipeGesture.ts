/**
 * useSwipeGesture - Hook for detecting horizontal swipe gestures
 * Returns handlers to attach to a container element
 */

import { useRef, useCallback } from 'react';

interface SwipeConfig {
  threshold?: number; // Minimum swipe distance (default: 50px)
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
}

interface TouchState {
  startX: number;
  startY: number;
  startTime: number;
}

export function useSwipeGesture({
  threshold = 50,
  onSwipeLeft,
  onSwipeRight,
}: SwipeConfig) {
  const touchState = useRef<TouchState | null>(null);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    touchState.current = {
      startX: touch.clientX,
      startY: touch.clientY,
      startTime: Date.now(),
    };
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (!touchState.current) return;

    const touch = e.changedTouches[0];
    const deltaX = touch.clientX - touchState.current.startX;
    const deltaY = touch.clientY - touchState.current.startY;
    const elapsed = Date.now() - touchState.current.startTime;

    // Only count as swipe if:
    // 1. Horizontal distance > threshold
    // 2. More horizontal than vertical (to avoid conflicts with scrolling)
    // 3. Completed within 500ms (quick swipe)
    if (Math.abs(deltaX) > threshold &&
        Math.abs(deltaX) > Math.abs(deltaY) * 1.5 &&
        elapsed < 500) {
      if (deltaX > 0 && onSwipeRight) {
        onSwipeRight();
      } else if (deltaX < 0 && onSwipeLeft) {
        onSwipeLeft();
      }
    }

    touchState.current = null;
  }, [threshold, onSwipeLeft, onSwipeRight]);

  const handleTouchCancel = useCallback(() => {
    touchState.current = null;
  }, []);

  return {
    onTouchStart: handleTouchStart,
    onTouchEnd: handleTouchEnd,
    onTouchCancel: handleTouchCancel,
  };
}

export default useSwipeGesture;
