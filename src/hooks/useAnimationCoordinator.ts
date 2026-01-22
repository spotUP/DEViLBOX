/**
 * Centralized Animation Coordinator
 *
 * Coordinates all animation loops in the app to prevent frame dropping
 * from multiple independent requestAnimationFrame/setInterval loops.
 *
 * Instead of running 4+ independent animation loops:
 * - PatternEditor smooth scroll
 * - ChannelVUMeters (each meter has its own setInterval)
 * - ChannelVUMeters swing animation
 * - VirtualizedTrackerView auto-scroll
 *
 * We run a SINGLE requestAnimationFrame loop that calls all subscribed
 * animation callbacks in sequence.
 */

import { useEffect, useRef } from 'react';

type AnimationCallback = (deltaTime: number) => void;

class AnimationCoordinator {
  private callbacks: Map<string, AnimationCallback> = new Map();
  private rafId: number | null = null;
  private lastTime: number = 0;
  private isRunning: boolean = false;

  subscribe(id: string, callback: AnimationCallback): () => void {
    this.callbacks.set(id, callback);

    // Start the loop if this is the first subscriber
    if (!this.isRunning) {
      this.start();
    }

    // Return unsubscribe function
    return () => {
      this.callbacks.delete(id);

      // Stop the loop if no more subscribers
      if (this.callbacks.size === 0) {
        this.stop();
      }
    };
  }

  private start() {
    if (this.isRunning) return;

    this.isRunning = true;
    this.lastTime = performance.now();
    this.animate();
  }

  private stop() {
    if (!this.isRunning) return;

    this.isRunning = false;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  private animate = () => {
    const currentTime = performance.now();
    const deltaTime = currentTime - this.lastTime;
    this.lastTime = currentTime;

    // Call all subscribed animation callbacks
    this.callbacks.forEach((callback) => {
      try {
        callback(deltaTime);
      } catch (error) {
        console.error('Animation callback error:', error);
      }
    });

    // Continue the loop
    if (this.isRunning) {
      this.rafId = requestAnimationFrame(this.animate);
    }
  };
}

// Singleton instance
const coordinator = new AnimationCoordinator();

/**
 * Hook to subscribe to the centralized animation loop
 *
 * @param id - Unique identifier for this animation
 * @param callback - Function called on every frame with deltaTime in milliseconds
 * @param deps - Dependencies array (like useEffect)
 *
 * @example
 * useAnimationFrame('smooth-scroll', (deltaTime) => {
 *   const progress = (performance.now() - startTime) / duration;
 *   setOffset(progress);
 * }, [startTime, duration]);
 */
export function useAnimationFrame(
  id: string,
  callback: AnimationCallback | null,
  deps: React.DependencyList = []
) {
  const callbackRef = useRef(callback);

  // Update callback ref when it changes
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    if (!callbackRef.current) return;

    const unsubscribe = coordinator.subscribe(id, (deltaTime) => {
      callbackRef.current?.(deltaTime);
    });

    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
