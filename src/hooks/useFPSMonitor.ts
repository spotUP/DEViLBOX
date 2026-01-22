/**
 * FPS Monitor Hook - Track frame rate and trigger quality degradation
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { useUIStore } from '@stores/useUIStore';
import { getToneEngine } from '@engine/ToneEngine';

export type QualityLevel = 'high' | 'medium' | 'low';

interface FPSMonitorOptions {
  sampleSize?: number; // Number of frames to average (default: 60)
  degradeThreshold?: number; // FPS below this triggers degradation (default: 40)
  recoverThreshold?: number; // FPS above this triggers recovery (default: 55)
  checkInterval?: number; // How often to check FPS in ms (default: 2000)
  enableAutoDegradation?: boolean; // Auto-adjust quality (default: true)
}

const DEFAULT_OPTIONS: Required<FPSMonitorOptions> = {
  sampleSize: 60,
  degradeThreshold: 40,
  recoverThreshold: 55,
  checkInterval: 2000,
  enableAutoDegradation: true,
};

/**
 * Monitor FPS and automatically adjust quality settings
 */
export function useFPSMonitor(options: FPSMonitorOptions = {}) {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  const [fps, setFps] = useState(60);
  const [averageFps, setAverageFps] = useState(60);
  const frameTimestamps = useRef<number[]>([]);
  const lastCheckTime = useRef(Date.now());
  const rafId = useRef<number | null>(null);

  const { performanceQuality, setPerformanceQuality } = useUIStore();

  // Adjust quality based on FPS (memoized with useCallback)
  const adjustQuality = useCallback((avgFps: number) => {
    if (avgFps < opts.degradeThreshold) {
      // FPS is too low, degrade quality
      if (performanceQuality === 'high') {
        setPerformanceQuality('medium');
        getToneEngine().setPerformanceQuality('medium');
        console.log(`[FPS Monitor] Degraded to medium quality (FPS: ${avgFps})`);
      } else if (performanceQuality === 'medium') {
        setPerformanceQuality('low');
        getToneEngine().setPerformanceQuality('low');
        console.log(`[FPS Monitor] Degraded to low quality (FPS: ${avgFps})`);
      }
    } else if (avgFps > opts.recoverThreshold) {
      // FPS is good, recover quality
      if (performanceQuality === 'low') {
        setPerformanceQuality('medium');
        getToneEngine().setPerformanceQuality('medium');
        console.log(`[FPS Monitor] Recovered to medium quality (FPS: ${avgFps})`);
      } else if (performanceQuality === 'medium') {
        setPerformanceQuality('high');
        getToneEngine().setPerformanceQuality('high');
        console.log(`[FPS Monitor] Recovered to high quality (FPS: ${avgFps})`);
      }
    }
  }, [opts.degradeThreshold, opts.recoverThreshold, performanceQuality, setPerformanceQuality]);

  // Measure FPS using requestAnimationFrame
  useEffect(() => {
    let lastTime = performance.now();

    const measureFPS = (currentTime: number) => {
      // Calculate instant FPS
      const deltaTime = currentTime - lastTime;
      const instantFps = deltaTime > 0 ? 1000 / deltaTime : 0;

      // Store timestamp for rolling average
      frameTimestamps.current.push(currentTime);
      if (frameTimestamps.current.length > opts.sampleSize) {
        frameTimestamps.current.shift();
      }

      // Calculate average FPS over sample window
      if (frameTimestamps.current.length >= 2) {
        const firstTimestamp = frameTimestamps.current[0];
        const lastTimestamp = frameTimestamps.current[frameTimestamps.current.length - 1];
        const timeSpan = lastTimestamp - firstTimestamp;
        const frameCount = frameTimestamps.current.length - 1;

        // Prevent division by zero
        const avgFps = timeSpan > 0 ? (frameCount / timeSpan) * 1000 : 0;

        // Only update state if value changed significantly (avoid excessive re-renders)
        const roundedAvg = Math.round(avgFps);
        const roundedInst = Math.round(instantFps);

        setAverageFps(prev => Math.abs(prev - roundedAvg) >= 1 ? roundedAvg : prev);
        setFps(prev => Math.abs(prev - roundedInst) >= 1 ? roundedInst : prev);

        // Check if we should adjust quality (throttled)
        const now = Date.now();
        if (opts.enableAutoDegradation && now - lastCheckTime.current >= opts.checkInterval) {
          lastCheckTime.current = now;
          adjustQuality(avgFps);
        }
      }

      lastTime = currentTime;
      rafId.current = requestAnimationFrame(measureFPS);
    };

    rafId.current = requestAnimationFrame(measureFPS);

    return () => {
      if (rafId.current !== null) {
        cancelAnimationFrame(rafId.current);
      }
    };
  }, [opts.sampleSize, opts.enableAutoDegradation, opts.checkInterval, adjustQuality]);

  return {
    fps, // Current instant FPS
    averageFps, // Rolling average FPS
    quality: performanceQuality,
  };
}

/**
 * Hook to get current quality level without monitoring
 */
export function usePerformanceQuality(): QualityLevel {
  return useUIStore((state) => state.performanceQuality);
}
