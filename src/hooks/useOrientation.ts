/**
 * useOrientation - Detect device orientation changes
 * Provides portrait/landscape detection for mobile layouts
 */

import { useState, useEffect } from 'react';

export type Orientation = 'portrait' | 'landscape';

// Screen Orientation API types
export type OrientationLockType =
  | 'any'
  | 'natural'
  | 'landscape'
  | 'portrait'
  | 'portrait-primary'
  | 'portrait-secondary'
  | 'landscape-primary'
  | 'landscape-secondary';

// Extend ScreenOrientation with lock/unlock methods (not in all TypeScript lib versions)
interface ScreenOrientationWithLock extends ScreenOrientation {
  lock(orientation: OrientationLockType): Promise<void>;
  unlock(): void;
}

export interface OrientationState {
  orientation: Orientation;
  isPortrait: boolean;
  isLandscape: boolean;
  angle: number;
}

/**
 * Determine orientation from window dimensions
 */
function getOrientation(width: number, height: number): Orientation {
  return width > height ? 'landscape' : 'portrait';
}

/**
 * Get orientation angle from screen.orientation API
 */
function getOrientationAngle(): number {
  if (window.screen?.orientation?.angle !== undefined) {
    return window.screen.orientation.angle;
  }
  // Fallback for older devices
  // @ts-ignore - window.orientation is deprecated but still supported
  if (window.orientation !== undefined) {
    // @ts-ignore
    return window.orientation;
  }
  return 0;
}

/**
 * Hook for orientation detection
 * Listens to both resize and orientationchange events
 */
export function useOrientation(): OrientationState {
  const [state, setState] = useState<OrientationState>(() => {
    if (typeof window === 'undefined') {
      return {
        orientation: 'portrait',
        isPortrait: true,
        isLandscape: false,
        angle: 0,
      };
    }

    const orientation = getOrientation(window.innerWidth, window.innerHeight);
    return {
      orientation,
      isPortrait: orientation === 'portrait',
      isLandscape: orientation === 'landscape',
      angle: getOrientationAngle(),
    };
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleOrientationChange = () => {
      const orientation = getOrientation(window.innerWidth, window.innerHeight);
      const angle = getOrientationAngle();

      setState({
        orientation,
        isPortrait: orientation === 'portrait',
        isLandscape: orientation === 'landscape',
        angle,
      });
    };

    // Listen to multiple events for best compatibility
    window.addEventListener('resize', handleOrientationChange);
    window.addEventListener('orientationchange', handleOrientationChange);

    // Modern API (if available)
    if (window.screen?.orientation) {
      window.screen.orientation.addEventListener('change', handleOrientationChange);
    }

    // Trigger initial update
    handleOrientationChange();

    return () => {
      window.removeEventListener('resize', handleOrientationChange);
      window.removeEventListener('orientationchange', handleOrientationChange);

      if (window.screen?.orientation) {
        window.screen.orientation.removeEventListener('change', handleOrientationChange);
      }
    };
  }, []);

  return state;
}

/**
 * Hook to lock orientation (requires fullscreen on most browsers)
 */
export function useLockOrientation(
  orientation?: OrientationLockType
): {
  lock: (type: OrientationLockType) => Promise<void>;
  unlock: () => void;
  isSupported: boolean;
} {
  const isSupported = typeof window !== 'undefined' && 'orientation' in window.screen;

  const lock = async (type: OrientationLockType) => {
    if (!isSupported) {
      console.warn('Screen orientation lock is not supported on this device');
      return;
    }

    try {
      await (window.screen.orientation as ScreenOrientationWithLock).lock(type);
    } catch (error) {
      console.error('Failed to lock orientation:', error);
      // Note: Most browsers require fullscreen for orientation lock
      if (error instanceof DOMException && error.name === 'SecurityError') {
        console.warn('Orientation lock requires fullscreen mode');
      }
    }
  };

  const unlock = () => {
    if (!isSupported) return;

    try {
      (window.screen.orientation as ScreenOrientationWithLock).unlock();
    } catch (error) {
      console.error('Failed to unlock orientation:', error);
    }
  };

  // Auto-lock if orientation is specified
  useEffect(() => {
    if (orientation && isSupported) {
      lock(orientation);
      return () => unlock();
    }
  }, [orientation, isSupported]);

  return { lock, unlock, isSupported };
}

export default useOrientation;
