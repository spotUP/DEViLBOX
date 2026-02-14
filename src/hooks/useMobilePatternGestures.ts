/**
 * useMobilePatternGestures - Pattern editor specific gesture detection
 * Handles swipe, tap, long-press, and pinch-zoom gestures for mobile tracker
 */

import { useRef, useCallback } from 'react';
import { haptics } from '@/utils/haptics';

export interface PatternGestureConfig {
  onSwipeUp?: () => void;
  onSwipeDown?: () => void;
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  onTap?: (x: number, y: number) => void;
  onLongPress?: (x: number, y: number) => void;
  onPinchZoom?: (scale: number) => void;
  onScroll?: (deltaY: number) => void; // Continuous scroll during touch drag
  swipeThreshold?: number;
  longPressDelay?: number;
  enabled?: boolean;
}

export interface GestureHandlers {
  onTouchStart: (e: React.TouchEvent) => void;
  onTouchMove: (e: React.TouchEvent) => void;
  onTouchEnd: (e: React.TouchEvent) => void;
  onTouchCancel: () => void;
}

interface TouchState {
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  lastY: number; // For continuous scroll tracking
  startTime: number;
  touches: number;
  initialDistance: number;
  longPressTimer: ReturnType<typeof setTimeout> | null;
  hasMoved: boolean;
}

const MOVEMENT_THRESHOLD = 10; // px - movement allowed before canceling tap/long-press
const DEFAULT_SWIPE_THRESHOLD = 50; // px
const DEFAULT_LONG_PRESS_DELAY = 500; // ms
const SWIPE_MAX_DURATION = 500; // ms - swipes must be quick
const PINCH_THRESHOLD = 50; // px - minimum pinch distance change

/**
 * Get distance between two touch points
 */
function getTouchDistance(touch1: React.Touch, touch2: React.Touch): number {
  const dx = touch2.clientX - touch1.clientX;
  const dy = touch2.clientY - touch1.clientY;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Hook for pattern editor gesture detection
 */
export function useMobilePatternGestures({
  onSwipeUp,
  onSwipeDown,
  onSwipeLeft,
  onSwipeRight,
  onTap,
  onLongPress,
  onPinchZoom,
  onScroll,
  swipeThreshold = DEFAULT_SWIPE_THRESHOLD,
  longPressDelay = DEFAULT_LONG_PRESS_DELAY,
  enabled = true,
}: PatternGestureConfig): GestureHandlers {
  const touchState = useRef<TouchState | null>(null);

  // Clear long-press timer
  const clearLongPressTimer = useCallback(() => {
    if (touchState.current?.longPressTimer) {
      clearTimeout(touchState.current.longPressTimer);
      touchState.current.longPressTimer = null;
    }
  }, []);

  // Handle touch start
  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (!enabled) return;

      const touch = e.touches[0];
      const numTouches = e.touches.length;

      touchState.current = {
        startX: touch.clientX,
        startY: touch.clientY,
        currentX: touch.clientX,
        currentY: touch.clientY,
        lastY: touch.clientY,
        startTime: Date.now(),
        touches: numTouches,
        initialDistance: numTouches === 2 ? getTouchDistance(e.touches[0], e.touches[1]) : 0,
        longPressTimer: null,
        hasMoved: false,
      };

      // Start long-press timer for single touch
      if (numTouches === 1 && onLongPress) {
        touchState.current.longPressTimer = setTimeout(() => {
          if (touchState.current && !touchState.current.hasMoved) {
            haptics.heavy();
            onLongPress(touchState.current.startX, touchState.current.startY);
            touchState.current = null; // Consume the gesture
          }
        }, longPressDelay);
      }
    },
    [enabled, onLongPress, longPressDelay]
  );

  // Handle touch move
  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (!enabled || !touchState.current) return;

      const touch = e.touches[0];
      const numTouches = e.touches.length;

      touchState.current.currentX = touch.clientX;
      touchState.current.currentY = touch.clientY;

      const deltaX = touch.clientX - touchState.current.startX;
      const deltaY = touch.clientY - touchState.current.startY;
      const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

      // Check if moved beyond threshold
      if (distance > MOVEMENT_THRESHOLD) {
        touchState.current.hasMoved = true;
        clearLongPressTimer();
      }

      // Handle pinch-zoom (two fingers)
      if (numTouches === 2 && onPinchZoom && e.touches.length === 2) {
        const currentDistance = getTouchDistance(e.touches[0], e.touches[1]);
        const distanceChange = currentDistance - touchState.current.initialDistance;

        // Only trigger if significant change
        if (Math.abs(distanceChange) > PINCH_THRESHOLD) {
          const scale = currentDistance / touchState.current.initialDistance;
          onPinchZoom(scale);
          // Update initial distance for continuous pinching
          touchState.current.initialDistance = currentDistance;
        }

        // Prevent default to avoid page zoom
        e.preventDefault();
      }

      // Handle continuous scroll for single-touch vertical movement
      if (numTouches === 1 && onScroll) {
        const deltaY = touchState.current.lastY - touch.clientY;
        const absX = Math.abs(deltaX);
        const absY = Math.abs(deltaY);

        // Prevent default horizontal scrolling when we detect any meaningful touch movement
        if (absX > 5 || absY > 5) {
          e.preventDefault();
        }

        // Only trigger scroll if this is significantly more vertical than horizontal
        // Use 1.5x ratio to allow some horizontal drift while scrolling
        if (absY > absX * 1.5 && Math.abs(deltaY) > 1) {
          onScroll(deltaY);
          touchState.current.lastY = touch.clientY;
        }
      }
    },
    [enabled, onPinchZoom, onScroll, clearLongPressTimer]
  );

  // Handle touch end
  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (!enabled || !touchState.current) return;

      clearLongPressTimer();

      const touch = e.changedTouches[0];
      const deltaX = touch.clientX - touchState.current.startX;
      const deltaY = touch.clientY - touchState.current.startY;
      const elapsed = Date.now() - touchState.current.startTime;
      const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

      // Tap detection (quick touch with minimal movement)
      if (
        !touchState.current.hasMoved &&
        distance < MOVEMENT_THRESHOLD &&
        elapsed < 300 &&
        touchState.current.touches === 1 &&
        onTap
      ) {
        haptics.soft();
        onTap(touchState.current.startX, touchState.current.startY);
        touchState.current = null;
        return;
      }

      // Swipe detection (quick directional movement)
      if (
        touchState.current.hasMoved &&
        elapsed < SWIPE_MAX_DURATION &&
        touchState.current.touches === 1
      ) {
        const absX = Math.abs(deltaX);
        const absY = Math.abs(deltaY);

        // Determine swipe direction (favor the dominant axis)
        if (absX > absY && absX > swipeThreshold) {
          // Horizontal swipe - prevent default scrolling
          e.preventDefault();
          haptics.selection();
          if (deltaX > 0 && onSwipeRight) {
            onSwipeRight();
          } else if (deltaX < 0 && onSwipeLeft) {
            onSwipeLeft();
          }
        } else if (absY > absX && absY > swipeThreshold) {
          // Vertical swipe
          haptics.selection();
          if (deltaY > 0 && onSwipeDown) {
            onSwipeDown();
          } else if (deltaY < 0 && onSwipeUp) {
            onSwipeUp();
          }
        }
      }

      touchState.current = null;
    },
    [
      enabled,
      swipeThreshold,
      onSwipeUp,
      onSwipeDown,
      onSwipeLeft,
      onSwipeRight,
      onTap,
      clearLongPressTimer,
    ]
  );

  // Handle touch cancel
  const handleTouchCancel = useCallback(() => {
    clearLongPressTimer();
    touchState.current = null;
  }, [clearLongPressTimer]);

  return {
    onTouchStart: handleTouchStart,
    onTouchMove: handleTouchMove,
    onTouchEnd: handleTouchEnd,
    onTouchCancel: handleTouchCancel,
  };
}

export default useMobilePatternGestures;
