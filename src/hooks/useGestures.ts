/**
 * useGestures - Universal gesture detection hook
 * Supports tap, double-tap, long-press, swipe (4 directions), pinch-zoom, and rotation
 * State machine prevents conflicting gestures
 */

import { useRef, useCallback } from 'react';
import { haptics } from '@/utils/haptics';

export interface GestureConfig {
  onTap?: (x: number, y: number) => void;
  onDoubleTap?: (x: number, y: number) => void;
  onLongPress?: (x: number, y: number) => void;
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  onSwipeUp?: () => void;
  onSwipeDown?: () => void;
  onPinchZoom?: (scale: number, centerX: number, centerY: number) => void;
  onRotate?: (angle: number) => void;
  swipeThreshold?: number;
  longPressDelay?: number;
  doubleTapDelay?: number;
  enabled?: boolean;
}

export interface GestureHandlers {
  onTouchStart: (e: React.TouchEvent) => void;
  onTouchMove: (e: React.TouchEvent) => void;
  onTouchEnd: (e: React.TouchEvent) => void;
  onTouchCancel: () => void;
}

type GestureState = 'idle' | 'tap' | 'long-press' | 'swipe' | 'pinch' | 'rotate';

interface TouchState {
  state: GestureState;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  startTime: number;
  touches: number;
  initialDistance: number;
  initialAngle: number;
  longPressTimer: ReturnType<typeof setTimeout> | null;
  doubleTapTimer: ReturnType<typeof setTimeout> | null;
  hasMoved: boolean;
  lastTapTime: number;
  lastTapX: number;
  lastTapY: number;
}

const MOVEMENT_THRESHOLD = 10; // px
const DEFAULT_SWIPE_THRESHOLD = 50; // px
const DEFAULT_LONG_PRESS_DELAY = 500; // ms
const DEFAULT_DOUBLE_TAP_DELAY = 300; // ms
const SWIPE_MAX_DURATION = 500; // ms
const PINCH_THRESHOLD = 20; // px
const ROTATE_THRESHOLD = 10; // degrees
const DOUBLE_TAP_MAX_DISTANCE = 40; // px

/**
 * Get distance between two touch points
 */
function getTouchDistance(touch1: React.Touch, touch2: React.Touch): number {
  const dx = touch2.clientX - touch1.clientX;
  const dy = touch2.clientY - touch1.clientY;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Get angle between two touch points (in degrees)
 */
function getTouchAngle(touch1: React.Touch, touch2: React.Touch): number {
  const dx = touch2.clientX - touch1.clientX;
  const dy = touch2.clientY - touch1.clientY;
  return (Math.atan2(dy, dx) * 180) / Math.PI;
}

/**
 * Get center point between two touches
 */
function getTouchCenter(touch1: React.Touch, touch2: React.Touch): { x: number; y: number } {
  return {
    x: (touch1.clientX + touch2.clientX) / 2,
    y: (touch1.clientY + touch2.clientY) / 2,
  };
}

/**
 * Universal gesture detection hook
 */
export function useGestures({
  onTap,
  onDoubleTap,
  onLongPress,
  onSwipeLeft,
  onSwipeRight,
  onSwipeUp,
  onSwipeDown,
  onPinchZoom,
  onRotate,
  swipeThreshold = DEFAULT_SWIPE_THRESHOLD,
  longPressDelay = DEFAULT_LONG_PRESS_DELAY,
  doubleTapDelay = DEFAULT_DOUBLE_TAP_DELAY,
  enabled = true,
}: GestureConfig): GestureHandlers {
  const touchState = useRef<TouchState>({
    state: 'idle',
    startX: 0,
    startY: 0,
    currentX: 0,
    currentY: 0,
    startTime: 0,
    touches: 0,
    initialDistance: 0,
    initialAngle: 0,
    longPressTimer: null,
    doubleTapTimer: null,
    hasMoved: false,
    lastTapTime: 0,
    lastTapX: 0,
    lastTapY: 0,
  });

  // Clear timers
  const clearTimers = useCallback(() => {
    if (touchState.current.longPressTimer) {
      clearTimeout(touchState.current.longPressTimer);
      touchState.current.longPressTimer = null;
    }
    if (touchState.current.doubleTapTimer) {
      clearTimeout(touchState.current.doubleTapTimer);
      touchState.current.doubleTapTimer = null;
    }
  }, []);

  // Handle touch start
  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (!enabled) return;

      const touch = e.touches[0];
      const numTouches = e.touches.length;
      const now = Date.now();

      clearTimers();

      touchState.current = {
        ...touchState.current,
        state: 'idle',
        startX: touch.clientX,
        startY: touch.clientY,
        currentX: touch.clientX,
        currentY: touch.clientY,
        startTime: now,
        touches: numTouches,
        initialDistance: numTouches === 2 ? getTouchDistance(e.touches[0], e.touches[1]) : 0,
        initialAngle: numTouches === 2 ? getTouchAngle(e.touches[0], e.touches[1]) : 0,
        hasMoved: false,
      };

      // Single touch: start long-press timer
      if (numTouches === 1 && onLongPress) {
        touchState.current.state = 'tap';
        touchState.current.longPressTimer = setTimeout(() => {
          if (touchState.current.state === 'tap' && !touchState.current.hasMoved) {
            touchState.current.state = 'long-press';
            haptics.heavy();
            onLongPress(touchState.current.startX, touchState.current.startY);
          }
        }, longPressDelay);
      }

      // Two touches: enter pinch/rotate mode
      if (numTouches === 2) {
        touchState.current.state = 'pinch';
      }
    },
    [enabled, onLongPress, longPressDelay, clearTimers]
  );

  // Handle touch move
  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (!enabled || touchState.current.state === 'idle') return;

      const touch = e.touches[0];
      const numTouches = e.touches.length;

      touchState.current.currentX = touch.clientX;
      touchState.current.currentY = touch.clientY;

      const deltaX = touch.clientX - touchState.current.startX;
      const deltaY = touch.clientY - touchState.current.startY;
      const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

      // Mark as moved if beyond threshold
      if (distance > MOVEMENT_THRESHOLD) {
        touchState.current.hasMoved = true;

        // Cancel long-press if we moved
        if (touchState.current.state === 'tap') {
          clearTimers();
          touchState.current.state = 'swipe';
        }
      }

      // Handle pinch-zoom (two fingers)
      if (
        touchState.current.state === 'pinch' &&
        numTouches === 2 &&
        e.touches.length === 2 &&
        onPinchZoom
      ) {
        const currentDistance = getTouchDistance(e.touches[0], e.touches[1]);
        const distanceChange = currentDistance - touchState.current.initialDistance;

        if (Math.abs(distanceChange) > PINCH_THRESHOLD) {
          const scale = currentDistance / touchState.current.initialDistance;
          const center = getTouchCenter(e.touches[0], e.touches[1]);
          onPinchZoom(scale, center.x, center.y);
          touchState.current.initialDistance = currentDistance;
        }

        // Prevent default to avoid page zoom
        e.preventDefault();
      }

      // Handle rotation (two fingers)
      if (
        touchState.current.state === 'pinch' &&
        numTouches === 2 &&
        e.touches.length === 2 &&
        onRotate
      ) {
        const currentAngle = getTouchAngle(e.touches[0], e.touches[1]);
        let angleDelta = currentAngle - touchState.current.initialAngle;

        // Normalize angle to -180 to 180
        while (angleDelta > 180) angleDelta -= 360;
        while (angleDelta < -180) angleDelta += 360;

        if (Math.abs(angleDelta) > ROTATE_THRESHOLD) {
          touchState.current.state = 'rotate';
          onRotate(angleDelta);
          touchState.current.initialAngle = currentAngle;
        }
      }
    },
    [enabled, onPinchZoom, onRotate, clearTimers]
  );

  // Handle touch end
  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (!enabled) return;

      clearTimers();

      const touch = e.changedTouches[0];
      const deltaX = touch.clientX - touchState.current.startX;
      const deltaY = touch.clientY - touchState.current.startY;
      const elapsed = Date.now() - touchState.current.startTime;
      const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
      const now = Date.now();

      // Tap detection
      if (
        touchState.current.state === 'tap' &&
        !touchState.current.hasMoved &&
        distance < MOVEMENT_THRESHOLD &&
        elapsed < 300 &&
        touchState.current.touches === 1
      ) {
        // Check for double-tap
        const timeSinceLastTap = now - touchState.current.lastTapTime;
        const distanceFromLastTap = Math.sqrt(
          Math.pow(touch.clientX - touchState.current.lastTapX, 2) +
          Math.pow(touch.clientY - touchState.current.lastTapY, 2)
        );

        if (
          onDoubleTap &&
          timeSinceLastTap < doubleTapDelay &&
          distanceFromLastTap < DOUBLE_TAP_MAX_DISTANCE
        ) {
          // Double-tap detected
          haptics.medium();
          onDoubleTap(touchState.current.startX, touchState.current.startY);
          touchState.current.lastTapTime = 0; // Reset to prevent triple-tap
        } else {
          // Single tap - wait to see if another tap comes
          if (onTap) {
            if (onDoubleTap) {
              // Delay single tap to allow for double-tap detection
              touchState.current.doubleTapTimer = setTimeout(() => {
                haptics.soft();
                onTap?.(touchState.current.startX, touchState.current.startY);
              }, doubleTapDelay);
            } else {
              // No double-tap handler, fire immediately
              haptics.soft();
              onTap(touchState.current.startX, touchState.current.startY);
            }
          }

          // Record tap for double-tap detection
          touchState.current.lastTapTime = now;
          touchState.current.lastTapX = touch.clientX;
          touchState.current.lastTapY = touch.clientY;
        }
      }

      // Swipe detection
      if (
        touchState.current.state === 'swipe' &&
        touchState.current.hasMoved &&
        elapsed < SWIPE_MAX_DURATION &&
        touchState.current.touches === 1
      ) {
        const absX = Math.abs(deltaX);
        const absY = Math.abs(deltaY);

        if (absX > absY && absX > swipeThreshold) {
          // Horizontal swipe
          haptics.selection();
          if (deltaX > 0) {
            onSwipeRight?.();
          } else {
            onSwipeLeft?.();
          }
        } else if (absY > absX && absY > swipeThreshold) {
          // Vertical swipe
          haptics.selection();
          if (deltaY > 0) {
            onSwipeDown?.();
          } else {
            onSwipeUp?.();
          }
        }
      }

      // Reset state
      touchState.current.state = 'idle';
    },
    [
      enabled,
      swipeThreshold,
      doubleTapDelay,
      onTap,
      onDoubleTap,
      onSwipeLeft,
      onSwipeRight,
      onSwipeUp,
      onSwipeDown,
      clearTimers,
    ]
  );

  // Handle touch cancel
  const handleTouchCancel = useCallback(() => {
    clearTimers();
    touchState.current.state = 'idle';
  }, [clearTimers]);

  return {
    onTouchStart: handleTouchStart,
    onTouchMove: handleTouchMove,
    onTouchEnd: handleTouchEnd,
    onTouchCancel: handleTouchCancel,
  };
}

export default useGestures;
