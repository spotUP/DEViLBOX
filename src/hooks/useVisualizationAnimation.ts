/**
 * useVisualizationAnimation - Reusable hook for 30fps canvas animations
 *
 * Features:
 * - 30fps frame rate limiting
 * - Automatic cleanup on unmount
 * - Idle detection (skips frames when no activity)
 * - Visibility-based pause (doesn't animate when hidden)
 *
 * PERFORMANCE:
 * - Uses refs to avoid re-renders
 * - 30fps cap (not 60fps) - visualizations don't need 60fps
 * - Skips animation entirely when idle
 */

import { useEffect, useRef, useCallback } from 'react';

// Target: 30fps = ~33.33ms per frame (configurable via fps option)

interface UseVisualizationAnimationOptions {
  /**
   * Callback to render a frame
   * @param timestamp Current timestamp from requestAnimationFrame
   * @returns true if there was activity (animation should continue), false if idle
   */
  onFrame: (timestamp: number) => boolean;

  /**
   * Whether the animation should be active
   * Set to false when the visualization is hidden
   */
  enabled?: boolean;

  /**
   * Target FPS (default: 30)
   */
  fps?: number;

  /**
   * Number of consecutive idle frames before reducing to lower FPS
   * Default: 10 (after 10 idle frames, check less frequently)
   */
  idleThreshold?: number;
}

export function useVisualizationAnimation({
  onFrame,
  enabled = true,
  fps = 30,
  idleThreshold = 10,
}: UseVisualizationAnimationOptions): {
  isAnimating: React.MutableRefObject<boolean>;
  idleFrames: React.MutableRefObject<number>;
} {
  const animationRef = useRef<number | null>(null);
  const lastFrameTimeRef = useRef<number>(0);
  const isAnimatingRef = useRef<boolean>(false);
  const idleFramesRef = useRef<number>(0);
  const onFrameRef = useRef(onFrame);

  // Keep onFrame ref up to date
  useEffect(() => {
    onFrameRef.current = onFrame;
  }, [onFrame]);

  const frameInterval = 1000 / fps;

  // Animation loop
  const animate = useCallback((timestamp: number) => {
    if (!isAnimatingRef.current) return;

    // Frame rate limiting
    const elapsed = timestamp - lastFrameTimeRef.current;

    // When idle, check even less frequently
    const currentInterval = idleFramesRef.current > idleThreshold
      ? frameInterval * 2  // Half rate when idle
      : frameInterval;

    if (elapsed < currentInterval) {
      animationRef.current = requestAnimationFrame(animate);
      return;
    }

    lastFrameTimeRef.current = timestamp - (elapsed % currentInterval);

    // Call frame callback
    const hadActivity = onFrameRef.current(timestamp);

    // Track idle frames
    if (hadActivity) {
      idleFramesRef.current = 0;
    } else {
      idleFramesRef.current++;
    }

    // Continue animation
    animationRef.current = requestAnimationFrame(animate);
  }, [frameInterval, idleThreshold]);

  // Start/stop animation based on enabled state
  useEffect(() => {
    if (enabled) {
      isAnimatingRef.current = true;
      idleFramesRef.current = 0;
      lastFrameTimeRef.current = 0;
      animationRef.current = requestAnimationFrame(animate);
    } else {
      isAnimatingRef.current = false;
      if (animationRef.current !== null) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
    }

    return () => {
      isAnimatingRef.current = false;
      if (animationRef.current !== null) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
    };
  }, [enabled, animate]);

  return {
    isAnimating: isAnimatingRef,
    idleFrames: idleFramesRef,
  };
}

/**
 * useHighFpsAnimation - 60fps animation for smooth cursor tracking
 * Use this only for sample playback cursor or similar smooth animations
 */
export function useHighFpsAnimation({
  onFrame,
  enabled = true,
}: {
  onFrame: (timestamp: number) => boolean;
  enabled?: boolean;
}): React.MutableRefObject<boolean> {
  const animationRef = useRef<number | null>(null);
  const isAnimatingRef = useRef<boolean>(false);
  const onFrameRef = useRef(onFrame);

  useEffect(() => {
    onFrameRef.current = onFrame;
  }, [onFrame]);

  const animate = useCallback((timestamp: number) => {
    if (!isAnimatingRef.current) return;

    // 60fps - no frame limiting
    onFrameRef.current(timestamp);

    animationRef.current = requestAnimationFrame(animate);
  }, []);

  useEffect(() => {
    if (enabled) {
      isAnimatingRef.current = true;
      animationRef.current = requestAnimationFrame(animate);
    } else {
      isAnimatingRef.current = false;
      if (animationRef.current !== null) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
    }

    return () => {
      isAnimatingRef.current = false;
      if (animationRef.current !== null) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
    };
  }, [enabled, animate]);

  return isAnimatingRef;
}
