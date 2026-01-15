/**
 * ManualOverrideManager - Tracks manual knob overrides for automation
 * When a parameter is manually controlled via knobs, it overrides automation
 * until a timeout expires (one pattern cycle of inactivity)
 */

type ParameterName = 'cutoff' | 'resonance' | 'envMod' | 'decay' | 'accent' | 'overdrive' | 'tuning' | 'volume' | 'pan' | 'distortion' | 'delay' | 'reverb';

interface OverrideEntry {
  timestamp: number;
  value: number;
}

class ManualOverrideManager {
  private overrides: Map<ParameterName, OverrideEntry> = new Map();
  private patternLengthMs: number = 4000; // Default 4 seconds (64 rows at 120 BPM)
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;

  constructor() {
    // Start cleanup interval
    this.startCleanup();
  }

  /**
   * Update the pattern timing info for timeout calculation
   */
  public updateTiming(bpm: number, patternLength: number): void {
    const beatsPerRow = 0.25; // 4 rows per beat
    const secondsPerRow = (60 / bpm) * beatsPerRow;
    this.patternLengthMs = secondsPerRow * patternLength * 1000;
  }

  /**
   * Register a manual override for a parameter
   * Called when user touches a knob
   */
  public setOverride(parameter: ParameterName, value: number): void {
    this.overrides.set(parameter, {
      timestamp: Date.now(),
      value,
    });
  }

  /**
   * Check if a parameter is currently overridden
   * Returns true if override is active (not expired)
   */
  public isOverridden(parameter: ParameterName): boolean {
    const entry = this.overrides.get(parameter);
    if (!entry) return false;

    const elapsed = Date.now() - entry.timestamp;
    if (elapsed > this.patternLengthMs) {
      // Override expired, remove it
      this.overrides.delete(parameter);
      return false;
    }

    return true;
  }

  /**
   * Get the manual override value if active
   * Returns null if no active override
   */
  public getOverrideValue(parameter: ParameterName): number | null {
    if (!this.isOverridden(parameter)) return null;
    return this.overrides.get(parameter)?.value ?? null;
  }

  /**
   * Clear override for a specific parameter
   */
  public clearOverride(parameter: ParameterName): void {
    this.overrides.delete(parameter);
  }

  /**
   * Clear all overrides
   */
  public clearAll(): void {
    this.overrides.clear();
  }

  /**
   * Get time remaining until override expires (for UI feedback)
   * Returns 0-1 where 1 is fully active, 0 is expired
   */
  public getOverrideStrength(parameter: ParameterName): number {
    const entry = this.overrides.get(parameter);
    if (!entry) return 0;

    const elapsed = Date.now() - entry.timestamp;
    const remaining = Math.max(0, this.patternLengthMs - elapsed);
    return remaining / this.patternLengthMs;
  }

  /**
   * Start periodic cleanup of expired overrides
   */
  private startCleanup(): void {
    if (this.cleanupInterval) return;

    this.cleanupInterval = setInterval(() => {
      const now = Date.now();
      for (const [param, entry] of this.overrides.entries()) {
        if (now - entry.timestamp > this.patternLengthMs) {
          this.overrides.delete(param);
        }
      }
    }, 1000);
  }

  /**
   * Stop cleanup interval (for testing/cleanup)
   */
  public destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }
}

// Singleton instance
let instance: ManualOverrideManager | null = null;

export const getManualOverrideManager = (): ManualOverrideManager => {
  if (!instance) {
    instance = new ManualOverrideManager();
  }
  return instance;
};

export type { ParameterName };
