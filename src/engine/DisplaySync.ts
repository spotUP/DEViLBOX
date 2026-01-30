/**
 * DisplaySync - Fixed-rate display synchronization for classic tracker feel
 *
 * On the Amiga, display updates were synced to the vertical blank interrupt
 * at exactly 50Hz (PAL) or 60Hz (NTSC). This gave trackers their characteristic
 * "tight" feel with rock-solid visual timing.
 *
 * JavaScript timing (setTimeout/setInterval) has inherent jitter. This service
 * uses requestAnimationFrame with time accumulation to achieve consistent
 * visual update rates regardless of actual frame timing.
 *
 * Usage:
 *   const sync = DisplaySync.getInstance();
 *   sync.subscribe((state) => updateDisplay(state));
 *   sync.start();
 */

import { useTransportStore } from '@stores/useTransportStore';
import { useTrackerStore } from '@stores/useTrackerStore';

// Display refresh rates (in Hz)
export const DISPLAY_RATES = {
  PAL: 50,      // Amiga PAL - 50Hz (20ms per frame)
  NTSC: 60,     // Amiga NTSC - 60Hz (16.67ms per frame)
  SMOOTH: 120,  // High refresh rate displays
} as const;

export type DisplayRate = keyof typeof DISPLAY_RATES;

export interface DisplayState {
  row: number;
  pattern: number;
  position: number;
  isPlaying: boolean;
  tick: number;  // Current tick within row (for sub-row precision if needed)
}

type DisplayCallback = (state: DisplayState) => void;

class DisplaySync {
  private static instance: DisplaySync | null = null;

  private subscribers = new Set<DisplayCallback>();
  private rafId: number | null = null;
  private lastFrameTime = 0;
  private accumulator = 0;
  private frameInterval: number;  // Target interval in ms
  private running = false;

  // Current display state (updated at fixed rate)
  private currentState: DisplayState = {
    row: 0,
    pattern: 0,
    position: 0,
    isPlaying: false,
    tick: 0,
  };

  // Frame counter for debugging
  private frameCount = 0;
  private lastFpsTime = 0;
  private measuredFps = 0;

  private constructor() {
    // Default to PAL rate (50Hz)
    this.frameInterval = 1000 / DISPLAY_RATES.PAL;
  }

  public static getInstance(): DisplaySync {
    if (!DisplaySync.instance) {
      DisplaySync.instance = new DisplaySync();
    }
    return DisplaySync.instance;
  }

  /**
   * Set the display refresh rate
   */
  public setRate(rate: DisplayRate | number): void {
    const hz = typeof rate === 'number' ? rate : DISPLAY_RATES[rate];
    this.frameInterval = 1000 / hz;
  }

  /**
   * Get current measured FPS (for debugging)
   */
  public getMeasuredFps(): number {
    return this.measuredFps;
  }

  /**
   * Subscribe to display updates
   */
  public subscribe(callback: DisplayCallback): () => void {
    this.subscribers.add(callback);

    // Immediately send current state to new subscriber
    callback(this.currentState);

    // Auto-start if this is the first subscriber
    if (this.subscribers.size === 1 && !this.running) {
      this.start();
    }

    // Return unsubscribe function
    return () => {
      this.subscribers.delete(callback);

      // Auto-stop if no more subscribers
      if (this.subscribers.size === 0) {
        this.stop();
      }
    };
  }

  /**
   * Start the display sync loop
   */
  public start(): void {
    if (this.running) return;

    this.running = true;
    this.lastFrameTime = performance.now();
    this.accumulator = 0;
    this.frameCount = 0;
    this.lastFpsTime = this.lastFrameTime;

    this.loop(this.lastFrameTime);
  }

  /**
   * Stop the display sync loop
   */
  public stop(): void {
    if (!this.running) return;

    this.running = false;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  /**
   * Force an immediate update (for seeking, stopping, etc.)
   */
  public forceUpdate(): void {
    this.pollState();
    this.notifySubscribers();
  }

  /**
   * Main loop - runs on RAF but only triggers updates at fixed rate
   */
  private loop = (currentTime: number): void => {
    if (!this.running) return;

    const deltaTime = currentTime - this.lastFrameTime;
    this.lastFrameTime = currentTime;

    // Accumulate time
    this.accumulator += deltaTime;

    // Process fixed-rate updates
    // Use while loop to handle cases where we need to catch up
    let updated = false;
    while (this.accumulator >= this.frameInterval) {
      this.accumulator -= this.frameInterval;
      this.pollState();
      updated = true;
      this.frameCount++;
    }

    // Only notify subscribers if state was updated
    if (updated) {
      this.notifySubscribers();
    }

    // Measure FPS (every second)
    if (currentTime - this.lastFpsTime >= 1000) {
      this.measuredFps = this.frameCount;
      this.frameCount = 0;
      this.lastFpsTime = currentTime;
    }

    // Continue loop
    this.rafId = requestAnimationFrame(this.loop);
  };

  /**
   * Poll current state from stores
   */
  private pollState(): void {
    const transport = useTransportStore.getState();
    const tracker = useTrackerStore.getState();

    this.currentState = {
      row: transport.currentRow,
      pattern: transport.currentPatternIndex,
      position: tracker.currentPositionIndex,
      isPlaying: transport.isPlaying,
      tick: 0, // Could be enhanced to track sub-row ticks
    };
  }

  /**
   * Notify all subscribers of current state
   */
  private notifySubscribers(): void {
    const state = this.currentState;
    for (const callback of this.subscribers) {
      try {
        callback(state);
      } catch (e) {
        console.error('[DisplaySync] Subscriber error:', e);
      }
    }
  }

  /**
   * Get current state without subscribing
   */
  public getState(): DisplayState {
    return { ...this.currentState };
  }
}

// Export singleton getter
export function getDisplaySync(): DisplaySync {
  return DisplaySync.getInstance();
}

export { DisplaySync };
