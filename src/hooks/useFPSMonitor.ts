/**
 * FPS Monitor Hook - Lightweight real FPS measurement
 *
 * Uses a singleton RAF counter shared across all hook consumers.
 * Only triggers React re-renders once per second to minimize overhead.
 * The RAF callback itself is ~1μs per frame (just increment + time check).
 */

import { useEffect, useState } from 'react';
import { useUIStore } from '@stores/useUIStore';
import { notify } from '@stores/useNotificationStore';

export type QualityLevel = 'high' | 'medium' | 'low';

// ── Singleton FPS counter (no React involvement) ─────────────────────────

let frameCount = 0;
let lastTime = 0;
let currentFps = 60;
let currentAvgFps = 60;
let rafId = 0;
let refCount = 0;
const listeners = new Set<(fps: number, avg: number) => void>();

// Rolling average buffer (last 4 samples → 4-second window)
const samples: number[] = [];
const MAX_SAMPLES = 4;

// Low FPS warning — 60s cooldown between warnings, skip first 5s after start
let lastWarningTime = 0;
let counterStartTime = 0;
const WARNING_COOLDOWN_MS = 60_000;
const WARMUP_MS = 5_000;

function tick(now: number) {
  frameCount++;
  if (lastTime === 0) lastTime = now;

  const elapsed = now - lastTime;
  if (elapsed >= 1000) {
    currentFps = Math.round((frameCount * 1000) / elapsed);
    frameCount = 0;
    lastTime = now;

    // Update rolling average
    samples.push(currentFps);
    if (samples.length > MAX_SAMPLES) samples.shift();
    currentAvgFps = Math.round(samples.reduce((a, b) => a + b, 0) / samples.length);

    // Notify subscribers (triggers React re-render once/sec)
    for (const fn of listeners) fn(currentFps, currentAvgFps);

    // Update quality in UI store (only when it actually changes)
    const quality: QualityLevel =
      currentAvgFps >= 50 ? 'high' :
      currentAvgFps >= 30 ? 'medium' : 'low';
    const store = useUIStore.getState();
    if (store.performanceQuality !== quality) {
      store.setPerformanceQuality(quality);
    }

    // Warn user when FPS is too low for smooth playback
    const uptime = now - counterStartTime;
    if (
      quality === 'low' &&
      samples.length >= MAX_SAMPLES &&
      uptime > WARMUP_MS &&
      now - lastWarningTime > WARNING_COOLDOWN_MS
    ) {
      lastWarningTime = now;
      notify.warning(
        `Low performance (${currentAvgFps} FPS). Playback may stutter. Try closing other tabs or switching to DOM mode in Settings.`,
        10_000,
      );
    }
  }

  rafId = requestAnimationFrame(tick);
}

function startCounter() {
  refCount++;
  if (refCount === 1) {
    lastTime = 0;
    frameCount = 0;
    samples.length = 0;
    currentFps = 60;
    currentAvgFps = 60;
    counterStartTime = performance.now();
    lastWarningTime = 0;
    rafId = requestAnimationFrame(tick);
  }
}

function stopCounter() {
  refCount--;
  if (refCount <= 0) {
    refCount = 0;
    cancelAnimationFrame(rafId);
    rafId = 0;
  }
}

// ── Hook ─────────────────────────────────────────────────────────────────

/**
 * Returns real measured FPS and quality level.
 * Shared singleton RAF — negligible overhead even with multiple consumers.
 * Re-renders once per second.
 */
export function useFPSMonitor() {
  const [data, setData] = useState({ fps: 60, averageFps: 60 });
  const quality = useUIStore((state) => state.performanceQuality);

  useEffect(() => {
    startCounter();
    const handler = (fps: number, avg: number) => {
      setData({ fps, averageFps: avg });
    };
    listeners.add(handler);
    return () => {
      listeners.delete(handler);
      stopCounter();
    };
  }, []);

  return { fps: data.fps, averageFps: data.averageFps, quality };
}

/**
 * Hook to get current quality level without starting the monitor
 */
export function usePerformanceQuality(): QualityLevel {
  return useUIStore((state) => state.performanceQuality);
}
