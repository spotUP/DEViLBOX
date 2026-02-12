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

import { useEffect, useRef } from 'react';

// 30fps = ~33.33ms per frame
export const FRAME_INTERVAL = 1000 / 30;

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
  const frameIntervalRef = useRef(1000 / fps);
  const idleThresholdRef = useRef(idleThreshold);

  // Keep refs up to date via effects (not during render)
  useEffect(() => { onFrameRef.current = onFrame; }, [onFrame]);
  useEffect(() => { frameIntervalRef.current = 1000 / fps; }, [fps]);
  useEffect(() => { idleThresholdRef.current = idleThreshold; }, [idleThreshold]);

  // Start/stop animation based on enabled state
  // The animation loop function is defined inside the effect to avoid
  // self-referencing useCallback issues with the React compiler.
  useEffect(() => {
    if (!enabled) {
      isAnimatingRef.current = false;
      if (animationRef.current !== null) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
      return;
    }

    isAnimatingRef.current = true;
    idleFramesRef.current = 0;
    lastFrameTimeRef.current = 0;

    const tick = (timestamp: number) => {
      if (!isAnimatingRef.current) return;

      // Frame rate limiting
      const elapsed = timestamp - lastFrameTimeRef.current;
      const frameInterval = frameIntervalRef.current;

      // When idle, check even less frequently
      const currentInterval = idleFramesRef.current > idleThresholdRef.current
        ? frameInterval * 2  // Half rate when idle
        : frameInterval;

      if (elapsed < currentInterval) {
        animationRef.current = requestAnimationFrame(tick);
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
      animationRef.current = requestAnimationFrame(tick);
    };

    animationRef.current = requestAnimationFrame(tick);

    return () => {
      isAnimatingRef.current = false;
      if (animationRef.current !== null) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
    };
  }, [enabled]);

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

  useEffect(() => { onFrameRef.current = onFrame; }, [onFrame]);

  // The animation loop is defined inside the effect to avoid
  // self-referencing useCallback issues with the React compiler.
  useEffect(() => {
    if (!enabled) {
      isAnimatingRef.current = false;
      if (animationRef.current !== null) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
      return;
    }

    isAnimatingRef.current = true;

    const tick = (timestamp: number) => {
      if (!isAnimatingRef.current) return;

      // 60fps - no frame limiting
      onFrameRef.current(timestamp);

      animationRef.current = requestAnimationFrame(tick);
    };

    animationRef.current = requestAnimationFrame(tick);

    return () => {
      isAnimatingRef.current = false;
      if (animationRef.current !== null) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
    };
  }, [enabled]);

  return isAnimatingRef;
}
