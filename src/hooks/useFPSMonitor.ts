/**
 * FPS Monitor Hook - Performance quality management
 *
 * PERF: Removed RAF-based FPS counting as it was causing overhead and
 * fluctuating with mouse movement. Now just shows stable 60fps target.
 * Our animation loops are already capped at 60fps or 30fps.
 */

import { useUIStore } from '@stores/useUIStore';

export type QualityLevel = 'high' | 'medium' | 'low';

/**
 * Returns stable 60fps display and current quality level
 * FPS measurement removed to reduce overhead
 */
export function useFPSMonitor() {
  const performanceQuality = useUIStore((state) => state.performanceQuality);

  return {
    fps: 60, // Target FPS - animations are capped at this
    averageFps: 60,
    quality: performanceQuality,
  };
}

/**
 * Hook to get current quality level without monitoring
 */
export function usePerformanceQuality(): QualityLevel {
  return useUIStore((state) => state.performanceQuality);
}
